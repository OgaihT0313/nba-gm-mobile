// "Console MyGM" design tokens — the system fixed by the redesign handoff
// (design 1b, then applied to every other screen).
//
// The rules the whole app now follows:
//   · page background #06080f, panels #0d1526 with a #1c2942 hairline, radius 20
//   · every screen opens on a full-bleed hero: a gradient in the team's PRIMARY
//     color, cut on the diagonal by its SECONDARY
//   · labels are JetBrains Mono ~8.5px with wide tracking; every number is mono
//   · a highlight panel carries a 3px bar on its left edge in the color of the
//     datum it's about
//   · exactly ONE red CTA per screen — the red is fixed (#EF3B24), NOT the team
//     accent, so "the main action" always reads the same everywhere
//
// Everything here is a plain string/number because NativeWind's `bg-accent/40`
// opacity shorthand silently fails against a runtime CSS variable (confirmed on
// device) — alpha has to be baked into a concrete rgba() via `withAlpha`.

export const COLORS = {
  /** Page background. */
  bg: '#06080f',
  /** Standard panel fill. */
  panel: '#0d1526',
  /** Panel hairline. */
  line: '#1c2942',
  /** Inset wells inside a panel (rows, quotes, mini-tiles). */
  sunken: '#0a1120',
  /** Secondary/ghost button fill. */
  ghost: '#0f172a',

  /** Bottom nav. */
  navBg: '#0a0f1c',
  navLine: '#16203a',
  navIdle: '#64748b',
  navIdleChip: '#1b2740',

  /** The fixed CTA red — one per screen. */
  cta: '#EF3B24',
  ctaDark: '#b8281a',

  /** Semantic data colors (match constants.attributeColor). */
  good: '#22c55e',
  goodSoft: '#4ade80',
  neutral: '#a3a3a3',
  warn: '#fbbf24',
  bad: '#f87171',
  badSoft: '#fca5a5',
  info: '#7dd3fc',

  /** Champion screen — the one place that breaks the system. */
  goldBg: '#0a0803',
  goldPanel: '#141005',
  goldLine: '#33280f',
  gold: '#fbbf24',
  goldDeep: '#ea9a08',

  text: '#ffffff',
  textSoft: '#cbd5e1',
  textDim: '#94a3b8',
} as const;

/** Text colors, as the alpha-on-white ramp the design uses throughout. */
export const INK = {
  /** Body copy on a panel. */
  body: 'rgba(255,255,255,0.5)',
  /** Mono label inside a panel. */
  label: 'rgba(255,255,255,0.42)',
  /** Mono label over a hero gradient (needs more contrast). */
  labelOnHero: 'rgba(255,255,255,0.65)',
  /** Secondary metadata under a name. */
  meta: 'rgba(255,255,255,0.4)',
  /** The faintest tier — footnotes, axis ticks. */
  faint: 'rgba(255,255,255,0.32)',
} as const;

/** Radii, mirroring the tailwind rounded-control/card/hero tokens. */
export const RADIUS = { control: 12, card: 20, hero: 32, pill: 99 } as const;

/**
 * Letter-spacing, converted from the design's `em` values — RN's letterSpacing
 * is absolute px, so it has to be resolved against the font size it's used at.
 */
export const tracking = (fontSize: number, em: number) => fontSize * em;

/** `#rrggbb` + alpha → `rgba(...)`. Handles 3-digit hex too. */
export const withAlpha = (hex: string, alpha: number): string => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** Perceptual lightness 0..1, used to decide if a brand color can carry a hero. */
export const luminance = (hex: string): number => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Readable text color to place ON a franchise color. Eight teams ship a very
 * light primary (SAS silver, DAL/BKN greys) where white text disappears, and
 * most of the rest are dark enough that near-black does — so the choice has to
 * be made per team, not once.
 */
export const onAccent = (hex: string): string => (luminance(hex) > 0.6 ? COLORS.bg : '#ffffff');

/** Lighten toward white by `amount` (0..1). */
export const lighten = (hex: string, amount: number): string => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

/** Darken toward black by `amount` (0..1). */
export const darken = (hex: string, amount: number): string => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  const mix = (c: number) => Math.round(c * (1 - amount));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

/**
 * The three colors a hero needs, derived from one team's brand pair.
 *
 * The mockups were all drawn with OKC (a bright blue primary), but eight
 * franchises ship a near-black or very dark navy primary (bkn #000000,
 * den #0E2240, ind #002D62...). Painting the hero with those verbatim gives a
 * black-on-black band with no gradient at all, so a too-dark primary is lifted
 * toward its own hue and, if it's still flat, the diagonal falls back to the
 * secondary — which is exactly the color those franchises are known by anyway.
 */
export const heroPalette = (primary: string, secondary: string) => {
  const base = luminance(primary) < 0.09 ? lighten(primary, 0.28) : primary;
  const mid = darken(base, 0.45);
  // The diagonal must never disappear into the base — if the secondary is just
  // as dark (bkn: black/grey), lift it too.
  const cut = luminance(secondary) < 0.12 ? lighten(secondary, 0.35) : secondary;
  return { base, mid, cut };
};
