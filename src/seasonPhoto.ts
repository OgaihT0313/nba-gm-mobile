// PLANO-FOTOS-ERAS fase 2: the photo follows the save. data/photos.json lists
// every official team-season headshot there is (2015-16 on); for the season on
// screen and the team the player is on in the save, this picks the closest one
// that isn't from the future -- his own team's first, any team's otherwise.
// Before 2015-16 there are none, and the player's photoUrl (phases 1 and 3)
// stays.
import photos from '../data/photos.json';
import type { Player } from '../types';
import { teamsData } from '../constants';

const INDEX = photos as unknown as Record<string, [number, number][]>;
export const FIRST_PHOTO_SEASON = 2015;

// The season on screen, by its first year (2019 = 2019-20). Set by App and
// CareerApp, like src/eraIdentity's year.
let photoSeason: number | null = null;
export const setPhotoSeason = (startYear: number | null) => { photoSeason = startYear; };

const NBA_TEAM: Record<string, number> = {};
teamsData.forEach((t) => {
  const m = /\/logos\/nba\/(\d+)\//.exec(t.logoUrl || '');
  if (m) NBA_TEAM[t.id] = Number(m[1]);
});

const urlOf = (year: number, team: number, nbaId: number) =>
  `https://cdn.nba.com/headshots/nba/${team}/${year}/1040x760/${nbaId}.png`;

/** The headshot for this season and team, with the year it's from; null when the index has none to offer. */
export const seasonPhoto = (
  p: Pick<Player, 'nbaId'> | undefined,
  teamId?: string,
  startYear: number | null = photoSeason,
): { url: string; year: number } | null => {
  if (!p?.nbaId || startYear === null || startYear < FIRST_PHOTO_SEASON) return null;
  const entries = INDEX[String(p.nbaId)];
  if (!entries?.length) return null;
  const upTo = entries.filter(([y]) => y <= startYear);
  if (!upTo.length) return null;
  const team = teamId ? NBA_TEAM[teamId] : undefined;
  const own = team ? upTo.filter(([, t]) => t === team) : [];
  const [year, t] = (own.length ? own : upTo)[(own.length ? own : upTo).length - 1];
  return { url: urlOf(year, t, p.nbaId), year };
};

/** Whether a season photo found for this season is close enough to drop the era treatment. */
export const isCurrentPhoto = (found: { year: number } | null, startYear: number | null = photoSeason): boolean =>
  !!found && startYear !== null && startYear - found.year <= 1;
