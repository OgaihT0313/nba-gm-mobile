import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

import type { CourtState } from '../../services/watchDirector';
import { buildLedTexture, buildNetTexture, hexToRgb, LIGHT_POOLS } from './textures';

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

function Bowl({ primary, secondary }: ArenaProps) {
  const { risers, fans, heads, flashSpots } = useMemo(() => {
    const seats: { x: number; z: number; rot: number; row: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      const off = r * ROW_DEPTH;
      ringPoints(BOWL_INSET_L + off, BOWL_INSET_W + off, CORNER_R + off, SEAT_PITCH).forEach((p) => {
        seats.push({ x: p.x, z: p.z, rot: Math.atan2(p.nx, p.nz), row: r });
      });
    }

    const box = new THREE.BoxGeometry(1, 1, 1);
    const riserMat = new THREE.MeshStandardMaterial({ color: '#2a3040', roughness: 0.95 });
    const risers = new THREE.InstancedMesh(box, riserMat, seats.length);
    const fanGeo = new THREE.BoxGeometry(1.25, 1.9, 0.95);
    const fanMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const fans = new THREE.InstancedMesh(fanGeo, fanMat, seats.length);
    // ~3,300 heads: a 48-triangle sphere instead of 96 halves the bowl's
    // geometry, and at stand distance nobody can count the facets.
    const headGeo = new THREE.SphereGeometry(0.42, 6, 4);
    const headMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const heads = new THREE.InstancedMesh(headGeo, headMat, seats.length);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    const shirts = [primary, primary, primary, secondary, '#f2f2f2', '#1b1d24', '#2b3a55', '#7a1f2b', '#d9d2c3'];
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
      c.set(shirts[Math.floor(rnd() * shirts.length)]).multiplyScalar((0.38 + rnd() * 0.2) * dusk);
      fans.setColorAt(i, c);
      m.compose(new THREE.Vector3(s.x, top + 1.9 * h + 0.4, s.z), q, new THREE.Vector3(h, h, h));
      heads.setMatrixAt(i, m);
      c.set(skins[Math.floor(rnd() * skins.length)]).multiplyScalar(0.55 * dusk);
      heads.setColorAt(i, c);
      if (!empty && flashSpots.length < FLASH_SPOTS && rnd() < 0.012) {
        flashSpots.push(new THREE.Vector3(s.x, top + 1.9 * h + 0.9, s.z));
      }
    });
    [risers, fans, heads].forEach((im) => {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
    });
    return { risers, fans, heads, flashSpots };
  }, [primary, secondary]);

  return (
    <>
      <primitive object={risers} />
      <primitive object={fans} />
      <primitive object={heads} />
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
      until[i] = now + FLASH_LIFE;
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
function Courtside({ primary, secondary }: ArenaProps) {
  const led = useMemo(() => {
    const tex = buildLedTexture(primary, secondary);
    tex.repeat.set(6, 1);
    return new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.1, roughness: 0.4 });
  }, [primary, secondary]);
  const ledEnd = useMemo(() => {
    const m = led.clone();
    m.emissiveMap = led.emissiveMap!.clone();
    m.emissiveMap.repeat.set(3, 1);
    m.emissiveMap.needsUpdate = true;
    return m;
  }, [led]);

  useFrame((_, dt) => {
    led.emissiveMap!.offset.x = (led.emissiveMap!.offset.x + dt * 0.04) % 1;
    ledEnd.emissiveMap!.offset.x = (ledEnd.emissiveMap!.offset.x + dt * 0.04) % 1;
  });

  const chairs = useMemo(() => {
    const geo = new THREE.BoxGeometry(1.6, 3, 1.5);
    const mat = new THREE.MeshStandardMaterial({ color: primary, roughness: 0.7 });
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
        <meshStandardMaterial color="#14161d" roughness={0.6} />
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
function Scoreboard({ primary, secondary }: ArenaProps) {
  const screen = useMemo(() => {
    const [r, g, b] = hexToRgb(primary);
    const c = new THREE.Color(`rgb(${r},${g},${b})`).lerp(new THREE.Color('#ffffff'), 0.15);
    return new THREE.MeshStandardMaterial({ color: '#05060a', emissive: c, emissiveIntensity: 0.75, roughness: 0.3 });
  }, [primary]);
  const trim = useMemo(() => new THREE.MeshStandardMaterial({ color: '#05060a', emissive: secondary, emissiveIntensity: 0.45 }), [secondary]);

  return (
    <group position={[0, 62, 0]}>
      <mesh>
        <boxGeometry args={[22, 13, 16]} />
        <meshStandardMaterial color="#0d0f15" roughness={0.5} metalness={0.4} />
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
          <meshStandardMaterial color="#20232b" />
        </mesh>
      ))}
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

function Hoop({ side, primary, courtRef }: {
  side: 1 | -1;
  primary: string;
  courtRef?: React.MutableRefObject<CourtState | null>;
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
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
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
    const mat = new THREE.MeshStandardMaterial({ color: '#2a0806', emissive: '#ff2a1a', emissiveIntensity: 0.12, roughness: 0.4 });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'shotClockEdge';
    return m;
  }, []);

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
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ff4f12', roughness: 0.35, metalness: 0.5 }));
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
    <meshPhysicalMaterial color="#d8e6f2" transmission={0} transparent opacity={0.22} roughness={0.05} metalness={0.1} depthWrite={false} />
  );
  const white = <meshStandardMaterial color="#f4f4f4" roughness={0.4} />;
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
        <meshStandardMaterial color={primary} roughness={0.75} />
      </mesh>
      {/* The pad on the court-facing side of the base: a thick slab proud of
          the frame, the part players actually run into. */}
      <mesh position={[s * (HALF_L + 3.2), 2.35, 0]}>
        <boxGeometry args={[0.7, 4.7, 6.9]} />
        <meshStandardMaterial color={primary} roughness={0.95} />
      </mesh>
      <mesh position={[s * (HALF_L + 4.2), 2.2, 0]}>
        <boxGeometry args={[1.4, 4.4, 5.2]} />
        <meshStandardMaterial color="#14161d" roughness={0.6} />
      </mesh>
      <mesh position={[s * (HALF_L + 5.5), 9, 0]} rotation={[0, 0, s * 0.42]}>
        <boxGeometry args={[1.1, 12, 1.1]} />
        <meshStandardMaterial color="#1a1c22" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[s * (HALF_L + 0.6), 13.2, 0]}>
        <boxGeometry args={[8.4, 0.9, 0.9]} />
        <meshStandardMaterial color="#1a1c22" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Pad wrapping the bottom of the board. */}
      <mesh position={[boardX, 8.85, 0]}>
        <boxGeometry args={[0.45, 0.35, 6.1]} />
        <meshStandardMaterial color={primary} roughness={0.7} />
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
      {/* Shot clock on top. */}
      <mesh position={[boardX, 13.4, 0]}>
        <boxGeometry args={[0.8, 0.9, 2.6]} />
        <meshStandardMaterial color="#0b0b0e" emissive="#ff2a1a" emissiveIntensity={0.55} />
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
                <meshStandardMaterial color="#ff4f12" roughness={0.35} metalness={0.5} />
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

export default function Arena({ primary, secondary, courtRef }: ArenaProps & {
  courtRef?: React.MutableRefObject<CourtState | null>;
}) {
  return (
    <>
      {/* The arena floor around the hardwood. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[420, 320]} />
        <meshStandardMaterial color="#101219" roughness={0.95} />
      </mesh>
      <Bowl primary={primary} secondary={secondary} />
      <Courtside primary={primary} secondary={secondary} />
      <Scoreboard primary={primary} secondary={secondary} />
      <CeilingLights />
      <SpotBeams />
      <Hoop side={1} primary={primary} courtRef={courtRef} />
      <Hoop side={-1} primary={primary} courtRef={courtRef} />
    </>
  );
}
