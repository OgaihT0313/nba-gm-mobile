// An old broadcast look over the 3D court for the older eras: scanlines, a
// darkened edge, and a washed-out warm cast -- strong in the 1980s, lighter in
// the 1990s, gone from 2000-01 on (the picture the league has today).
//
// One full-screen quad drawn last in the scene, all three effects in a single
// fragment shader, at the canvas's (reduced) resolution. It used to be three
// React Native layers stacked over the GL view -- a color View, a repeated
// scanline image and a stretched vignette -- which the phone composited on
// top of every frame: three blended full screens at native resolution, and
// the 1985-86 games measured ~15% slower than the modern ones (device audit,
// 2026-10-18).
import React, { useMemo } from 'react';
import { PixelRatio } from 'react-native';
import * as THREE from 'three';

interface Look { scan: number; vignette: number; cast: string; castAlpha: number }

/** The look for a season (END year), or null for a modern picture. */
export const tvLookFor = (year: number | null): Look | null => {
  if (year === null || year > 2000) return null;
  if (year <= 1990) return { scan: 0.28, vignette: 0.85, cast: '#d6bc8c', castAlpha: 0.16 };
  return { scan: 0.16, vignette: 0.6, cast: '#c8beaa', castAlpha: 0.08 };
};

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Over the picture: the cast (color c at alpha ac), then black scanlines (s)
// and the vignette (v). As one normal blend: A = 1 - (1-ac)(1-s)(1-v), and the
// color is what's left of the cast after the two darkenings, over A.
const FRAG = /* glsl */ `
uniform vec3 uCast;
uniform float uCastA;
uniform float uScan;
uniform float uVig;
uniform float uPeriod;
varying vec2 vUv;
void main() {
  // One dark row in three, like the old 4x3 scanline tile, in screen points.
  float s = step(fract(gl_FragCoord.y / uPeriod), 1.0 / 3.0) * uScan;
  float v = smoothstep(0.34, 0.74, length(vUv - 0.5)) * uVig;
  float keep = (1.0 - s) * (1.0 - v);
  float a = 1.0 - (1.0 - uCastA) * keep;
  gl_FragColor = vec4(uCast * uCastA * keep / max(a, 1e-4), a);
}`;

/**
 * Inside the Canvas. `renderScale` is the canvas's share of the screen's
 * resolution, so the scanlines keep their on-screen pitch.
 */
const EraTVPass: React.FC<{ year: number | null; renderScale: number }> = ({ year, renderScale }) => {
  const look = tvLookFor(year);
  const mesh = useMemo(() => {
    if (!look) return null;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uCast: { value: new THREE.Color(look.cast) },
        uCastA: { value: look.castAlpha },
        uScan: { value: look.scan },
        uVig: { value: look.vignette },
        // The tile's rows were 1 pt each: 3 pt per period.
        uPeriod: { value: Math.max(2, 3 * PixelRatio.get() * renderScale) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    m.frustumCulled = false;
    m.renderOrder = 10000;
    return m;
  }, [look?.cast, look?.castAlpha, look?.scan, look?.vignette, renderScale]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mesh) return null;
  return <primitive object={mesh} />;
};

export default React.memo(EraTVPass);
