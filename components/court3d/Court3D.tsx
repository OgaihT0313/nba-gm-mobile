import React, { useMemo, useRef } from 'react';
import { GestureResponderEvent, PanResponder, Platform, View } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';

import type { CourtState } from '../../services/watchDirector';
import Arena from './Arena';
import { createRig, type Rig } from './PlayerRig';
import { buildBallTexture, buildFloorTexture, buildShadowTexture, hexToRgb, FLOOR_L, FLOOR_W } from './textures';

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
  numbers?: { [playerId: string]: number };
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

function CameraRig({
  stateRef, preset, courtRef,
}: {
  stateRef: React.MutableRefObject<CameraDragState>;
  preset: CameraPreset;
  courtRef: React.MutableRefObject<CourtState | null>;
}) {
  const target = useMemo(() => new THREE.Vector3(0, 5, 0), []);
  useFrame(({ camera, size }, dt) => {
    const s = stateRef.current;
    const k = 1 - Math.pow(0.02, dt); // frame-rate independent easing
    if (!s.dragging) {
      if (preset.autoRotate) {
        s.angle += dt * 0.05;
      } else {
        s.angle = THREE.MathUtils.lerp(s.angle, preset.angle, k);
        s.elev = THREE.MathUtils.lerp(s.elev, preset.elev, k);
        s.dist = THREE.MathUtils.lerp(s.dist, preset.dist, k);
      }
    }
    const court = courtRef.current;
    if (court) {
      const portraitLag = THREE.MathUtils.clamp((1.1 - size.width / Math.max(1, size.height)) / 0.6, 0, 1);
      // Possessions turn over every ~1.5 s of screen time; a lazy wide-shot
      // follow (30% of the gap left after a second) never caught the play and
      // parked at center court. A tall screen, which can't see both ends at
      // once, pans like a broadcast camera: 8% left after a second.
      const lag = preset.lag ?? THREE.MathUtils.lerp(0.3, 0.08, portraitLag);
      const f = 1 - Math.pow(lag, dt);
      // Aim at the action, not just the ball: half the ball, half the ten
      // bodies' centroid, so a skip pass or a fast break doesn't leave the
      // players out of frame while the ball is centered.
      let px = 0, pz = 0;
      court.players.forEach((pl) => { px += pl.x; pz += pl.z; });
      const n = court.players.length || 1;
      const ax = court.ball.x * 0.5 + (px / n) * 0.5;
      const az = court.ball.z * 0.5 + (pz / n) * 0.5;
      // A phone held upright sees a sliver of the court horizontally (vertical
      // fov 38° at a 0.46 aspect is ~18° across): a wide shot that only
      // half-follows the play films an empty floor. The taller the screen,
      // the closer every framing gets to tracking the action fully.
      const portrait = THREE.MathUtils.clamp((1.1 - size.width / Math.max(1, size.height)) / 0.6, 0, 1);
      const follow = preset.follow + (1 - preset.follow) * portrait;
      // A possession change moves all ten bodies 50+ ft in under half a
      // second of screen time (measured): no pan keeps up, and the wide shot
      // spent every transition filming an empty floor. A big jump is a CUT,
      // the way a broadcast switches cameras, instead of a slide.
      if (Math.abs(ax * follow - target.x) > 30 && !preset.lag) target.x = ax * follow;
      target.x = THREE.MathUtils.lerp(target.x, ax * follow, f);
      target.z = THREE.MathUtils.lerp(target.z, az * follow * (preset.lag ? 0.8 : 0.5 + 0.4 * portrait), f);
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
/* The floor.                                                          */
/* ------------------------------------------------------------------ */
function Floor({ wood, primary, secondary, label }: { wood: string; primary: string; secondary: string; label: string }) {
  const gl = useThree((s) => s.gl);
  const material = useMemo(() => {
    const map = buildFloorTexture({ wood, primary, secondary, label, flipRows: Platform.OS !== 'web' });
    // The floor is seen at a grazing angle almost all the time; anisotropic
    // filtering is what keeps the far lines crisp instead of smeared.
    map.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return new THREE.MeshStandardMaterial({ map, roughness: 0.34, metalness: 0.02 });
  }, [wood, primary, secondary, label, gl]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[FLOOR_L, FLOOR_W]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Players and ball.                                                   */
/* ------------------------------------------------------------------ */
const HOME_COUNT = 5;
const BALL_R = 0.39; // 9.4-inch ball, in feet

function PlayersAndBall({
  home, away, courtRef, numbers,
}: {
  home: TeamVisual;
  away: TeamVisual;
  courtRef: React.MutableRefObject<CourtState | null>;
  numbers?: { [playerId: string]: number };
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

  useFrame(({ clock }, dt) => {
    const court = courtRef.current;
    if (!court) return;
    const t = clock.getElapsedTime();

    court.players.forEach((p, i) => {
      const rig = rigs[i];
      if (!rig) return;
      if (bound.current[i] !== p.playerId) {
        bound.current[i] = p.playerId;
        rig.setPlayer(p.playerId, numbers?.[p.playerId] ?? null);
      }
      rig.update({
        x: p.x, z: p.z, rotY: p.rotY, dt, time: t,
        hasBall: p.hasBall,
        onOffense: p.side === court.possession,
        ball: court.ball,
      });
    });

    // Lift the ball by its radius so it rests on the floor instead of in it,
    // and let it spin the way it is travelling.
    const b = court.ball;
    ball.position.set(b.x, Math.max(BALL_R, b.y), b.z);
    const moved = lastBall.current.distanceTo(ball.position);
    if (b.inFlight) ball.rotation.z -= moved / BALL_R;
    else ball.rotation.x += moved / BALL_R;
    lastBall.current.copy(ball.position);
    ballShadow.position.set(b.x, 0.05, b.z);
    const lift = Math.min(1, b.y / 14);
    ballShadow.scale.setScalar(1.1 + lift * 0.8);
    (ballShadow.material as THREE.MeshBasicMaterial).opacity = 1;
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
function Scene({ home, away, courtRef, visual, homeLabel, numbers }: Omit<Court3DProps, 'cameraView'>) {
  return (
    <>
      {/* Arena lighting: a warm key from the rig above, a cooler fill, and a
          low ambient so the stands fall away into the dark. */}
      <hemisphereLight args={['#dfe6ff', '#24180c', 0.5]} />
      <ambientLight intensity={0.22} color="#8090b0" />
      <directionalLight position={[30, 120, 45]} intensity={1.9} color="#fff3df" />
      <directionalLight position={[-45, 100, -35]} intensity={0.9} color="#dfe8ff" />
      <directionalLight position={[0, 60, 90]} intensity={0.45} color="#ffffff" />

      <Floor
        wood={visual?.floorColor ?? DEFAULT_FLOOR_COLOR}
        primary={home.primary}
        secondary={home.secondary}
        label={homeLabel ?? 'NBA'}
      />
      <Arena primary={home.primary} secondary={home.secondary} />
      <PlayersAndBall home={home} away={away} courtRef={courtRef} numbers={numbers} />
    </>
  );
}

export default function Court3D({
  home, away, courtRef, visual, cameraView = 'iso', homeLabel, numbers,
}: Court3DProps) {
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
        <CameraRig stateRef={camState} preset={preset} courtRef={courtRef} />
        <Scene home={home} away={away} courtRef={courtRef} visual={visual} homeLabel={homeLabel} numbers={numbers} />
      </Canvas>
    </View>
  );
}
