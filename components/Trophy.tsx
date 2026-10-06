import React from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

// A championship trophy in the Larry O'Brien silhouette: a ball resting in the
// rim, a net-like body tapering to a short stem, a stepped base. Drawn in the
// system's gold so it sits on the bracket's Finals box without a bitmap.

const GOLD = '#E8C26A';
const GOLD_LIGHT = '#F6DF9C';
const GOLD_DARK = '#A9802F';
const SEAM = '#7A5A1E';

const Trophy: React.FC<{ size?: number }> = ({ size = 40 }) => (
  // viewBox is 40 x 64: `size` sets the height, width follows the aspect.
  <Svg width={(size * 40) / 64} height={size} viewBox="0 0 40 64">
    <Defs>
      <LinearGradient id="trophyGold" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor={GOLD_DARK} />
        <Stop offset="0.45" stopColor={GOLD_LIGHT} />
        <Stop offset="1" stopColor={GOLD_DARK} />
      </LinearGradient>
    </Defs>

    {/* Ball, sitting in the rim. */}
    <G>
      <Circle cx={20} cy={11} r={9} fill={GOLD} />
      <Path d="M11 11 H29" stroke={SEAM} strokeWidth={1.1} />
      <Path d="M20 2 V20" stroke={SEAM} strokeWidth={1.1} />
      <Path d="M14 4.5 Q18 11 14 17.5" stroke={SEAM} strokeWidth={1.1} fill="none" />
      <Path d="M26 4.5 Q22 11 26 17.5" stroke={SEAM} strokeWidth={1.1} fill="none" />
    </G>

    {/* Rim. */}
    <Ellipse cx={20} cy={20} rx={11} ry={2.4} fill={GOLD_DARK} />
    <Ellipse cx={20} cy={19.4} rx={11} ry={2} fill={GOLD} />

    {/* Net / body, tapering to the stem, with the net's diagonal weave. */}
    <Path d="M9.5 21 L16.5 47 H23.5 L30.5 21 Z" fill="url(#trophyGold)" />
    <Path d="M12 23 L22 45 M17 22 L24 38 M22 22 L26.5 31 M28 23 L18 45 M23 22 L16 38 M18 22 L13.5 31"
      stroke={GOLD_DARK} strokeWidth={0.7} opacity={0.75} />

    {/* Stem and stepped base. */}
    <Rect x={16} y={46.5} width={8} height={4} fill={GOLD_DARK} />
    <Path d="M11 50.5 H29 L31 56 H9 Z" fill="url(#trophyGold)" />
    <Rect x={7} y={56} width={26} height={5} rx={1} fill={GOLD} />
    <Rect x={7} y={60} width={26} height={1.6} rx={0.8} fill={GOLD_DARK} />
  </Svg>
);

export default Trophy;
