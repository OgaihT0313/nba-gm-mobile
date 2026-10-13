import * as THREE from 'three';

import { createPainter } from './painter';
import type { Painter } from './painterTypes';

// Textures that need real type: the jersey (number and surname in the app's
// display face, collar, piping, fabric rib) and the championship banners in
// the rafters. Drawn with the platform brush (painter.ts: Skia on the phone,
// the browser canvas on the web) instead of the pixel painter in textures.ts,
// whose 5x7 font is fine at scoreboard distance but blocky on a chest.

/** Canvas rows run top-down; a DataTexture's row 0 is the bottom of the face. */
const flipInto = (src: Uint8Array, dst: Uint8Array, w: number, h: number) => {
  const row = w * 4;
  for (let y = 0; y < h; y++) dst.set(src.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
};

const lum = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
/** The number's fill: the secondary if it stands out on the primary, else white or ink. */
export const inkFor = (primary: string, secondary: string) =>
  Math.abs(lum(primary) - lum(secondary)) >= 0.25 ? secondary : lum(primary) > 0.5 ? '#141418' : '#f5f5f5';
const outlineFor = (primary: string, ink: string) => (ink === '#f5f5f5' || ink === '#141418' ? primary : lum(ink) > 0.5 ? '#141418' : '#f5f5f5');

export const JERSEY_W = 512;
export const JERSEY_H = 256;

/** "Shai Gilgeous-Alexander" -> "GILGEOUS-ALEXANDER"; suffixes dropped. */
const surname = (name: string) => {
  const parts = name.split(' ').filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(w));
  return (parts.length > 1 ? parts.slice(1).join(' ') : parts[0] ?? '').toUpperCase();
};

const drawJersey = (p: Painter, primary: string, secondary: string, number: number | null, name?: string) => {
  const { w: W, h: H } = p;
  // u wraps the torso: 0.25 is the chest, 0.75 the back (see textures.ts).
  const chest = W * 0.25;
  const back = W * 0.75;
  p.rect(0, 0, W, H, primary);
  // Rib of the mesh fabric: faint horizontal lines, cheap to draw.
  for (let y = 0; y < H; y += 4) p.rect(0, y, W, 1, 'rgba(0,0,0,0.07)');
  // Hem and collar band.
  p.rect(0, H * 0.92, W, H * 0.08, secondary);
  p.rect(0, H * 0.08, W, H * 0.06, secondary);
  // V-neck on the chest: the trim color, with the body color cut back in.
  p.poly([chest - 34, H * 0.08, chest + 34, H * 0.08, chest, H * 0.3], secondary);
  p.poly([chest - 20, H * 0.08, chest + 20, H * 0.08, chest, H * 0.24], primary);
  // Side seams with white piping.
  for (const x of [0, W / 2, W]) {
    p.rect(x - 14, H * 0.14, 28, H * 0.78, secondary);
    p.rect(x - 16, H * 0.14, 2, H * 0.78, 'rgba(255,255,255,0.75)');
    p.rect(x + 14, H * 0.14, 2, H * 0.78, 'rgba(255,255,255,0.75)');
  }
  if (number === null) return;
  const ink = inkFor(primary, secondary);
  const edge = outlineFor(primary, ink);
  const num = String(number);
  p.text(num, chest, H * 0.72, H * 0.44, ink, { stroke: edge, strokeWidth: 9 });
  p.text(num, back, H * 0.76, H * 0.44, ink, { stroke: edge, strokeWidth: 9 });
  if (name) {
    const label = surname(name);
    // Long names shrink to fit the back, as on a real jersey.
    const size = Math.min(H * 0.12, (W * 0.36) / Math.max(1, p.textWidth(label, 100) / 100));
    p.text(label, back, H * 0.29, size, ink, { stroke: edge, strokeWidth: 3 });
  }
};

/**
 * Repaints `tex` (a JERSEY_W x JERSEY_H DataTexture) with the rich jersey.
 * Returns false when the platform brush isn't available, so the caller can
 * keep the pixel-font jersey.
 */
export const paintRichJersey = (
  tex: THREE.DataTexture, primary: string, secondary: string, number: number | null, name?: string,
): boolean => {
  const p = createPainter(JERSEY_W, JERSEY_H);
  if (!p) return false;
  drawJersey(p, primary, secondary, number, name);
  const px = p.pixels();
  if (!px) return false;
  flipInto(px, tex.image.data as Uint8Array, JERSEY_W, JERSEY_H);
  tex.needsUpdate = true;
  return true;
};

export const createJerseyDataTexture = (): THREE.DataTexture => {
  const tex = new THREE.DataTexture(new Uint8Array(JERSEY_W * JERSEY_H * 4), JERSEY_W, JERSEY_H, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
};

/* ------------------------------------------------------------------ */
/* Championship banners                                                 */
/* ------------------------------------------------------------------ */

export const BANNER_W = 128;
export const BANNER_H = 256;

/**
 * Every banner side by side in one texture (one draw per banner quad, one
 * texture for all of them): the franchise's title years, oldest first.
 */
export const buildBannerTexture = (years: number[], primary: string, secondary: string): THREE.DataTexture | null => {
  if (!years.length) return null;
  const W = BANNER_W * years.length;
  const p = createPainter(W, BANNER_H);
  if (!p) return null;
  const ink = inkFor(primary, secondary);
  years.forEach((year, i) => {
    const x = i * BANNER_W;
    const cx = x + BANNER_W / 2;
    p.rect(x, 0, BANNER_W, BANNER_H, primary);
    p.rect(x + 6, 6, BANNER_W - 12, BANNER_H - 12, secondary);
    p.rect(x + 12, 12, BANNER_W - 24, BANNER_H - 24, primary);
    p.text('CAMPEÕES', cx, 70, 22, ink);
    p.text('DA NBA', cx, 96, 22, ink);
    p.text(String(year), cx, 170, 50, '#f5f5f5', { stroke: secondary, strokeWidth: 5 });
    p.rect(cx - 28, 196, 56, 4, secondary);
  });
  const px = p.pixels();
  if (!px) return null;
  const data = new Uint8Array(W * BANNER_H * 4);
  flipInto(px, data, W, BANNER_H);
  const tex = new THREE.DataTexture(data, W, BANNER_H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
};

/* ------------------------------------------------------------------ */
/* Floor decals: the home team's type, laid over the hardwood           */
/* ------------------------------------------------------------------ */

/** Type alone on a transparent ground, mipmapped (the floor is seen edge-on). */
const decalTexture = (W: number, H: number, draw: (p: Painter) => void): THREE.DataTexture | null => {
  const p = createPainter(W, H);
  if (!p) return null;
  draw(p);
  const px = p.pixels();
  if (!px) return null;
  const data = new Uint8Array(W * H * 4);
  flipInto(px, data, W, H);
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
};

/** One word as big as fits the canvas, with an outline. */
const fitWord = (p: Painter, word: string, color: string, edge: string, fill = 0.92) => {
  const size = Math.min(p.h * 0.82, (p.w * fill) / Math.max(1, p.textWidth(word, 100) / 100));
  p.text(word, p.w / 2, p.h / 2 + size * 0.36, size, color, { stroke: edge, strokeWidth: Math.max(4, size * 0.08) });
};

/** Center court: the nickname across the circle, the way a logo spills over it. */
export const buildCenterDecal = (nickname: string, primary: string, secondary: string) => {
  const ink = inkFor(primary, secondary);
  return decalTexture(1024, 512, (p) => fitWord(p, nickname.toUpperCase(), ink, outlineFor(primary, ink)));
};

/** A wordmark for the painted apron (the city, the nickname): light type, a dark edge. */
export const buildApronDecal = (word: string, primary: string, secondary: string, W = 1024, H = 128) => {
  const ink = lum(secondary) > 0.35 && Math.abs(lum(primary) - lum(secondary)) >= 0.25 ? secondary : '#f5f5f5';
  return decalTexture(W, H, (p) => fitWord(p, word.toUpperCase(), ink, 'rgba(0,0,0,0.55)', 0.96));
};
