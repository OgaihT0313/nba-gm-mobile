// App preferences that outlive any one career -- the light/dark mode and which
// GM save slot was last played. Stored apart from the save (saveStorage's prefs
// file / localStorage key), read once at startup.

import type { ThemeMode } from '../src/theme/tokens';
import { readPrefs, writePrefs } from './saveStorage';

interface Prefs {
  themeMode?: ThemeMode;
  /** The GM slot (1-3) the app opens on. */
  activeSlot?: number;
}

const load = (): Prefs => {
  try {
    const text = readPrefs();
    return text ? (JSON.parse(text) as Prefs) : {};
  } catch {
    return {};
  }
};

export const loadThemeMode = (): ThemeMode => (load().themeMode === 'light' ? 'light' : 'dark');

export const saveThemeMode = (mode: ThemeMode): void => {
  writePrefs(JSON.stringify({ ...load(), themeMode: mode }));
};

export const loadActiveSlot = (): number => {
  const n = load().activeSlot;
  return n === 2 || n === 3 ? n : 1;
};

export const saveActiveSlot = (slot: number): void => {
  writePrefs(JSON.stringify({ ...load(), activeSlot: slot }));
};
