import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleProp, ViewStyle } from 'react-native';

// Page/element fade-in, the RN stand-in for the web's motion `initial/animate`
// transitions.
//
// Deliberately React Native's core Animated API rather than Reanimated's
// `entering={FadeIn}` layout animations: on react-native-web those set
// `visibility: hidden` up front and never reveal the element (verified — the
// whole screen went blank while still laid out correctly), which would ship a
// broken web build. Core Animated works on both web and native.
interface FadeInViewProps {
  children: React.ReactNode;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

const FadeInView: React.FC<FadeInViewProps> = ({ children, duration = 220, style, className }) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(opacity, {
      toValue: 1,
      duration,
      // Web has no native animated module; with useNativeDriver:true the
      // animation silently never runs there.
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start();

    // Safety net — the reason this component starts at opacity 0 at all.
    // Animated is driven by requestAnimationFrame, and a host that never marks
    // the page visible (document.hidden === true) throttles rAF to zero, so the
    // animation never progresses and the screen would stay permanently
    // invisible. setValue applies without rAF, so this guarantees the content
    // is always shown even where the fade can't run. On a real browser/device
    // the fade has long since finished and this is a no-op.
    const failsafe = setTimeout(() => opacity.setValue(1), duration + 400);

    return () => {
      anim.stop();
      clearTimeout(failsafe);
    };
  }, [opacity, duration]);

  return (
    <Animated.View style={[{ opacity, flex: 1 }, style]}>
      {children}
    </Animated.View>
  );
};

export default FadeInView;
