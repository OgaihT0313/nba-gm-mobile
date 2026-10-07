// "Transmissão" design tokens — the redesign handed off from Claude Design
// (design_handoff_redesign_transmissao, 2026-10-05), replacing "Console MyGM".
//
// The rules the whole app now follows:
//   · a TV-scoreboard look: neutral black (#0B0B0D), surfaces #141417, no
//     gradients anywhere — a franchise color is a FLAT block
//   · type is Barlow Condensed for display, numbers and labels; Barlow for body
//   · West = red (#E5484D), East = blue (#3E8BF0), everywhere in the app
//   · exactly ONE main action per screen, and it is LIGHT (#F3F1EC on black
//     ink). Secondary actions are surface2 fills or outlines
//   · a highlight card carries a 3px inset on its left edge in the color of the
//     datum it is about (gold on the MVP, team color on "your series")
//
// Everything here is a plain string/number because NativeWind's `bg-accent/40`
// opacity shorthand silently fails against a runtime CSS variable (confirmed on
// device) — alpha has to be baked into a concrete rgba() via `withAlpha`.
//
// Key names from the old system are kept (panel, line, sunken, cta...) so every
// screen moved to the new palette at once; the new names are the ones to use.

export const COLORS = {
  /** Page background. */
  bg: '#0B0B0D',
  /** Cards and panels. */
  surface: '#141417',
  panel: '#141417',
  /** Secondary buttons, inactive chips, wells. */
  surface2: '#1B1B1F',
  sunken: '#1B1B1F',
  ghost: '#1B1B1F',
  /** Main dividers. */
  line: '#1F1F23',
  /** List-row dividers. */
  lineSoft: '#1C1C20',
  /** Meter tracks, outline borders. */
  lineStrong: '#26262B',
  /** Outline (ghost) button border. */
  ghostBorder: '#2F2F35',

  /** Bottom nav and the action dock above it. */
  navBg: '#0E0E11',
  navLine: '#1F1F23',
  navIdle: '#77757F',
  navIdleChip: '#1B1B1F',
  dockBg: '#111114',

  /** The ONE main action: light fill, black ink. */
  ctaFill: '#F3F1EC',
  ctaInk: '#0B0B0D',
  /**
   * Red. Kept under its old name because ~40 call sites use it to mean "red"
   * (a rival, a blocking problem, a loss) — not the main action any more.
   */
  cta: '#E5484D',
  ctaDark: '#B8383C',

  /** Conferences. */
  west: '#E5484D',
  east: '#3E8BF0',
  westLine: '#5A2A2D',
  eastLine: '#253B5E',

  /** Semantic data colors. */
  good: '#3DD68C',
  goodSoft: '#3DD68C',
  neutral: '#9B9893',
  warn: '#E8A13A',
  bad: '#E5484D',
  badSoft: '#E5484D',
  info: '#3E8BF0',

  /** Gold: MVP, the Finals, a champion. */
  gold: '#E8C26A',
  goldDeep: '#C9A24A',
  /** Champion screen — the one place that breaks the system. */
  goldBg: '#0D0B07',
  goldPanel: '#17130A',
  goldLine: '#221D12',
  goldMeta: '#9B8F70',
  goldInk: '#1A1405',

  text: '#F3F1EC',
  textSoft: '#C9C6C0',
  textDim: '#9B9893',
  muted: '#9B9893',
  dim: '#77757F',
  faint: '#66645F',
} as const;

/** Text tiers. */
export const INK = {
  /** Body copy. */
  body: '#9B9893',
  /** Section / field label. */
  label: '#9B9893',
  /** Label over a franchise-color block. */
  labelOnHero: 'rgba(243,241,236,0.78)',
  /** Secondary metadata under a name. */
  meta: '#77757F',
  /** Axis ticks, footnotes, placeholders. */
  faint: '#66645F',
} as const;

/** Font families (loaded in App.tsx). A custom family never synthesizes weight. */
export const FONT = {
  cond500: 'BarlowCondensed_500Medium',
  cond600: 'BarlowCondensed_600SemiBold',
  cond700: 'BarlowCondensed_700Bold',
  cond800: 'BarlowCondensed_800ExtraBold',
  body400: 'Barlow_400Regular',
  body500: 'Barlow_500Medium',
  body600: 'Barlow_600SemiBold',
} as const;

/** OVR color by band: >=85 good, 78-84 text, below muted. */
export const ovrColor = (ovr: number): string => (ovr >= 85 ? COLORS.good : ovr >= 78 ? COLORS.text : COLORS.muted);

/** Conference color. */
export const confColor = (conference: string | undefined): string => (conference === 'East' ? COLORS.east : COLORS.west);

/** Radii, mirroring the tailwind rounded-control/card/hero tokens. */
export const RADIUS = { control: 12, card: 16, hero: 20, tile: 14, chip: 10, tag: 6, pill: 99 } as const;

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

/**
 * A team color that reads as a FILL on the black background (bars, segments).
 * Eight franchises ship a near-black primary (den #0E2240, bkn #000000...):
 * as a bar on #141417 it disappears, so those use their secondary instead.
 */
export const visibleTeamColor = (primary: string, secondary: string): string =>
  luminance(primary) < 0.06 ? secondary : primary;

/** Euclidean RGB distance between two hex colors (0..441). Under ~110 two
 *  team colors read as the same color at a glance. */
export const colorDistance = (a: string, b: string): number => {
  const p = (h: string) => { const x = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) || 0); };
  const [r1, g1, b1] = p(a); const [r2, g2, b2] = p(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
};
