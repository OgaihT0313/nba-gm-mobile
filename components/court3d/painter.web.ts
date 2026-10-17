// The web build's brush (see painter.ts): the browser's own canvas. The font
// is the one the app already registered through expo-font, so it is ready
// whenever the app is.
import type { Painter } from './painterTypes';

const FAMILY = 'BarlowCondensed_800ExtraBold';

export const painterReady = () => typeof document !== 'undefined';
export const onPainterReady = (cb: () => void) => { cb(); };
export const loadPainterFont = async () => {
  try { await (document as any).fonts?.load(`100px ${FAMILY}`); } catch { /* fallback font */ }
};

// One canvas per size, reused, and kept in CPU memory (willReadFrequently):
// every paint is read back with getImageData, which on a GPU canvas waits
// for the GPU. Same reason as the native painter's raster surface.
const contexts = new Map<string, CanvasRenderingContext2D>();

export const createPainter = (w: number, h: number): Painter | null => {
  if (typeof document === 'undefined') return null;
  const key = `${w}x${h}`;
  let ctx = contexts.get(key) ?? null;
  if (!ctx) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    contexts.set(key, ctx);
  }
  ctx.clearRect(0, 0, w, h);
  const font = (size: number) => `${Math.round(size)}px ${FAMILY}, "Arial Narrow", sans-serif`;
  return {
    w,
    h,
    rect: (x, y, rw, rh, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, rw, rh); },
    poly: (pts, color) => {
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    },
    textWidth: (str, size) => { ctx.font = font(size); return ctx.measureText(str).width; },
    text: (str, x, y, size, color, opts = {}) => {
      ctx.font = font(size);
      ctx.textAlign = opts.align === 'left' ? 'left' : 'center';
      ctx.textBaseline = 'alphabetic';
      if (opts.stroke && opts.strokeWidth) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = opts.strokeWidth;
        ctx.strokeStyle = opts.stroke;
        ctx.strokeText(str, x, y);
      }
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
    },
    pixels: () => new Uint8Array(ctx.getImageData(0, 0, w, h).data.buffer),
  };
};
