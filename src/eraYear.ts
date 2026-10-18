// The season an era save is in, as its END year (1985 = 1984-85). The save
// keeps the era it started in (SeasonState.era) and walks the ERAS chain one
// entry per offseason (eraChainIndex), so the year is the start's plus the
// steps taken -- past the chain's last real season too (2021, 2022...), where
// every franchise is back to today's identity. Null for the live league.
import { ERAS } from '../data/eras';
import type { SeasonState } from '../types';

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

/** "1995-96". */
export const seasonLabelOf = (s: Pick<SeasonState, 'era' | 'eraChainIndex' | 'gmLegacy'>): string => {
  const y = seasonStartYearOf(s);
  return `${y}-${String(y + 1).slice(-2)}`;
};
