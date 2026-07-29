import React, { createContext, useContext } from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';
import { getTeamAccent, darkenHex } from '../../constants';

// Per-team dynamic theming, ported from the web app's `--accent` CSS custom
// properties. NativeWind's `vars()` injects the same custom properties via a
// wrapping <View>, so any `bg-accent` / `text-accent` / `border-accent` class
// resolves to the current team color. `accent` is also exposed on the context
// as concrete strings for the few spots that need a real value (e.g. SVG icon
// stroke, which can't read a CSS variable).

interface ThemeContextValue {
  teamId: string | null;
  accent: { primary: string; secondary: string; dark: string };
}

const DEFAULT: ThemeContextValue = {
  teamId: null,
  accent: { primary: '#38bdf8', secondary: '#0284c7', dark: '#0284c7' },
};

const ThemeContext = createContext<ThemeContextValue>(DEFAULT);

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ teamId: string | null; children: React.ReactNode }> = ({ teamId, children }) => {
  const a = getTeamAccent(teamId);
  const accent = { primary: a.primary, secondary: a.secondary, dark: darkenHex(a.primary) };

  const themeVars = vars({
    '--accent': accent.primary,
    '--accent-dark': accent.dark,
    '--accent-secondary': accent.secondary,
  });

  return (
    <ThemeContext.Provider value={{ teamId, accent }}>
      <View style={[{ flex: 1 }, themeVars]}>{children}</View>
    </ThemeContext.Provider>
  );
};
