import React from 'react';
import { View, Text, Pressable, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, INK, RADIUS, FONT, tracking, withAlpha, onAccent } from '../../src/theme/tokens';
import { Image } from 'expo-image';
import type { Player } from '../../types';
import { getTeamAccent, teamsData, getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG } from '../../constants';

// The "Transmissão" primitives (design_handoff_redesign_transmissao). Everything
// the redesign repeats — the card, the condensed label, the meter, the one light
// CTA, the tricode badge — lives here so the screens stay literally the same
// system instead of 25 near-misses.
//
// Colors are passed as concrete strings, never as `bg-accent/40` classes: the
// accent is a runtime CSS variable and NativeWind's opacity shorthand does not
// resolve against one (it renders transparent on device).

/* -------------------------------------------------------------------------- */
/* Type                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The smallest a label may render. Barlow Condensed is narrow, so the floor is
 * higher than the old mono's: below ~10px it stops being readable on a phone.
 */
export const MIN_LABEL_SIZE = 10;

/**
 * Old call sites were sized for JetBrains Mono, a wide face. Barlow Condensed
 * at the same size reads ~20% smaller, so labels scale up once, here.
 */
const LABEL_SCALE = 1.2;

/** Condensed 700 label with wide tracking — the workhorse label of the design. */
export const MonoLabel: React.FC<{
  children: React.ReactNode;
  color?: string;
  size?: number;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}> = ({ children, color = INK.label, size: asked = 9, style, numberOfLines }) => {
  const size = Math.max(MIN_LABEL_SIZE, Math.round(asked * LABEL_SCALE * 2) / 2);
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ fontFamily: FONT.cond700, fontSize: size, letterSpacing: tracking(size, 0.12), color, textTransform: 'uppercase' }, style]}
    >
      {children}
    </Text>
  );
};

/** The label above a screen title ("PASSO 2 DE 2", "TEMPORADA 3 · 2025-26"). */
export const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; size?: number }> = ({
  children,
  color = COLORS.muted,
  size = 11,
}) => (
  <Text style={{ fontFamily: FONT.cond700, fontSize: Math.max(MIN_LABEL_SIZE, size), letterSpacing: tracking(size, 0.14), color, textTransform: 'uppercase' }}>
    {children}
  </Text>
);

/** Condensed 800 display face: titles, team names, CTA labels. */
export const HeroTitle: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
}> = ({ children, size = 34, color = COLORS.text, style, numberOfLines, adjustsFontSizeToFit }) => (
  <Text
    numberOfLines={numberOfLines}
    adjustsFontSizeToFit={adjustsFontSizeToFit}
    minimumFontScale={0.55}
    style={[
      { fontFamily: FONT.cond800, fontSize: size, lineHeight: size * 0.98, letterSpacing: 0, color, textTransform: 'uppercase' },
      style,
    ]}
  >
    {children}
  </Text>
);

/** A number: condensed 800, tabular. */
export const Stat: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  fit?: boolean;
}> = ({ children, size = 22, color = COLORS.text, style, numberOfLines = 1, fit }) => (
  <Text
    numberOfLines={numberOfLines}
    adjustsFontSizeToFit={fit}
    minimumFontScale={0.6}
    style={[{ fontFamily: FONT.cond800, fontSize: size * 1.1, lineHeight: size * 1.12, color, fontVariant: ['tabular-nums'] }, style]}
  >
    {children}
  </Text>
);

/** Body copy: Barlow 500, muted. */
export const BodyText: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}> = ({ children, size = 13.5, color = COLORS.muted, style, numberOfLines }) => (
  <Text numberOfLines={numberOfLines} style={[{ fontFamily: FONT.body500, fontSize: size, lineHeight: size * 1.45, color }, style]}>
    {children}
  </Text>
);

/** A name in a list: condensed 600. */
export const Name: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}> = ({ children, size = 15, color = COLORS.text, style, numberOfLines = 1 }) => (
  <Text numberOfLines={numberOfLines} style={[{ fontFamily: FONT.cond600, fontSize: size, lineHeight: size * 1.15, color }, style]}>
    {children}
  </Text>
);

/** Screen title block: optional label + 34px condensed title. */
export const ScreenTitle: React.FC<{ label?: string; title: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({
  label, title, right, style,
}) => (
  <View style={[{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 }, style]}>
    <View className="flex-row items-end justify-between" style={{ gap: 10 }}>
      <View className="flex-1">
        {label ? <Eyebrow>{label}</Eyebrow> : null}
        <HeroTitle size={34} style={{ marginTop: label ? 4 : 0 }} numberOfLines={2} adjustsFontSizeToFit>
          {title}
        </HeroTitle>
      </View>
      {right}
    </View>
  </View>
);

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

interface PanelProps {
  children: React.ReactNode;
  /** 3px inset on the left edge, in the color of whatever the card is about. */
  bar?: string;
  /** 1px outline — marks "this is the one that matters" (your team, your pick). */
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
  padding = 14,
  radius = RADIUS.card,
  fill = COLORS.surface,
  className = '',
  style,
}) => (
  <View
    className={className}
    style={[
      {
        backgroundColor: fill,
        borderRadius: radius,
        borderWidth: highlight ? 1 : 0,
        borderColor: highlight,
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
/** Alias: the handoff calls it Card. */
export const Card = Panel;

/** An inset well inside a card — rows, quotes, mini-tiles. */
export const Well: React.FC<{
  children: React.ReactNode;
  padding?: number;
  radius?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
}> = ({ children, padding = 10, radius = RADIUS.control, className = '', style }) => (
  <View className={className} style={[{ backgroundColor: COLORS.surface2, borderRadius: radius, padding }, style]}>
    {children}
  </View>
);

/** label-over-number tile. */
export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  color?: string;
  bar?: string;
  children?: React.ReactNode;
}> = ({ label, value, sub, color = COLORS.text, bar, children }) => (
  <Panel bar={bar} padding={13} radius={RADIUS.tile} className="flex-1">
    <MonoLabel size={9}>{label}</MonoLabel>
    <Stat size={22} color={color} style={{ marginTop: 3 }} fit>
      {value}
    </Stat>
    {sub ? (
      <BodyText size={11.5} color={COLORS.dim} style={{ marginTop: 2 }} numberOfLines={2}>
        {sub}
      </BodyText>
    ) : null}
    {children}
  </Panel>
);

/**
 * A row of numbers separated by vertical hairlines — GERAL / ATAQUE / DEFESA.
 * `onColor` for a strip sitting on a franchise-color block.
 */
export const StatStrip: React.FC<{
  items: { label: string; value: React.ReactNode; color?: string }[];
  size?: number;
  onColor?: string;
  style?: StyleProp<ViewStyle>;
}> = ({ items, size = 26, onColor, style }) => {
  const ink = onColor ? onAccent(onColor) : COLORS.text;
  const divider = onColor ? withAlpha(ink === '#ffffff' ? '#ffffff' : '#000000', 0.18) : COLORS.line;
  return (
    <View className="flex-row" style={style}>
      {items.map((it, i) => (
        <View
          key={it.label}
          className="flex-1"
          style={{ paddingHorizontal: 10, paddingVertical: 4, borderLeftWidth: i ? 1 : 0, borderLeftColor: divider }}
        >
          <Stat size={size} color={it.color ?? ink} fit>{it.value}</Stat>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.2, color: onColor ? withAlpha(ink === '#ffffff' ? '#ffffff' : '#000000', 0.7) : COLORS.muted, textTransform: 'uppercase', marginTop: 1 }}>
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The team's tricode on a flat block of its primary color. Replaces logos in
 * dense lists. Sizes: 30x20 list, 32x22 picker, 44x44 game, 62x62 hero.
 */
export const TeamBadge: React.FC<{
  teamId: string;
  width?: number;
  height?: number;
  /** Override the fill (neutral badge on Home). */
  fill?: string;
  style?: StyleProp<ViewStyle>;
}> = ({ teamId, width = 30, height = 20, fill, style }) => {
  const bg = fill ?? getTeamAccent(teamId).primary;
  const big = height >= 40;
  const fontSize = big ? Math.round(height * 0.34) : Math.max(10, Math.round(height * 0.52));
  return (
    <View
      style={[{
        width, height, borderRadius: big ? Math.round(height * 0.22) : 4,
        backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
      }, style]}
    >
      <Text style={{ fontFamily: FONT.cond800, fontSize, color: onAccent(bg), letterSpacing: 0.4 }} numberOfLines={1}>
        {teamId.toUpperCase()}
      </Text>
    </View>
  );
};

/** The franchise crest (NBA CDN SVG), by team id. Logos never change during a
 *  save, so it is looked up in the opening data rather than threaded through. */
// The NBA CDN's "D" variant is drawn for dark backgrounds; the "L" one in the
// data carries a light backing disc on several crests and leaves the Jazz
// mark near-black, both wrong on this UI.
const LOGO_BY_ID = new Map(teamsData.map((t) => [t.id, t.logoUrl?.replace('/global/L/', '/global/D/')]));
export const TeamLogo: React.FC<{ teamId: string; size?: number; style?: StyleProp<any> }> = ({ teamId, size = 22, style }) => {
  const uri = LOGO_BY_ID.get(teamId);
  if (!uri) return <View style={[{ width: size, height: size }, style]} />;
  return (
    <Image
      source={{ uri }}
      style={[{ width: size, height: size }, style]}
      contentFit="contain"
    />
  );
};

/** A player's headshot on a square tinted with his team's color (neutral for a
 *  free agent): the face is what makes a list of names read as people. */
export const PlayerFace: React.FC<{ player: Player; teamId?: string; size?: number; style?: StyleProp<ViewStyle> }> = ({ player, teamId, size = 36, style }) => {
  const bg = teamId ? withAlpha(getTeamAccent(teamId).primary, 0.45) : COLORS.surface2;
  return (
    <View style={[{ width: size, height: size, borderRadius: Math.round(size * 0.28), overflow: 'hidden', backgroundColor: bg }, style]}>
      <Image
        source={{ uri: getPlayerImageUrl(player) }}
        placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
        style={{ width: size, height: size }}
        contentFit="cover"
        contentPosition="top"
      />
    </View>
  );
};

/** Outline tag: RIVAL, VOCÊ, PLAYOFFS... never wraps. */
export const Tag: React.FC<{
  children: React.ReactNode;
  color?: string;
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ children, color = COLORS.muted, filled, style }) => (
  <View
    style={[{
      flexShrink: 0, paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: RADIUS.tag,
      borderWidth: 1, borderColor: filled ? color : withAlpha(color, 0.55),
      backgroundColor: filled ? color : 'transparent', alignSelf: 'flex-start',
    }, style]}
  >
    <Text numberOfLines={1} style={{ fontFamily: FONT.cond700, fontSize: 11.5, letterSpacing: 1.1, color: filled ? onAccent(color) : color, textTransform: 'uppercase' }}>
      {children}
    </Text>
  </View>
);

/* -------------------------------------------------------------------------- */
/* Indicators                                                                  */
/* -------------------------------------------------------------------------- */

export type ChipTone = 'good' | 'warn' | 'bad' | 'info' | 'neutral' | 'solid';

const CHIP: Record<ChipTone, { bg: string; border: string; fg: string }> = {
  good: { bg: 'transparent', border: withAlpha(COLORS.good, 0.55), fg: COLORS.good },
  warn: { bg: 'transparent', border: withAlpha(COLORS.warn, 0.55), fg: COLORS.warn },
  bad: { bg: 'transparent', border: withAlpha(COLORS.bad, 0.55), fg: COLORS.bad },
  info: { bg: 'transparent', border: withAlpha(COLORS.east, 0.55), fg: COLORS.east },
  neutral: { bg: COLORS.surface2, border: COLORS.surface2, fg: COLORS.muted },
  solid: { bg: COLORS.ctaFill, border: COLORS.ctaFill, fg: COLORS.ctaInk },
};

export const Chip: React.FC<{
  children: React.ReactNode;
  tone?: ChipTone;
  onPress?: () => void;
  size?: number;
  mono?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ children, tone = 'neutral', onPress, size = 10, style }) => {
  const c = CHIP[tone];
  const fs = Math.max(11, size * 1.15);
  const inner = (
    <Text numberOfLines={1} style={{ fontFamily: FONT.cond700, fontSize: fs, color: c.fg, letterSpacing: 0.8, textTransform: 'uppercase' }}>
      {children}
    </Text>
  );
  const box: ViewStyle = {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.tag + 2,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
  };
  return onPress ? (
    <Pressable onPress={onPress} style={[box, style]} className="active:opacity-75" accessibilityRole="button">
      {inner}
    </Pressable>
  ) : (
    <View style={[box, style]}>{inner}</View>
  );
};

/** Filter chips (TODAS / PG / SG …): active is light, inactive surface2. */
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
          accessibilityRole="tab"
          accessibilityLabel={it.label}
          aria-selected={active}
          hitSlop={{ top: 6, bottom: 6 }}
          className="active:opacity-75"
          style={{
            minHeight: 34,
            paddingHorizontal: 13,
            justifyContent: 'center',
            borderRadius: RADIUS.chip,
            backgroundColor: active ? COLORS.ctaFill : COLORS.surface2,
          }}
        >
          <Text style={{ fontFamily: FONT.cond700, fontSize: 13, letterSpacing: 1, color: active ? COLORS.ctaInk : COLORS.muted, textTransform: 'uppercase' }}>
            {it.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

/** Progress / share meter. `value` is 0..1. Solid fill, never a gradient. */
export const Meter: React.FC<{
  value: number;
  color?: string;
  /** Kept for old call sites: the first color is used, flat. */
  colors?: [string, string];
  height?: number;
  track?: string;
  style?: StyleProp<ViewStyle>;
}> = ({ value, color = COLORS.good, colors, height = 4, track = COLORS.lineStrong, style }) => {
  const pct = `${Math.max(0, Math.min(1, value || 0)) * 100}%` as const;
  return (
    <View style={[{ height, borderRadius: 2, backgroundColor: track, overflow: 'hidden' }, style]}>
      <View style={{ width: pct, height: '100%', backgroundColor: colors ? colors[0] : color, borderRadius: 2 }} />
    </View>
  );
};

/** Square initials, the stand-in wherever a headshot doesn't belong. */
export const Initials: React.FC<{
  name: string;
  size?: number;
  gradient?: [string, string];
  color?: string;
}> = ({ name, size = 34, gradient, color = COLORS.textSoft }) => {
  const letters = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const bg = gradient ? gradient[0] : COLORS.surface2;
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
      <Text style={{ fontFamily: FONT.cond800, fontSize: size * 0.38, color: gradient ? onAccent(bg) : color }}>{letters}</Text>
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The one main action per screen — LIGHT. `sub` turns it into the row form:
 * label on the left, meta + chevron on the right ("SIMULAR TEMPORADA · 29
 * JOGOS ›").
 */
export const CtaButton: React.FC<{
  label: string;
  sub?: string;
  onPress: () => void;
  disabled?: boolean;
  /** Gold, for the champion screen. */
  gold?: boolean;
  /** Team-color variant (allowed by the handoff as the alternative CTA). */
  tint?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}> = ({ label, sub, onPress, disabled, gold, tint, size = 19, style }) => {
  const fill = gold ? COLORS.gold : tint ?? COLORS.ctaFill;
  const ink = gold ? COLORS.goldInk : tint ? onAccent(tint) : COLORS.ctaInk;

  // Disabled keeps its `sub`. That line is where every screen explains WHY the
  // action is closed ("Faltam 2 para o mínimo", "Dispense 3 em Meu Time") --
  // dropping it left a grey button and no reason.
  if (disabled) {
    return (
      <View
        accessibilityRole="button"
        aria-disabled
        accessibilityLabel={sub ? `${label}. ${sub}` : label}
        style={[
          {
            minHeight: 54, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16,
            backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center',
          },
          style,
        ]}
      >
        <Text style={{ fontFamily: FONT.cond800, fontSize: size * 0.85, letterSpacing: 1, color: COLORS.dim, textTransform: 'uppercase' }}>
          {label}
        </Text>
        {sub ? (
          <Text style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.warn, marginTop: 2, textAlign: 'center' }}>{sub}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-75"
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      style={[
        {
          minHeight: 54, borderRadius: 14, paddingHorizontal: 18, backgroundColor: fill,
          flexDirection: 'row', alignItems: 'center', justifyContent: sub ? 'space-between' : 'center', gap: 10,
        },
        style,
      ]}
    >
      {/* The label is the action and keeps its width; the sub is context and truncates first. */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{ flexShrink: 0, maxWidth: sub ? '72%' : '100%', fontFamily: FONT.cond800, fontSize: size, letterSpacing: tracking(size, 0.06), color: ink, textTransform: 'uppercase' }}
      >
        {label}
      </Text>
      {sub ? (
        <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: FONT.cond700, fontSize: 13.5, letterSpacing: 0.8, color: withAlpha(ink === '#ffffff' ? '#ffffff' : ink, 0.6), textTransform: 'uppercase' }}>
          {sub} ›
        </Text>
      ) : null}
    </Pressable>
  );
};

/** Outline secondary action — never competes with the light CTA. */
export const GhostButton: React.FC<{
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  color?: string;
  size?: number;
  padding?: number;
  /** surface2 fill instead of an outline (the dock's secondary buttons). */
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ label, onPress, disabled, color = COLORS.text, size = 14.5, padding = 12, filled, style }) => (
  <Pressable
    onPress={disabled ? undefined : onPress}
    className="active:opacity-75"
    accessibilityRole="button"
    accessibilityLabel={label}
    aria-disabled={!!disabled}
    style={[
      {
        minHeight: 46,
        borderRadius: 12,
        paddingVertical: padding,
        paddingHorizontal: 12,
        backgroundColor: filled ? COLORS.surface2 : 'transparent',
        borderWidth: filled ? 0 : 1,
        borderColor: COLORS.ghostBorder,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      },
      style,
    ]}
  >
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: FONT.cond700, fontSize: Math.max(13, size * 1.15), letterSpacing: 1.1, color, textTransform: 'uppercase' }}>
      {label}
    </Text>
  </Pressable>
);

/** Section heading between card groups. */
export const SectionLabel: React.FC<{ children: React.ReactNode; color?: string; right?: React.ReactNode }> = ({ children, color, right }) => (
  <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 2, marginTop: 4 }}>
    <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: color ?? COLORS.muted, textTransform: 'uppercase' }}>
      {children}
    </Text>
    {right}
  </View>
);

/**
 * The fixed action bar above the bottom nav: bg #111114, top hairline,
 * padding 12/14. Pass it as a Screen `footer`.
 */
export const Dock: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ children, style }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ backgroundColor: COLORS.dockBg, borderTopWidth: 1, borderTopColor: COLORS.line, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 + Math.max(0, insets.bottom * 0), gap: 8 }, style]}>
      {children}
    </View>
  );
};
