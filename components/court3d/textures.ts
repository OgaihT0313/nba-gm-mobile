import * as THREE from 'three';

// Every texture the court uses, painted pixel by pixel into DataTextures.
//
// There is no 2D canvas in React Native (the HTML prototype this scene grew out
// of drew its floor with one), and shipping image files would mean an asset
// pipeline for a handful of patterns. Computing them is cheap -- each one is
// built once when the screen opens -- and it lets the floor carry the home
// team's colors and tricode without a single bitmap per franchise.

export type RGB = [number, number, number];

export const hexToRgb = (hex: string): RGB => {
  const c = new THREE.Color(hex);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
};

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const luminance = ([r, g, b]: RGB) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/**
 * Deterministic noise in [0,1) -- the same floor every time the screen opens.
 * Integer mixing, not the usual sin() trick: the floor calls it for every one
 * of ~1.2M pixels, and on a phone's JS engine sin() was most of the build time.
 */
const hash = (x: number, y: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const finish = (data: Uint8Array, w: number, h: number, opts: { repeat?: boolean; srgb?: boolean } = {}) => {
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = opts.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
};

/* ------------------------------------------------------------------ */
/* A 5x7 bitmap font -- enough for tricodes and jersey numbers.        */
/* ------------------------------------------------------------------ */
const GLYPHS: { [ch: string]: string[] } = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/**
 * Is the point (u, v), in [0,1] across a block of text, inside a lit pixel?
 * Glyphs sit on a 6-wide cell (5 + 1 gap); v grows downward.
 */
const textCovers = (text: string, u: number, v: number): boolean => {
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
  const cols = text.length * 6 - 1;
  const cx = Math.floor(u * cols);
  const cy = Math.floor(v * 7);
  const glyph = GLYPHS[text[Math.floor(cx / 6)]?.toUpperCase() ?? ' '] ?? GLYPHS[' '];
  const gx = cx % 6;
  return gx < 5 && glyph[cy]?.[gx] === '1';
};

/* ------------------------------------------------------------------ */
/* The floor.                                                          */
/* ------------------------------------------------------------------ */
/** Floor extents in feet: the 94x50 court plus a painted apron on every side. */
export const FLOOR_L = 106;
export const FLOOR_W = 62;

/**
 * Hardwood with the court painted on it: maple strips running the length of
 * the floor, every line two inches wide, the lane and the apron in the home
 * team's color, the center circle carrying its tricode. Lines are painted
 * into the wood rather than drawn as geometry -- WebGL draws GL lines one
 * pixel wide whatever you ask for, which is most of why the old court read as
 * a wireframe.
 */
export const buildFloorTexture = (opts: {
  wood: string;
  primary: string;
  secondary: string;
  label: string;
}): THREE.DataTexture => {
  // 1536 x 768: ~14.5 px per foot, so a two-inch line is still ~2.4 px wide,
  // and it builds in about half the time of 2048 x 1024 -- this runs on the
  // JS thread when the screen opens, on a phone.
  const W = 1536;
  const H = 768;
  const data = new Uint8Array(W * H * 4);
  const wood = hexToRgb(opts.wood);
  const primary = hexToRgb(opts.primary);
  const secondary = hexToRgb(opts.secondary);
  // Paint has to read against the wood; a near-black primary keeps a hint of grain.
  const paintAlpha = 0.86;
  const white: RGB = [246, 244, 238];
  const lineColor: RGB = luminance(primary) > 0.75 ? [24, 26, 32] : white;
  const textColor: RGB = luminance(secondary) < 0.2 && luminance(primary) < 0.2 ? white : secondary;

  const HALF_L = 47;
  const HALF_W = 25;
  const HOOP = 41.75;
  const LINE = 2 / 12; // two inches, in feet
  const LANE_HALF = 8;
  const LANE_LEN = 19;
  const THREE_R = 23.75;
  const CORNER_Z = 22;
  const CORNER_LEN = 14;
  const STRIP = 0.5; // visual maple strip width

  for (let row = 0; row < H; row++) {
    // Row 0 lands at -z on the rotated plane. Worked out on paper it should
    // have been +z; on screen the tricode's N came out mirrored, so this is
    // what the renderer actually does.
    const z = ((row + 0.5) / H) * FLOOR_W - FLOOR_W / 2;
    const az = Math.abs(z);
    for (let col = 0; col < W; col++) {
      const x = ((col + 0.5) / W) * FLOOR_L - FLOOR_L / 2;
      const ax = Math.abs(x);

      // --- wood -------------------------------------------------------
      const strip = Math.floor((z + 100) / STRIP);
      const board = Math.floor((x + 100 + (strip % 7) * 1.7) / 6.5); // staggered board ends
      const tone = 0.86 + hash(strip, board) * 0.22;
      // Grain: a slow wave along each strip (phase from the strip) plus fine speckle.
      const grain = Math.sin(x * 2.3 + hash(strip, 3) * 40) * 0.035
        + (hash(col >> 1, row >> 1) - 0.5) * 0.05;
      const seam = ((z + 100) / STRIP) % 1 < 0.06 ? 0.86 : 1;
      let c: RGB = [wood[0] * (tone + grain) * seam, wood[1] * (tone + grain) * seam, wood[2] * (tone + grain) * seam];

      // --- painted areas ---------------------------------------------
      const onCourt = ax <= HALF_L && az <= HALF_W;
      if (!onCourt) c = mix(c, mix(primary, [0, 0, 0], 0.18), paintAlpha);
      const sx = x >= 0 ? 1 : -1;
      const dLane = HALF_L - ax; // distance in from the baseline
      if (onCourt && dLane <= LANE_LEN && az <= LANE_HALF) c = mix(c, primary, paintAlpha);
      const rCenter = Math.hypot(x, z);
      if (rCenter <= 6) c = mix(c, primary, paintAlpha);

      // Wordmark on the apron behind each baseline, facing the court.
      if (ax > HALF_L + 1 && ax < HALF_L + 5.5 && az < 14) {
        const u = sx > 0 ? (z + 14) / 28 : (14 - z) / 28;
        // Read from midcourt: the edge farther from the court is the top.
        const v = 1 - (ax - (HALF_L + 1)) / 4.5;
        if (textCovers('NBA GM', u, v)) c = white;
      }

      // --- lines --------------------------------------------------------
      let line = false;
      // Boundary.
      if ((ax <= HALF_L && Math.abs(az - HALF_W) <= LINE) || (az <= HALF_W && Math.abs(ax - HALF_L) <= LINE)) line = true;
      // Midcourt line and circles.
      if (az <= HALF_W && Math.abs(x) <= LINE / 2) line = true;
      if (Math.abs(rCenter - 6) <= LINE / 2 || Math.abs(rCenter - 2) <= LINE / 2) line = true;
      if (!line && onCourt) {
        const hx = sx * HOOP;
        const toHoop = Math.hypot(x - hx, z);
        // Lane.
        if (dLane <= LANE_LEN && Math.abs(az - LANE_HALF) <= LINE / 2) line = true;
        if (az <= LANE_HALF && Math.abs(dLane - LANE_LEN) <= LINE / 2) line = true;
        // Free-throw circle: solid toward midcourt, dashed inside the lane.
        const ft = Math.hypot(x - sx * (HALF_L - LANE_LEN), z);
        if (Math.abs(ft - 6) <= LINE / 2) {
          const inside = dLane > LANE_LEN;
          if (inside || Math.floor(Math.atan2(z, x) * 6) % 2 === 0) line = true;
        }
        // Restricted area.
        if (Math.abs(toHoop - 4) <= LINE / 2 && sx * (hx - x) >= 0) line = true;
        // Lane hash marks.
        if (Math.abs(az - LANE_HALF - 0.5) <= 0.5 && dLane > 7 && dLane < 11.3) {
          const mark = dLane - 7;
          if ((mark >= 0 && mark <= LINE * 2) || (Math.abs(mark - 1) <= LINE) || (Math.abs(mark - 4.2) <= LINE)) line = true;
        }
        // Three-point line.
        if (dLane <= CORNER_LEN && Math.abs(az - CORNER_Z) <= LINE / 2) line = true;
        if (dLane > CORNER_LEN - 0.1 && Math.abs(toHoop - THREE_R) <= LINE / 2 && az <= CORNER_Z + 0.1) line = true;
        // Coaching box ticks on the sidelines.
        if (Math.abs(ax - 28) <= LINE / 2 && az >= HALF_W - 3 && az <= HALF_W) line = true;
      }
      if (line) c = onCourt || az <= HALF_W + LINE ? lineColor : white;

      // Tricode across the center circle, painted over the midcourt line the
      // way a logo is. Read from the near (+z) sideline: the far edge is the top.
      if (rCenter <= 5.2) {
        const tw = 8.4;
        const th = tw * 7 / (opts.label.length * 6 - 1);
        if (textCovers(opts.label, (x + tw / 2) / tw, (z + th / 2) / th)) c = textColor;
      }

      const i = (row * W + col) * 4;
      data[i] = Math.max(0, Math.min(255, c[0]));
      data[i + 1] = Math.max(0, Math.min(255, c[1]));
      data[i + 2] = Math.max(0, Math.min(255, c[2]));
      data[i + 3] = 255;
    }
  }
  return finish(data, W, H);
};

/* ------------------------------------------------------------------ */
/* Small props.                                                        */
/* ------------------------------------------------------------------ */

/** Orange pebbled leather with the eight black channels of a real ball. */
export const buildBallTexture = (): THREE.DataTexture => {
  const W = 256;
  const H = 128;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const lat = (y / H) * Math.PI - Math.PI / 2;
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2;
      const pebble = 0.9 + hash(x, y) * 0.14;
      let c: RGB = [214 * pebble, 104 * pebble, 40 * pebble];
      // A great circle through the poles, the equator, and the two curved
      // seams: where the point's distance along x sits at ~0.7 of the radius.
      const px = Math.cos(lat) * Math.cos(lon);
      const seam = Math.abs(Math.sin(lon)) * Math.cos(lat) < 0.03
        || Math.abs(lat) < 0.03
        || Math.abs(Math.abs(px) - 0.7) < 0.03;
      if (seam) c = [28, 20, 18];
      const i = (y * W + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return finish(data, W, H, { repeat: true });
};

/** Diamond mesh for the net, alpha-cut so the strings are real holes. */
export const buildNetTexture = (): THREE.DataTexture => {
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * 8;
      const v = (y / S) * 6;
      const d1 = Math.abs(((u + v) % 1) - 0.5);
      const d2 = Math.abs(((u - v + 100) % 1) - 0.5);
      const on = d1 > 0.42 || d2 > 0.42;
      const i = (y * S + x) * 4;
      data[i] = 250; data[i + 1] = 250; data[i + 2] = 250; data[i + 3] = on ? 255 : 0;
    }
  }
  return finish(data, S, S, { repeat: true });
};

/** Soft round contact shadow -- one texture shared by every body and the ball. */
export const buildShadowTexture = (): THREE.DataTexture => {
  const S = 64;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2);
      const a = Math.max(0, 1 - d);
      const i = (y * S + x) * 4;
      data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = Math.round(255 * a * a * 0.85);
    }
  }
  return finish(data, S, S, { srgb: false });
};

/**
 * A jersey: team color, trim at the hem, and the number front and back. The
 * torso is a capsule, so u wraps around the body -- 0.25 is the chest and
 * 0.75 the back once the mesh faces +z.
 */
export const buildJerseyTexture = (primary: string, secondary: string, number: number | null): THREE.DataTexture => {
  const W = 128;
  const H = 64;
  const data = new Uint8Array(W * H * 4);
  paintJersey(data, W, H, hexToRgb(primary), hexToRgb(secondary), number);
  return finish(data, W, H);
};

export const paintJersey = (data: Uint8Array, W: number, H: number, primary: RGB, secondary: RGB, number: number | null) => {
  const text = number === null ? '' : String(number);
  const ink: RGB = Math.abs(luminance(primary) - luminance(secondary)) < 0.25
    ? (luminance(primary) > 0.5 ? [20, 20, 24] : [245, 245, 245])
    : secondary;
  for (let y = 0; y < H; y++) {
    const v = y / H; // 0 = bottom of the torso
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let c: RGB = primary;
      if (v < 0.08 || (v > 0.86 && v < 0.92)) c = secondary; // hem and collar trim
      if (text) {
        for (const centre of [0.25, 0.75]) {
          const nw = 0.13 * text.length;
          const nu = (u - (centre - nw / 2)) / nw;
          const nv = 1 - (v - 0.3) / 0.42;
          if (textCovers(text, nu, nv)) c = ink;
        }
      }
      const i = (y * W + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
};

/** Scrolling courtside LED: the wordmark and a stripe in the home colors. */
export const buildLedTexture = (primary: string, secondary: string): THREE.DataTexture => {
  const W = 512;
  const H = 32;
  const data = new Uint8Array(W * H * 4);
  const p = hexToRgb(primary);
  const s = hexToRgb(secondary);
  const bright: RGB = luminance(p) < 0.15 ? s : p;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x % 256) / 256;
      const v = 1 - y / H;
      let c: RGB = [10, 12, 18];
      if (v < 0.1 || v > 0.9) c = bright;
      if (textCovers('NBA GM', (u - 0.08) / 0.5, (v - 0.22) / 0.56)) c = [255, 255, 255];
      if (u > 0.66 && u < 0.92 && v > 0.3 && v < 0.7) c = mix(bright, [255, 255, 255], (Math.sin(u * 60) + 1) * 0.15);
      const i = (y * W + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return finish(data, W, H, { repeat: true });
};
