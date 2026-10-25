// The GM's saves: three slots, each the whole SeasonState as JSON in an
// envelope with a format version. Storage itself is platform-specific (saveStorage.ts on the
// phone, saveStorage.web.ts in the browser); this file owns the format.
//
// SeasonState is plain data — no Map, Set or Date anywhere in types.ts — so
// JSON round-trips it exactly (undefined fields simply drop out). Keep it that
// way: a Map added to the state would save as {} without any error.

import type { SeasonState } from '../types';
import { readSave, writeSave, removeSave, type SaveSlot } from './saveStorage';
import { ensureStaff } from './staffService';
import { loadActiveSlot } from './prefsService';
import { sortStandings } from './scheduleService';
import { getTeamNickname, getTeamTricode } from '../constants';
import { eraEndYearOf, seasonLabelOf } from '../src/eraYear';

// Slot 1 is the file the single save always used, so a save from before the
// slots is simply slot 1.
export type GmSlot = 1 | 2 | 3;
export const GM_SLOTS: GmSlot[] = [1, 2, 3];
const storageOf = (slot: GmSlot): SaveSlot => (slot === 1 ? 'save' : slot === 2 ? 'save-2' : 'save-3');
const activeSlot = (): GmSlot => loadActiveSlot() as GmSlot;

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

export const loadGame = (slot: GmSlot = activeSlot()): SeasonState | null => {
  const text = readSave(storageOf(slot));
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
// in flight the newest state waits, and states in between are skipped. Each
// state carries its slot, so a write queued before a slot switch still lands
// in the slot it came from.
let writing = false;
let queued: { season: SeasonState; slot: GmSlot } | null = null;
// Bumped by deleteSave, so a write that was already in flight when the save
// was deleted removes what it just wrote instead of resurrecting it.
let generation = 0;

const flush = async () => {
  writing = true;
  while (queued) {
    const { season, slot } = queued;
    queued = null;
    const gen = generation;
    try {
      const file: SaveFile = { version: SAVE_VERSION, savedAt: new Date().toISOString(), season };
      await writeSave(JSON.stringify(file), storageOf(slot));
      if (gen !== generation) removeSave(storageOf(slot));
    } catch (e) {
      console.warn('[save] gravação falhou', e);
    }
  }
  writing = false;
};

export const saveGame = (season: SeasonState, slot: GmSlot = activeSlot()): void => {
  queued = { season, slot };
  if (!writing) flush();
};

export const deleteSave = (slot: GmSlot = activeSlot()): void => {
  if (queued?.slot === slot) queued = null;
  generation++;
  removeSave(storageOf(slot));
};

/** What a slot's card on Home shows, without making that save the one on screen. */
export interface SaveSummary {
  teamId: string;
  nickname: string;
  tricode: string;
  /** "1995-96": the season the save is in now. */
  yearLabel: string;
  seasonNumber: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  /** Conference rank, 0 before the first game. */
  rank: number;
  conference: 'East' | 'West';
  titles: number;
  seasons: number;
  confidence: number;
  fired: boolean;
}

// The team's name and tricode are those of the save's own season (the Bullets
// in a 1995-96 save), read with its year, not the one on screen.
export const summaryOf = (season: SeasonState): SaveSummary | null => {
  const team = season.teams.find((t) => t.id === season.userTeamId);
  if (!team) return null;
  const year = eraEndYearOf(season);
  const rank = season.gamesPlayed > 0
    ? sortStandings(season.teams.filter((t) => t.conference === team.conference), season.schedule).findIndex((t) => t.id === team.id) + 1
    : 0;
  return {
    teamId: team.id,
    nickname: getTeamNickname(team, year),
    tricode: getTeamTricode(team, year),
    yearLabel: seasonLabelOf(season),
    seasonNumber: season.gmLegacy.seasons + 1,
    gamesPlayed: season.gamesPlayed,
    wins: team.wins ?? 0,
    losses: team.losses ?? 0,
    rank,
    conference: team.conference,
    titles: season.gmLegacy.titles,
    seasons: season.gmLegacy.seasons,
    confidence: season.owner.confidence,
    fired: !!season.owner.fired,
  };
};

/** Every slot's summary, null for an empty (or unreadable) one. Reads each file. */
export const listSaves = (): (SaveSummary | null)[] =>
  GM_SLOTS.map((slot) => {
    const season = loadGame(slot);
    return season ? summaryOf(season) : null;
  });
