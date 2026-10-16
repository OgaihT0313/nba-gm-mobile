// The career save: one slot, the whole SeasonState as JSON in an envelope with
// a format version. Storage itself is platform-specific (saveStorage.ts on the
// phone, saveStorage.web.ts in the browser); this file owns the format.
//
// SeasonState is plain data — no Map, Set or Date anywhere in types.ts — so
// JSON round-trips it exactly (undefined fields simply drop out). Keep it that
// way: a Map added to the state would save as {} without any error.

import type { SeasonState } from '../types';
import { readSave, writeSave, removeSave } from './saveStorage';
import { ensureStaff } from './staffService';

// Bump when SeasonState changes in a way an old save can't be read as-is, and
// add the step that upgrades the previous version to MIGRATIONS.
export const SAVE_VERSION = 1;

interface SaveFile {
  version: number;
  savedAt: string;
  season: SeasonState;
}

// MIGRATIONS[n] turns a version-n season into version n+1.
const MIGRATIONS: { [fromVersion: number]: (season: any) => any } = {};

const looksLikeSeason = (s: any): s is SeasonState =>
  !!s && typeof s === 'object' && Array.isArray(s.teams) && !!s.players && typeof s.userTeamId === 'string';

export const loadGame = (): SeasonState | null => {
  const text = readSave();
  if (!text) return null;
  try {
    const file = JSON.parse(text) as SaveFile;
    // A save from a NEWER build than this one: refuse rather than misread it.
    if (typeof file.version !== 'number' || file.version > SAVE_VERSION) return null;
    let season: any = file.season;
    for (let v = file.version; v < SAVE_VERSION; v++) {
      const step = MIGRATIONS[v];
      if (!step) return null;
      season = step(season);
    }
    // Additive fields that old saves simply lack are filled here rather than
    // bumping the version: a save from before the staff gets an average one.
    return looksLikeSeason(season) ? ensureStaff(season) : null;
  } catch (e) {
    console.warn('[save] arquivo ilegível', e);
    return null;
  }
};

// Writes never overlap (the phone writes through a temp file): while one is
// in flight the newest state waits, and states in between are skipped.
let writing = false;
let queued: SeasonState | null = null;
// Bumped by deleteSave, so a write that was already in flight when the save
// was deleted removes what it just wrote instead of resurrecting it.
let generation = 0;

const flush = async () => {
  writing = true;
  while (queued) {
    const season = queued;
    queued = null;
    const gen = generation;
    try {
      const file: SaveFile = { version: SAVE_VERSION, savedAt: new Date().toISOString(), season };
      await writeSave(JSON.stringify(file));
      if (gen !== generation) removeSave();
    } catch (e) {
      console.warn('[save] gravação falhou', e);
    }
  }
  writing = false;
};

export const saveGame = (season: SeasonState): void => {
  queued = season;
  if (!writing) flush();
};

export const deleteSave = (): void => {
  queued = null;
  generation++;
  removeSave();
};
