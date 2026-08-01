import React from 'react';
import { View, Text, Pressable, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { COLORS, INK, RADIUS, tracking, withAlpha } from '../../src/theme/tokens';

// The "Console MyGM" primitives. Everything the redesign repeats — the panel,
// the mono label, the meter, the one red CTA — lives here so the 15 screens
// stay literally the same system instead of 15 near-misses.
//
// Colors are passed as concrete strings, never as `bg-accent/40` classes: the
// accent is a runtime CSS variable and NativeWind's opacity shorthand does not
// resolve against one (it renders transparent on device).

/* -------------------------------------------------------------------------- */
/* Type                                                                        */
/* -------------------------------------------------------------------------- */

/** JetBrains Mono micro-label — the workhorse label of the whole design. */
export const MonoLabel: React.FC<{
  children: React.ReactNode;
  color?: string;
  size?: number;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}> = ({ children, color = INK.label, size = 8.5, style, numberOfLines }) => (
  <Text
    className="font-mono-bold"
    numberOfLines={numberOfLines}
    style={[{ fontSize: size, letterSpacing: tracking(size, 0.16), color, textTransform: 'uppercase' }, style]}
  >
    {children}
  </Text>
);

/** The wider-tracked label that rides on the hero band. */
export const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; size?: number }> = ({
  children,
  color = INK.labelOnHero,
  size = 9.5,
}) => (
  <Text
    className="font-mono-bold"
    style={{ fontSize: size, letterSpacing: tracking(size, 0.2), color, textTransform: 'uppercase' }}
  >
    {children}
  </Text>
);

/** Inter 900 italic display face. Hero titles and CTA labels only. */
export const HeroTitle: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
}> = ({ children, size = 30, color = COLORS.text, style, numberOfLines, adjustsFontSizeToFit }) => (
  <Text
    className="font-display"
    numberOfLines={numberOfLines}
    adjustsFontSizeToFit={adjustsFontSizeToFit}
    minimumFontScale={0.6}
    style={[
      { fontSize: size, lineHeight: size * 1.02, letterSpacing: -size * 0.035, color, textTransform: 'uppercase' },
      style,
    ]}
  >
    {children}
  </Text>
);

/** Mono number, the design's rule for every figure on screen. */
export const Stat: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  fit?: boolean;
}> = ({ children, size = 20, color = COLORS.text, style, numberOfLines = 1, fit }) => (
  <Text
    className="font-mono-bold"
    numberOfLines={numberOfLines}
    adjustsFontSizeToFit={fit}
    minimumFontScale={0.6}
    style={[{ fontSize: size, lineHeight: size * 1.06, color }, style]}
  >
    {children}
  </Text>
);

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

interface PanelProps {
  children: React.ReactNode;
  /** 3px left edge bar, in the color of whatever the panel is about. */
  bar?: string;
  /** 2px ring — marks "this is the one that matters" (your team, your pick). */
  highlight?: string;
  padding?: number;
  radius?: number;
  fill?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export const Panel: React.FC<PanelProps> = ({
  children,
  bar,
  highlight,
  padding = 13,
  radius = RADIUS.card,
  fill = COLORS.panel,
  className = '',
  style,
}) => (
  <View
    className={className}
    style={[
      {
        backgroundColor: fill,
        borderRadius: radius,
        borderWidth: highlight ? 2 : 1,
        borderColor: highlight ?? COLORS.line,
        padding,
        overflow: 'hidden',
      },
      style,
    ]}
  >
    {bar ? (
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: bar }} />
    ) : null}
    {children}
  </View>
);

/** An inset well inside a panel — rows, quotes, mini-tiles. */
export const Well: React.FC<{
  children: React.ReactNode;
  padding?: number;
  radius?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
}> = ({ children, padding = 10, radius = RADIUS.control, className = '', style }) => (
  <View className={className} style={[{ backgroundColor: COLORS.sunken, borderRadius: radius, padding }, style]}>
    {children}
  </View>
);

/** label-over-number tile. Three of these in a row is the design's stat strip. */
export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  color?: string;
  bar?: string;
  children?: React.ReactNode;
}> = ({ label, value, sub, color = COLORS.text, bar, children }) => (
  <Panel bar={bar} padding={13} className="flex-1">
    <MonoLabel size={8}>{label}</MonoLabel>
    <Stat size={21} color={color} style={{ marginTop: 4 }} fit>
      {value}
    </Stat>
    {sub ? (
      <MonoLabel size={9} color={INK.meta} style={{ marginTop: 4, letterSpacing: 0 }}>
        {sub}
      </MonoLabel>
    ) : null}
    {children}
  </Panel>
);

/* -------------------------------------------------------------------------- */
/* Indicators                                                                  */
/* -------------------------------------------------------------------------- */

export type ChipTone = 'good' | 'warn' | 'bad' | 'info' | 'neutral' | 'solid';

const CHIP: Record<ChipTone, { bg: string; border: string; fg: string }> = {
  good: { bg: withAlpha(COLORS.goodSoft, 0.12), border: withAlpha(COLORS.goodSoft, 0.3), fg: COLORS.goodSoft },
  warn: { bg: withAlpha(COLORS.warn, 0.12), border: withAlpha(COLORS.warn, 0.32), fg: COLORS.warn },
  bad: { bg: withAlpha(COLORS.cta, 0.12), border: withAlpha(COLORS.cta, 0.32), fg: COLORS.badSoft },
  info: { bg: withAlpha(COLORS.info, 0.12), border: withAlpha(COLORS.info, 0.3), fg: COLORS.info },
  neutral: { bg: COLORS.panel, border: COLORS.line, fg: COLORS.textDim },
  solid: { bg: '#ffffff', border: '#ffffff', fg: COLORS.bg },
};

export const Chip: React.FC<{
  children: React.ReactNode;
  tone?: ChipTone;
  onPress?: () => void;
  size?: number;
  mono?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ children, tone = 'neutral', onPress, size = 10, mono = false, style }) => {
  const c = CHIP[tone];
  const inner = (
    <Text
      className={mono ? 'font-mono-bold' : 'font-bold'}
      style={{
        fontSize: size,
        color: c.fg,
        letterSpacing: mono ? tracking(size, 0.08) : 0,
        textTransform: mono ? 'uppercase' : 'none',
      }}
    >
      {children}
    </Text>
  );
  const box: ViewStyle = {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
  };
  return onPress ? (
    <Pressable onPress={onPress} style={[box, style]} className="active:opacity-70">
      {inner}
    </Pressable>
  ) : (
    <View style={[box, style]}>{inner}</View>
  );
};

/** Horizontal filter chips (TODAS / LESTE / OESTE …). */
export const FilterRow: React.FC<{
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}> = ({ items, value, onChange, style }) => (
  <View className="flex-row flex-wrap" style={[{ gap: 6 }, style]}>
    {items.map((it) => {
      const active = it.id === value;
      return (
        <Pressable
          key={it.id}
          onPress={() => onChange(it.id)}
          className="active:opacity-70"
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: RADIUS.control,
            backgroundColor: active ? '#ffffff' : COLORS.panel,
            borderWidth: 1,
            borderColor: active ? '#ffffff' : COLORS.line,
          }}
        >
          <Text
            className={active ? 'font-black' : 'font-bold'}
            style={{ fontSize: 10.5, color: active ? COLORS.bg : COLORS.textDim, textTransform: 'uppercase' }}
          >
            {it.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

/** Progress / share meter. `value` is 0..1. */
export const Meter: React.FC<{
  value: number;
  color?: string;
  colors?: [string, string];
  height?: number;
  track?: string;
  style?: StyleProp<ViewStyle>;
}> = ({ value, color = COLORS.good, colors, height = 6, track = COLORS.line, style }) => {
  const pct = `${Math.max(0, Math.min(1, value || 0)) * 100}%` as const;
  return (
    <View style={[{ height, borderRadius: RADIUS.pill, backgroundColor: track, overflow: 'hidden' }, style]}>
      {colors ? (
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: pct, height: '100%', borderRadius: RADIUS.pill }}
        />
      ) : (
        <View style={{ width: pct, height: '100%', backgroundColor: color, borderRadius: RADIUS.pill }} />
      )}
    </View>
  );
};

/** Circular initials, the stand-in wherever a headshot doesn't belong. */
export const Initials: React.FC<{
  name: string;
  size?: number;
  gradient?: [string, string];
  color?: string;
}> = ({ name, size = 34, gradient, color = COLORS.info }) => {
  const letters = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const label = (
    <Text className="font-black" style={{ fontSize: size * 0.32, color: gradient ? '#fff' : color }}>
      {letters}
    </Text>
  );
  const box: ViewStyle = { width: size, height: size, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' };
  return gradient ? (
    <LinearGradient colors={gradient} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={box}>
      {label}
    </LinearGradient>
  ) : (
    <View style={[box, { backgroundColor: COLORS.line }]}>{label}</View>
  );
};

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The one red action per screen. `sub` turns it into the wide row-with-chevron
 * form the mockups use for "AVANÇAR TEMPORADA" / "JOGAR O JOGO 7".
 */
export const CtaButton: React.FC<{
  label: string;
  sub?: string;
  onPress: () => void;
  disabled?: boolean;
  /** Gold, for the champion screen — the one screen allowed to break the red rule. */
  gold?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
}> = ({ label, sub, onPress, disabled, gold, size = sub ? 15 : 15, style }) => {
  const tint: [string, string] = gold ? [COLORS.gold, COLORS.goldDeep] : [COLORS.cta, COLORS.ctaDark];
  const fg = gold ? '#1a1305' : '#fff';

  if (disabled) {
    return (
      <View
        style={[
          {
            borderRadius: 18,
            paddingVertical: sub ? 14 : 16,
            paddingHorizontal: 16,
            backgroundColor: COLORS.panel,
            borderWidth: 1,
            borderColor: COLORS.line,
            alignItems: 'center',
          },
          style,
        ]}
      >
        <Text className="font-black" style={{ fontSize: 13, color: '#525252', textTransform: 'uppercase' }}>
          {label}
        </Text>
      </View>
    );
  }

  return (
    <Pressable onPress={onPress} className="active:opacity-85" style={style}>
      <LinearGradient
        colors={tint}
        start={{ x: 0, y: 0.2 }}
        end={{ x: 1, y: 0.8 }}
        style={{
          borderRadius: 18,
          paddingVertical: sub ? 14 : 16,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          justifyContent: sub ? 'flex-start' : 'center',
        }}
      >
        {/* flex:1 in BOTH variants, not just the row-with-chevron one. Without
            a bounded width the label has nothing to shrink against, so
            adjustsFontSizeToFit no-ops and a long CTA ("Assumir o Thunder")
            gets clipped mid-word instead of scaling down — seen on device. */}
        <View style={{ flex: 1 }}>
          <HeroTitle
            size={size}
            color={fg}
            style={{ letterSpacing: 0.2, textAlign: sub ? 'left' : 'center' }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {label}
          </HeroTitle>
          {sub ? (
            <MonoLabel size={9.5} color={gold ? 'rgba(26,19,5,0.75)' : 'rgba(255,255,255,0.75)'} style={{ marginTop: 2, letterSpacing: 0 }}>
              {sub}
            </MonoLabel>
          ) : null}
        </View>
        {sub ? (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: RADIUS.pill,
              backgroundColor: 'rgba(0,0,0,0.25)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text className="font-black" style={{ fontSize: 15, color: fg, lineHeight: 18 }}>
              ›
            </Text>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
};

/** Secondary action — never competes with the red. */
export const GhostButton: React.FC<{
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  color?: string;
  size?: number;
  padding?: number;
  style?: StyleProp<ViewStyle>;
}> = ({ label, onPress, disabled, color = COLORS.textDim, size = 11.5, padding = 13, style }) => (
  <Pressable
    onPress={disabled ? undefined : onPress}
    className="active:opacity-70"
    style={[
      {
        borderRadius: 16,
        paddingVertical: padding,
        paddingHorizontal: 12,
        backgroundColor: COLORS.ghost,
        borderWidth: 1,
        borderColor: COLORS.line,
        alignItems: 'center',
        opacity: disabled ? 0.4 : 1,
      },
      style,
    ]}
  >
    <Text className="font-black" style={{ fontSize: size, color, textTransform: 'uppercase' }} numberOfLines={1}>
      {label}
    </Text>
  </Pressable>
);

/** Section heading between card groups. */
export const SectionLabel: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <MonoLabel color={color ?? INK.label} style={{ paddingLeft: 3 }}>
    {children}
  </MonoLabel>
);
