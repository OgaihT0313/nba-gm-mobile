import { createContext, useContext } from 'react';

import type { Player } from '../types';

// The league as the player sheet sees it: who plays where, for "Comparar"
// (PlayerCompare picks the second player from here). Absent (Minha Carreira),
// the sheet simply shows no "Comparar" button.
export interface LeagueValue {
  players: Record<string, Player>;
  /** The team a player is on; undefined for free agents and the retired. */
  teamOf: (playerId: string) => string | undefined;
}

export const LeagueContext = createContext<LeagueValue | null>(null);
export const useLeague = () => useContext(LeagueContext);
