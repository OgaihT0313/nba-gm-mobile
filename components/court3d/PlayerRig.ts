import * as THREE from 'three';

import { buildJerseyTexture, paintJersey, hexToRgb } from './textures';

// One basketball player: a jointed body, built once, posed every frame.
//
// The old dolls were thirteen rigid cylinders that slid around and bobbed.
// This one has hips, knees, shoulders and elbows, and the pose comes from what
// the player is doing -- running at his real speed, sitting in a defensive
// stance, dribbling, rising up when the ball goes toward the rim near him.
// Nothing here decides anything about the game: positions and possession still
// come from services/watchDirector.ts, this only reads them.
//
// Units are feet, like the rest of the court: ~6'5" to the top of the head.

const SKIN_TONES = ['#f1c7a3', '#d9a57c', '#b97a52', '#8d5a3b', '#6b4029', '#4a2c1d'];
const HAIR = new THREE.MeshStandardMaterial({ color: '#16120f', roughness: 0.9 });
const SOCK = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.8 });

const GEO = {
  torso: new THREE.CapsuleGeometry(0.58, 1.35, 6, 18),
  head: new THREE.SphereGeometry(0.4, 18, 14),
  hair: new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
  neck: new THREE.CylinderGeometry(0.19, 0.22, 0.4, 10),
  // Limbs are deliberately thick and overlap at the joints, each joint capped
  // with a ball of the same radius: thinner and gapped (the first pass), up
  // close they read as a wooden artist's mannequin.
  upperArm: new THREE.CapsuleGeometry(0.21, 0.8, 4, 12),
  foreArm: new THREE.CapsuleGeometry(0.17, 0.88, 4, 12),
  hand: new THREE.SphereGeometry(0.2, 10, 8),
  shoulderJoint: new THREE.SphereGeometry(0.27, 12, 10),
  elbowJoint: new THREE.SphereGeometry(0.19, 10, 8),
  kneeJoint: new THREE.SphereGeometry(0.24, 10, 8),
  shorts: new THREE.CylinderGeometry(0.7, 0.8, 1.1, 18, 1, true),
  thigh: new THREE.CapsuleGeometry(0.3, 0.95, 4, 12),
  shin: new THREE.CapsuleGeometry(0.22, 1.0, 4, 12),
  sock: new THREE.CylinderGeometry(0.205, 0.2, 0.55, 10),
  shoe: new THREE.BoxGeometry(0.42, 0.32, 0.9),
  shadow: new THREE.PlaneGeometry(1, 1),
};

/** Stable per-player number in [0,1), so a player keeps his look all game. */
const seeded = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};

export interface Rig {
  root: THREE.Group;
  /** Rebinds the body to a different player (a substitution). */
  setPlayer: (playerId: string, number: number | null) => void;
  /** Poses the body for this frame. */
  update: (input: PoseInput) => void;
}

export interface PoseInput {
  x: number;
  z: number;
  rotY: number;
  dt: number;
  time: number;
  hasBall: boolean;
  onOffense: boolean;
  ball: { x: number; y: number; z: number; inFlight: boolean };
}

interface Joints {
  body: THREE.Group;
  hips: THREE.Group;
  shoulderL: THREE.Group; shoulderR: THREE.Group;
  elbowL: THREE.Group; elbowR: THREE.Group;
  hipL: THREE.Group; hipR: THREE.Group;
  kneeL: THREE.Group; kneeR: THREE.Group;
}

const at = (parent: THREE.Object3D, x: number, y: number, z = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

const mesh = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};

export const createRig = (team: { primary: string; secondary: string }, shadowMat: THREE.Material): Rig => {
  const root = new THREE.Group();

  // Jersey: its own texture per body, repainted in place when a substitute
  // comes in (no new GPU texture, just new pixels).
  const jerseyTex = buildJerseyTexture(team.primary, team.secondary, null);
  const jersey = new THREE.MeshStandardMaterial({ map: jerseyTex, roughness: 0.62 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: team.primary, roughness: 0.6, side: THREE.DoubleSide });
  const shoeMat = new THREE.MeshStandardMaterial({ color: team.secondary, roughness: 0.45 });
  const skin = new THREE.MeshStandardMaterial({ color: SKIN_TONES[0], roughness: 0.55 });

  const shadow = new THREE.Mesh(GEO.shadow, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  shadow.renderOrder = 1;
  root.add(shadow);

  const body = at(root, 0, 0);
  const hips = at(body, 0, 3.45);

  // Torso, flattened front-to-back so it reads as a chest, not a barrel.
  const torso = mesh(hips, GEO.torso, jersey, 0, 1.05);
  torso.scale.set(1.15, 1, 0.72);
  mesh(hips, GEO.neck, skin, 0, 2.15);
  mesh(hips, GEO.head, skin, 0, 2.58);
  const hair = mesh(hips, GEO.hair, HAIR, 0, 2.6);

  const shoulderL = at(hips, -0.78, 1.82);
  const shoulderR = at(hips, 0.78, 1.82);
  const elbowL = at(shoulderL, 0, -1.1);
  const elbowR = at(shoulderR, 0, -1.1);
  [shoulderL, shoulderR].forEach((s) => {
    mesh(s, GEO.shoulderJoint, skin);
    mesh(s, GEO.upperArm, skin, 0, -0.55);
  });
  [elbowL, elbowR].forEach((e) => {
    mesh(e, GEO.elbowJoint, skin);
    mesh(e, GEO.foreArm, skin, 0, -0.56);
    mesh(e, GEO.hand, skin, 0, -1.18);
  });

  const shorts = mesh(hips, GEO.shorts, shortsMat, 0, -0.32);
  shorts.scale.set(1, 1, 0.78);

  const hipL = at(hips, -0.32, -0.22);
  const hipR = at(hips, 0.32, -0.22);
  const kneeL = at(hipL, 0, -1.55);
  const kneeR = at(hipR, 0, -1.55);
  [hipL, hipR].forEach((h) => mesh(h, GEO.thigh, skin, 0, -0.75));
  [kneeL, kneeR].forEach((k) => {
    mesh(k, GEO.kneeJoint, skin);
    mesh(k, GEO.shin, skin, 0, -0.72);
    mesh(k, GEO.sock, SOCK, 0, -1.2);
    mesh(k, GEO.shoe, shoeMat, 0, -1.6, 0.16);
  });

  const j: Joints = { body, hips, shoulderL, shoulderR, elbowL, elbowR, hipL, hipR, kneeL, kneeR };

  // Animation state, all smoothed so a pose change is a motion, not a snap.
  let phase = Math.random() * Math.PI * 2;
  let speedSmooth = 0;
  let lastX = 0;
  let lastZ = 0;
  let first = true;
  let jump = 0;
  const pose = {
    crouch: 0, lean: 0, armsUp: 0, stance: 0, dribble: 0,
  };
  const approach = (cur: number, target: number, k: number) => cur + (target - cur) * k;

  const setPlayer = (playerId: string, number: number | null) => {
    const r = seeded(playerId);
    skin.color.set(SKIN_TONES[Math.floor(r * SKIN_TONES.length)]);
    hair.visible = r % 0.5 > 0.15;
    paintJersey(jerseyTex.image.data as Uint8Array, jerseyTex.image.width, jerseyTex.image.height,
      hexToRgb(team.primary), hexToRgb(team.secondary), number);
    jerseyTex.needsUpdate = true;
    // Height varies a little: guards to bigs.
    root.scale.setScalar(0.94 + seeded(playerId + 'h') * 0.12);
  };

  const update = (p: PoseInput) => {
    const dt = Math.max(1 / 240, Math.min(0.1, p.dt));
    if (first) { lastX = p.x; lastZ = p.z; first = false; }
    const speed = Math.hypot(p.x - lastX, p.z - lastZ) / dt; // feet per real second
    lastX = p.x;
    lastZ = p.z;
    speedSmooth = approach(speedSmooth, Math.min(speed, 40), 0.15);

    // Playback runs the game at ~10x real time, so on-screen speed is a
    // reading of game speed; 4 ft/s on screen is a jog, 20+ a sprint.
    const run = Math.min(1, speedSmooth / 18);
    phase += dt * (6 + speedSmooth * 0.45);

    // Is this player going up for (or contesting) a shot right now?
    const dxb = p.ball.x - p.x;
    const dzb = p.ball.z - p.z;
    const nearBall = Math.hypot(dxb, dzb);
    const rising = p.ball.inFlight && p.ball.y > 7 && p.ball.y < 13 && nearBall < 5;

    const defending = !p.onOffense && run < 0.3;
    pose.stance = approach(pose.stance, defending ? 1 : 0, 0.08);
    pose.armsUp = approach(pose.armsUp, rising ? 1 : 0, 0.25);
    pose.dribble = approach(pose.dribble, p.hasBall && !rising ? 1 : 0, 0.2);
    pose.lean = approach(pose.lean, run * 0.22 + pose.stance * 0.18, 0.12);
    const targetJump = rising && nearBall < 3.5 ? 1.6 : 0;
    jump = approach(jump, targetJump, targetJump > jump ? 0.35 : 0.12);

    root.position.set(p.x, 0, p.z);
    root.rotation.y = p.rotY;

    const swing = Math.sin(phase) * run;
    const bob = Math.abs(Math.cos(phase)) * run * 0.22;
    const crouch = pose.stance * 0.55 + (1 - run) * 0.05;
    j.body.position.y = bob - crouch * 0.6 + jump;
    j.hips.rotation.x = pose.lean;

    // Legs: alternate swing, knees fold on the recovery half of the stride;
    // in a stance both thighs come forward and the knees bend.
    const kneeFold = (s: number) => Math.max(0, s) * 1.3 * run + 0.12;
    j.hipL.rotation.x = -swing * 0.85 - pose.stance * 0.55 - pose.lean * 0.6;
    j.hipR.rotation.x = swing * 0.85 - pose.stance * 0.55 - pose.lean * 0.6;
    j.kneeL.rotation.x = kneeFold(Math.sin(phase + Math.PI / 2)) + pose.stance * 0.95 + jump * 0.2;
    j.kneeR.rotation.x = kneeFold(-Math.sin(phase + Math.PI / 2)) + pose.stance * 0.95 + jump * 0.2;
    // Stance is wide.
    j.hipL.rotation.z = -pose.stance * 0.22;
    j.hipR.rotation.z = pose.stance * 0.22;

    // Arms: counter-swing when running, wide in a stance, straight up on a
    // shot or a contest, and the right hand working the ball on a dribble.
    const dribbleBeat = Math.sin(p.time * 13);
    const armUp = pose.armsUp * -2.9;
    j.shoulderL.rotation.x = swing * 0.75 * (1 - pose.armsUp) + armUp - pose.stance * 0.6;
    j.shoulderR.rotation.x = -swing * 0.75 * (1 - pose.armsUp) * (1 - pose.dribble) + armUp
      - pose.dribble * (0.55 + dribbleBeat * 0.12) - pose.stance * 0.6;
    // A real stance has the hands out and low, palms up to the ball -- not
    // the arms straight out at shoulder height.
    j.shoulderL.rotation.z = -0.1 - pose.stance * 0.42 * (1 - pose.armsUp);
    j.shoulderR.rotation.z = 0.1 + pose.stance * 0.42 * (1 - pose.armsUp) + pose.dribble * 0.18;
    j.elbowL.rotation.x = -0.35 - run * 0.9 - pose.stance * 0.3 + pose.armsUp * 0.25;
    j.elbowR.rotation.x = -0.35 - run * 0.9 * (1 - pose.dribble) - pose.dribble * (0.75 + dribbleBeat * 0.35) + pose.armsUp * 0.25;

    // Contact shadow shrinks and fades as he leaves the floor.
    const s = 2.4 - jump * 0.35;
    shadow.scale.set(s, s, 1);
    shadow.position.y = 0.04 - root.position.y;
  };

  return { root, setPlayer, update };
};
