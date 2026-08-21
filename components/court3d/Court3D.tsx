import React, { useMemo, useRef } from 'react';
import { GestureResponderEvent, PanResponder, View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

// Native port of quadra-3d.html (the standalone Three.js prototype) into a
// React Three Fiber component that renders inside the app via expo-gl,
// instead of a WebView. Two things are deliberately NOT ported 1:1:
//
// 1. The wood-floor texture + baked-in court lines were drawn with a 2D
//    `<canvas>` context in the HTML version — that API doesn't exist in React
//    Native. Lines are real 3D geometry here instead (see `buildMarkings`),
//    and the floor is a flat wood-toned material.
// 2. The thousands-strong instanced crowd was tuned for a desktop GPU. A
//    Galaxy A57-class phone (the project's real test device — see memory)
//    gets a much smaller capped crowd instead; instancing keeps it to a
//    single draw call either way; it's the vertex/fragment cost we keep low.
//
// Everything else (court proportions, hoop rig, camera feel) mirrors the
// original file directly.

export interface TeamVisual {
  primary: string;
  secondary: string;
}

export interface ShotEvent {
  id: number; // bump to re-trigger the animation even if `side` repeats
  side: 'home' | 'away';
  points: 1 | 2 | 3;
}

/** Per-Era-Group visual touch (see src/theme/eraVisuals.ts) — optional and
 * narrow on purpose: today just the floor tone. Omitted entirely for a
 * live/no-era save, which keeps the exact court that already shipped. */
export interface Court3DVisual {
  floorColor?: string;
}

/** Fixed broadcast-style framings, an idea borrowed (re-implemented, not
 * copied — the reference was web-only Three.js, see CameraRig below) from a
 * Gemini-generated prototype the user shared. `iso` is exactly today's
 * default free-orbit view (angle/elev/dist match the previous hardcoded
 * camState default 1:1) — picking it is a no-op for anyone not using the new
 * UI. The other three freeze auto-rotate (a real broadcast camera doesn't
 * spin) and ease the rig toward a fixed angle/elevation/distance instead. */
export type CameraView = 'iso' | 'tv' | 'overhead' | 'behind_basket';

interface CameraPreset {
  angle: number;
  elev: number;
  dist: number;
  autoRotate: boolean;
}

const CAMERA_PRESETS: Record<CameraView, CameraPreset> = {
  iso: { angle: 0.62, elev: 0.52, dist: 118, autoRotate: true },
  tv: { angle: Math.PI / 2, elev: 0.22, dist: 145, autoRotate: false },
  overhead: { angle: 0.3, elev: 1.48, dist: 95, autoRotate: false },
  behind_basket: { angle: Math.PI, elev: 0.16, dist: 150, autoRotate: false },
};

interface Court3DProps {
  home: TeamVisual;
  away: TeamVisual;
  shot?: ShotEvent | null;
  visual?: Court3DVisual;
  /** Defaults to 'iso' — the same free-orbit view Court3D always had. */
  cameraView?: CameraView;
}

const DEFAULT_FLOOR_COLOR = '#b5793f';

const COURT_L = 94;
const COURT_W = 50;
const HOOP_IN = 5.25;
const HOOP_X = COURT_L / 2 - HOOP_IN; // 41.75 — distance of each hoop from center

// Home always attacks the +X hoop, away the -X hoop. Purely a staging
// convention for the animation — it doesn't track real end-swaps by quarter.
const HOME_HOOP = new THREE.Vector3(HOOP_X, 10, 0);
const AWAY_HOOP = new THREE.Vector3(-HOOP_X, 10, 0);
const HOME_SPOT = new THREE.Vector3(HOOP_X - 20, 0, -7);
const AWAY_SPOT = new THREE.Vector3(-HOOP_X + 20, 0, 7);

/* ------------------------------------------------------------------ */
/* Camera rig — drag-to-rotate + gentle auto-rotate. State lives in a  */
/* ref (not React state) so a finger drag never forces a re-render;   */
/* the same approach the original file used with a bare module-level  */
/* variable, just moved into a ref for RN's touch/gesture model.      */
/* ------------------------------------------------------------------ */
export interface CameraDragState {
  angle: number;
  elev: number;
  dist: number;
  dragging: boolean;
}

function CameraRig({ stateRef, preset }: { stateRef: React.MutableRefObject<CameraDragState>; preset: CameraPreset }) {
  const target = useMemo(() => new THREE.Vector3(0, 6, 0), []);
  useFrame(({ camera }) => {
    const s = stateRef.current;
    if (!s.dragging) {
      if (preset.autoRotate) {
        // Exactly the original 'iso' behavior — free continuous spin, elev/
        // dist stay wherever a drag last left them. Zero behavior change for
        // any caller not using the new camera-view picker.
        s.angle += 0.0016;
      } else {
        // A fixed broadcast angle: ease toward it instead of snapping, and
        // let it keep pulling back even after a manual drag lets go (reads
        // as "the camera operator recentering"), rather than staying wherever
        // the user last left it.
        s.angle = THREE.MathUtils.lerp(s.angle, preset.angle, 0.06);
        s.elev = THREE.MathUtils.lerp(s.elev, preset.elev, 0.06);
        s.dist = THREE.MathUtils.lerp(s.dist, preset.dist, 0.06);
      }
    }
    camera.position.set(
      target.x + Math.cos(s.angle) * s.dist * Math.cos(s.elev),
      target.y + Math.sin(s.elev) * s.dist,
      target.z + Math.sin(s.angle) * s.dist * Math.cos(s.elev),
    );
    camera.lookAt(target);
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Court lines — real geometry instead of a baked texture.            */
/* ------------------------------------------------------------------ */
const circlePoints = (cx: number, cz: number, r: number, segs: number, a0 = 0, a1 = Math.PI * 2) => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    pts.push(new THREE.Vector3(cx + Math.cos(a) * r, 0.03, cz + Math.sin(a) * r));
  }
  return pts;
};

function buildMarkings(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const addLoop = (pts: THREE.Vector3[]) => group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));

  // Perimeter.
  const hx = COURT_L / 2, hz = COURT_W / 2;
  addLoop([
    new THREE.Vector3(-hx, 0.03, -hz), new THREE.Vector3(hx, 0.03, -hz),
    new THREE.Vector3(hx, 0.03, hz), new THREE.Vector3(-hx, 0.03, hz), new THREE.Vector3(-hx, 0.03, -hz),
  ]);
  // Center line + center circle.
  addLoop([new THREE.Vector3(0, 0.03, -hz), new THREE.Vector3(0, 0.03, hz)]);
  addLoop(circlePoints(0, 0, 6, 32));

  [-1, 1].forEach((dir) => {
    const baseX = dir * hx;
    const hoopX = dir * HOOP_X;
    const laneFarX = baseX - dir * 19;

    // Lane (16 x 19 ft).
    addLoop([
      new THREE.Vector3(baseX, 0.03, -8), new THREE.Vector3(laneFarX, 0.03, -8),
      new THREE.Vector3(laneFarX, 0.03, 8), new THREE.Vector3(baseX, 0.03, 8), new THREE.Vector3(baseX, 0.03, -8),
    ]);
    // Free-throw circle.
    addLoop(circlePoints(laneFarX, 0, 6, 24));
    // Restricted-area semicircle under the hoop.
    addLoop(circlePoints(hoopX, 0, 4, 16, dir > 0 ? Math.PI / 2 : -Math.PI / 2, dir > 0 ? Math.PI * 1.5 : Math.PI / 2));

    // Three-point line: corner straights + arc around the hoop.
    const cornerZ = 22, straightX = 14, arcR = 23.75;
    const cornerNearX = baseX - dir * straightX;
    const startAng = Math.atan2(-cornerZ, cornerNearX - hoopX);
    const endAng = Math.atan2(cornerZ, cornerNearX - hoopX);
    const arcPts = circlePoints(hoopX, 0, arcR, 28, startAng, endAng);
    addLoop([new THREE.Vector3(baseX, 0.03, -cornerZ), new THREE.Vector3(cornerNearX, 0.03, -cornerZ), ...arcPts, new THREE.Vector3(baseX, 0.03, cornerZ)]);
  });

  return group;
}

function CourtMarkings() {
  const group = useMemo(() => buildMarkings(), []);
  return <primitive object={group} />;
}

/* ------------------------------------------------------------------ */
/* Hoop — backboard, rim, pole, simple net.                           */
/* ------------------------------------------------------------------ */
function Hoop({ x, facing }: { x: number; facing: 1 | -1 }) {
  const netLines = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.6 });
    const pts: THREE.Vector3[] = [];
    const segs = 10;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const rx = x - facing * 0.9 + Math.cos(a) * 0.75;
      const rz = Math.sin(a) * 0.75;
      pts.push(new THREE.Vector3(rx, 10, rz), new THREE.Vector3(x - facing * 0.9 + Math.cos(a) * 0.28, 8.7, Math.sin(a) * 0.28));
    }
    return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
  }, [x, facing]);

  return (
    <group>
      <mesh position={[x + facing * 4.5, 6.5, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 13, 12]} />
        <meshStandardMaterial color="#1b1d22" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[x + facing * 2.2, 12.4, 0]}>
        <boxGeometry args={[4.6, 0.5, 0.5]} />
        <meshStandardMaterial color="#1b1d22" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[x, 12.2, 0]}>
        <boxGeometry args={[0.15, 3.2, 6]} />
        <meshStandardMaterial color="#f4f7ff" roughness={0.25} transparent opacity={0.92} />
      </mesh>
      <mesh position={[x - facing * 0.9, 10, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.75, 0.06, 10, 24]} />
        <meshStandardMaterial color="#ff5a1f" roughness={0.35} metalness={0.6} />
      </mesh>
      <primitive object={netLines} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Player doll — same proportions as the HTML version, colored from   */
/* real team accent colors (constants.ts getTeamAccent) instead of    */
/* the hardcoded TEAMS dict.                                          */
/* ------------------------------------------------------------------ */
function PlayerDoll({ x, z, rotY, team, bob }: { x: number; z: number; rotY: number; team: TeamVisual; bob: number }) {
  return (
    <group position={[x, bob, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 4.7, 0]}>
        <cylinderGeometry args={[0.85, 0.72, 2.1, 14]} />
        <meshStandardMaterial color={team.primary} roughness={0.6} />
      </mesh>
      <mesh position={[0, 5.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.08, 8, 16]} />
        <meshStandardMaterial color={team.secondary} roughness={0.5} />
      </mesh>
      <mesh position={[0, 6.35, 0]}>
        <sphereGeometry args={[0.52, 16, 14]} />
        <meshStandardMaterial color="#c98a5c" roughness={0.7} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 1.02, 4.55, 0]} rotation={[0, 0, side * 0.18]}>
            <cylinderGeometry args={[0.22, 0.2, 1.9, 10]} />
            <meshStandardMaterial color={team.primary} roughness={0.6} />
          </mesh>
          <mesh position={[side * 1.28, 3.55, 0.12]} rotation={[0, 0, side * 0.32]}>
            <cylinderGeometry args={[0.19, 0.17, 1.0, 10]} />
            <meshStandardMaterial color="#c98a5c" roughness={0.7} />
          </mesh>
          <mesh position={[side * 0.32, 3.35, 0]}>
            <cylinderGeometry args={[0.42, 0.38, 1.15, 12]} />
            <meshStandardMaterial color={team.secondary} roughness={0.6} />
          </mesh>
          <mesh position={[side * 0.32, 1.9, 0]}>
            <cylinderGeometry args={[0.24, 0.2, 1.9, 10]} />
            <meshStandardMaterial color="#c98a5c" roughness={0.7} />
          </mesh>
          <mesh position={[side * 0.32, 0.85, 0.15]}>
            <boxGeometry args={[0.42, 0.32, 0.75]} />
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Ball — idles at whichever side is about to shoot, arcs to that     */
/* side's hoop when a new ShotEvent comes in, then idles at the other */
/* side's spot ready for the next possession.                        */
/* ------------------------------------------------------------------ */
function Ball({ shot }: { shot?: ShotEvent | null }) {
  const ref = useRef<THREE.Mesh>(null);
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number } | null>(null);
  const idlePos = useRef(new THREE.Vector3(0, 3.2, 0));
  const lastId = useRef<number | null>(null);

  if (shot && shot.id !== lastId.current) {
    lastId.current = shot.id;
    const from = (shot.side === 'home' ? HOME_SPOT : AWAY_SPOT).clone().setY(3.2);
    const to = (shot.side === 'home' ? HOME_HOOP : AWAY_HOOP).clone();
    anim.current = { from, to, start: -1, duration: 0.9 };
  }

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const a = anim.current;
    if (!a) {
      mesh.position.lerp(idlePos.current, 0.08);
      return;
    }
    if (a.start < 0) a.start = 0;
    a.start += delta;
    const t = Math.min(1, a.start / a.duration);
    mesh.position.lerpVectors(a.from, a.to, t);
    mesh.position.y += Math.sin(t * Math.PI) * 6; // arc height
    if (t >= 1) {
      idlePos.current.copy(a.to).setY(3.2);
      anim.current = null;
    }
  });

  return (
    // A plain tuple here, NOT the idlePos Vector3 instance — R3F tries a
    // direct `mesh.position = value` assignment when the prop is itself a
    // Vector3, and Object3D.position has no setter, which crashed the whole
    // watch screen on mount ("Cannot assign to read-only property
    // 'position'"). Only the mount-time value matters; every frame after
    // that mutates ref.current.position directly above.
    <mesh ref={ref} position={[idlePos.current.x, idlePos.current.y, idlePos.current.z]}>
      <sphereGeometry args={[0.5, 16, 12]} />
      <meshStandardMaterial color="#e8792c" roughness={0.5} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Lightweight stands — tiered blocks per side, no per-fan instancing */
/* (the HTML prototype's thousands-strong crowd is desktop-only; see  */
/* the file header comment for why).                                 */
/* ------------------------------------------------------------------ */
function Stands() {
  const rows = 6;
  const rowH = 2.4, rowD = 3.2;
  const sides: { axis: 'x' | 'z'; sign: 1 | -1; len: number }[] = [
    { axis: 'z', sign: 1, len: COURT_L + 24 },
    { axis: 'z', sign: -1, len: COURT_L + 24 },
    { axis: 'x', sign: 1, len: COURT_W + 24 },
    { axis: 'x', sign: -1, len: COURT_W + 24 },
  ];
  return (
    <group>
      {sides.map((s, si) =>
        Array.from({ length: rows }).map((_, r) => {
          const dist = COURT_W / 2 + 10 + r * rowD;
          const h = 1 + r * rowH;
          const w = s.axis === 'z' ? s.len : rowD + 1;
          const d = s.axis === 'z' ? rowD + 1 : s.len;
          const pos: [number, number, number] = s.axis === 'z' ? [0, h, s.sign * dist] : [s.sign * dist, h, 0];
          return (
            <mesh key={`${si}-${r}`} position={pos}>
              <boxGeometry args={[w, 1.3, d]} />
              <meshStandardMaterial color={r % 2 === 0 ? '#232838' : '#1c2030'} roughness={0.9} />
            </mesh>
          );
        }),
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Scene root.                                                        */
/* ------------------------------------------------------------------ */
function Scene({ home, away, shot, visual }: Court3DProps) {
  return (
    <>
      <hemisphereLight args={[0x9fb3ff, 0x1a1408, 0.6]} />
      <ambientLight intensity={0.4} color="#404860" />
      <directionalLight position={[40, 90, 20]} intensity={1.1} color="#fff2d6" />

      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[COURT_L, 1, COURT_W]} />
        <meshStandardMaterial color={visual?.floorColor ?? DEFAULT_FLOOR_COLOR} roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh position={[0, -0.9, 0]}>
        <boxGeometry args={[COURT_L + 24, 0.8, COURT_W + 24]} />
        <meshStandardMaterial color="#14161c" roughness={0.9} />
      </mesh>

      <CourtMarkings />
      <Hoop x={-HOOP_X} facing={1} />
      <Hoop x={HOOP_X} facing={-1} />
      <Stands />

      <PlayerDoll x={HOME_SPOT.x} z={HOME_SPOT.z} rotY={Math.PI / 2 - 0.3} team={home} bob={0.05} />
      <PlayerDoll x={AWAY_SPOT.x} z={AWAY_SPOT.z} rotY={-Math.PI / 2 - 0.3} team={away} bob={0.05} />
      <Ball shot={shot} />
    </>
  );
}

export default function Court3D({ home, away, shot, visual, cameraView = 'iso' }: Court3DProps) {
  const preset = CAMERA_PRESETS[cameraView];
  const camState = useRef<CameraDragState>({ angle: 0.62, elev: 0.52, dist: 118, dragging: false });
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
          camState.current.elev = Math.max(0.12, Math.min(1.15, camState.current.elev - dy * 0.004));
          last.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        },
        onPanResponderRelease: () => {
          camState.current.dragging = false;
        },
        onPanResponderTerminate: () => {
          camState.current.dragging = false;
        },
      }),
    [],
  );

  return (
    <View style={{ flex: 1 }} {...responder.panHandlers}>
      <Canvas camera={{ fov: 42, near: 0.5, far: 900 }} style={{ flex: 1 }}>
        <color attach="background" args={['#05070d']} />
        <fog attach="fog" args={['#05070d', 80, 340]} />
        <CameraRig stateRef={camState} preset={preset} />
        <Scene home={home} away={away} shot={shot} visual={visual} />
      </Canvas>
    </View>
  );
}
