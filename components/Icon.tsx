import React from 'react';
import { Svg, Path, Circle, Rect } from 'react-native-svg';

// RN port of the web line-icon set. Same 24x24 geometry and stroke language
// (1.8 weight, round caps, no fill). On the web these stroked with `currentColor`
// and inherited text color; react-native-svg has no cascading text color, so the
// stroke color is an explicit `color` prop (callers pass the accent when needed).
export type IconName =
    | 'home' | 'teams' | 'scout' | 'my-team' | 'draft' | 'free-agency'
    | 'simulation' | 'standings' | 'leaders' | 'trade' | 'awards' | 'all-star'
    | 'playoffs' | 'commentary' | 'cup' | 'offers' | 'trending' | 'menu'
    | 'chevron-down' | 'lock' | 'calendar' | 'waive' | 'medical' | 'coach' | 'battery';

const PATHS: Record<IconName, React.ReactNode> = {
    home: <><Path d="M4 10.5 12 4l8 6.5" /><Path d="M6 9.8V20h12V9.8" /><Path d="M10 20v-5h4v5" /></>,
    teams: <><Circle cx="12" cy="12" r="8.5" /><Path d="M12 3.5v17M3.5 12h17" /><Path d="M6 6c2.6 2.4 2.6 9.6 0 12M18 6c-2.6 2.4-2.6 9.6 0 12" /></>,
    scout: <><Circle cx="11" cy="11" r="6.5" /><Path d="M20.5 20.5 16 16" /></>,
    'my-team': <Path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z" />,
    draft: <><Path d="M12 5 3 9l9 4 9-4-9-4z" /><Path d="M7 11v4.3c0 1.3 2.2 2.7 5 2.7s5-1.4 5-2.7V11" /><Path d="M21 9v4.5" /></>,
    'free-agency': <><Path d="M4 20.5h16" /><Path d="M15 5l4 4" /><Path d="M4.5 19.5l1-4 11-11 3 3-11 11-4 1z" /></>,
    simulation: <><Path d="M4 4v16h16" /><Path d="M7 14.5l3.2-4 3 2.2 4.3-6" /></>,
    standings: <><Path d="M7 4h10v4.5a5 5 0 0 1-10 0V4z" /><Path d="M7 5.5H4.8a1.8 1.8 0 0 0 0 3.6H7M17 5.5h2.2a1.8 1.8 0 0 1 0 3.6H17" /><Path d="M12 13.5V17" /><Path d="M8.5 20.5c0-1.6 1.1-3.5 3.5-3.5s3.5 1.9 3.5 3.5z" /></>,
    leaders: <Path d="M12 3c3 3.5 4.5 5.6 4.5 8.5a4.5 4.5 0 0 1-9 0c0-1.4.5-2.6 1.4-3.6.2 1 .9 1.7 1.8 1.9C10 8.9 10.6 6 12 3z" />,
    trade: <><Path d="M4 9h13" /><Path d="M14 6l3 3-3 3" /><Path d="M20 15H7" /><Path d="M10 12l-3 3 3 3" /></>,
    awards: <><Circle cx="12" cy="14" r="5.5" /><Path d="M9 9.4 6.5 3.5M15 9.4 17.5 3.5M8.5 3.5h7" /><Path d="M12 12.2l.8 1.6 1.8.3-1.3 1.3.3 1.8-1.6-.9-1.6.9.3-1.8-1.3-1.3 1.8-.3z" /></>,
    'all-star': <><Circle cx="12" cy="12" r="3" /><Path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M18.4 5.6l-2.5 2.5M8.1 15.9l-2.5 2.5" /></>,
    playoffs: <><Path d="M4 6v4.5h6" /><Path d="M4 18v-4.5h6" /><Path d="M10 10.5V13.5" /><Path d="M10 12h5" /><Path d="M15 8.5v7" /><Path d="M15 12h5" /></>,
    commentary: <><Rect x="9.5" y="3" width="5" height="10" rx="2.5" /><Path d="M6.5 11a5.5 5.5 0 0 0 11 0" /><Path d="M12 16.5V21" /><Path d="M9 21h6" /></>,
    cup: <><Path d="M7 4h10v4.5a5 5 0 0 1-10 0V4z" /><Path d="M7 5.5H4.8a1.8 1.8 0 0 0 0 3.6H7M17 5.5h2.2a1.8 1.8 0 0 1 0 3.6H17" /><Path d="M12 13.5V17" /><Path d="M8.5 20.5c0-1.6 1.1-3.5 3.5-3.5s3.5 1.9 3.5 3.5z" /></>,
    offers: <><Rect x="3" y="5.5" width="18" height="13" rx="2" /><Path d="M4 7l8 5.5L20 7" /></>,
    trending: <><Path d="M3 17l6-6 4 4 8-8" /><Path d="M15 7h6v6" /></>,
    menu: <Path d="M4 7h16M4 12h16M4 17h16" />,
    'chevron-down': <Path d="M6 9l6 6 6-6" />,
    lock: <><Rect x="5" y="10.5" width="14" height="9.5" rx="2" /><Path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
    calendar: <><Rect x="4" y="5" width="16" height="15" rx="2" /><Path d="M4 9.5h16M8 3v4M16 3v4" /></>,
    waive: <><Path d="M4 7h16" /><Path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" /><Path d="M6.5 7l.9 12.1a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" /><Path d="M10 11v5M14 11v5" /></>,
    medical: <><Rect x="4" y="4" width="16" height="16" rx="4.5" /><Path d="M12 8.5v7M8.5 12h7" /></>,
    coach: <><Rect x="6" y="4" width="12" height="17" rx="2" /><Rect x="9" y="2.5" width="6" height="3" rx="1" /><Path d="M9 11h6M9 14.5h4.5M9 8h3" /></>,
    battery: <><Rect x="3" y="8" width="15.5" height="8.5" rx="2" /><Path d="M21 10.5v3.5" /><Path d="M8 8v8.5" /></>,
};

interface IconProps {
    name: IconName;
    size?: number;
    color?: string;
    strokeWidth?: number;
}

const Icon: React.FC<IconProps> = ({ name, size = 24, color = '#cbd5e1', strokeWidth = 1.8 }) => (
    <Svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        {PATHS[name]}
    </Svg>
);

export default Icon;
