import * as THREE from 'three';

import type { PlayerAction } from '../../services/watchDirector';
import { buildBandTexture, buildJerseyTexture, paintJersey, hexToRgb } from './textures';
import { createJerseyDataTexture, paintRichJersey } from './richTextures';
import { onPainterReady, painterReady } from './painter';

// One basketball player: a jointed body, built once, posed every frame.
//
// The old dolls were thirteen rigid cylinders that slid around and bobbed.
// This one has hips, knees, shoulders, elbows and a neck, and the pose comes
// from what the player is doing -- running at his real speed, sitting in a
// defensive stance, and, since PLANO-3D Etapa 4, the action the director says
// he is in (dribble, pass, jumper, layup, dunk, contest). Nothing here decides
// anything about the game: positions, possession and actions come from
// services/watchDirector.ts, this only reads them.
//
// Units are feet, like the rest of the court: ~6'5" to the top of the head.

const SKIN_TONES = ['#f1c7a3', '#d9a57c', '#b97a52', '#8d5a3b', '#6b4029', '#4a2c1d'];
const HAIR = new THREE.MeshStandardMaterial({ color: '#16120f', roughness: 0.9 });

/** Fabric by color, shared by every body that wears it. */
const fabricCache = new Map<string, THREE.MeshStandardMaterial>();
const fabric = (color: string) => {
  let m = fabricCache.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 }); fabricCache.set(color, m); }
  return m;
};
const WHITE = '#f4f4f4';
const BLACK = '#15161a';
/** Signature shoes: a few players wear something loud. */
const LOUD_SHOES = ['#d6262e', '#c8f031', '#1fb5ad', '#ff7a1a', '#ff5fa2', '#3f6fe0'];

/** Bounces per second of a live dribble -- the ball (Court3D) and the hand share it. */
export const DRIBBLE_HZ = 2.1;
/** Where the dribble is: 0 = in the hand, 0.5 = on the floor. */
export const dribblePhase = (time: number) => (time * DRIBBLE_HZ) % 1;

/** v runs 0 (bottom) to 1 (top) up a box, on every face: the sole is a band. */
const uvByHeight = (geo: THREE.BufferGeometry) => {
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox!;
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - min.y) / (max.y - min.y));
  uv.needsUpdate = true;
  return geo;
};

const GEO = {
  torso: new THREE.CapsuleGeometry(0.58, 1.35, 6, 18),
  head: new THREE.SphereGeometry(0.4, 18, 14),
  hair: new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
  headband: new THREE.CylinderGeometry(0.415, 0.415, 0.14, 18, 1, true),
  neck: new THREE.CylinderGeometry(0.19, 0.22, 0.4, 10),
  // Limbs are deliberately thick and overlap at the joints, each joint capped
  // with a ball of the same radius: thinner and gapped (the first pass), up
  // close they read as a wooden artist's mannequin.
  upperArm: new THREE.CapsuleGeometry(0.21, 0.8, 4, 12),
  sleeve: new THREE.CylinderGeometry(0.235, 0.235, 0.7, 12, 1, true),
  foreSleeve: new THREE.CylinderGeometry(0.195, 0.18, 0.8, 12, 1, true),
  wristband: new THREE.CylinderGeometry(0.19, 0.19, 0.22, 12, 1, true),
  legSleeve: new THREE.CylinderGeometry(0.255, 0.215, 1.05, 12, 1, true),
  kneePad: new THREE.CylinderGeometry(0.29, 0.29, 0.42, 12, 1, true),
  foreArm: new THREE.CapsuleGeometry(0.17, 0.88, 4, 12),
  hand: new THREE.SphereGeometry(0.2, 10, 8),
  shoulderJoint: new THREE.SphereGeometry(0.27, 12, 10),
  elbowJoint: new THREE.SphereGeometry(0.19, 10, 8),
  kneeJoint: new THREE.SphereGeometry(0.24, 10, 8),
  shorts: new THREE.CylinderGeometry(0.7, 0.8, 1.1, 18, 1, true),
  thigh: new THREE.CapsuleGeometry(0.3, 0.95, 4, 12),
  shin: new THREE.CapsuleGeometry(0.22, 1.0, 4, 12),
  sock: new THREE.CylinderGeometry(0.205, 0.2, 0.55, 10),
  shoe: uvByHeight(new THREE.BoxGeometry(0.42, 0.32, 0.9)),
  shadow: new THREE.PlaneGeometry(1, 1),
};

/** Stable per-player number in [0,1), so a player keeps his look all game. */
const seeded = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};

// The shorts' and shoes' band textures are the same for a whole team, so
// they're shared across its five bodies (and the bench) by color.
const bandCache = new Map<string, THREE.DataTexture>();
const sharedBand = (base: string, bands: { from: number; to: number; color: string }[]) => {
  const key = base + JSON.stringify(bands);
  let tex = bandCache.get(key);
  if (!tex) { tex = buildBandTexture(base, bands); bandCache.set(key, tex); }
  return tex;
};

/** A light shoe gets a dark sole, any other a white one. */
const soleFor = (shoe: string) => {
  const c = new THREE.Color(shoe);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.6 ? '#1c1d22' : '#f2f2ee';
};

/** What the body needs to know about the man wearing it. */
export interface RigPlayer {
  number: number | null;
  name?: string;
  /** Real height and weight (pipeline/sync_physical.py); absent = average build. */
  heightCm?: number;
  weightKg?: number;
  /** Sampled from his official photo; absent = a stable tone from his id. */
  skinTone?: string;
}

/** The model's own height at scale 1: ~6'5". */
const BASE_HEIGHT_CM = 196;
/** NBA average BMI; heavier than this reads thicker, lighter reads leaner. */
const BASE_BMI = 24.5;

export interface Rig {
  root: THREE.Group;
  /** Rebinds the body to a different player (a substitution). */
  setPlayer: (playerId: string, info: RigPlayer) => void;
  /** Poses the body for this frame. True when a sneaker squeaks (a hard
   *  plant or cut), for the sound. */
  update: (input: PoseInput) => boolean;
  /** World positions of the right and left hands, as posed this frame. */
  hands: (right: THREE.Vector3, left: THREE.Vector3) => void;
  /** Which way the body faces, radians (the director's rotY, smoothed). */
  yaw: () => number;
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
  /** Playback just cut: the jump in position is an edit, not a sprint. */
  snap?: boolean;
  /** What the director says he's doing, and how far into it (0-1). */
  action?: PlayerAction;
  actionT?: number;
}

interface Joints {
  body: THREE.Group;
  hips: THREE.Group;
  neck: THREE.Group;
  shoulderL: THREE.Group; shoulderR: THREE.Group;
  elbowL: THREE.Group; elbowR: THREE.Group;
  hipL: THREE.Group; hipR: THREE.Group;
  kneeL: THREE.Group; kneeR: THREE.Group;
}

/** Every angle the pose writes, so a base pose and an action pose can be blended. */
interface Pose {
  lean: number;
  hipLx: number; hipRx: number; hipLz: number; hipRz: number;
  kneeL: number; kneeR: number;
  shLx: number; shRx: number; shLz: number; shRz: number;
  elL: number; elR: number;
}
const KEYS: (keyof Pose)[] = ['lean', 'hipLx', 'hipRx', 'hipLz', 'hipRz', 'kneeL', 'kneeR', 'shLx', 'shRx', 'shLz', 'shRz', 'elL', 'elR'];

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

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** 0 -> 1 -> 0 over [from, to], a smooth hump (sine). */
const hump = (t: number, from: number, to: number) => Math.sin(Math.PI * clamp01((t - from) / (to - from)));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** How high each finish leaves the floor, feet. */
const LEAP: Record<string, number> = { shot: 1.25, layup: 1.8, dunk: 2.8, contest: 0.95, rebound: 2.1 };
/** The neck turns toward the ball this far, no further (~70 degrees). */
const NECK_LIMIT = 1.22;
/** How fast the body turns, radians per second at most. */
const TURN_RATE = 9;
/** Seconds between two squeaks from the same pair of shoes. */
const SQUEAK_GAP = 0.9;

export const createRig = (team: { primary: string; secondary: string }, shadowMat: THREE.Material): Rig => {
  const root = new THREE.Group();

  // Jersey: its own texture per body, repainted in place when a substitute
  // comes in (no new GPU texture, just new pixels).
  // Two jerseys: the rich one (real type, collar, piping -- richTextures.ts)
  // once the platform brush and its font are in, the pixel-font one until
  // then and wherever the brush is unavailable.
  const jerseyTex = buildJerseyTexture(team.primary, team.secondary, null);
  const richTex = createJerseyDataTexture();
  const jersey = new THREE.MeshStandardMaterial({ map: jerseyTex, roughness: 0.62 });
  let shirt: { number: number | null; name?: string } = { number: null };
  let waitingForFont = false;
  const paintShirt = () => {
    if (painterReady() && paintRichJersey(richTex, team.primary, team.secondary, shirt.number, shirt.name)) {
      if (jersey.map !== richTex) { jersey.map = richTex; jersey.needsUpdate = true; }
      return;
    }
    paintJersey(jerseyTex.image.data as Uint8Array, jerseyTex.image.width, jerseyTex.image.height,
      hexToRgb(team.primary), hexToRgb(team.secondary), shirt.number);
    jerseyTex.needsUpdate = true;
    if (!painterReady() && !waitingForFont) {
      waitingForFont = true;
      onPainterReady(() => { waitingForFont = false; paintShirt(); });
    }
  };
  // Shorts carry a waistband and shoes a sole as painted bands, not meshes.
  const shortsMat = new THREE.MeshStandardMaterial({
    map: sharedBand(team.primary, [{ from: 0.84, to: 1.01, color: team.secondary }]),
    roughness: 0.6, side: THREE.DoubleSide,
  });
  // The shoes are the player's own (setPlayer picks the pair).
  const shoeMat = new THREE.MeshStandardMaterial({
    map: sharedBand(team.secondary, [{ from: -0.01, to: 0.3, color: soleFor(team.secondary) }]),
    roughness: 0.45,
  });
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
  // Everything that gets thicker on a heavier body (not the head, hands or feet).
  const bulky: THREE.Mesh[] = [];
  // Head on its own pivot at the base of the neck, so it can follow the ball.
  const neck = at(hips, 0, 1.95);
  mesh(neck, GEO.neck, skin, 0, 0.2);
  mesh(neck, GEO.head, skin, 0, 0.63);
  const hair = mesh(neck, GEO.hair, HAIR, 0, 0.65);
  const headband = mesh(neck, GEO.headband, fabric(WHITE), 0, 0.72);

  const shoulderL = at(hips, -0.78, 1.82);
  const shoulderR = at(hips, 0.78, 1.82);
  const elbowL = at(shoulderL, 0, -1.1);
  const elbowR = at(shoulderR, 0, -1.1);
  [shoulderL, shoulderR].forEach((s) => {
    bulky.push(mesh(s, GEO.shoulderJoint, skin));
    bulky.push(mesh(s, GEO.upperArm, skin, 0, -0.55));
  });
  // Accessories, each worn by some players and not others (setPlayer): a
  // shooting sleeve on either arm, sometimes full length; wristbands; a
  // compression sleeve or a pad on one leg.
  const sleeveUp = [mesh(shoulderL, GEO.sleeve, fabric(BLACK), 0, -0.62), mesh(shoulderR, GEO.sleeve, fabric(BLACK), 0, -0.62)];
  const sleeveFore = [mesh(elbowL, GEO.foreSleeve, fabric(BLACK), 0, -0.5), mesh(elbowR, GEO.foreSleeve, fabric(BLACK), 0, -0.5)];
  const wrist = [mesh(elbowL, GEO.wristband, fabric(WHITE), 0, -0.98), mesh(elbowR, GEO.wristband, fabric(WHITE), 0, -0.98)];
  const handMeshes: THREE.Mesh[] = [];
  [elbowL, elbowR].forEach((e) => {
    bulky.push(mesh(e, GEO.elbowJoint, skin));
    bulky.push(mesh(e, GEO.foreArm, skin, 0, -0.56));
    handMeshes.push(mesh(e, GEO.hand, skin, 0, -1.18));
  });

  const shorts = mesh(hips, GEO.shorts, shortsMat, 0, -0.32);
  shorts.scale.set(1, 1, 0.78);

  const hipL = at(hips, -0.32, -0.22);
  const hipR = at(hips, 0.32, -0.22);
  const kneeL = at(hipL, 0, -1.55);
  const kneeR = at(hipR, 0, -1.55);
  [hipL, hipR].forEach((h) => bulky.push(mesh(h, GEO.thigh, skin, 0, -0.75)));
  const socks: THREE.Mesh[] = [];
  [kneeL, kneeR].forEach((k) => {
    bulky.push(mesh(k, GEO.kneeJoint, skin));
    bulky.push(mesh(k, GEO.shin, skin, 0, -0.72));
    socks.push(mesh(k, GEO.sock, fabric(WHITE), 0, -1.2));
    mesh(k, GEO.shoe, shoeMat, 0, -1.6, 0.16);
  });
  const legSleeve = [mesh(kneeL, GEO.legSleeve, fabric(BLACK), 0, -0.45), mesh(kneeR, GEO.legSleeve, fabric(BLACK), 0, -0.45)];
  const kneePad = [mesh(kneeL, GEO.kneePad, fabric(BLACK), 0, 0), mesh(kneeR, GEO.kneePad, fabric(BLACK), 0, 0)];

  const j: Joints = { body, hips, neck, shoulderL, shoulderR, elbowL, elbowR, hipL, hipR, kneeL, kneeR };

  // Animation state, all smoothed so a pose change is a motion, not a snap.
  let phase = Math.random() * Math.PI * 2;
  let speedSmooth = 0;
  let vx = 0;
  let vz = 0;
  let lastX = 0;
  let lastZ = 0;
  let yaw = 0;
  let first = true;
  let jump = 0;
  let actWeight = 0;
  let neckYaw = 0;
  let shuffle = 0;
  let squeakWait = 0;
  let lastHeading = 0;
  const pose = {
    crouch: 0, lean: 0, armsUp: 0, stance: 0, dribble: 0,
  };
  const base = {} as Pose;
  const act = {} as Pose;
  const approach = (cur: number, target: number, k: number) => cur + (target - cur) * k;

  const setPlayer = (playerId: string, info: RigPlayer) => {
    const { number } = info;
    const r = seeded(playerId);
    skin.color.set(info.skinTone ?? SKIN_TONES[Math.floor(r * SKIN_TONES.length)]);
    hair.visible = r % 0.5 > 0.15;
    // Accessories are the player's, not the game's: fixed by his id, so the
    // same man shows up in the same gear every game.
    const pick = <T>(salt: string, list: T[]) => list[Math.floor(seeded(playerId + salt) * list.length)];
    const own = [WHITE, BLACK, team.primary, team.secondary];
    headband.visible = seeded(playerId + 'band') < 0.22;
    headband.material = fabric(pick('bandc', own));
    const sleeveSide = seeded(playerId + 'sleeve');
    const sleeveColor = fabric(pick('sleevec', [BLACK, WHITE, team.primary]));
    const full = seeded(playerId + 'full') < 0.45;
    [0, 1].forEach((k) => {
      // ~1 in 4 wears a sleeve: mostly the shooting (right) arm.
      const on = k === 1 ? sleeveSide < 0.18 : sleeveSide >= 0.18 && sleeveSide < 0.26;
      sleeveUp[k].visible = on;
      sleeveFore[k].visible = on && full;
      sleeveUp[k].material = sleeveColor;
      sleeveFore[k].material = sleeveColor;
    });
    const bands = seeded(playerId + 'wrist');
    const bandColor = fabric(pick('wristc', own));
    wrist[0].visible = bands < 0.3;
    wrist[1].visible = bands < 0.15 && !sleeveFore[1].visible;
    wrist.forEach((m) => { m.material = bandColor; });
    const leg = seeded(playerId + 'leg');
    const legColor = fabric(pick('legc', [BLACK, WHITE]));
    legSleeve[0].visible = leg < 0.1;
    legSleeve[1].visible = leg >= 0.1 && leg < 0.18;
    kneePad[0].visible = leg >= 0.18 && leg < 0.24;
    kneePad[1].visible = leg >= 0.24 && leg < 0.27;
    [...legSleeve, ...kneePad].forEach((m) => { m.material = legColor; });
    const sockColor = fabric(seeded(playerId + 'sock') < 0.25 ? BLACK : WHITE);
    socks.forEach((m) => { m.material = sockColor; });
    // His shoes: the team's color for most, plain white or black for some,
    // and a loud signature pair for a few.
    const shoe = seeded(playerId + 'shoe');
    const shoeColor = shoe < 0.45 ? team.secondary : shoe < 0.65 ? WHITE : shoe < 0.85 ? '#1a1b20' : pick('shoec', LOUD_SHOES);
    shoeMat.map = sharedBand(shoeColor, [{ from: -0.01, to: 0.3, color: soleFor(shoeColor) }]);
    shoeMat.needsUpdate = true;
    shirt = { number, name: info.name };
    paintShirt();
    // His real height (Curry 188 cm to Wembanyama 224: the old random spread
    // was +-6%, the real one 19%), and his weight as width: BMI against the
    // league average, softened so a heavy man reads sturdy, not inflated.
    const h = info.heightCm ? info.heightCm / BASE_HEIGHT_CM : 0.94 + seeded(playerId + 'h') * 0.12;
    root.scale.setScalar(Math.max(0.85, Math.min(1.16, h)));
    const bmi = info.heightCm && info.weightKg ? info.weightKg / (info.heightCm / 100) ** 2 : BASE_BMI;
    const bulk = Math.max(0.86, Math.min(1.2, 1 + (bmi / BASE_BMI - 1) * 0.8));
    torso.scale.set(1.15 * bulk, 1, 0.72 * bulk);
    shorts.scale.set(bulk, 1, 0.78 * bulk);
    bulky.forEach((m) => m.scale.set(bulk, 1, bulk));
  };

  const update = (p: PoseInput): boolean => {
    const dt = Math.max(1 / 240, Math.min(0.1, p.dt));
    if (first || p.snap) {
      lastX = p.x; lastZ = p.z; vx = 0; vz = 0; speedSmooth = 0; yaw = p.rotY; first = false;
    }
    // Velocity, smoothed: feet per real second on screen.
    vx = approach(vx, (p.x - lastX) / dt, 0.2);
    vz = approach(vz, (p.z - lastZ) / dt, 0.2);
    lastX = p.x;
    lastZ = p.z;
    const prevSpeed = speedSmooth;
    speedSmooth = Math.min(40, Math.hypot(vx, vz));
    const speed = speedSmooth;

    const action: PlayerAction = p.action ?? 'idle';
    const t = p.actionT ?? 0;
    // A finish, a contest, a screen or a rebound takes the body over;
    // dribbling and passing are layered on the running pose below.
    const big = action === 'shot' || action === 'layup' || action === 'dunk' || action === 'contest'
      || action === 'screen' || action === 'rebound';

    // --- facing ---------------------------------------------------------
    // The director says where he looks (the ball, or the rim with it in his
    // hands). A man running hard faces where he's going instead -- a
    // defender only once he's really sprinting; under that he slides and
    // backpedals facing the play. And the body turns, it doesn't snap.
    const heading = Math.atan2(vx, vz);
    const runFacing = !big && speed > 7 && (p.onOffense || speed > 16);
    const want = runFacing ? heading : p.rotY;
    const turn = wrapAngle(want - yaw);
    yaw += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, turn * Math.min(1, dt * 12)));
    yaw = wrapAngle(yaw);

    // How the legs move relative to the body: forward, back, or sideways.
    const fwd = speed > 0.5 ? (vx * Math.sin(yaw) + vz * Math.cos(yaw)) / speed : 1;
    const lat = speed > 0.5 ? Math.abs(vx * Math.cos(yaw) - vz * Math.sin(yaw)) / speed : 0;
    const backpedal = fwd < -0.3;

    // Playback paces each beat so nobody passes ~34 ft/s on screen
    // (watchDirector SCREEN_SPRINT); 4 ft/s on screen is a jog, 20+ a sprint.
    const run = Math.min(1, speed / 18);
    phase += dt * (6 + speed * 0.45) * (backpedal ? -1 : 1);

    // A plant or a hard cut at speed: the floor squeaks.
    squeakWait = Math.max(0, squeakWait - dt);
    let squeak = false;
    if (!p.snap && squeakWait === 0) {
      const turnRate = Math.abs(wrapAngle(heading - lastHeading)) / dt;
      const braking = (prevSpeed - speed) / dt;
      if ((speed > 9 && turnRate > 3.2) || (prevSpeed > 11 && braking > 30)) {
        squeakWait = SQUEAK_GAP;
        squeak = Math.random() < 0.6;
      }
    }
    lastHeading = heading;

    // Without director actions (an old plan), fall back to reading the ball:
    // anyone under a ball in flight near the rim rises for it.
    const dxb = p.ball.x - p.x;
    const dzb = p.ball.z - p.z;
    const nearBall = Math.hypot(dxb, dzb);
    const rising = p.action === undefined && p.ball.inFlight && p.ball.y > 7 && p.ball.y < 13 && nearBall < 5;

    const defending = !p.onOffense && run < 0.55 && !big;
    pose.stance = approach(pose.stance, defending ? 1 : 0, 0.08);
    // A defender moving sideways slides his feet instead of running.
    shuffle = approach(shuffle, defending && speed > 2 && lat > 0.55 ? 1 : 0, 0.15);
    pose.armsUp = approach(pose.armsUp, rising ? 1 : 0, 0.25);
    pose.dribble = approach(pose.dribble, action === 'dribble' || (p.action === undefined && p.hasBall && !rising) ? 1 : 0, 0.2);
    pose.lean = approach(pose.lean, run * (backpedal ? -0.1 : 0.22) * (1 - shuffle) + pose.stance * 0.18, 0.12);

    // --- base pose: running, stance, dribble ---------------------------
    const stride = run * (1 - shuffle);
    const swing = Math.sin(phase) * stride;
    const bob = Math.abs(Math.cos(phase)) * run * 0.22;
    const crouch = pose.stance * 0.55 + (1 - run) * 0.05;
    const kneeFold = (s: number) => Math.max(0, s) * 1.3 * stride + 0.12;
    // The hand meets the ball at the top of each bounce (dribblePhase 0) and
    // pushes it down; 1 = hand up at the catch, -1 = pushed down.
    const dribbleBeat = Math.cos(2 * Math.PI * dribblePhase(p.time));
    const armUp = pose.armsUp * -2.9;
    // A slide step: the feet spread and come back together.
    const spread = shuffle * (0.16 + 0.2 * (0.5 + 0.5 * Math.sin(phase)));
    // In a stance with nowhere to go, he stays on his toes.
    const chop = pose.stance * (1 - run) * Math.sin(p.time * 11 + phase) * 0.04;
    base.lean = pose.lean;
    // Legs: alternate swing, knees fold on the recovery half of the stride;
    // in a stance both thighs come forward, the knees bend and it goes wide.
    base.hipLx = -swing * 0.85 - pose.stance * 0.55 - pose.lean * 0.6;
    base.hipRx = swing * 0.85 - pose.stance * 0.55 - pose.lean * 0.6;
    base.kneeL = kneeFold(Math.sin(phase + Math.PI / 2)) + pose.stance * 0.95;
    base.kneeR = kneeFold(-Math.sin(phase + Math.PI / 2)) + pose.stance * 0.95;
    base.hipLz = -pose.stance * 0.22 - spread;
    base.hipRz = pose.stance * 0.22 + spread;
    // Arms: counter-swing when running, out and low in a stance, the right
    // hand working the ball on a dribble while the left arm comes across to
    // shield it.
    base.shLx = swing * 0.75 * (1 - pose.armsUp) * (1 - pose.dribble) + armUp - pose.stance * 0.6 - pose.dribble * 0.75;
    base.shRx = -swing * 0.75 * (1 - pose.armsUp) * (1 - pose.dribble) + armUp
      - pose.dribble * (0.55 + dribbleBeat * 0.12) - pose.stance * 0.6;
    base.shLz = -0.1 - pose.stance * 0.42 * (1 - pose.armsUp) - pose.dribble * 0.5;
    base.shRz = 0.1 + pose.stance * 0.42 * (1 - pose.armsUp) + pose.dribble * 0.18;
    base.elL = -0.35 - run * 0.9 * (1 - pose.dribble) - pose.stance * 0.3 + pose.armsUp * 0.25 - pose.dribble * 1.0;
    base.elR = -0.35 - run * 0.9 * (1 - pose.dribble) - pose.dribble * (0.75 + dribbleBeat * 0.35) + pose.armsUp * 0.25;

    // --- action pose ----------------------------------------------------
    // actionT runs 0-0.4 over the gather and 0.4-1 over the ball's flight
    // (watchDirector). The flight now lasts its real time (~1 s from three),
    // so the jump is timed to the release and he lands while the ball is
    // still in the air, follow-through held.
    let leap = 0;
    let gather = 0;
    if (action === 'shot') {
      // Dip on the gather, rise, release at the top with the shooting elbow
      // snapping straight, guide hand peeling off, follow-through held.
      gather = hump(t, 0, 0.3) * 0.5;
      leap = hump(t, 0.22, 0.6) * LEAP.shot;
      const released = clamp01((t - 0.36) / 0.1);
      act.lean = -0.05;
      act.hipLx = -0.15; act.hipRx = -0.15; act.hipLz = -0.05; act.hipRz = 0.05;
      act.kneeL = 0.25 + gather * 1.4; act.kneeR = 0.25 + gather * 1.4;
      act.shRx = -2.55 - released * 0.35; act.shRz = 0.12;
      act.elR = -1.5 + released * 1.35;
      act.shLx = -2.3 + released * 0.9; act.shLz = -0.35;
      act.elL = -1.1 + released * 0.4;
    } else if (action === 'layup') {
      // Off one foot: the left knee drives up, the right arm lays it up high,
      // the left arm out for balance.
      gather = hump(t, 0, 0.25) * 0.35;
      leap = hump(t, 0.18, 0.9) * LEAP.layup;
      const drive = hump(t, 0.15, 0.95);
      act.lean = 0.12;
      act.hipLx = -1.35 * drive; act.hipRx = 0.25 * drive; act.hipLz = 0; act.hipRz = 0;
      act.kneeL = 0.3 + 1.6 * drive; act.kneeR = 0.15 + gather;
      act.shRx = -2.95 * clamp01(t / 0.4 + 0.2); act.shRz = 0.05;
      act.elR = -0.25;
      act.shLx = -0.7; act.shLz = -0.75; act.elL = -0.6;
    } else if (action === 'dunk') {
      // Two-foot gather, a big rise with the ball up over the rim, then the
      // hang: knees tucked, both arms up and hauling down after the slam.
      gather = hump(t, 0, 0.25) * 0.7;
      leap = hump(t, 0.15, 1.05) * LEAP.dunk;
      const hang = clamp01((t - 0.55) / 0.2);
      act.lean = 0.08 - hang * 0.1;
      act.hipLx = -0.5 - hang * 0.4; act.hipRx = -0.35 - hang * 0.4; act.hipLz = -0.08; act.hipRz = 0.08;
      act.kneeL = 0.3 + gather * 1.6 + hang * 0.9; act.kneeR = 0.3 + gather * 1.6 + hang * 0.9;
      act.shRx = -3.05 + hang * 0.25; act.shLx = -2.85 + hang * 0.2;
      act.shRz = 0.15; act.shLz = -0.15;
      act.elR = -0.15 - hang * 0.4; act.elL = -0.25 - hang * 0.4;
    } else if (action === 'contest') {
      // Late, and not as high: the hand goes straight up at the release, the
      // other stays low and out.
      leap = hump(t, 0.3, 0.72) * LEAP.contest;
      act.lean = 0.02;
      act.hipLx = -0.2; act.hipRx = -0.2; act.hipLz = -0.12; act.hipRz = 0.12;
      act.kneeL = 0.35 + (1 - hump(t, 0.3, 0.72)) * 0.4; act.kneeR = act.kneeL;
      act.shLx = -3.0 * clamp01(t / 0.35); act.shLz = -0.1; act.elL = -0.1;
      act.shRx = -0.5; act.shRz = 0.55; act.elR = -0.5;
    } else if (action === 'screen') {
      // Set and still: feet wide, knees bent, arms folded across the chest.
      act.lean = 0.1;
      act.hipLx = -0.2; act.hipRx = -0.2; act.hipLz = -0.3; act.hipRz = 0.3;
      act.kneeL = 0.5; act.kneeR = 0.5;
      act.shLx = -0.75; act.shRx = -0.75; act.shLz = 0.55; act.shRz = -0.55;
      act.elL = -1.75; act.elR = -1.75;
    } else if (action === 'rebound') {
      // A load, then up with both hands over his head, high-pointing it.
      gather = hump(t, 0, 0.3) * 0.6;
      leap = hump(t, 0.2, 1) * LEAP.rebound;
      const reach = clamp01((t - 0.15) / 0.3);
      act.lean = -0.04;
      act.hipLx = -0.3; act.hipRx = -0.3; act.hipLz = -0.1; act.hipRz = 0.1;
      act.kneeL = 0.3 + gather * 1.5 + reach * 0.3; act.kneeR = act.kneeL;
      act.shLx = -2.95 * reach; act.shRx = -2.95 * reach; act.shLz = -0.18; act.shRz = 0.18;
      act.elL = -0.15; act.elR = -0.15;
    }

    // A pass is layered on the running legs: both arms push out from the
    // chest and snap straight at mid-beat.
    if (action === 'pass') {
      const push = hump(Math.min(1, t * 1.4), 0, 1);
      base.shLx = -0.95 - push * 0.55; base.shRx = -0.95 - push * 0.55;
      base.shLz = -0.25; base.shRz = 0.25;
      base.elL = -1.7 + push * 1.5; base.elR = -1.7 + push * 1.5;
    }

    // Blend into a big action and back out of it, so a shot reads as a
    // motion from the run and not a snap into a statue. On the way out `act`
    // still holds the action's last pose, which is what it fades from.
    actWeight = approach(actWeight, big ? 1 : 0, big ? 0.35 : 0.15);
    const f = {} as Pose;
    for (const k of KEYS) f[k] = base[k] + ((act[k] ?? base[k]) - base[k]) * actWeight;

    const targetJump = big ? leap : rising && nearBall < 3.5 ? 1.6 : 0;
    jump = big ? targetJump : approach(jump, targetJump, targetJump > jump ? 0.35 : 0.12);

    root.position.set(p.x, 0, p.z);
    root.rotation.y = yaw;

    j.body.position.y = bob - crouch * 0.6 - gather * 0.5 + jump + chop;
    j.hips.rotation.x = f.lean;
    j.hipL.rotation.x = f.hipLx;
    j.hipR.rotation.x = f.hipRx;
    j.hipL.rotation.z = f.hipLz;
    j.hipR.rotation.z = f.hipRz;
    j.kneeL.rotation.x = f.kneeL + jump * 0.2;
    j.kneeR.rotation.x = f.kneeR + jump * 0.2;
    j.shoulderL.rotation.x = f.shLx;
    j.shoulderR.rotation.x = f.shRx;
    j.shoulderL.rotation.z = f.shLz;
    j.shoulderR.rotation.z = f.shRz;
    j.elbowL.rotation.x = f.elL;
    j.elbowR.rotation.x = f.elR;

    // The head follows the ball, as far as a neck turns.
    const look = wrapAngle(Math.atan2(dxb, dzb) - yaw);
    const wantNeck = Math.max(-NECK_LIMIT, Math.min(NECK_LIMIT, look));
    neckYaw = approach(neckYaw, wantNeck, 0.18);
    j.neck.rotation.y = neckYaw;

    // Contact shadow shrinks and fades as he leaves the floor.
    const s = 2.4 - jump * 0.35;
    shadow.scale.set(s, s, 1);
    shadow.position.y = 0.04 - root.position.y;
    return squeak;
  };

  const hands = (right: THREE.Vector3, left: THREE.Vector3) => {
    root.updateMatrixWorld(true);
    handMeshes[1].getWorldPosition(right);
    handMeshes[0].getWorldPosition(left);
  };

  return { root, setPlayer, update, hands, yaw: () => yaw };
};
