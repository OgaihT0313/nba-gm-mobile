// Web build of saveStorage.ts: the career goes to localStorage (a season is
// ~0.75 MB of JSON, well inside the browser's ~5 MB per origin). Private
// windows and blocked site data make every call throw, so each one is guarded
// and the game simply runs without a save there.
// 'save', 'save-2', 'save-3' are the GM's three (the first keeps the original
// key), 'career' is Minha Carreira's.
export type SaveSlot = 'save' | 'save-2' | 'save-3' | 'career';
const keyOf = (slot: SaveSlot) => `nba-manager-${slot}`;

export const readSave = (slot: SaveSlot = 'save'): string | null => {
  try {
    return window.localStorage.getItem(keyOf(slot));
  } catch (e) {
    console.warn('[save] leitura falhou', e);
    return null;
  }
};

export const writeSave = async (text: string, slot: SaveSlot = 'save'): Promise<void> => {
  window.localStorage.setItem(keyOf(slot), text);
};

export const removeSave = (slot: SaveSlot = 'save'): void => {
  try {
    window.localStorage.removeItem(keyOf(slot));
  } catch (e) {
    console.warn('[save] remoção falhou', e);
  }
};

// Small preferences (the light/dark mode), apart from the career.
const PREFS_KEY = 'nba-manager-prefs';

export const readPrefs = (): string | null => {
  try {
    return window.localStorage.getItem(PREFS_KEY);
  } catch {
    return null;
  }
};

export const writePrefs = (text: string): void => {
  try {
    window.localStorage.setItem(PREFS_KEY, text);
  } catch (e) {
    console.warn('[prefs] gravação falhou', e);
  }
};
