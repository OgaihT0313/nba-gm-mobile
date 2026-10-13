// The career screens' shared pieces, in the app's "Transmissão" language:
// flat panels, condensed caps, one light CTA. Kept here so the career screens
// read as one family without touching the GM's components.
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT, RADIUS, withAlpha, onAccent } from '../../src/theme/tokens';

/** A scrolling page with the status bar's inset on top and room for a docked CTA. */
export const Page: React.FC<{ children: React.ReactNode; dock?: React.ReactNode; band?: { color: string; height: number } }> = ({ children, dock, band }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {band ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: band.height + insets.top, backgroundColor: band.color }} /> : null}
      {/* A column on a wide screen (the site on a PC), full width on a phone. */}
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: dock ? 120 : 40, gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center' }} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      {dock ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, backgroundColor: COLORS.dockBg, borderTopWidth: 1, borderTopColor: COLORS.line }}>
          <View style={{ width: '100%', maxWidth: 608, alignSelf: 'center' }}>{dock}</View>
        </View>
      ) : null}
    </View>
  );
};

export const Label: React.FC<{ children: React.ReactNode; color?: string; style?: StyleProp<any> }> = ({ children, color = COLORS.muted, style }) => (
  <Text style={[{ fontFamily: FONT.cond700, fontSize: 11.5, letterSpacing: 1.5, color, textTransform: 'uppercase' }, style]}>{children}</Text>
);

export const Title: React.FC<{ children: React.ReactNode; size?: number; color?: string }> = ({ children, size = 30, color = COLORS.text }) => (
  <Text style={{ fontFamily: FONT.cond800, fontSize: size, lineHeight: size * 1.02, color, textTransform: 'uppercase' }}>{children}</Text>
);

export const Body: React.FC<{ children: React.ReactNode; color?: string; size?: number }> = ({ children, color = COLORS.muted, size = 13.5 }) => (
  <Text style={{ fontFamily: FONT.body500, fontSize: size, lineHeight: size * 1.4, color }}>{children}</Text>
);

export const Box: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle>; highlight?: string }> = ({ children, style, highlight }) => (
  <View style={[{ backgroundColor: COLORS.surface, borderRadius: RADIUS.card, padding: 14, gap: 8, borderWidth: highlight ? 1 : 0, borderColor: highlight }, style]}>{children}</View>
);

/** A choice among several: filled when picked. */
export const Option: React.FC<{
  label: string;
  sub?: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ label, sub, active, onPress, disabled, style }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    aria-selected={active}
    onPress={disabled ? undefined : onPress}
    className="active:opacity-75"
    style={[{
      paddingVertical: sub ? 10 : 9, paddingHorizontal: 12, borderRadius: 12,
      backgroundColor: active ? COLORS.text : COLORS.sunken, opacity: disabled ? 0.45 : 1,
    }, style]}
  >
    <Text style={{ fontFamily: FONT.cond800, fontSize: 15.5, letterSpacing: 0.4, color: active ? COLORS.bg : COLORS.text, textTransform: 'uppercase' }}>{label}</Text>
    {sub ? <Text style={{ fontFamily: FONT.body500, fontSize: 12.5, lineHeight: 17, marginTop: 2, color: active ? withAlpha(COLORS.bg, 0.72) : COLORS.muted }}>{sub}</Text> : null}
  </Pressable>
);

/** - value + */
export const Stepper: React.FC<{ value: string; onMinus: () => void; onPlus: () => void; label: string }> = ({ value, onMinus, onPlus, label }) => (
  <View className="flex-row items-center" style={{ gap: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Diminuir ${label}`} onPress={onMinus} className="active:opacity-70"
      style={{ width: 44, height: 40, borderRadius: 10, backgroundColor: COLORS.sunken, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT.cond800, fontSize: 22, color: COLORS.text }}>−</Text>
    </Pressable>
    <Text style={{ flex: 1, textAlign: 'center', fontFamily: FONT.cond800, fontSize: 24, color: COLORS.text }}>{value}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar ${label}`} onPress={onPlus} className="active:opacity-70"
      style={{ width: 44, height: 40, borderRadius: 10, backgroundColor: COLORS.sunken, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT.cond800, fontSize: 22, color: COLORS.text }}>+</Text>
    </Pressable>
  </View>
);

/** A horizontal bar with its number. */
export const Bar: React.FC<{ label: string; value: number; max?: number; color?: string; right?: React.ReactNode }> = ({ label, value, max = 99, color = COLORS.text, right }) => (
  <View className="flex-row items-center" style={{ gap: 10 }}>
    <Text style={{ width: 104, fontFamily: FONT.cond700, fontSize: 13, letterSpacing: 0.6, color: COLORS.textSoft, textTransform: 'uppercase' }} numberOfLines={1}>{label}</Text>
    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: COLORS.sunken, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, (value - 40) / (max - 40))) * 100}%`, height: '100%', backgroundColor: color }} />
    </View>
    <Text style={{ width: 26, textAlign: 'right', fontFamily: FONT.cond800, fontSize: 15, color: COLORS.text }}>{Math.round(value)}</Text>
    {right}
  </View>
);

/** The career's bottom tabs. */
export const Tabs = <T extends string>({ tabs, active, onChange, accent }: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  accent: string;
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-row" style={{ backgroundColor: COLORS.navBg, borderTopWidth: 1, borderTopColor: COLORS.navLine, paddingTop: 8, paddingBottom: 8 + Math.max(0, insets.bottom - 8) }}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Pressable key={t.id} accessibilityRole="tab" accessibilityLabel={t.label} aria-selected={on} onPress={() => onChange(t.id)} className="flex-1 items-center active:opacity-70" style={{ gap: 7, paddingVertical: 4 }}>
            <View style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: on ? accent : 'transparent' }} />
            <Text style={{ fontFamily: FONT.cond700, fontSize: 13, letterSpacing: 1, color: on ? COLORS.text : COLORS.dim, textTransform: 'uppercase' }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

/** A light, full-width button. */
export const Cta: React.FC<{ label: string; sub?: string; onPress: () => void; disabled?: boolean; tint?: string }> = ({ label, sub, onPress, disabled, tint }) => {
  const fill = tint ?? COLORS.ctaFill;
  const ink = tint ? onAccent(tint) : COLORS.ctaInk;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={disabled ? undefined : onPress} className="active:opacity-80"
      style={{ minHeight: 54, borderRadius: 14, backgroundColor: fill, opacity: disabled ? 0.4 : 1, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontFamily: FONT.cond800, fontSize: 20, letterSpacing: 0.6, color: ink, textTransform: 'uppercase' }}>{label}</Text>
      {sub ? <Text style={{ fontFamily: FONT.cond700, fontSize: 13, letterSpacing: 0.8, color: withAlpha(ink, 0.65), textTransform: 'uppercase' }}>{sub}</Text> : null}
    </Pressable>
  );
};

/** An outlined secondary button. */
export const Ghost: React.FC<{ label: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> }> = ({ label, onPress, disabled, style }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={disabled ? undefined : onPress} className="active:opacity-70"
    style={[{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: COLORS.lineStrong, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1, paddingHorizontal: 12 }, style]}>
    <Text style={{ fontFamily: FONT.cond800, fontSize: 15, letterSpacing: 0.8, color: COLORS.text, textTransform: 'uppercase' }}>{label}</Text>
  </Pressable>
);

/** Feet-inches for a height in cm (the NBA's own unit), with the cm. */
export const heightLabel = (cm: number) => {
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}'${inches % 12}" · ${cm} cm`;
};
