import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

import type { CourtState } from '../../services/watchDirector';
import { buildBannerTexture, createJumboTexture, paintJumbo, JUMBO_W, JUMBO_H, type JumboFace } from './richTextures';
import { onPainterReady } from './painter';
import {
  buildLedTexture, buildNetTexture, hexToRgb, LIGHT_POOLS,
  buildScoreboardTexture, paintScoreboard, buildShotClockTexture, paintShotClock,
} from './textures';

// Everything around the court: the bowl and its crowd, courtside furniture,
// the center-hung scoreboard, and the two baskets. Static except for the LED
// ribbons, which scroll.
//
// Draw calls are the budget on a phone, so anything that repeats (seats, fans,
// chairs, ceiling lights) is ONE InstancedMesh, however many there are.

const HALF_L = 47;
const HALF_W = 25;

interface ArenaProps {
  primary: string;
  secondary: string;
}

/** The live numbers the arena shows (PLANO-3D Etapa 5). `clock` is the time
 *  left in the period, in seconds; `shotClock` is absent between possessions. */
export interface ScoreboardData {
  home: number;
  away: number;
  quarter: number;
  clock: number;
  shotClock?: number;
  homeLabel?: string;
  awayLabel?: string;
}

const periodLabel = (q: number) => (q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `OT${q - 4}`);
const clockLabel = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * Several geometries as one (one draw call): the named attributes
 * concatenated, indices offset. Every part must carry the same attributes.
 * The parts are disposed.
 */
const mergeParts = (parts: THREE.BufferGeometry[], names: string[]): THREE.BufferGeometry => {
  const merged = new THREE.BufferGeometry();
  names.forEach((name) => {
    const size = parts[0].getAttribute(name).itemSize;
    const total = parts.reduce((n, g) => n + g.getAttribute(name).count, 0);
    const out = new Float32Array(total * size);
    let o = 0;
    parts.forEach((g) => { const a = g.getAttribute(name).array as Float32Array; out.set(a, o); o += a.length; });
    merged.setAttribute(name, new THREE.BufferAttribute(out, size));
  });
  const indices: number[] = [];
  let base = 0;
  parts.forEach((g) => {
    const idx = g.getIndex()!;
    for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + base);
    base += g.getAttribute('position').count;
    g.dispose();
  });
  merged.setIndex(indices);
  return merged;
};

/* ------------------------------------------------------------------ */
/* The bowl: stepped rows all the way round, a fan in every seat.      */
/* ------------------------------------------------------------------ */
const ROWS = 14;
const ROW_DEPTH = 2.7;
const ROW_RISE = 1.7;
const SEAT_PITCH = 2.05;
const BOWL_INSET_L = HALF_L + 15; // first row behind the baselines
const BOWL_INSET_W = HALF_W + 12; // first row behind the sidelines
const CORNER_R = 10;

/** Points spaced `pitch` apart around a rounded rectangle, with the inward normal. */
const ringPoints = (hx: number, hz: number, r: number, pitch: number) => {
  const out: { x: number; z: number; nx: number; nz: number }[] = [];
  const straightX = hx - r;
  const straightZ = hz - r;
  const segs: ((t: number) => { x: number; z: number; nx: number; nz: number })[] = [];
  const lens: number[] = [];
  // Four straights and four quarter-arcs, counter-clockwise from +x.
  const corners: [number, number, number][] = [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]];
  const straights: [number, number, number, number, number, number][] = [
    [hx, -straightZ, hx, straightZ, -1, 0],
    [straightX, hz, -straightX, hz, 0, -1],
    [-hx, straightZ, -hx, -straightZ, 1, 0],
    [-straightX, -hz, straightX, -hz, 0, 1],
  ];
  for (let i = 0; i < 4; i++) {
    const [x0, z0, x1, z1, nx, nz] = straights[i];
    segs.push((t) => ({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, nx, nz }));
    lens.push(Math.hypot(x1 - x0, z1 - z0));
    const [cx, cz, a0] = corners[i];
    segs.push((t) => {
      const a = a0 + (Math.PI / 2) * t;
      return { x: cx * straightX + Math.cos(a) * r, z: cz * straightZ + Math.sin(a) * r, nx: -Math.cos(a), nz: -Math.sin(a) };
    });
    lens.push((Math.PI / 2) * r);
  }
  segs.forEach((seg, i) => {
    const n = Math.max(1, Math.floor(lens[i] / pitch));
    for (let k = 0; k < n; k++) out.push(seg((k + 0.5) / n));
  });
  return out;
};

/* ------------------------------------------------------------------ */
/* The crowd on its feet.                                               */
/* ------------------------------------------------------------------ */
// The sound already roars on a big basket (sound/soundEngine.ts); this is the
// picture: the fans of the team that scored stand, bounce and throw their arms
// up, then settle back into their seats. All of it in the vertex shader, from
// three numbers per fan (its rhythm, which side it's on, how into it it is) and
// two levels for the whole building -- not one matrix rewritten per frame, so
// ~3,300 fans cost the same on their feet as sitting down.

/** How worked up each side's fans are. Written by the screen (cheer), read by the bowl. */
export interface CrowdHype {
  home: number;
  away: number;
  homeUntil: number;
  awayUntil: number;
}
export const newCrowdHype = (): CrowdHype => ({ home: 0, away: 0, homeUntil: 0, awayUntil: 0 });
const nowS = () => Date.now() / 1000;
/** Gets one side's fans up to `level` (0-1) for `holdS` seconds. */
export const cheer = (hype: CrowdHype, side: 'home' | 'away', level: number, holdS: number) => {
  const now = nowS();
  const until = now + holdS;
  if (side === 'home') {
    hype.home = Math.max(level, now < hype.homeUntil ? hype.home : 0);
    hype.homeUntil = Math.max(until, hype.homeUntil);
  } else {
    hype.away = Math.max(level, now < hype.awayUntil ? hype.away : 0);
    hype.awayUntil = Math.max(until, hype.awayUntil);
  }
};

const crowdUniforms = { uHome: { value: 0 }, uAway: { value: 0 }, uTime: { value: 0 }, uCam: { value: new THREE.Vector3(0, 1e4, 0) } };

// Seats closer to the lens than this (ft) aren't drawn. From the TV and close
// cameras, up behind the near stands, the last rows sat a few feet from the
// lens and filled the bottom third of the frame with giant blocks -- ugly,
// and the most expensive pixels on screen (device audit, 2026-10-18). The
// front rows, further off, stay: the broadcast look of a crowd at the bottom
// edge, with the camera on its platform behind them.
const LENS_CLEAR_FT = 48;

const STAND_GLSL = `
        // aFan: x = rhythm (0-1), y = home fan (1) or away (0), z = how into it.
        float ex = mix(uAway, uHome, aFan.y) * aFan.z;
        float stand = smoothstep(0.05, 0.4, ex);
        float jumpy = smoothstep(0.35, 0.9, ex);
        float hop = abs(sin(uTime * (6.5 + aFan.x * 3.0) + aFan.x * 6.2832));`;
const ARMS_GLSL = `
        float up = smoothstep(0.3, 0.75, ex) * step(0.4, aFan.z);
        transformed.y *= up;
        transformed.x += sin(uTime * (7.0 + aFan.x * 4.0) + aFan.x * 12.0) * 0.45 * transformed.y;`;
const LIFT_GLSL = `
        transformed.y += stand * 0.85 + hop * jumpy * 0.5 + sin(uTime * 1.3 + aFan.x * 40.0) * 0.03;`;
// Collapses a seat near the camera to a point: no area, no pixels.
const CLEAR_GLSL = `
        if (distance((modelMatrix * instanceMatrix[3]).xyz, uCam) < ${LENS_CLEAR_FT.toFixed(1)}) transformed = vec3(0.0);`;

/**
 * Teaches a crowd material to stand up. `arms` makes the vertex collapse to
 * nothing until the fan is excited enough to raise them. `still` (the risers)
 * only learns to clear the lens. Lambert: ~3,300 seats of matte shirts gain
 * nothing from a PBR shader, and they cover a third of the frame.
 */
const standingCrowd = (mat: THREE.MeshLambertMaterial, kind: string, arms = false, still = false) => {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHome = crowdUniforms.uHome;
    shader.uniforms.uAway = crowdUniforms.uAway;
    shader.uniforms.uTime = crowdUniforms.uTime;
    shader.uniforms.uCam = crowdUniforms.uCam;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uHome;\nuniform float uAway;\nuniform float uTime;\nuniform vec3 uCam;\nattribute vec3 aFan;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + (still ? '' : STAND_GLSL + (arms ? ARMS_GLSL : '') + LIFT_GLSL) + CLEAR_GLSL);
  };
  mat.customProgramCacheKey = () => `crowd-${kind}`;
  return mat;
};

/** Raised arms: two thin boxes in a V from the shoulders, base at y = 0. */
const armsGeometry = () => {
  // Thick enough to read from the broadcast camera, ~100 ft away.
  const arm = (side: number) => new THREE.BoxGeometry(0.4, 1.7, 0.36)
    .translate(0, 0.8, 0)
    .rotateZ(-side * 0.5)
    .translate(side * 0.5, 0, 0);
  return mergeParts([arm(1), arm(-1)], ['position', 'normal', 'uv']);
};

function Bowl({ primary, secondary, awayPrimary, hype }: ArenaProps & { awayPrimary?: string; hype?: React.MutableRefObject<CrowdHype> }) {
  const { risers, fans, heads, arms, flashSpots } = useMemo(() => {
    const seats: { x: number; z: number; rot: number; row: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      const off = r * ROW_DEPTH;
      ringPoints(BOWL_INSET_L + off, BOWL_INSET_W + off, CORNER_R + off, SEAT_PITCH).forEach((p) => {
        seats.push({ x: p.x, z: p.z, rot: Math.atan2(p.nx, p.nz), row: r });
      });
    }

    const box = new THREE.BoxGeometry(1, 1, 1);
    const riserMat = standingCrowd(new THREE.MeshLambertMaterial({ color: '#2a3040' }), 'riser', false, true);
    const risers = new THREE.InstancedMesh(box, riserMat, seats.length);
    const fanGeo = new THREE.BoxGeometry(1.25, 1.9, 0.95);
    const fanMat = standingCrowd(new THREE.MeshLambertMaterial(), 'body');
    const fans = new THREE.InstancedMesh(fanGeo, fanMat, seats.length);
    // ~3,300 heads: a 48-triangle sphere instead of 96 halves the bowl's
    // geometry, and at stand distance nobody can count the facets.
    const headGeo = new THREE.SphereGeometry(0.42, 6, 4);
    const headMat = standingCrowd(new THREE.MeshLambertMaterial(), 'head');
    const heads = new THREE.InstancedMesh(headGeo, headMat, seats.length);
    const armGeo = armsGeometry();
    const armMat = standingCrowd(new THREE.MeshLambertMaterial(), 'arms', true);
    const arms = new THREE.InstancedMesh(armGeo, armMat, seats.length);
    // Per fan: rhythm, home or away, how into it (see standingCrowd).
    const fanAttr = new Float32Array(seats.length * 3);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    // A home crowd: three in four in the home colors, a few away fans, the
    // rest in street clothes. It was a third in the primary color, which on
    // screen read as a neutral building rather than a home floor.
    const neutral = ['#f2f2f2', '#1b1d24', '#2b3a55', '#d9d2c3'];
    /** The fan's shirt, and whether he's here for the visitors. */
    const shirtFor = (): [string, boolean] => {
      const r = rnd();
      if (r < 0.55) return [primary, false];
      if (r < 0.75) return [secondary, false];
      if (r < 0.85) return [awayPrimary ?? '#7a1f2b', true];
      return [neutral[Math.floor(rnd() * neutral.length)], false];
    };
    const skins = ['#f1c7a3', '#d9a57c', '#b97a52', '#8d5a3b', '#5c3826'];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const flashSpots: THREE.Vector3[] = [];

    seats.forEach((s, i) => {
      const top = 1 + s.row * ROW_RISE;
      q.setFromAxisAngle(up, s.rot);
      // Riser: a solid step from the floor to this row's height.
      m.compose(new THREE.Vector3(s.x, top / 2, s.z), q, new THREE.Vector3(SEAT_PITCH * 1.02, top, ROW_DEPTH * 1.02));
      risers.setMatrixAt(i, m);
      c.set(s.row % 2 ? '#161a24' : '#1b2030').multiplyScalar(1 - (s.row / (ROWS - 1)) * 0.5);
      risers.setColorAt(i, c);
      // A few empty seats keep it from reading as wallpaper.
      const empty = rnd() < 0.07;
      const h = empty ? 0.001 : 0.9 + rnd() * 0.25;
      m.compose(new THREE.Vector3(s.x, top + 0.95 * h, s.z), q, new THREE.Vector3(1, h, 1));
      fans.setMatrixAt(i, m);
      // Darker than their real colors: the house lights are on the court, and
      // a crowd lit like the floor fights it for attention. Each row up sits
      // further from the light, so the bowl fades into the dark toward the
      // back (PLANO-3D Etapa 2: the penumbra, without a single extra light).
      const dusk = 1 - (s.row / (ROWS - 1)) * 0.55;
      const [shirt, visitor] = shirtFor();
      c.set(shirt).multiplyScalar((0.38 + rnd() * 0.2) * dusk);
      fans.setColorAt(i, c);
      m.compose(new THREE.Vector3(s.x, top + 1.9 * h + 0.4, s.z), q, new THREE.Vector3(h, h, h));
      heads.setMatrixAt(i, m);
      c.set(skins[Math.floor(rnd() * skins.length)]).multiplyScalar(0.55 * dusk);
      heads.setColorAt(i, c);
      // Arms from the shoulders, in the same skin, a little lighter: up in
      // the air they catch the light the seated crowd doesn't.
      m.compose(new THREE.Vector3(s.x, top + 1.75 * h, s.z), q, new THREE.Vector3(h, h, h));
      arms.setMatrixAt(i, m);
      arms.setColorAt(i, c.multiplyScalar(1.5));
      fanAttr[i * 3] = rnd();
      fanAttr[i * 3 + 1] = visitor ? 0 : 1;
      // Most are into it; some just watch.
      fanAttr[i * 3 + 2] = 0.55 + rnd() * 0.45;
      if (!empty && flashSpots.length < FLASH_SPOTS && rnd() < 0.012) {
        flashSpots.push(new THREE.Vector3(s.x, top + 1.9 * h + 0.9, s.z));
      }
    });
    [fanGeo, headGeo, armGeo].forEach((g) => g.setAttribute('aFan', new THREE.InstancedBufferAttribute(fanAttr, 3)));
    [risers, fans, heads, arms].forEach((im) => {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
    });
    return { risers, fans, heads, arms, flashSpots };
  }, [primary, secondary, awayPrimary]);

  // Each side's level rises fast and settles slowly once its hold runs out.
  const level = useRef({ home: 0, away: 0 });
  useFrame(({ clock, camera }, dt) => {
    crowdUniforms.uCam.value.copy(camera.position);
    const h = hype?.current;
    const now = nowS();
    const lv = level.current;
    const ease = (cur: number, target: number) => cur + (target - cur) * Math.min(1, dt * (target > cur ? 6 : 1.1));
    lv.home = ease(lv.home, h && now < h.homeUntil ? h.home : 0);
    lv.away = ease(lv.away, h && now < h.awayUntil ? h.away : 0);
    crowdUniforms.uHome.value = lv.home;
    crowdUniforms.uAway.value = lv.away;
    crowdUniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <>
      <primitive object={risers} />
      <primitive object={fans} />
      <primitive object={heads} />
      <primitive object={arms} />
      <Flashes spots={flashSpots} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Phone flashes in the crowd.                                         */
/* ------------------------------------------------------------------ */
// A few dozen fixed spots in the stands, one InstancedMesh of tiny additive
// squares; each fires now and then for a few frames. Only the instances that
// change get a new matrix, and nothing is lit -- it's paint, not light.
const FLASH_SPOTS = 36;
const FLASH_LIFE = 0.09; // seconds a flash stays up
const FLASH_RATE = 2.2; // flashes per second across the whole bowl

function Flashes({ spots }: { spots: THREE.Vector3[] }) {
  const mesh = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1.1, 1.1);
    const mat = new THREE.MeshBasicMaterial({
      color: '#fffaf0', transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < im.count; i++) im.setMatrixAt(i, hidden);
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    return im;
  }, [spots]);
  const until = useMemo(() => new Float32Array(spots.length), [spots]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3() }), []);

  useFrame(({ clock, camera }, dt) => {
    if (spots.length === 0) return;
    const now = clock.getElapsedTime();
    let dirty = false;
    // Start new flashes at FLASH_RATE per second on average.
    if (Math.random() < FLASH_RATE * dt) {
      const i = Math.floor(Math.random() * spots.length);
      // Not from a seat cleared for the lens: it would hang in the air.
      if (spots[i].distanceTo(camera.position) >= LENS_CLEAR_FT) until[i] = now + FLASH_LIFE;
    }
    for (let i = 0; i < spots.length; i++) {
      const on = until[i] > now;
      const was = until[i] > 0;
      if (on) {
        // Face the camera so the square reads as a point of light.
        tmp.q.copy(camera.quaternion);
        tmp.s.setScalar(0.8 + Math.random() * 0.5);
        tmp.m.compose(spots[i], tmp.q, tmp.s);
        mesh.setMatrixAt(i, tmp.m);
        dirty = true;
      } else if (was) {
        until[i] = 0;
        tmp.m.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, tmp.m);
        dirty = true;
      }
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}

/* ------------------------------------------------------------------ */
/* Courtside: LED ribbons, scorer's table, benches.                    */
/* ------------------------------------------------------------------ */
// The ribbons flare and race for a moment after every basket.
const LED_BASE = 1.1;
const LED_FLASH = 1.2; // seconds

function Courtside({ primary, secondary, label, scored }: ArenaProps & { label?: string; scored: number }) {
  const led = useMemo(() => {
    const tex = buildLedTexture(primary, secondary, label);
    tex.repeat.set(6, 1);
    return new THREE.MeshLambertMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: LED_BASE });
  }, [primary, secondary, label]);
  const flash = useRef(0);
  const lastScored = useRef(scored);
  useEffect(() => {
    if (scored > lastScored.current) flash.current = 1;
    lastScored.current = scored;
  }, [scored]);
  const ledEnd = useMemo(() => {
    const m = led.clone();
    m.emissiveMap = led.emissiveMap!.clone();
    m.emissiveMap.repeat.set(3, 1);
    m.emissiveMap.needsUpdate = true;
    return m;
  }, [led]);

  useFrame(({ clock }, dt) => {
    const f = flash.current;
    const speed = 0.04 + f * 0.6;
    led.emissiveMap!.offset.x = (led.emissiveMap!.offset.x + dt * speed) % 1;
    ledEnd.emissiveMap!.offset.x = (ledEnd.emissiveMap!.offset.x + dt * speed) % 1;
    const glow = LED_BASE + f * 1.4 * (0.6 + 0.4 * Math.sin(clock.getElapsedTime() * 28));
    led.emissiveIntensity = glow;
    ledEnd.emissiveIntensity = glow;
    flash.current = Math.max(0, f - dt / LED_FLASH);
  });

  const chairs = useMemo(() => {
    const geo = new THREE.BoxGeometry(1.6, 3, 1.5);
    const mat = new THREE.MeshLambertMaterial({ color: primary });
    const xs: number[] = [];
    for (let x = 9; x <= 27; x += 2.2) xs.push(x, -x);
    const im = new THREE.InstancedMesh(geo, mat, xs.length);
    const m = new THREE.Matrix4();
    xs.forEach((x, i) => { m.makeTranslation(x, 1.5, HALF_W + 7.5); im.setMatrixAt(i, m); });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [primary]);

  return (
    <group>
      {/* Sideline ribbons, behind the benches on the near side and courtside on the far. */}
      {[[0, HALF_W + 9.6, 0], [0, -(HALF_W + 7), Math.PI]].map(([x, z, r], i) => (
        <mesh key={`s${i}`} position={[x, 1.4, z]} rotation={[0, r, 0]} material={led}>
          <boxGeometry args={[HALF_L * 2 + 8, 2.8, 0.4]} />
        </mesh>
      ))}
      {[1, -1].map((s) => (
        <mesh key={`b${s}`} position={[s * (HALF_L + 11), 1.4, 0]} rotation={[0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0]} material={ledEnd}>
          <boxGeometry args={[HALF_W * 2 + 6, 2.8, 0.4]} />
        </mesh>
      ))}

      {/* Scorer's table at center court, near sideline. */}
      <mesh position={[0, 1.6, HALF_W + 6]}>
        <boxGeometry args={[24, 3.2, 3]} />
        <meshLambertMaterial color="#14161d" />
      </mesh>
      <mesh position={[0, 1.6, HALF_W + 4.48]} material={led}>
        <boxGeometry args={[23.6, 2.6, 0.05]} />
      </mesh>
      <primitive object={chairs} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Center-hung scoreboard and the ceiling.                             */
/* ------------------------------------------------------------------ */
function Scoreboard({ primary, secondary, board, awayPrimary }: ArenaProps & { board: ScoreboardData; awayPrimary: string }) {
  // One texture on all four screens, repainted only when what it shows changes.
  const tex = useMemo(() => buildScoreboardTexture(), []);
  const screen = useMemo(
    () => new THREE.MeshLambertMaterial({ color: '#05060a', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.95 }),
    [tex],
  );
  const face = {
    homeLabel: board.homeLabel ?? '',
    awayLabel: board.awayLabel ?? '',
    home: board.home,
    away: board.away,
    period: periodLabel(board.quarter),
    clock: clockLabel(board.clock),
    homeColor: primary,
    awayColor: awayPrimary,
  };
  const key = JSON.stringify(face);
  useEffect(() => { paintScoreboard(tex, face); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const trim = useMemo(() => new THREE.MeshLambertMaterial({ color: '#05060a', emissive: secondary, emissiveIntensity: 0.45 }), [secondary]);

  return (
    <group position={[0, 62, 0]}>
      <mesh>
        <boxGeometry args={[22, 13, 16]} />
        <meshLambertMaterial color="#0d0f15" />
      </mesh>
      {/* Four screens. */}
      <mesh position={[0, 0, 8.05]} material={screen}><planeGeometry args={[20, 10.5]} /></mesh>
      <mesh position={[0, 0, -8.05]} rotation={[0, Math.PI, 0]} material={screen}><planeGeometry args={[20, 10.5]} /></mesh>
      <mesh position={[11.05, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={screen}><planeGeometry args={[14, 10.5]} /></mesh>
      <mesh position={[-11.05, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={screen}><planeGeometry args={[14, 10.5]} /></mesh>
      {/* LED rings top and bottom. */}
      <mesh position={[0, -6.8, 0]} material={trim}><boxGeometry args={[22.4, 0.5, 16.4]} /></mesh>
      <mesh position={[0, 6.8, 0]} material={trim}><boxGeometry args={[22.4, 0.4, 16.4]} /></mesh>
      {/* Rigging. */}
      {[[-8, -6], [8, -6], [-8, 6], [8, 6]].map(([x, z], i) => (
        <mesh key={i} position={[x, 30, z]}>
          <cylinderGeometry args={[0.12, 0.12, 48, 6]} />
          <meshLambertMaterial color="#20232b" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Championship banners in the rafters.                                 */
/* ------------------------------------------------------------------ */
// Over the far sideline's top rows (the TV camera sits at +z), facing the
// floor: one quad per title, all reading from one texture
// (richTextures.buildBannerTexture), up to 10 to a row.
const BANNER_W_FT = 6;
const BANNER_H_FT = 12;
const BANNER_GAP = 1.6;
const BANNERS_PER_ROW = 14;

function Banners({ years, primary, secondary }: { years: number[]; primary: string; secondary: string }) {
  const tex = useMemo(() => buildBannerTexture(years, primary, secondary), [years, primary, secondary]);
  const mat = useMemo(() => (tex ? new THREE.MeshBasicMaterial({ map: tex, color: '#c9c9c9' }) : null), [tex]);
  const quads = useMemo(() => years.map((_, i) => {
    const g = new THREE.PlaneGeometry(BANNER_W_FT, BANNER_H_FT);
    const uv = g.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / years.length);
    const row = Math.floor(i / BANNERS_PER_ROW);
    const inRow = Math.min(BANNERS_PER_ROW, years.length - row * BANNERS_PER_ROW);
    const col = i % BANNERS_PER_ROW;
    const x = (col - (inRow - 1) / 2) * (BANNER_W_FT + BANNER_GAP);
    // Over the jumbotron (y ~24-38), which hangs over the same stands; more
    // rows go up, not down into it.
    return { g, x, y: 44 + row * (BANNER_H_FT + 2) };
  }), [years]);
  if (!mat) return null;
  const z = -(BOWL_INSET_W + ROWS * ROW_DEPTH - 4);
  return (
    <group position={[0, 0, z]}>
      {quads.map((q, i) => <mesh key={i} geometry={q.g} material={mat} position={[q.x, q.y, 0]} />)}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The jumbotron on the far wall.                                       */
/* ------------------------------------------------------------------ */
// The center-hung board sits 62 ft up, out of every broadcast framing. This
// one hangs over the far stands, under the banners, where the TV and the wide
// cameras see it: the score and clock, the game's top scorer, a call for
// DEFENSE! while the visitors have the ball (the screen pulses), and the
// moment after a home basket or during a replay. Painted with the platform
// brush (richTextures.paintJumbo), only when what it shows changes.
const JUMBO_FT_W = 45;
const JUMBO_FT_H = (JUMBO_FT_W * JUMBO_H) / JUMBO_W;
// Low enough for the broadcast camera on a phone held upright (it sees the far
// wall up to ~50 ft; the last rows of fans hide the bottom edge a little).
const JUMBO_Y = 31;
const JUMBO_Z = -(BOWL_INSET_W + ROWS * ROW_DEPTH + 1.5);

export type JumboData = Omit<JumboFace, 'homeColor' | 'awayColor' | 'accent'>;

function Jumbotron({ face, primary, secondary, awayPrimary }: { face: JumboData; primary: string; secondary: string; awayPrimary: string }) {
  const tex = useMemo(() => createJumboTexture(), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [tex]);
  // The accent: the home secondary when it reads on black, else white.
  const accent = useMemo(() => {
    const c = new THREE.Color(secondary);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.18 ? secondary : '#f5f5f5';
  }, [secondary]);
  const full: JumboFace = { ...face, homeColor: primary, awayColor: awayPrimary, accent };
  const key = JSON.stringify(full);
  const [fontTick, setFontTick] = React.useState(0);
  useEffect(() => { onPainterReady(() => setFontTick((n) => n + 1)); }, []);
  useEffect(() => { paintJumbo(tex, full); }, [key, fontTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const defense = !!face.defense && !face.message;
  useFrame(({ clock }) => {
    const k = defense ? 0.72 + 0.28 * Math.abs(Math.sin(clock.getElapsedTime() * 4.5)) : 1;
    if (mat.color.r !== k) mat.color.setScalar(k);
  });
  return (
    <group position={[0, JUMBO_Y, JUMBO_Z]}>
      <mesh position={[0, 0, -0.6]}>
        <boxGeometry args={[JUMBO_FT_W + 2, JUMBO_FT_H + 2, 1]} />
        <meshLambertMaterial color="#0b0d12" />
      </mesh>
      <mesh material={mat}>
        <planeGeometry args={[JUMBO_FT_W, JUMBO_FT_H]} />
      </mesh>
    </group>
  );
}

function CeilingLights() {
  const lights = useMemo(() => {
    const geo = new THREE.BoxGeometry(3, 0.6, 3);
    const mat = new THREE.MeshBasicMaterial({ color: '#fff7e8' });
    const pts: [number, number][] = [];
    for (let x = -60; x <= 60; x += 15) for (let z = -36; z <= 36; z += 18) pts.push([x, z]);
    const im = new THREE.InstancedMesh(geo, mat, pts.length);
    const m = new THREE.Matrix4();
    pts.forEach(([x, z], i) => { m.makeTranslation(x, 118, z); im.setMatrixAt(i, m); });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, []);
  return <primitive object={lights} />;
}

/* ------------------------------------------------------------------ */
/* Spotlight beams, painted.                                            */
/* ------------------------------------------------------------------ */
// No real spotlights (no shadow maps, no extra lights -- PLANO-3D's budget):
// open cones from the rig down to each light pool painted into the floor, in
// additive blending. The shader fades a cone's silhouette edges (where the
// surface turns away from the camera) and its foot, so it reads as light
// through haze rather than as a plastic funnel. All cones are one geometry:
// one draw call.
const BEAM_TOP = 112;
const BEAM_UNDER_SCOREBOARD = 54; // the center pool's beam starts below the scoreboard

const beamVertex = `
  varying vec3 vN;
  varying vec3 vV;
  varying float vH;
  varying float vDist;
  attribute float height01;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vH = height01;
    vDist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const beamFragment = `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vN;
  varying vec3 vV;
  varying float vH;
  varying float vDist;
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float body = facing * facing;
    // Bright near the rig, thinning toward the floor and gone well before it,
    // so a beam never lays haze over the paint (the center emblem).
    float fade = smoothstep(0.05, 0.45, vH) * (0.2 + 0.8 * vH);
    // A beam the camera is inside of, or looking straight down the length
    // of, piles both faces over a big patch of screen: fade the near ones out.
    float near = smoothstep(40.0, 95.0, vDist);
    gl_FragColor = vec4(uColor * (uStrength * body * fade * near), 1.0);
  }
`;

function SpotBeams() {
  const mesh = useMemo(() => {
    const parts = LIGHT_POOLS.map(([x, z]) => {
      const top = x === 0 && z === 0 ? BEAM_UNDER_SCOREBOARD : BEAM_TOP;
      const g = new THREE.CylinderGeometry(1.6, 11, top, 24, 1, true);
      g.translate(x, top / 2, z);
      // 0 at the floor, 1 at the rig, whatever the cone's height.
      const pos = g.getAttribute('position');
      const h = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) h[i] = pos.getY(i) / top;
      g.setAttribute('height01', new THREE.BufferAttribute(h, 1));
      return g;
    });
    const merged = mergeParts(parts, ['position', 'normal', 'height01']);
    const mat = new THREE.ShaderMaterial({
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      uniforms: { uColor: { value: new THREE.Color('#fff1d6') }, uStrength: { value: 0.12 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(merged, mat);
    m.frustumCulled = false;
    m.name = 'spotBeams';
    return m;
  }, []);
  return <primitive object={mesh} />;
}

/* ------------------------------------------------------------------ */
/* A basket: padded stanchion, glass, rim, net, shot clock.            */
/* ------------------------------------------------------------------ */
const BOARD_FACE = HALF_L - 4; // backboard plane, 4 ft inside the baseline
export const RIM_X = 41.75;
const RIM_Y = 10;

// The net whips when the ball drops through: stretched long and pinched,
// swinging back and forth, settling over NET_SETTLE seconds. Triggered here in
// the 3D (the ball crossing rim height inside the ring), so it needs no data
// from the director.
const NET_SETTLE = 0.75;

function Hoop({ side, primary, courtRef, shotClockMat, violation }: {
  side: 1 | -1;
  primary: string;
  courtRef?: React.MutableRefObject<CourtState | null>;
  shotClockMat: THREE.Material;
  violation: boolean;
}) {
  const net = useMemo(() => {
    const tex = buildNetTexture();
    tex.repeat.set(1, 1);
    // Tapered: wide at the rim, pinching in toward the bottom, a slight
    // flare at the very end where the cords hang free.
    const pts = [
      new THREE.Vector2(0.75, 0),
      new THREE.Vector2(0.66, -0.4),
      new THREE.Vector2(0.54, -0.85),
      new THREE.Vector2(0.44, -1.3),
      new THREE.Vector2(0.47, -1.55),
    ];
    const geo = new THREE.LatheGeometry(pts, 20);
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    return new THREE.Mesh(geo, mat);
  }, []);

  // LED edge around the glass, red, that lights on a shot-clock violation. Its
  // trigger is the live shot clock (PLANO-3D Etapa 5); until then it sits dark.
  const ledEdge = useMemo(() => {
    const t = 0.1;
    const parts = [
      new THREE.BoxGeometry(0.14, t, 6).translate(0, 12.5 + t / 2, 0),
      new THREE.BoxGeometry(0.14, t, 6).translate(0, 9.0 - t / 2, 0),
      new THREE.BoxGeometry(0.14, 3.5 + 2 * t, t).translate(0, 10.75, 3 + t / 2),
      new THREE.BoxGeometry(0.14, 3.5 + 2 * t, t).translate(0, 10.75, -3 - t / 2),
    ];
    const geo = mergeParts(parts, ['position', 'normal', 'uv']);
    const mat = new THREE.MeshLambertMaterial({ color: '#2a0806', emissive: '#ff2a1a', emissiveIntensity: 0.12 });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'shotClockEdge';
    return m;
  }, []);
  // Lit when the shot clock runs out.
  useEffect(() => {
    (ledEdge.material as THREE.MeshLambertMaterial).emissiveIntensity = violation ? 2.2 : 0.12;
  }, [violation, ledEdge]);

  // What holds the rim: a mounting plate on the glass, the arm out to the
  // ring, and the breakaway spring housing under it -- one mesh. Built in the
  // rim's own frame (+x toward the glass).
  const mount = useMemo(() => {
    const toBoard = BOARD_FACE - RIM_X;
    const arm = toBoard - 0.7;
    const parts = [
      new THREE.BoxGeometry(0.1, 0.9, 1.0).translate(toBoard - 0.12, -0.2, 0),
      new THREE.BoxGeometry(arm, 0.14, 0.42).translate(0.7 + arm / 2, 0, 0),
      new THREE.CylinderGeometry(0.13, 0.13, 0.42, 10).rotateZ(Math.PI / 2).translate(toBoard - 0.45, -0.26, 0),
    ];
    const geo = mergeParts(parts, ['position', 'normal', 'uv']);
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#ff4f12' }));
  }, []);

  // The rim assembly pivots at the glass, so a dunk pulls it down and lets it
  // spring back (Etapa 4 sets the kick, this eases it).
  const pivot = useMemo(() => new THREE.Group(), []);
  const ripple = useRef({ t: NET_SETTLE, lastY: 20 });
  const kick = useRef(0);
  useFrame((_, dt) => {
    const court = courtRef?.current;
    const r = ripple.current;
    if (court) {
      const b = court.ball;
      const inRing = Math.hypot(b.x - side * RIM_X, b.z) < 0.8;
      if (inRing && r.lastY > RIM_Y && b.y <= RIM_Y) r.t = 0;
      r.lastY = b.y;
      // A dunk finishing at this end yanks the rim down (PLANO-3D Etapa 4).
      const dunker = court.players.find((p) => p.action === 'dunk' && (p.actionT ?? 0) > 0.55 && Math.sign(p.x) === side);
      if (dunker && kick.current < 0.2) kick.current = 1;
    }
    if (r.t < NET_SETTLE) {
      r.t += dt;
      const env = Math.max(0, 1 - r.t / NET_SETTLE);
      const k = r.t * 16;
      net.scale.set(1 - 0.16 * env, 1 + 0.32 * env * Math.abs(Math.sin(k)), 1 - 0.16 * env);
      net.rotation.x = 0.1 * env * Math.sin(k * 0.8);
      net.rotation.z = 0.06 * env * Math.cos(k * 0.6);
    } else if (net.scale.y !== 1) {
      net.scale.set(1, 1, 1);
      net.rotation.set(0, 0, 0);
    }
    kick.current = Math.max(0, kick.current - dt * 1.6);
    // Pulled down, then a damped bounce back up.
    pivot.rotation.z = side * 0.16 * kick.current * Math.cos((1 - kick.current) * 18);
  });

  const s = side;
  const boardX = s * BOARD_FACE;
  const glass = (
    <meshPhongMaterial color="#d8e6f2" transparent opacity={0.22} shininess={90} depthWrite={false} />
  );
  const white = <meshLambertMaterial color="#f4f4f4" />;
  const frame: [number, number, number, number, number, number][] = [
    // [y, z, h, w] for the outer edge and the shooter's square (24 x 18 in).
    [12.5, 0, 0.15, 6, 0, 0], [9.0, 0, 0.15, 6, 0, 0], [10.75, 3, 3.5, 0.15, 0, 0], [10.75, -3, 3.5, 0.15, 0, 0],
    [11.5, 0, 0.12, 2, 0, 0], [10.0, 0, 0.12, 2, 0, 0], [10.75, 1, 1.5, 0.12, 0, 0], [10.75, -1, 1.5, 0.12, 0, 0],
  ];

  return (
    <group>
      {/* Stanchion: padded base behind the baseline, the arm reaching over. */}
      <mesh position={[s * (HALF_L + 6.5), 2.2, 0]}>
        <boxGeometry args={[6, 4.4, 6.5]} />
        <meshLambertMaterial color={primary} />
      </mesh>
      {/* The pad on the court-facing side of the base: a thick slab proud of
          the frame, the part players actually run into. */}
      <mesh position={[s * (HALF_L + 3.2), 2.35, 0]}>
        <boxGeometry args={[0.7, 4.7, 6.9]} />
        <meshLambertMaterial color={primary} />
      </mesh>
      <mesh position={[s * (HALF_L + 4.2), 2.2, 0]}>
        <boxGeometry args={[1.4, 4.4, 5.2]} />
        <meshLambertMaterial color="#14161d" />
      </mesh>
      <mesh position={[s * (HALF_L + 5.5), 9, 0]} rotation={[0, 0, s * 0.42]}>
        <boxGeometry args={[1.1, 12, 1.1]} />
        <meshLambertMaterial color="#1a1c22" />
      </mesh>
      <mesh position={[s * (HALF_L + 0.6), 13.2, 0]}>
        <boxGeometry args={[8.4, 0.9, 0.9]} />
        <meshLambertMaterial color="#1a1c22" />
      </mesh>
      {/* Pad wrapping the bottom of the board. */}
      <mesh position={[boardX, 8.85, 0]}>
        <boxGeometry args={[0.45, 0.35, 6.1]} />
        <meshLambertMaterial color={primary} />
      </mesh>
      {/* Glass. */}
      <mesh position={[boardX, 10.75, 0]} renderOrder={2}>
        <boxGeometry args={[0.12, 3.5, 6]} />
        {glass}
      </mesh>
      {frame.map(([y, z, h, w], i) => (
        <mesh key={i} position={[boardX - s * 0.07, y, z]}>
          <boxGeometry args={[0.03, h, w]} />
          {white}
        </mesh>
      ))}
      {/* Shot clock on top, its face toward the court showing the live count. */}
      <mesh position={[boardX, 13.4, 0]}>
        <boxGeometry args={[0.8, 0.9, 2.6]} />
        <meshLambertMaterial color="#0b0b0e" />
      </mesh>
      <mesh position={[boardX - s * 0.42, 13.4, 0]} rotation={[0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0]} material={shotClockMat}>
        <planeGeometry args={[2.4, 0.8]} />
      </mesh>
      <primitive object={ledEdge} position={[boardX - s * 0.02, 0, 0]} />
      {/* Rim, mount and net hang off one pivot at the glass. The inner group
          turns the rim's own frame (+x toward the glass) to face this end. */}
      <group position={[s * BOARD_FACE, RIM_Y, 0]}>
        <primitive object={pivot}>
          <group rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
            <group position={[-(BOARD_FACE - RIM_X), 0, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.75, 0.055, 10, 32]} />
                <meshLambertMaterial color="#ff4f12" />
              </mesh>
              <primitive object={mount} />
              <primitive object={net} />
            </group>
          </group>
        </primitive>
      </group>
    </group>
  );
}

// The screen's scoreboard state changes five times a second, and every change
// re-rendered the whole arena -- ~3,300 seats, the lights, both hoops -- for
// nothing. The parts that don't read the score or the clock sit behind memo.
const BowlM = React.memo(Bowl);
const CourtsideM = React.memo(Courtside);
const CeilingLightsM = React.memo(CeilingLights);
const SpotBeamsM = React.memo(SpotBeams);
const BannersM = React.memo(Banners);
const HoopM = React.memo(Hoop);

const IDLE_BOARD: ScoreboardData = { home: 0, away: 0, quarter: 1, clock: 12 * 60 };

export default function Arena({ primary, secondary, courtRef, board = IDLE_BOARD, awayPrimary, homeLabel, banners, hype, jumbo }: ArenaProps & {
  /** What the far-wall jumbotron shows; absent: no jumbotron. */
  jumbo?: JumboData;
  /** How worked up the crowd is (cheer). */
  hype?: React.MutableRefObject<CrowdHype>;
  /** The home team's title years, for the rafters. */
  banners?: number[];
  courtRef?: React.MutableRefObject<CourtState | null>;
  board?: ScoreboardData;
  awayPrimary?: string;
  homeLabel?: string;
}) {
  // Both shot clocks show the same count: one texture, repainted on change.
  const shotTex = useMemo(() => buildShotClockTexture(), []);
  const shotClockMat = useMemo(() => new THREE.MeshBasicMaterial({ map: shotTex }), [shotTex]);
  const shot = board.shotClock === undefined ? null : Math.max(0, Math.ceil(board.shotClock));
  useEffect(() => { paintShotClock(shotTex, shot); }, [shot, shotTex]);
  const violation = shot === 0;
  return (
    <>
      {/* The arena floor around the hardwood. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[420, 320]} />
        <meshLambertMaterial color="#101219" />
      </mesh>
      <BowlM primary={primary} secondary={secondary} awayPrimary={awayPrimary} hype={hype} />
      <CourtsideM primary={primary} secondary={secondary} label={homeLabel} scored={board.home + board.away} />
      <Scoreboard primary={primary} secondary={secondary} board={board} awayPrimary={awayPrimary ?? secondary} />
      <CeilingLightsM />
      <SpotBeamsM />
      {banners && banners.length ? <BannersM years={banners} primary={primary} secondary={secondary} /> : null}
      {jumbo ? <Jumbotron face={jumbo} primary={primary} secondary={secondary} awayPrimary={awayPrimary ?? secondary} /> : null}
      <HoopM side={1} primary={primary} courtRef={courtRef} shotClockMat={shotClockMat} violation={violation} />
      <HoopM side={-1} primary={primary} courtRef={courtRef} shotClockMat={shotClockMat} violation={violation} />
    </>
  );
}
