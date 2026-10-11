// App preferences that outlive any one career -- today only the light/dark
// mode. Stored apart from the save (saveStorage's prefs file / localStorage
// key), read once at startup.

import type { ThemeMode } from '../src/theme/tokens';
import { readPrefs, writePrefs } from './saveStorage';

interface Prefs {
  themeMode?: ThemeMode;
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
