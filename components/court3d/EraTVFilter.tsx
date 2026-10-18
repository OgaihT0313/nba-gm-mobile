// An old broadcast look over the 3D court for the older eras: scanlines, a
// darkened edge, and a washed-out warm cast -- strong in the 1980s, lighter in
// the 1990s, gone from 2000-01 on (the picture the league has today).
//
// Only overlays, composited above the GL view: no post-processing pass in the
// 3D itself, so the frame time measured on the phone (PLANO-3D) doesn't move.
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

const SCANLINES = require('../../assets/tv-scanlines.png');
const VIGNETTE = require('../../assets/tv-vignette.png');

interface Look { scan: number; vignette: number; cast: string }

/** The look for a season (END year), or null for a modern picture. */
export const tvLookFor = (year: number | null): Look | null => {
  if (year === null || year > 2000) return null;
  if (year <= 1990) return { scan: 0.28, vignette: 0.85, cast: 'rgba(214, 188, 140, 0.16)' };
  return { scan: 0.16, vignette: 0.6, cast: 'rgba(200, 190, 170, 0.08)' };
};

const EraTVFilter: React.FC<{ year: number | null }> = ({ year }) => {
  const look = tvLookFor(year);
  if (!look) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: look.cast }]} />
      <Image source={SCANLINES} resizeMode="repeat" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity: look.scan }]} />
      <Image source={VIGNETTE} resizeMode="stretch" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity: look.vignette }]} />
    </View>
  );
};

export default React.memo(EraTVFilter);
