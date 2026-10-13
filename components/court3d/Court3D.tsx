import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, PanResponder, View } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';

import type { CourtState } from '../../services/watchDirector';
import Arena, { RIM_X, type CrowdHype, type ScoreboardData } from './Arena';
import { createRig, dribblePhase, type Rig, type RigPlayer } from './PlayerRig';
import { loadPainterFont, painterReady } from './painter';
import { buildApronDecal, buildCenterDecal } from './richTextures';
import { buildBallTexture, buildFloorTexture, buildShadowTexture, hexToRgb, FLOOR_L, FLOOR_W } from './textures';

export type { ScoreboardData, CrowdHype };

/** What the court hears: the ball off the floor, a sneaker on it. */
export type CourtSound = 'bounce' | 'squeak';

// The 3D "Assistir ao Jogo" court, rendered natively through expo-gl by React
// Three Fiber.
//
// Rebuilt from the original prototype (a port of quadra-3d.html: cylinder
// dolls, one-pixel GL lines, flat brown floor, grey boxes for stands). What it
// draws now:
//   - hardwood with the court PAINTED into it (textures.ts): strips, two-inch
//     lines, the lane and apron in the home colors, the tricode at center;
//   - an arena around it (Arena.tsx): a full bowl of seated fans, courtside LED
//     ribbons, the scorer's table and benches, a center-hung scoreboard, real
//     baskets with glass, a net and a shot clock;
//   - ten jointed players (PlayerRig.ts) who run, defend, dribble and go up for
//     shots, in their team's jersey with their own number;
//   - a pebbled ball with seams, and a soft contact shadow under every body.
//
// Budget is a mid-range Android phone: every texture is computed once, repeated
// things are instanced, and there are no real-time shadow maps or
// post-processing -- contact shadows and lighting carry the depth instead.
//
// WHAT THE COMPONENT DOES NOT DO: decide anything. Where the ten players are
// and where the ball is comes entirely from services/watchDirector.ts. This
// file is a renderer.

export interface TeamVisual {
  primary: string;
  secondary: string;
}

/** Per-Era-Group visual touch (see src/theme/eraVisuals.ts): the wood tone. */
export interface Court3DVisual {
  floorColor?: string;
}

/** Fixed broadcast-style framings. `iso` free-orbits; the others hold an
 * angle the way a broadcast camera does, easing back after a drag. */
export type CameraView = 'iso' | 'tv' | 'close' | 'overhead' | 'behind_basket';

interface CameraPreset {
  angle: number;
  elev: number;
  dist: number;
  autoRotate: boolean;
  /** How hard this framing tracks the ball, 0 = locked on center court. */
  follow: number;
  /** Look-at height. The close camera aims at chest height, not the floor. */
  targetY?: number;
  /** Fraction of the gap to the ball the camera still has left after one
   * second -- small is snappy. The wide shots drift; the close one has to
   * stay on the play or it films an empty floor. */
  lag?: number;
}

const CAMERA_PRESETS: Record<CameraView, CameraPreset> = {
  iso: { angle: 0.62, elev: 0.46, dist: 108, autoRotate: true, follow: 0.35 },
  // From up in the near stands, above the back row: the bowl's last row sits
  // ~27 ft up and ~75 ft out, so the camera clears it rather than filming the
  // back of the crowd's heads (seen at 0.3 elev: fans covered half the court).
  tv: { angle: Math.PI / 2, elev: 0.45, dist: 98, autoRotate: false, follow: 0.62 },
  // High, but not straight down: the scoreboard hangs over center court at
  // ~62 ft, and a vertical camera looks at the court through it. At 54° the
  // line of sight passes the scoreboard ~40 ft off its edge.
  overhead: { angle: Math.PI / 2, elev: 0.95, dist: 105, autoRotate: false, follow: 0.15 },
  // The tight sideline camera that rides the ball -- the one that shows the
  // players as players rather than as a formation.
  close: { angle: Math.PI / 2 - 0.2, elev: 0.3, dist: 46, autoRotate: false, follow: 1, targetY: 4, lag: 0.02 },
  // A touch off the axis, like the broadcast baseline camera: dead-on, the
  // near stanchion's arm runs straight up the middle of the frame.
  behind_basket: { angle: Math.PI - 0.16, elev: 0.3, dist: 118, autoRotate: false, follow: 0.75 },
};

interface Court3DProps {
  home: TeamVisual;
  away: TeamVisual;
  /** Live court state, read every frame (a ref, never props -- the director
   * produces a new state 60x a second). */
  courtRef: React.MutableRefObject<CourtState | null>;
  visual?: Court3DVisual;
  cameraView?: CameraView;
  /** Painted at center court -- the home tricode. */
  homeLabel?: string;
  /** Jersey number by player id. */
  bodies?: { [playerId: string]: RigPlayer };
  /** The home team's title years, hung in the rafters. */
  banners?: number[];
  /** The live score, period, game clock and shot clock for the arena's
   *  scoreboard and shot clocks (PLANO-3D Etapa 5). Absent: the boards idle. */
  scoreboard?: ScoreboardData;
  /** Layout pixels the screen's own overlays cover at the top and bottom; the
   *  camera centers the action in the strip between them (PLANO-3D Etapa 7). */
  insets?: { top: number; bottom: number };
  /** The home team's nickname and city, painted on its floor. */
  homeNickname?: string;
  homeCity?: string;
  /** How worked up the crowd is (Arena's cheer). */
  crowd?: React.MutableRefObject<CrowdHype>;
  /** Called when the ball hits the floor or a shoe squeaks, for the sound. */
  onSound?: (kind: CourtSound) => void;
}

const DEFAULT_FLOOR_COLOR = '#caa271'; // light maple
/** Vertical field of view on a wide screen; portrait phones get more (CameraRig). */
const BASE_FOV = 38;

/** The visitors' kit. Two blue teams (Orlando at the Knicks) read as one team
 * of ten on a phone, so when the primaries are close the road side wears the
 * white alternate with its own color as trim -- what the NBA does too. */
const roadKit = (home: TeamVisual, away: TeamVisual): TeamVisual => {
  const [r1, g1, b1] = hexToRgb(home.primary);
  const [r2, g2, b2] = hexToRgb(away.primary);
  const dist = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  return dist < 120 ? { primary: '#eeeeea', secondary: away.primary } : away;
};

/* ------------------------------------------------------------------ */
/* Camera rig -- drag to orbit, presets ease in.                       */
/* ------------------------------------------------------------------ */
export interface CameraDragState {
  angle: number;
  elev: number;
  dist: number;
  dragging: boolean;
}

/** Seconds a switch between camera modes takes, eased in and out. */
const MODE_BLEND = 0.9;
/** The bowl, for keeping the camera out of it (see Arena.tsx's Bowl). */
const BOWL = { insetL: 62, insetW: 37, rowDepth: 2.7, rowRise: 1.7, rows: 14 };
/** Feet the camera keeps above whatever is under it: floor or stands. */
const CAMERA_CLEARANCE = 4;

/** Height of the stands (or the floor) under a point -- the bowl rises in
 *  steps from its first row behind the court's edge. */
const groundUnder = (x: number, z: number) => {
  const out = Math.max(Math.abs(x) - BOWL.insetL, Math.abs(z) - BOWL.insetW);
  if (out <= 0) return 0;
  const row = Math.min(BOWL.rows - 1, Math.floor(out / BOWL.rowDepth));
  return 1 + row * BOWL.rowRise + 3.5; // the row's step plus a seated fan
};

const smoothstep = (t: number) => t * t * (3 - 2 * t);

function CameraRig({
  stateRef, preset, courtRef, insets,
}: {
  stateRef: React.MutableRefObject<CameraDragState>;
  preset: CameraPreset;
  courtRef: React.MutableRefObject<CourtState | null>;
  insets?: { top: number; bottom: number };
}) {
  const target = useMemo(() => new THREE.Vector3(0, 5, 0), []);
  const lastCut = useRef<number | undefined>(undefined);
  // A mode switch: where the orbit started and when, so it travels to the new
  // framing along an eased curve of fixed length instead of covering a share
  // of the remaining gap every frame (which crawled the last stretch).
  const blend = useRef<{ preset: CameraPreset; from: { angle: number; elev: number; dist: number }; t: number } | null>(null);
  const lastPreset = useRef(preset);
  const probe = useMemo(() => new THREE.Vector3(), []);
  const viewShift = useRef('');

  useFrame(({ camera, size }, dt) => {
    const s = stateRef.current;
    const k = 1 - Math.pow(0.02, dt); // frame-rate independent easing
    if (lastPreset.current !== preset) {
      blend.current = { preset, from: { angle: s.angle, elev: s.elev, dist: s.dist }, t: 0 };
      lastPreset.current = preset;
    }
    if (!s.dragging) {
      const b = blend.current;
      if (b) {
        b.t += dt / MODE_BLEND;
        const e = smoothstep(Math.min(1, b.t));
        // The auto-rotating overview keeps turning; only its height and
        // distance blend. Every other framing blends all three.
        if (!preset.autoRotate) s.angle = b.from.angle + (preset.angle - b.from.angle) * e;
        s.elev = b.from.elev + (preset.elev - b.from.elev) * e;
        s.dist = b.from.dist + (preset.dist - b.from.dist) * e;
        if (b.t >= 1) blend.current = null;
      }
      if (preset.autoRotate) {
        s.angle += dt * 0.05;
      } else if (!blend.current) {
        s.angle = THREE.MathUtils.lerp(s.angle, preset.angle, k);
        s.elev = THREE.MathUtils.lerp(s.elev, preset.elev, k);
        s.dist = THREE.MathUtils.lerp(s.dist, preset.dist, k);
      }
    } else {
      blend.current = null;
    }

    const court = courtRef.current;
    if (court) {
      const portrait = THREE.MathUtils.clamp((1.1 - size.width / Math.max(1, size.height)) / 0.6, 0, 1);
      // Possessions turn over every few seconds of screen time; a lazy
      // wide-shot follow (30% of the gap left after a second) never caught the
      // play and parked at center court. A tall screen, which can't see both
      // ends at once, pans like a broadcast camera: 8% left after a second.
      let lag = preset.lag ?? THREE.MathUtils.lerp(0.3, 0.08, portrait);
      // Aim at the action, not just the ball: half the ball, half the ten
      // bodies' centroid, so a skip pass or a fast break doesn't leave the
      // players out of frame while the ball is centered.
      let px = 0, pz = 0;
      court.players.forEach((pl) => { px += pl.x; pz += pl.z; });
      const n = court.players.length || 1;
      let ax = court.ball.x * 0.5 + (px / n) * 0.5;
      let az = court.ball.z * 0.5 + (pz / n) * 0.5;
      // The close camera is the action camera (PLANO-3D Etapa 7): it rides
      // whoever has the ball, and once a shot is released it swings to frame
      // the shooter and the rim together.
      if (preset.lag) {
        const holder = court.players.find((pl) => pl.hasBall);
        if (holder) {
          ax = holder.x * 0.7 + (px / n) * 0.3;
          az = holder.z * 0.7 + (pz / n) * 0.3;
        }
        const shooter = court.players.find((pl) => (pl.action === 'shot' || pl.action === 'layup' || pl.action === 'dunk') && (pl.actionT ?? 0) >= 0.4);
        if (shooter) {
          const rimX = (shooter.side === 'home' ? 1 : -1) * RIM_X;
          ax = shooter.x * 0.45 + rimX * 0.55;
          az = shooter.z * 0.45;
          lag = Math.min(lag, 0.005);
        }
      }
      // A phone held upright sees a sliver of the court horizontally (vertical
      // fov 38° at a 0.46 aspect is ~18° across): a wide shot that only
      // half-follows the play films an empty floor. The taller the screen,
      // the closer every framing gets to tracking the action fully.
      const follow = preset.follow + (1 - preset.follow) * portrait;
      const zFollow = preset.lag ? 0.8 : 0.5 + 0.4 * portrait;
      const f = 1 - Math.pow(lag, dt);
      // Playback cuts past the trip up the floor (watchDirector advanceClock):
      // every framing, the close one included, cuts with it.
      const cut = court.cut !== lastCut.current;
      lastCut.current = court.cut;
      // And when the action has left the picture altogether -- outside the
      // middle 90% of the frame -- a broadcast cuts rather than chase it:
      // waiting for a 30 ft jump (the old rule) filmed empty floor meanwhile.
      probe.set(ax * follow, 4, az * zFollow);
      probe.project(camera);
      const outOfFrame = Math.abs(probe.x) > 0.9 || Math.abs(probe.y) > 0.9;
      if (cut || (outOfFrame && !blend.current)) {
        target.x = ax * follow;
        target.z = az * zFollow;
      }
      target.x = THREE.MathUtils.lerp(target.x, ax * follow, f);
      target.z = THREE.MathUtils.lerp(target.z, az * zFollow, f);
      target.y = THREE.MathUtils.lerp(target.y, preset.targetY ?? 5, f);
    }
    // Field of view sized to the screen. At the base 38° a phone held upright
    // (aspect ~0.46) sees +-15 ft across at broadcast distance -- less than
    // a half-court set spans, so the play kept sliding out of frame even with
    // the camera centered on it. Wide shots open up until they cover +-24 ft;
    // the close camera (which rides the ball) keeps the tight lens.
    if (camera instanceof THREE.PerspectiveCamera) {
      const aspect = size.width / Math.max(1, size.height);
      const wantHalf = preset.lag ? 0 : 24 / Math.max(1, s.dist);
      const vfov = wantHalf > 0 ? THREE.MathUtils.radToDeg(2 * Math.atan(wantHalf / aspect)) : BASE_FOV;
      const fov = THREE.MathUtils.clamp(vfov, BASE_FOV, 60);
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, fov, k);
        camera.updateProjectionMatrix();
      }
      // Aim at the middle of the strip the HUD leaves free, not the middle of
      // the screen: the projection center moves down by half the difference
      // between the top and bottom overlays.
      const shift = insets ? Math.round((insets.top - insets.bottom) / 2) : 0;
      const shiftKey = `${shift}:${size.width}x${size.height}`;
      if (shiftKey !== viewShift.current) {
        viewShift.current = shiftKey;
        if (shift === 0) camera.clearViewOffset();
        else camera.setViewOffset(size.width, size.height, 0, -shift, size.width, size.height);
      }
    }
    camera.position.set(
      target.x + Math.cos(s.angle) * s.dist * Math.cos(s.elev),
      target.y + Math.sin(s.elev) * s.dist,
      target.z + Math.sin(s.angle) * s.dist * Math.cos(s.elev),
    );
    // Never inside the floor or the stands: the camera stays a few feet above
    // whatever is under it, however low a drag takes it.
    const floor = groundUnder(camera.position.x, camera.position.z) + CAMERA_CLEARANCE;
    if (camera.position.y < floor) camera.position.y = floor;
    camera.lookAt(target);
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* The floor.                                                          */
/* ------------------------------------------------------------------ */
// Dev builds only: the renderer's counters (draw calls, triangles, live
// geometries/textures), the last 240 frame times, and the scene, camera and
// renderer themselves (to toggle a light or a mesh, or time a forced render,
// from the console while tuning), on globalThis.__court3d, so each stage of
// PLANO-3D can be measured.
// useFrame runs before the render, so the counters describe the previous frame.
function RenderProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const frames = useRef<number[]>([]);
  useFrame((_, dt) => {
    const f = frames.current;
    f.push(dt * 1000);
    if (f.length > 240) f.shift();
    (globalThis as any).__court3d = {
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      frameMs: f.slice(),
      scene,
      camera,
      gl,
    };
  });
  return null;
}

function Floor({ wood, primary, secondary, label, pixelText }: { wood: string; primary: string; secondary: string; label: string; pixelText: boolean }) {
  const gl = useThree((s) => s.gl);
  const material = useMemo(() => {
    // Flipped on every platform. The phone was checked on the device
    // (2026-10-07); the browser was left unflipped and drew the tricode upside
    // down ("BOS" read "BO2", seen 2026-10-10).
    const map = buildFloorTexture({ wood, primary, secondary, label, flipRows: true, pixelText });
    // The floor is seen at a grazing angle almost all the time; anisotropic
    // filtering is what keeps the far lines crisp instead of smeared.
    map.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    // Varnished maple, with the varnish painted in (the light pools in the
    // texture) and no specular at all. The floor is a big flat mirror for any
    // light low on the far side, and the rim light that outlines the players
    // is exactly that: with a glossy floor it bounced straight into the
    // near-side cameras and washed the court grey (seen in Etapa 2). Lambert
    // is also the cheapest lit material.
    return new THREE.MeshLambertMaterial({ map });
  }, [wood, primary, secondary, label, pixelText, gl]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[FLOOR_L, FLOOR_W]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* The home team's type on its floor.                                  */
/* ------------------------------------------------------------------ */
// The nickname across center court and on both baselines, the city along the
// far sideline (the one the cameras face), in the app's display face (Skia,
// richTextures.ts). Flat quads a hair over the wood, lit like it; the floor
// itself leaves out its pixel-font lettering when these are on.
interface Decal { mat: THREE.Material; geo: THREE.PlaneGeometry; x: number; z: number; rz: number }
function CourtDecals({ primary, secondary, nickname, city }: { primary: string; secondary: string; nickname: string; city?: string }) {
  const gl = useThree((s) => s.gl);
  const decals = useMemo<Decal[]>(() => {
    const out: Decal[] = [];
    const add = (tex: THREE.DataTexture | null, w: number, h: number, x: number, z: number, rz: number) => {
      if (!tex) return;
      tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      const mat = new THREE.MeshLambertMaterial({
        map: tex, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      });
      out.push({ mat, geo: new THREE.PlaneGeometry(w, h), x, z, rz });
    };
    // Read from the near sideline: the top of the type is the far side.
    add(buildCenterDecal(nickname, primary, secondary), 16, 8, 0, 0, 0);
    // Each baseline's reads from midcourt, top toward the stanchion.
    const base = buildApronDecal(nickname, primary, secondary);
    add(base, 26, 3.25, 50.2, 0, -Math.PI / 2);
    add(base, 26, 3.25, -50.2, 0, Math.PI / 2);
    if (city) add(buildApronDecal(city, primary, secondary, 2048, 160), 52, 4.06, 0, -28.1, 0);
    return out;
  }, [primary, secondary, nickname, city, gl]);
  return (
    <>
      {decals.map((d, i) => (
        <mesh key={i} geometry={d.geo} material={d.mat} rotation={[-Math.PI / 2, 0, d.rz]} position={[d.x, 0.02, d.z]} renderOrder={1} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Players and ball.                                                   */
/* ------------------------------------------------------------------ */
const HOME_COUNT = 5;
const BALL_R = 0.39; // 9.4-inch ball, in feet

/** Backspin on a shot or a lob, radians per real second (~2 turns). */
const BACKSPIN = Math.PI * 4;

/** Seconds the ball takes to settle from one owner to the next (a catch, a release). */
const BALL_HANDOFF = 0.12;
/** A shoe squeak at most this often, anywhere on the floor. */
const SQUEAK_EVERY = 0.35;

function PlayersAndBall({
  home, away, courtRef, bodies, onSound,
}: {
  home: TeamVisual;
  away: TeamVisual;
  courtRef: React.MutableRefObject<CourtState | null>;
  bodies?: { [playerId: string]: RigPlayer };
  onSound?: React.MutableRefObject<((kind: CourtSound) => void) | undefined>;
}) {
  const shadowMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: buildShadowTexture(), transparent: true, depthWrite: false,
  }), []);

  const rigs = useMemo<Rig[]>(
    () => {
      const kit = roadKit(home, away);
      return Array.from({ length: 10 }, (_, i) => createRig(i < HOME_COUNT ? home : kit, shadowMat));
    },
    [home, away, shadowMat],
  );
  const bound = useRef<string[]>([]);
  const group = useMemo(() => {
    const g = new THREE.Group();
    rigs.forEach((r) => g.add(r.root));
    return g;
  }, [rigs]);

  const ball = useMemo(() => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 24, 16),
      new THREE.MeshStandardMaterial({ map: buildBallTexture(), roughness: 0.62 }),
    );
    return m;
  }, []);
  const ballShadow = useMemo(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.05;
    return m;
  }, [shadowMat]);
  const lastBall = useRef(new THREE.Vector3());
  const lastCut = useRef<number | undefined>(undefined);
  const spin = useMemo(() => ({ axis: new THREE.Vector3(), q: new THREE.Quaternion(), move: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  // The ball in a player's hands: where it is, who has it, and the blend from
  // its last place when it changes hands.
  const hold = useMemo(() => ({
    right: new THREE.Vector3(), left: new THREE.Vector3(), target: new THREE.Vector3(), from: new THREE.Vector3(),
    owner: -2, blend: 1, lastY: 0, lastVy: 0, lastSqueak: 0,
  }), []);

  useFrame(({ clock }, dt) => {
    const court = courtRef.current;
    if (!court) return;
    const t = clock.getElapsedTime();
    const snap = court.cut !== lastCut.current;
    lastCut.current = court.cut;

    let squeaked = false;
    court.players.forEach((p, i) => {
      const rig = rigs[i];
      if (!rig) return;
      if (bound.current[i] !== p.playerId) {
        bound.current[i] = p.playerId;
        rig.setPlayer(p.playerId, bodies?.[p.playerId] ?? { number: null });
      }
      if (rig.update({
        x: p.x, z: p.z, rotY: p.rotY, dt, time: t,
        hasBall: p.hasBall,
        onOffense: p.side === court.possession,
        ball: court.ball,
        snap,
        action: p.action,
        actionT: p.actionT,
      })) squeaked = true;
    });
    if (squeaked && t - hold.lastSqueak > SQUEAK_EVERY) {
      hold.lastSqueak = t;
      onSound?.current?.('squeak');
    }

    // Where the ball is. In someone's hands it's in HIS hands: dribbled off
    // the floor from his right hand, in time with the arm (dribblePhase), or
    // held in both for a shot or a pass. Loose, it's wherever the director
    // put it. A change of owner -- a catch, a release -- eases over a few
    // frames instead of jumping from the body's center to the hand.
    const b = court.ball;
    const owner = court.players.findIndex((p) => p.hasBall);
    if (owner >= 0) {
      const rig = rigs[owner];
      rig.hands(hold.right, hold.left);
      const pl = court.players[owner];
      const yaw = rig.yaw();
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      if (pl.action === 'shot' || pl.action === 'layup' || pl.action === 'dunk' || pl.action === 'pass' || pl.action === 'screen') {
        hold.target.addVectors(hold.right, hold.left).multiplyScalar(0.5);
        hold.target.x += fx * 0.35;
        hold.target.z += fz * 0.35;
      } else {
        const f = dribblePhase(t);
        const handY = Math.max(BALL_R, hold.right.y - BALL_R);
        hold.target.set(hold.right.x + fx * 0.3, BALL_R + (handY - BALL_R) * (2 * f - 1) ** 2, hold.right.z + fz * 0.3);
      }
    } else {
      // Lift the ball by its radius so it rests on the floor instead of in it.
      hold.target.set(b.x, Math.max(BALL_R, b.y), b.z);
    }
    if (owner !== hold.owner) {
      hold.from.copy(ball.position);
      hold.blend = snap || hold.owner === -2 ? 1 : 0;
      hold.owner = owner;
    }
    if (hold.blend < 1) {
      hold.blend = Math.min(1, hold.blend + dt / BALL_HANDOFF);
      const e = hold.blend * hold.blend * (3 - 2 * hold.blend);
      ball.position.lerpVectors(hold.from, hold.target, e);
    } else {
      ball.position.copy(hold.target);
    }
    // The bounce: the ball turning from down to up near the floor.
    const vy = (ball.position.y - hold.lastY) / Math.max(1e-3, dt);
    if (!snap && hold.lastVy < -2 && vy >= 0 && ball.position.y < BALL_R + 0.6) onSound?.current?.('bounce');
    hold.lastVy = snap ? 0 : vy;
    hold.lastY = ball.position.y;
    // Spin about the axis across the direction of travel (PLANO-3D Etapa 6):
    // in the air that's backspin -- the top turning back toward the shooter,
    // about two turns a second -- and on the floor or the bounce it rolls
    // the way it moves.
    spin.move.subVectors(ball.position, lastBall.current);
    spin.move.y = 0;
    const moved = snap ? 0 : spin.move.length();
    if (moved > 1e-4) {
      spin.axis.crossVectors(spin.up, spin.move).normalize();
      const angle = b.inFlight ? -BACKSPIN * dt : moved / BALL_R;
      spin.q.setFromAxisAngle(spin.axis, angle);
      ball.quaternion.premultiply(spin.q);
    }
    lastBall.current.copy(ball.position);
    // Contact shadow: tight and dark with the ball on the floor, spread out
    // and faint when it's up in the air.
    ballShadow.position.set(ball.position.x, 0.05, ball.position.z);
    const lift = Math.min(1, ball.position.y / 14);
    ballShadow.scale.setScalar(0.9 + lift * 1.6);
    (ballShadow.material as THREE.MeshBasicMaterial).opacity = 1 - lift * 0.72;
  });

  return (
    <>
      <primitive object={group} />
      <primitive object={ball} />
      <primitive object={ballShadow} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Scene root.                                                         */
/* ------------------------------------------------------------------ */
function Scene({
  home, away, courtRef, visual, homeLabel, bodies, scoreboard, banners, homeNickname, homeCity, crowd, soundRef,
}: Omit<Court3DProps, 'cameraView' | 'onSound'> & { soundRef: React.MutableRefObject<((kind: CourtSound) => void) | undefined> }) {
  // The type on the floor waits for the brush's font (painter.ts): until it
  // is in -- or if it never loads -- the floor paints its own pixel lettering.
  // Held back until the font settles so the floor isn't built twice.
  const [fontSettled, setFontSettled] = useState(false);
  useEffect(() => {
    let live = true;
    loadPainterFont().finally(() => { if (live) setFontSettled(true); });
    return () => { live = false; };
  }, []);
  const rich = fontSettled && painterReady();
  return (
    <>
      {/* Arena lighting: a warm key from the rig above, a cold rim light low
          from the far side (the cameras mostly sit on the near, +z, side, so
          it outlines the players against the dark stands -- it was a high
          fill until PLANO-3D Etapa 2), a soft front fill, and a low ambient so
          the stands fall away into the dark. Still five lights, no shadows. */}
      <hemisphereLight args={['#dfe6ff', '#24180c', 0.5]} />
      <ambientLight intensity={0.16} color="#8090b0" />
      <directionalLight position={[30, 120, 45]} intensity={1.9} color="#fff3df" />
      <directionalLight position={[-20, 38, -110]} intensity={1.25} color="#cfe0ff" />
      <directionalLight position={[0, 60, 90]} intensity={0.5} color="#ffffff" />

      {fontSettled ? (
        <Floor
          wood={visual?.floorColor ?? DEFAULT_FLOOR_COLOR}
          primary={home.primary}
          secondary={home.secondary}
          label={homeLabel ?? 'NBA'}
          pixelText={!rich || !homeNickname}
        />
      ) : null}
      {rich && homeNickname ? (
        <CourtDecals primary={home.primary} secondary={home.secondary} nickname={homeNickname} city={homeCity} />
      ) : null}
      <Arena
        primary={home.primary}
        secondary={home.secondary}
        courtRef={courtRef}
        board={scoreboard}
        awayPrimary={away.primary}
        homeLabel={homeLabel}
        banners={banners}
        hype={crowd}
      />
      <PlayersAndBall home={home} away={away} courtRef={courtRef} bodies={bodies} onSound={soundRef} />
    </>
  );
}

export default function Court3D({
  home, away, courtRef, visual, cameraView = 'iso', homeLabel, bodies, scoreboard, insets, banners,
  homeNickname, homeCity, crowd, onSound,
}: Court3DProps) {
  // Read through a ref so a new callback each render never rebuilds the scene.
  const soundRef = useRef(onSound);
  soundRef.current = onSound;
  const preset = CAMERA_PRESETS[cameraView];
  const camState = useRef<CameraDragState>({
    angle: CAMERA_PRESETS.iso.angle, elev: CAMERA_PRESETS.iso.elev, dist: CAMERA_PRESETS.iso.dist, dragging: false,
  });
  const last = useRef({ x: 0, y: 0 });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          camState.current.dragging = true;
          last.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        },
        onPanResponderMove: (e: GestureResponderEvent) => {
          const dx = e.nativeEvent.pageX - last.current.x;
          const dy = e.nativeEvent.pageY - last.current.y;
          camState.current.angle += dx * 0.005;
          camState.current.elev = Math.max(0.1, Math.min(1.4, camState.current.elev - dy * 0.004));
          last.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        },
        onPanResponderRelease: () => { camState.current.dragging = false; },
        onPanResponderTerminate: () => { camState.current.dragging = false; },
      }),
    [],
  );

  return (
    <View style={{ flex: 1 }} {...responder.panHandlers}>
      <Canvas camera={{ fov: BASE_FOV, near: 0.5, far: 1200 }} style={{ flex: 1 }}>
        <color attach="background" args={['#04060b']} />
        <fog attach="fog" args={['#04060b', 160, 520]} />
        <CameraRig stateRef={camState} preset={preset} courtRef={courtRef} insets={insets} />
        {__DEV__ ? <RenderProbe /> : null}
        <Scene
          home={home} away={away} courtRef={courtRef} visual={visual} homeLabel={homeLabel} bodies={bodies}
          scoreboard={scoreboard} banners={banners} homeNickname={homeNickname} homeCity={homeCity} crowd={crowd} soundRef={soundRef}
        />
      </Canvas>
    </View>
  );
}
