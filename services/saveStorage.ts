// Where the career lives on the phone: one JSON file in the app's document
// directory (never cleaned up by the system). The web build resolves
// saveStorage.web.ts instead — expo-file-system has no web implementation.
import { File, Paths } from 'expo-file-system';

const NAME = 'nba-manager-save.json';
const TMP_NAME = 'nba-manager-save.tmp.json';

export const readSave = (): string | null => {
  try {
    const file = new File(Paths.document, NAME);
    return file.exists ? file.textSync() : null;
  } catch (e) {
    console.warn('[save] leitura falhou', e);
    return null;
  }
};

// Written to a temp file and moved over the real one, so an app killed
// mid-write leaves the previous save intact instead of half a JSON.
export const writeSave = async (text: string): Promise<void> => {
  const tmp = new File(Paths.document, TMP_NAME);
  if (tmp.exists) tmp.delete();
  tmp.create();
  tmp.write(text);
  await tmp.move(new File(Paths.document, NAME), { overwrite: true });
};

export const removeSave = (): void => {
  try {
    const file = new File(Paths.document, NAME);
    if (file.exists) file.delete();
  } catch (e) {
    console.warn('[save] remoção falhou', e);
  }
};

// Small preferences (the light/dark mode) live in their own file, apart from
// the career: deleting a broken save must not reset them, and they're read
// before anything else at startup.
const PREFS_NAME = 'nba-manager-prefs.json';

export const readPrefs = (): string | null => {
  try {
    const file = new File(Paths.document, PREFS_NAME);
    return file.exists ? file.textSync() : null;
  } catch {
    return null;
  }
};

export const writePrefs = (text: string): void => {
  try {
    const file = new File(Paths.document, PREFS_NAME);
    if (!file.exists) file.create();
    file.write(text);
  } catch (e) {
    console.warn('[prefs] gravação falhou', e);
  }
};
