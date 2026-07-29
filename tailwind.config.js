/** @type {import('tailwindcss').Config} */
module.exports = {
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
      },
      borderRadius: {
        // 3-tier scale ported from the web app's --radius-control/card/hero.
        control: '12px',
        card: '20px',
        hero: '32px',
      },
      fontFamily: {
        // The web hero face is Inter 900 italic. In RN a custom family doesn't
        // synthesize weight/style, so we load the exact Black-Italic file and
        // expose it as `font-display` — used ONLY on hero text. Everything else
        // stays on the system font, which handles font-bold/font-black properly.
        display: ['Inter_900BlackItalic'],
        // Same rule for the mono face: one loaded file per weight, so bold mono
        // is its own token. Never write `font-mono font-black` — the weight
        // class does nothing on a custom family and you'd get regular.
        mono: ['JetBrainsMono_400Regular'],
        'mono-bold': ['JetBrainsMono_700Bold'],
      },
    },
  },
  plugins: [],
};
