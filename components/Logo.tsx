import React from 'react';
import { Svg, Circle, Path } from 'react-native-svg';

// Basketball glyph, RN port. `color` sets the stroke (the web version inherited
// currentColor); the subtle fill is a low-opacity tint of the same color.
interface LogoProps {
    size?: number;
    color?: string;
}

const Logo: React.FC<LogoProps> = ({ size = 28, color = '#e2e8f0' }) => (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
        <Circle cx="12" cy="12" r="9.5" fill={color} fillOpacity={0.18} stroke={color} strokeWidth={1.4} />
        <Path d="M2.5 12h19" stroke={color} strokeWidth={1.4} />
        <Path d="M12 2.5v19" stroke={color} strokeWidth={1.4} />
        <Path d="M5 4.8c2.6 2.2 2.6 12.2 0 14.4" stroke={color} strokeWidth={1.4} fill="none" />
        <Path d="M19 4.8c-2.6 2.2-2.6 12.2 0 14.4" stroke={color} strokeWidth={1.4} fill="none" />
    </Svg>
);

export default Logo;
