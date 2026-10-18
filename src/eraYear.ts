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
