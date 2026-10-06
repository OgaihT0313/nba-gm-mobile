import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Rect } from 'react-native-svg';

import { COLORS, FONT } from '../src/theme/tokens';

// The NBA Manager mark (handoff "Logos NBA Manager", option 2b): the two
// conference strokes, "NBA" in condensed 800 with the ball beside it, and
// "MANAGER" tracked wide underneath. Drawn, not a bitmap, so it stays sharp at
// every size and needs no asset at runtime.

export const BALL = '#E8762B';
export const SEAM = '#1A0F08';

/** The ball alone. Geometry is the handoff's CSS, scaled from its 70px build. */
export const Ball: React.FC<{ size: number }> = ({ size: s }) => {
  const w = s * 0.057; // seam width
  const id = `ball-${Math.round(s)}`;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <Defs>
        <ClipPath id={id}>
          <Circle cx={s / 2} cy={s / 2} r={s / 2} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id})`}>
        <Circle cx={s / 2} cy={s / 2} r={s / 2} fill={BALL} />
        <Rect x={s / 2 - w / 2} y={0} width={w} height={s} fill={SEAM} />
        <Rect x={0} y={s / 2 - w / 2} width={s} height={w} fill={SEAM} />
        {/* The side seams are ellipses whose inner edge crosses the ball. */}
        <Ellipse cx={-0.164 * s} cy={s / 2} rx={0.45 * s - w / 2} ry={0.6 * s - w / 2} stroke={SEAM} strokeWidth={w} fill="none" />
        <Ellipse cx={1.164 * s} cy={s / 2} rx={0.45 * s - w / 2} ry={0.6 * s - w / 2} stroke={SEAM} strokeWidth={w} fill="none" />
      </G>
    </Svg>
  );
};

/** The full lockup. `size` is the "NBA" cap height in px (96 on Home, 82 on the splash). */
const BrandLogo: React.FC<{ size?: number }> = ({ size = 96 }) => {
  const k = size / 96;
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <View className="flex-row" style={{ gap: 4 * k }}>
        <View style={{ width: 31 * k, height: 6 * k, backgroundColor: COLORS.west }} />
        <View style={{ width: 31 * k, height: 6 * k, backgroundColor: COLORS.east }} />
      </View>
      <View className="flex-row items-center" style={{ gap: 9 * k, marginTop: 14 * k }}>
        <Text style={{ fontFamily: FONT.cond800, fontSize: size, lineHeight: size * 0.86, letterSpacing: -0.01 * size, color: COLORS.text, includeFontPadding: false }}>
          NBA
        </Text>
        <Ball size={70 * k} />
      </View>
      <Text style={{ fontFamily: FONT.cond700, fontSize: 26 * k, lineHeight: 26 * k, letterSpacing: 0.36 * 26 * k, color: COLORS.text, marginTop: 9 * k }}>
        MANAGER
      </Text>
    </View>
  );
};

export default BrandLogo;
