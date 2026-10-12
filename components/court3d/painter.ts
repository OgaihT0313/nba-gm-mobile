// A 2D brush for the 3D court's rich textures (jerseys, title banners), drawn
// with React Native Skia on an offscreen surface and read back as RGBA bytes
// for a THREE.DataTexture. React Native has no HTML canvas; Skia is the
// native equivalent (certified for Expo SDK 57). The web build resolves
// painter.web.ts, which does the same with the browser's canvas.
//
// Text is Barlow Condensed ExtraBold, the app's display face, loaded once from
// the font package's .ttf. Until it is in, painters still draw shapes, and
// callers that need text wait on onPainterReady.
import { Skia, PaintStyle, ColorType, AlphaType, type SkTypeface, type SkFont } from '@shopify/react-native-skia';
import { Asset } from 'expo-asset';

import type { Painter } from './painterTypes';

let typeface: SkTypeface | null = null;
let loading: Promise<void> | null = null;
const waiters: (() => void)[] = [];

export const painterReady = () => typeface !== null;

/** Calls `cb` once the font is in (right away if it already is). */
export const onPainterReady = (cb: () => void) => {
  if (typeface) cb(); else waiters.push(cb);
};

export const loadPainterFont = (): Promise<void> => {
  if (!loading) {
    loading = (async () => {
      try {
        const asset = Asset.fromModule(require('@expo-google-fonts/barlow-condensed/800ExtraBold/BarlowCondensed_800ExtraBold.ttf'));
        await asset.downloadAsync();
        const data = await Skia.Data.fromURI(asset.localUri ?? asset.uri);
        typeface = Skia.Typeface.MakeFreeTypeFaceFromData(data);
      } catch (e) {
        console.warn('[painter] font', e);
      }
      if (typeface) waiters.splice(0).forEach((f) => f());
    })();
  }
  return loading;
};

const fonts = new Map<number, SkFont>();
const fontAt = (size: number): SkFont | null => {
  if (!typeface) return null;
  const key = Math.round(size);
  let f = fonts.get(key);
  if (!f) { f = Skia.Font(typeface, key); fonts.set(key, f); }
  return f;
};

export const createPainter = (w: number, h: number): Painter | null => {
  const surface = Skia.Surface.MakeOffscreen(w, h);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  const fill = (color: string) => {
    const p = Skia.Paint();
    p.setColor(Skia.Color(color));
    p.setAntiAlias(true);
    return p;
  };
  return {
    w,
    h,
    rect: (x, y, rw, rh, color) => canvas.drawRect(Skia.XYWHRect(x, y, rw, rh), fill(color)),
    poly: (pts, color) => {
      const path = Skia.Path.Make();
      path.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
      path.close();
      canvas.drawPath(path, fill(color));
    },
    textWidth: (str, size) => fontAt(size)?.measureText(str).width ?? 0,
    text: (str, x, y, size, color, opts = {}) => {
      const font = fontAt(size);
      if (!font) return;
      const width = font.measureText(str).width;
      const left = opts.align === 'left' ? x : x - width / 2;
      if (opts.stroke && opts.strokeWidth) {
        const s = fill(opts.stroke);
        s.setStyle(PaintStyle.Stroke);
        s.setStrokeWidth(opts.strokeWidth);
        canvas.drawText(str, left, y, s, font);
      }
      canvas.drawText(str, left, y, fill(color), font);
    },
    pixels: () => {
      surface.flush();
      const img = surface.makeImageSnapshot();
      const px = img.readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
      return px instanceof Uint8Array ? px : null;
    },
  };
};
