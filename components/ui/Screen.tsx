import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../src/theme/ThemeProvider';
import { COLORS } from '../../src/theme/tokens';

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
}) => (
  // "Transmissão": a franchise color is a FLAT block — no gradient, no diagonal.
  // A 5px stripe of the secondary closes it at the base.
  <View style={{ pointerEvents: 'none', position: 'absolute', left: 0, right: 0, top: 0, height }}>
    <View style={{ flex: 1, backgroundColor: primary }} />
    <View style={{ height: 5, backgroundColor: secondary }} />
  </View>
);

interface ScreenProps extends Pick<ScrollViewProps, 'onScroll' | 'scrollEventThrottle'> {
  /** Height of the team-colored band, measured from the very top of the display. */
  heroHeight?: number;
  /** The single pinned action for this screen. */
  footer?: React.ReactNode;
  /** Override the backdrop (champion screen) or drop it entirely (`null`). */
  backdrop?: React.ReactNode | null;
  /** Page background, for the screens that deliberately leave the system. */
  background?: string;
  /**
   * A compact bar pinned to the top once the hero has scrolled out of view.
   * The hero carries what a screen is ABOUT (record, game number, the owner's
   * mood); without this it was gone the moment you read anything below it.
   */
  stickyHeader?: React.ReactNode;
  children: React.ReactNode;
}

const Screen: React.FC<ScreenProps> = ({
  heroHeight = 170,
  footer,
  backdrop,
  background = COLORS.bg,
  stickyHeader,
  children,
  onScroll,
  ...scrollProps
}) => {
  const insets = useSafeAreaInsets();
  const { accent } = useTheme();
  // Only flips at the threshold, so scrolling does not re-render the page.
  const [pinned, setPinned] = useState(false);

  return (
    <View className="flex-1" style={{ backgroundColor: background }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: footer ? 8 : 22 }}
        showsVerticalScrollIndicator={false}
        {...scrollProps}
        // Only listen when someone needs it: a handler with no throttle makes
        // React Native warn on every frame of every scroll, on every screen.
        scrollEventThrottle={stickyHeader || onScroll ? (scrollProps.scrollEventThrottle ?? 32) : undefined}
        onScroll={stickyHeader || onScroll ? (e) => {
          if (stickyHeader) {
            const past = e.nativeEvent.contentOffset.y > heroHeight - 40;
            if (past !== pinned) setPinned(past);
          }
          onScroll?.(e);
        } : undefined}
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
          {/* No default band any more: the redesign is flat black, and only
              the screens that own a team-color block (Meu Time, Confirmar)
              pass one in. */}
          {backdrop ?? null}
          <View style={{ paddingTop: insets.top + 6 }}>{children}</View>
        </View>
      </ScrollView>

      {stickyHeader && pinned ? (
        <View
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            paddingTop: insets.top + 8, paddingBottom: 9, paddingHorizontal: 16,
            backgroundColor: COLORS.navBg, borderBottomWidth: 1, borderBottomColor: COLORS.navLine,
          }}
        >
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, backgroundColor: accent.primary, opacity: 0.8 }} />
          {stickyHeader}
        </View>
      ) : null}

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
