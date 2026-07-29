import React from 'react';
import { View, Text } from 'react-native';

// RN port. Mobile-first: the eyebrow/title/subtitle stack, with any actions
// (e.g. the Segmented sim controls) below — the same layout the web header
// collapses to at its `flex-col` mobile breakpoint.
interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  accentColor?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, subtitle, actions, accentColor }) => (
  <View className="gap-4">
    <View>
      {eyebrow ? (
        <Text
          className="text-[10px] font-bold uppercase tracking-widest mb-1 text-accent"
          style={accentColor ? { color: accentColor } : undefined}
        >
          {eyebrow}
        </Text>
      ) : null}
      <Text className="text-3xl font-display uppercase tracking-tighter text-white">{title}</Text>
      {subtitle ? (
        typeof subtitle === 'string'
          ? <Text className="text-slate-400 text-sm mt-2">{subtitle}</Text>
          : <View className="mt-2">{subtitle}</View>
      ) : null}
    </View>
    {actions ? <View>{actions}</View> : null}
  </View>
);

export default PageHeader;
