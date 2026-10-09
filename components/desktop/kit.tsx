import React, { useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Platform, StyleProp, ViewStyle, TextStyle } from 'react-native';

import { COLORS, FONT, tracking } from '../../src/theme/tokens';
import { CtaButton, GhostButton } from '../ui/kit';

// The PC chrome (design_handoff_nba_manager_pc), on top of the same
// "Transmissão" primitives the phone uses. Only the layout differs: a fixed
// sidebar instead of the bottom nav, 28/32 page padding, a 44px title, a dock
// whose actions sit on the right, and centered modals instead of bottom sheets.

export const PAGE_X = 32;
export const PAGE_Y = 28;

/** Pressable with the PC hover state (`#141417` / `#1B1B1F` fill, or any style). */
export const Hover: React.FC<{
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hoverStyle?: ViewStyle;
  children: React.ReactNode;
  accessibilityLabel?: string;
  selected?: boolean;
}> = ({ onPress, disabled, style, hoverStyle = { backgroundColor: COLORS.surface2 }, children, accessibilityLabel, selected }) => (
  <Pressable
    onPress={disabled ? undefined : onPress}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    aria-disabled={!!disabled}
    aria-selected={selected}
    // react-native-web hands `hovered` to the style callback; RN's types don't know it.
    style={(state) => {
      const hovered = (state as unknown as { hovered?: boolean }).hovered;
      return [
        Platform.OS === 'web' && onPress && !disabled ? ({ cursor: 'pointer' } as ViewStyle) : null,
        style,
        hovered && onPress && !disabled ? hoverStyle : null,
      ];
    }}
  >
    {children}
  </Pressable>
);

/** Condensed 700 label at true px (the phone's MonoLabel scales its size up). */
export const DLabel: React.FC<{ children: React.ReactNode; color?: string; size?: number; style?: StyleProp<TextStyle>; numberOfLines?: number }> = ({
  children, color = COLORS.muted, size = 11, style, numberOfLines,
}) => (
  <Text numberOfLines={numberOfLines} style={[{ fontFamily: FONT.cond700, fontSize: size, letterSpacing: tracking(size, 0.12), color, textTransform: 'uppercase' }, style]}>
    {children}
  </Text>
);

/** Page title block: eyebrow + 44px condensed title, with an optional right slot. */
export const DTitle: React.FC<{
  eyebrow?: React.ReactNode;
  title: string;
  right?: React.ReactNode;
  size?: number;
  onBack?: () => void;
  style?: StyleProp<ViewStyle>;
}> = ({ eyebrow, title, right, size = 44, onBack, style }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }, style]}>
    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
      {onBack ? <BackLink onPress={onBack} /> : null}
      {eyebrow ? <DLabel size={12} style={{ letterSpacing: tracking(12, 0.14), marginTop: onBack ? 10 : 0 }}>{eyebrow}</DLabel> : null}
      <Text numberOfLines={1} style={{ fontFamily: FONT.cond800, fontSize: size, lineHeight: size * 0.98, color: COLORS.text, textTransform: 'uppercase' }}>
        {title}
      </Text>
    </View>
    {right}
  </View>
);

export const BackLink: React.FC<{ onPress: () => void; color?: string; label?: string }> = ({ onPress, color = COLORS.text, label = 'Voltar' }) => (
  <Hover onPress={onPress} hoverStyle={{ opacity: 0.7 }} style={{ alignSelf: 'flex-start' }}>
    <Text style={{ fontFamily: FONT.cond700, fontSize: 14, letterSpacing: 1.4, color, textTransform: 'uppercase' }}>‹ {label}</Text>
  </Hover>
);

/**
 * A page: scrolling body with the 28/32 padding, plus an optional dock. The
 * dock is the PC translation of the phone's footer — actions on the right.
 */
export const DPage: React.FC<{
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** false: the body does not scroll (screens that manage their own columns). */
  scroll?: boolean;
  padding?: number;
  background?: string;
  contentStyle?: StyleProp<ViewStyle>;
}> = ({ children, footer, scroll = true, padding, background = COLORS.bg, contentStyle }) => {
  const pad = padding !== undefined ? { padding } : { paddingHorizontal: PAGE_X, paddingVertical: PAGE_Y };
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: background }}>
      {scroll ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[pad, contentStyle]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, minHeight: 0 }, pad, contentStyle]}>{children}</View>
      )}
      {footer}
    </View>
  );
};

/** The PC dock: `#111114`, top hairline, 14/32 padding, context left, actions right. */
export const DDock: React.FC<{ note?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ note, children, style }) => (
  <View
    style={[{
      backgroundColor: COLORS.dockBg, borderTopWidth: 1, borderTopColor: COLORS.line,
      paddingVertical: 14, paddingHorizontal: PAGE_X, flexDirection: 'row', alignItems: 'center', gap: 10,
    }, style]}
  >
    <View style={{ flex: 1, minWidth: 0 }}>
      {typeof note === 'string' ? (
        <Text numberOfLines={2} style={{ fontFamily: FONT.body500, fontSize: 13, color: COLORS.dim }}>{note}</Text>
      ) : note}
    </View>
    {children}
  </View>
);

/** The dock's one light action: 380×54. */
export const DCta: React.FC<React.ComponentProps<typeof CtaButton>> = ({ style, size = 20, ...rest }) => (
  <CtaButton {...rest} size={size} style={[{ width: 380 }, style]} />
);

/** The dock's secondary actions: surface2 fill, 120 wide. */
export const DStep: React.FC<{ label: string; onPress: () => void; disabled?: boolean; width?: number }> = ({ label, onPress, disabled, width = 120 }) => (
  <GhostButton filled label={label} onPress={onPress} disabled={disabled} style={{ width }} />
);

/** Top tab bar (Meu Time): 48 tall, 3px light underline on the active tab. */
export const DTabs: React.FC<{ items: { id: string; label: string }[]; value: string; onChange: (id: string) => void; style?: StyleProp<ViewStyle> }> = ({
  items, value, onChange, style,
}) => (
  <View style={[{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.line }, style]}>
    {items.map((it) => {
      const on = it.id === value;
      return (
        <Hover key={it.id} onPress={() => onChange(it.id)} selected={on} hoverStyle={{ backgroundColor: COLORS.surface }} style={{ height: 48, paddingHorizontal: 22, justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 15, letterSpacing: 1.2, color: on ? COLORS.text : COLORS.dim, textTransform: 'uppercase' }}>{it.label}</Text>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, backgroundColor: on ? COLORS.text : 'transparent' }} />
        </Hover>
      );
    })}
  </View>
);

/** Segmented chips (fase, categoria): active light, idle surface2. */
export const DChips: React.FC<{ items: { id: string; label: string; disabled?: boolean }[]; value: string; onChange: (id: string) => void; height?: number; minWidth?: number }> = ({
  items, value, onChange, height = 40, minWidth,
}) => (
  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
    {items.map((it) => {
      const on = it.id === value;
      return (
        <Hover
          key={it.id}
          onPress={() => onChange(it.id)}
          disabled={it.disabled}
          selected={on}
          hoverStyle={on ? {} : { backgroundColor: COLORS.lineStrong }}
          style={{ height, minWidth, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? COLORS.ctaFill : COLORS.surface2, opacity: it.disabled ? 0.4 : 1 }}
        >
          <Text style={{ fontFamily: FONT.cond700, fontSize: 14, letterSpacing: 1.1, color: on ? COLORS.ctaInk : COLORS.muted, textTransform: 'uppercase' }}>{it.label}</Text>
        </Hover>
      );
    })}
  </View>
);

/** A table header cell / row of header cells. */
export const DTh: React.FC<{ children?: React.ReactNode; width?: number; flex?: number; align?: 'left' | 'right' | 'center' }> = ({ children, width, flex, align = 'left' }) => (
  <Text
    numberOfLines={1}
    style={{
      width, flex, minWidth: flex ? 0 : undefined, textAlign: align,
      fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: tracking(10.5, 0.12), color: COLORS.faint, textTransform: 'uppercase',
    }}
  >
    {children}
  </Text>
);

/**
 * Centered modal over a `rgba(5,5,6,.72)` veil — the PC replacement for every
 * bottom sheet. Closes on a veil click and on Esc.
 */
export const DModal: React.FC<{
  visible: boolean;
  onClose?: () => void;
  width?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}> = ({ visible, onClose, width = 640, children, style }) => {
  useEffect(() => {
    if (!visible || !onClose || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);
  if (!visible) return null;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Pressable
        accessible={false}
        onPress={onClose}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,5,6,0.72)' }}
      />
      <View style={[{ width, maxWidth: '100%', maxHeight: '100%' }, style]}>{children}</View>
    </View>
  );
};

/** Row helper for the "column + fixed side column" grids the PC pages use. */
export const Cols: React.FC<{ children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle>; align?: ViewStyle['alignItems'] }> = ({ children, gap = 20, style, align = 'flex-start' }) => (
  <View style={[{ flexDirection: 'row', gap, alignItems: align }, style]}>{children}</View>
);

/** A flexible column inside <Cols>. */
export const Col: React.FC<{ children: React.ReactNode; width?: number; gap?: number; style?: StyleProp<ViewStyle> }> = ({ children, width, gap = 14, style }) => (
  <View style={[width ? { width, flexShrink: 0 } : { flex: 1, minWidth: 0 }, { gap }, style]}>{children}</View>
);
