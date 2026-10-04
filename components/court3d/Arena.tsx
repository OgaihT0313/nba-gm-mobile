import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

import { buildLedTexture, buildNetTexture, hexToRgb } from './textures';

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
  const { risers, fans, heads } = useMemo(() => {
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

    seats.forEach((s, i) => {
      const top = 1 + s.row * ROW_RISE;
      q.setFromAxisAngle(up, s.rot);
      // Riser: a solid step from the floor to this row's height.
      m.compose(new THREE.Vector3(s.x, top / 2, s.z), q, new THREE.Vector3(SEAT_PITCH * 1.02, top, ROW_DEPTH * 1.02));
      risers.setMatrixAt(i, m);
      c.set(s.row % 2 ? '#161a24' : '#1b2030');
      risers.setColorAt(i, c);
      // A few empty seats keep it from reading as wallpaper.
      const empty = rnd() < 0.07;
      const h = empty ? 0.001 : 0.9 + rnd() * 0.25;
      m.compose(new THREE.Vector3(s.x, top + 0.95 * h, s.z), q, new THREE.Vector3(1, h, 1));
      fans.setMatrixAt(i, m);
      // Darker than their real colors: the house lights are on the court, and
      // a crowd lit like the floor fights it for attention.
      c.set(shirts[Math.floor(rnd() * shirts.length)]).multiplyScalar(0.38 + rnd() * 0.2);
      fans.setColorAt(i, c);
      m.compose(new THREE.Vector3(s.x, top + 1.9 * h + 0.4, s.z), q, new THREE.Vector3(h, h, h));
      heads.setMatrixAt(i, m);
      c.set(skins[Math.floor(rnd() * skins.length)]).multiplyScalar(0.55);
      heads.setColorAt(i, c);
    });
    [risers, fans, heads].forEach((im) => {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
    });
    return { risers, fans, heads };
  }, [primary, secondary]);

  return (
    <>
      <primitive object={risers} />
      <primitive object={fans} />
      <primitive object={heads} />
    </>
  );
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
/* A basket: padded stanchion, glass, rim, net, shot clock.            */
/* ------------------------------------------------------------------ */
const BOARD_FACE = HALF_L - 4; // backboard plane, 4 ft inside the baseline
export const RIM_X = 41.75;
const RIM_Y = 10;

function Hoop({ side, primary }: { side: 1 | -1; primary: string }) {
  const net = useMemo(() => {
    const tex = buildNetTexture();
    tex.repeat.set(1, 1);
    const pts = [
      new THREE.Vector2(0.75, 0),
      new THREE.Vector2(0.62, -0.6),
      new THREE.Vector2(0.48, -1.2),
      new THREE.Vector2(0.46, -1.5),
    ];
    const geo = new THREE.LatheGeometry(pts, 20);
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
    return new THREE.Mesh(geo, mat);
  }, []);

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
      {/* Rim and its bracket. */}
      <mesh position={[s * RIM_X, RIM_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.75, 0.055, 10, 32]} />
        <meshStandardMaterial color="#ff4f12" roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position={[s * (RIM_X + 0.92), RIM_Y, 0]}>
        <boxGeometry args={[0.5, 0.18, 0.5]} />
        <meshStandardMaterial color="#ff4f12" roughness={0.35} metalness={0.5} />
      </mesh>
      <primitive object={net} position={[s * RIM_X, RIM_Y, 0]} />
    </group>
  );
}

export default function Arena({ primary, secondary }: ArenaProps) {
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
      <Hoop side={1} primary={primary} />
      <Hoop side={-1} primary={primary} />
    </>
  );
}
