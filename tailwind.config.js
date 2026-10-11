/** @type {import('tailwindcss').Config} */
module.exports = {
  // The app is dark-only (`userInterfaceStyle: "dark"` in app.json) and uses no
  // `dark:` variants at all, so this is not a theming choice — it silences a
  // thrown error. Tailwind's default is 'media', and NativeWind's web runtime
  // installs a MutationObserver on <html> that calls its own colorScheme
  // setter, which throws outright under 'media' ("Cannot manually set color
  // scheme, as dark mode is type 'media'"). Pre-dates the SDK 57 patch bump —
  // reproduced on the old lockfile too. Web-only: the APK never bundles that
  // runtime.
  darkMode: 'class',
  content: [
    './App.tsx',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './screens/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Per-team dynamic accent — the actual value is injected at runtime by
        // the ThemeProvider via NativeWind `vars()` (see src/theme/ThemeProvider).
        // Mirrors the web app's `--accent` / `--accent-dark` CSS custom props.
        accent: 'var(--accent)',
        'accent-dark': 'var(--accent-dark)',
        'accent-secondary': 'var(--accent-secondary)',
        // "Console MyGM" surface ramp (see src/theme/tokens.ts, which is the
        // source of truth — these mirror it for the class-based spots).
        // "Transmissão" surface ramp (src/theme/tokens.ts is the source of
        // truth — these mirror it for the class-based spots).
        // Injected by the ThemeProvider from the live palette, so they follow
        // the light/dark mode like the inline COLORS values do.
        ink: 'var(--c-ink)',
        panel: 'var(--c-panel)',
        line: 'var(--c-line)',
        sunken: 'var(--c-sunken)',
        ghost: 'var(--c-ghost)',
        cta: 'var(--c-cta)',
        // Text tiers for the older class-styled components (they used
        // text-white / text-slate-*, which stay light in the light mode).
        fg: 'var(--c-text)',
        'fg-soft': 'var(--c-text-soft)',
        'fg-dim': 'var(--c-dim)',
      },
      borderRadius: {
        // 3-tier scale ported from the web app's --radius-control/card/hero.
        control: '12px',
        card: '16px',
        hero: '20px',
      },
      fontFamily: {
        // Barlow Condensed for display/labels/numbers, Barlow for body. A
        // custom family never synthesizes weight, so every weight is its own
        // token — never write `font-mono font-black`, the weight class does
        // nothing on a custom family. Old names (display, mono, mono-bold) are
        // kept so every screen moved to the new faces at once.
        display: ['BarlowCondensed_800ExtraBold'],
        mono: ['BarlowCondensed_600SemiBold'],
        'mono-bold': ['BarlowCondensed_700Bold'],
        cond: ['BarlowCondensed_700Bold'],
        'cond-black': ['BarlowCondensed_800ExtraBold'],
        body: ['Barlow_500Medium'],
      },
    },
  },
  plugins: [],
};
