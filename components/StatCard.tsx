import React from 'react';
import { View, Text } from 'react-native';

// RN port of the label-over-value tile. Same fixed tone palette as the web
// version (positive=emerald, warning=amber "over the cap", danger=red blocking,
// accent=per-team, default=white).
type StatTone = 'default' | 'positive' | 'warning' | 'danger' | 'accent';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: StatTone;
}

const TONE_CLASS: Record<StatTone, string> = {
  default: 'text-white',
  positive: 'text-emerald-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
  accent: 'text-accent',
};

const StatCard: React.FC<StatCardProps> = ({ label, value, sub, tone = 'default' }) => (
  <View className="bg-slate-950/50 rounded-2xl p-4 border border-slate-800 items-center">
    <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</Text>
    {/* JetBrains Mono runs noticeably wider per character than the system mono
        font this replaced — a long value ("-$48.9M") wrapped to 2 lines in a
        3-column row, confirmed live on device. adjustsFontSizeToFit lets it
        shrink only when it needs to, so short values (OVR, "58%") stay full size. */}
    <Text
      className={`text-lg font-mono-bold ${TONE_CLASS[tone]}`}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
    >
      {value}
    </Text>
    {sub ? <Text className="text-[10px] text-slate-600 font-mono mt-0.5">{sub}</Text> : null}
  </View>
);

export default StatCard;
