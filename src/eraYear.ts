// The season an era save is in, as its END year (1985 = 1984-85). The save
// keeps the era it started in (SeasonState.era) and walks the ERAS chain one
// entry per offseason (eraChainIndex), so the year is the start's plus the
// steps taken -- past the chain's last real season too (2021, 2022...), where
// every franchise is back to today's identity. Null for the live league.
import { ERAS } from '../data/eras';
import type { SeasonState, PlayoffFormat } from '../types';

export const eraEndYearOf = (s?: Pick<SeasonState, 'era' | 'eraChainIndex'> | null): number | null => {
  if (!s?.era) return null;
  const start = ERAS.findIndex((e) => e.id === s.era!.id);
  const base = parseInt(s.era.seasonLabel, 10) + 1;
  if (Number.isNaN(base) || start < 0) return null;
  return base + ((s.eraChainIndex ?? start) - start);
};

/**
 * The year the save's current season starts (1995 = 1995-96): an era save's
 * off the chain, the live save's from 2025-26 plus the seasons it has played.
 * In the draft and free agency it's already the coming season, so this is also
 * the draft's year (the 1995 draft opens 1995-96).
 */
export const seasonStartYearOf = (s: Pick<SeasonState, 'era' | 'eraChainIndex' | 'gmLegacy'>): number => {
  const end = eraEndYearOf(s);
  return end !== null ? end - 1 : 2025 + (s.gmLegacy?.seasons ?? 0);
};

/**
 * Whether this season has a Copa NBA. The in-season tournament began in
 * 2023-24; an era save before that has none, and gets one once its chain
 * walks into 2023-24. Takes the season's END year (eraEndYearOf), null for
 * the live league.
 */
export const CUP_FIRST_END_YEAR = 2024;
export const cupInYear = (endYear: number | null): boolean => endYear === null || endYear >= CUP_FIRST_END_YEAR;
export const hasCup = (s?: Pick<SeasonState, 'era' | 'eraChainIndex'> | null): boolean => cupInYear(eraEndYearOf(s));

/** "1995-96". */
export const seasonLabelOf = (s: Pick<SeasonState, 'era' | 'eraChainIndex' | 'gmLegacy'>): string => {
  const y = seasonStartYearOf(s);
  return `${y}-${String(y + 1).slice(-2)}`;
};

/**
 * The playoffs of the season ending in `endYear` (null: the live league, today's).
 *   - play-in for seeds 7-10: 2020-21 on;
 *   - 16 teams from 1983-84; before, 12, with each conference's top two on a bye;
 *   - first round best of 7 from 2002-03, best of 5 from 1983-84, best of 3 before;
 *     every later round best of 7 throughout.
 */
export const playoffFormatFor = (endYear: number | null): PlayoffFormat => {
  const y = endYear ?? 9999;
  return {
    playIn: y >= 2021,
    seedsPerConf: y >= 1984 ? 8 : 6,
    bestOf: [y >= 2003 ? 7 : y >= 1984 ? 5 : 3, 7, 7, 7],
  };
};
/**
 * Games each team plays in the season ending in `endYear`: 82, except the
 * real short ones -- the 1998-99 lockout (50), the 2011-12 lockout (66) and
 * 2020-21 (72), which an era save walks into past the end of the chain.
 */
export const SHORT_SEASONS: Record<number, number> = { 1999: 50, 2012: 66, 2021: 72 };
export const seasonGamesFor = (endYear: number | null): number => (endYear !== null && SHORT_SEASONS[endYear]) || 82;

export const playoffFormatOf = (s?: Pick<SeasonState, 'era' | 'eraChainIndex'> | null): PlayoffFormat =>
  playoffFormatFor(eraEndYearOf(s));

/**
 * Where the standings are cut: seeds up to `direct` are in the playoffs, up to
 * `playIn` play in (null when the season has none).
 */
export const seedCuts = (f: PlayoffFormat): { direct: number; playIn: number | null } =>
  f.playIn ? { direct: 6, playIn: 10 } : { direct: f.seedsPerConf, playIn: null };
