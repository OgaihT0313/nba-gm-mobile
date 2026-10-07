import React from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

// A championship trophy in the Larry O'Brien silhouette: the ball perched on
// the RIGHT edge of the rim (off-center, as on the real trophy), a tall net
// tapering to the stem, a two-step round base. Drawn in the system's gold so
// it sits on the bracket's Finals box without a bitmap.

const GOLD = '#E8C26A';
const GOLD_LIGHT = '#F6DF9C';
const GOLD_DARK = '#A9802F';
const SEAM = '#C9B27A';

const Trophy: React.FC<{ size?: number }> = ({ size = 40 }) => (
  // viewBox is 40 x 64: `size` sets the height, width follows the aspect.
  <Svg width={(size * 40) / 64} height={size} viewBox="0 0 40 64">
    <Defs>
      <LinearGradient id="trophyGold" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor={GOLD_DARK} />
        <Stop offset="0.45" stopColor={GOLD_LIGHT} />
        <Stop offset="1" stopColor={GOLD_DARK} />
      </LinearGradient>
      <LinearGradient id="ballGold" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={GOLD_LIGHT} />
        <Stop offset="0.6" stopColor={GOLD} />
        <Stop offset="1" stopColor={GOLD_DARK} />
      </LinearGradient>
    </Defs>

    {/* Net / body: wide at the rim, tapering to the stem. */}
    <Path d="M11 21 L28 21 L22.5 50 H17.5 Z" fill="url(#trophyGold)" />
    <Path
      d="M13 23 Q16 27 15 31 Q17 35 16.5 39 Q18 43 18 47 M18 22 Q20 27 19 32 Q21 37 20 42 M23.5 22 Q24 27 22.5 31 Q23 35 21.5 40 M27 23 Q26 28 24.5 32"
      stroke={SEAM} strokeWidth={0.6} fill="none" opacity={0.85}
    />
    {/* Rim. */}
    <Ellipse cx={19.5} cy={21} rx={8.5} ry={1.6} fill={GOLD_DARK} />
    <Ellipse cx={19.5} cy={20.6} rx={8.5} ry={1.2} fill={GOLD} />

    {/* Ball, resting on the right lip of the rim. */}
    <G>
      <Circle cx={26} cy={10.5} r={10} fill="url(#ballGold)" />
      <Path d="M16.3 8.5 Q26 13 35.7 9" stroke={SEAM} strokeWidth={0.9} fill="none" />
      <Path d="M24 0.7 Q29 10 25.5 20.4" stroke={SEAM} strokeWidth={0.9} fill="none" />
      <Path d="M18.5 3.8 Q22.5 9 19.5 17.6" stroke={SEAM} strokeWidth={0.9} fill="none" />
      <Path d="M31 1.9 Q35 8 33.6 16.8" stroke={SEAM} strokeWidth={0.9} fill="none" />
    </G>

    {/* Stem and the two-step round base. */}
    <Rect x={17.5} y={49.5} width={5} height={3} fill={GOLD_DARK} />
    <Ellipse cx={20} cy={56} rx={11} ry={2.6} fill={GOLD_DARK} />
    <Rect x={9} y={53} width={22} height={3} fill="url(#trophyGold)" />
    <Ellipse cx={20} cy={53} rx={11} ry={2.4} fill={GOLD} />
    <Ellipse cx={20} cy={60.4} rx={14} ry={3} fill={GOLD_DARK} />
    <Rect x={6} y={57} width={28} height={3.4} fill="url(#trophyGold)" />
    <Ellipse cx={20} cy={57} rx={14} ry={2.8} fill={GOLD} />
  </Svg>
);

export default Trophy;
