import { createContext, useContext } from 'react';

// The watch list, reachable from the player sheet wherever it opens (Scout,
// Franquias, Trocas, Líderes...) without threading props through each screen.
// Absent (Minha Carreira), the sheet simply shows no "Observar" button.
export interface WatchListValue {
  watched: Set<string>;
  /** The user's own players: watching them makes no sense. */
  own: Set<string>;
  toggle: (playerId: string) => void;
}

export const WatchListContext = createContext<WatchListValue | null>(null);
export const useWatchList = () => useContext(WatchListContext);
