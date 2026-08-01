import React, { useId } from 'react';
import { View, ScrollView, StyleSheet, ScrollViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Defs, LinearGradient as SvgGradient, Stop, Polygon } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../src/theme/ThemeProvider';
import { COLORS, heroPalette } from '../../src/theme/tokens';

// The page chrome every screen is built on, per the redesign:
//
//   [ hero backdrop: team-primary gradient, cut on the diagonal by the
//     secondary — fixed, does NOT scroll ]
//   [ scrolling content                                                   ]
//   [ one pinned CTA (optional)                                           ]
//
// The backdrop is rendered at page level rather than inside the header block so
// it can bleed under the status bar and keep sitting behind the first cards as
// they scroll past — the same "full-bleed hero" the mockups show.

const SIDE = 14;

/**
 * The team-colored band. Exported on its own for the two screens that own
 * their backdrop instead of using <Screen> (the champion screen goes gold, the
 * pre-team screens have no franchise color yet).
 */
export const HeroBackdrop: React.FC<{ height: number; primary: string; secondary: string }> = ({
  height,
  primary,
  secondary,
}) => {
  // react-native-svg resolves url(#id) against a global table, so two heroes
  // alive at once (a screen fading out under the next) would share one gradient
  // and flash the wrong color. useId keeps them distinct; the strip drops the
  // ":" React puts in the value, which is not a legal SVG id.
  const gradId = `heroCut${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { base, mid, cut } = heroPalette(primary, secondary);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height }}>
      <LinearGradient
        colors={[base, mid, COLORS.bg]}
        locations={[0, 0.46, 1]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.78, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* The diagonal wedge of secondary color across the top-right corner. A
          polygon is the only way to get CSS's clip-path here — RN views can't
          be clipped to an arbitrary shape. */}
      <View style={{ position: 'absolute', top: 0, right: 0, width: 210, height }}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <SvgGradient id={gradId} x1="1" y1="0" x2="0.12" y2="1">
              <Stop offset="0" stopColor={cut} stopOpacity={0.55} />
              <Stop offset="0.62" stopColor={cut} stopOpacity={0} />
            </SvgGradient>
          </Defs>
          <Polygon points="38,0 100,0 100,100 0,100" fill={`url(#${gradId})`} />
        </Svg>
      </View>
    </View>
  );
};

interface ScreenProps extends Pick<ScrollViewProps, 'onScroll' | 'scrollEventThrottle'> {
  /** Height of the team-colored band, measured from the very top of the display. */
  heroHeight?: number;
  /** The single pinned action for this screen. */
  footer?: React.ReactNode;
  /** Override the backdrop (champion screen) or drop it entirely (`null`). */
  backdrop?: React.ReactNode | null;
  /** Page background, for the screens that deliberately leave the system. */
  background?: string;
  children: React.ReactNode;
}

const Screen: React.FC<ScreenProps> = ({
  heroHeight = 170,
  footer,
  backdrop,
  background = COLORS.bg,
  children,
  ...scrollProps
}) => {
  const insets = useSafeAreaInsets();
  const { accent } = useTheme();

  return (
    <View className="flex-1" style={{ backgroundColor: background }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: footer ? 8 : 22 }}
        showsVerticalScrollIndicator={false}
        {...scrollProps}
      >
        {/* The band lives INSIDE the scrolled content, not pinned behind it.
            Pinned looked right on the static 844px mockups, but on a real
            scrolling screen the team gradient stayed put while unrelated cards
            slid over it — the top third of the page read blue no matter how far
            down you were. Scrolling it away with the header it belongs to is
            the whole point of a hero.

            The status-bar inset is padding on the INNER view rather than on the
            scroll container, so the backdrop's `top: 0` still means the top of
            the display and the gradient keeps bleeding under the clock. */}
        <View>
          {backdrop === undefined ? (
            <HeroBackdrop height={heroHeight + insets.top} primary={accent.primary} secondary={accent.secondary} />
          ) : (
            backdrop
          )}
          <View style={{ paddingTop: insets.top + 6 }}>{children}</View>
        </View>
      </ScrollView>

      {footer ? <View style={{ paddingHorizontal: SIDE, paddingTop: 10, paddingBottom: 10 }}>{footer}</View> : null}
    </View>
  );
};

/** The header block that sits on the hero band — 18px gutters, per the mockups. */
export const HeroContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <View className={className} style={{ paddingHorizontal: 18 }}>
    {children}
  </View>
);

/** The card column below the hero — 14px gutters, 10px rhythm. */
export const Body: React.FC<{ children: React.ReactNode; gap?: number; top?: number }> = ({
  children,
  gap = 10,
  top = 16,
}) => (
  <View style={{ paddingHorizontal: SIDE, marginTop: top, gap }}>
    {children}
  </View>
);

export default Screen;
