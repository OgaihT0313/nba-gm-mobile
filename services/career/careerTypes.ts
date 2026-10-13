// Minha Carreira (PLANO-CARREIRA.md): you are one player in the league, not
// its GM. The league itself is a normal SeasonState run with nobody at the
// controls -- userTeamId is NO_TEAM, which no team matches, so every team is
// the CPU's and every GM-only system (owner, decisions, offers) stays quiet.
// Around it, the career keeps what is yours: the player, the coach's trust,
// training, and the record of your games and seasons.
import type { Player, PlayerAttributes, SeasonState } from '../../types';

/** The league's user team in a career save: nobody. */
export const NO_TEAM = '__career__';

export type CareerStyleId = 'shooter' | 'slasher' | 'playmaker' | 'three_d' | 'rim_protector' | 'post' | 'wing';

/** What the creation screen asks for. */
export interface CareerCreation {
  firstName: string;
  lastName: string;
  number: number;
  position: 'PG' | 'SG' | 'SF' | 'PF' | 'C';
  style: CareerStyleId;
  heightCm: number;
  weightKg: number;
  skinTone: string;
  personality: string;
}

/** The pre-draft combine: three tests and the interview. */
export interface CombineResult {
  shooting: number; // each 0-100
  athletic: number;
  interview: number;
  /** OVR points the combine added (or cost) to the prospect's real rating. */
  ovrDelta: number;
  /** How teams read him afterwards: a better-known prospect, a tighter band. */
  summary: string;
}

export type WeeklyTraining = 'shooting' | 'defense' | 'physical' | 'film' | 'rest';

/** One of your games, as the box score has it. */
export interface CareerGame {
  day: number;
  opponentId: string;
  home: boolean;
  teamScore: number;
  oppScore: number;
  /** Absent: did not play (coach's decision or injured). */
  line?: { min: number; pts: number; reb: number; ast: number; stl: number; blk: number; tov: number };
  /** Trust after the game, for the chart. */
  trust: number;
}

export interface CareerSeasonLine {
  season: number; // 1 = rookie year
  label: string; // "2026-27"
  teamId: string;
  age: number;
  ovr: number;
  role: string;
  gp: number;
  mpg: number;
  ppg: number;
  rpg: number;
  apg: number;
  teamWins: number;
  teamLosses: number;
  honors: string[];
}

export type CareerPhase =
  | 'predraft' // the league plays the season before your draft; you do the combine
  | 'draft' // draft night
  | 'season' // regular season
  | 'playoffs'
  | 'retired';

export interface CareerState {
  version: 1;
  mode: 'live' | 'era';
  phase: CareerPhase;
  /** The league, run with userTeamId = NO_TEAM. */
  league: SeasonState;
  meId: string;
  creation: CareerCreation;
  /** Hidden ceiling: the OVR his body and talent top out at. */
  ceiling: number;
  /** Coach's trust, 0-100 (see careerTrust.ts). */
  trust: number;
  training: WeeklyTraining;
  /** Unspent development points, and where the spent ones went. */
  devPoints: number;
  spent: Partial<PlayerAttributes>;
  /** Off/def points bought but not yet worth a whole OVR point. */
  ratingCarry: number;
  /** Before the draft the player isn't in the league yet: here he is. */
  prospect?: Player;
  combine?: CombineResult;
  draft?: { teamId: string | null; pick: number | null; label: string };
  /** Your draft's picks, in order, for draft night (names kept: rookies get traded). */
  draftNight?: { pick: number; teamId: string; playerId: string; name: string; pos: string }[];
  /** This season's games, newest last. */
  games: CareerGame[];
  /** Finished seasons. */
  seasons: CareerSeasonLine[];
  /** Days into the season when the last weekly training was applied. */
  lastTrainingDay: number;
  /** The role the feed last announced, and since when it has held (anti-flicker). */
  announcedRole?: number;
  pendingRole?: { rank: number; since: number };
  /** Things that happened to you, newest first (trades, role changes, injuries). */
  feed: { day: number; text: string }[];
}
