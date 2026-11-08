// The real league around an era save, beyond the summer's trades.
//
// A chained era save (SeasonState.eraChainIndex) used to read only two things
// from the next real season: the offseason moves (team to team) and the draft
// class. Everything else the real league did was lost:
//   - expansion: Dallas (1980), Charlotte and Miami (1988), Minnesota and
//     Orlando (1989), Toronto and Vancouver (1995), the Bobcats (2004) never
//     appeared, and every real move INTO them was dropped;
//   - the Hornets' move to New Orleans (2002) never happened;
//   - nobody left the league when he really did (Jordan in 1993), and nobody
//     came back (Jordan in 1995) or arrived outside the draft.
// Each piece below reads ERAS[i] (the season just played) against ERAS[i+1]
// (the one the save walks into). All of it is skipped once the chain runs out.
//
// Pure apart from Math.random (through generateCoach/generateTeamStaff).
import type { Team, Player, SeasonState, Coach, Event } from '../types';
import { ERAS } from '../data/eras';
import { generateCoach } from './coachService';
import { generateTeamStaff } from './staffService';
import { initialPickAssets } from './draftService';
import { askingSalary } from './freeAgencyService';
import { MAX_ROSTER_SIZE } from './tradeService';

type PlayerMap = { [id: string]: Player };

/** The season the save walks into, when real history still has one. */
export const nextRealEra = (season: Pick<SeasonState, 'era' | 'eraChainIndex'>) =>
  season.era && season.eraChainIndex !== undefined ? ERAS[season.eraChainIndex + 1] : undefined;

// Every id that is a real NBA player in some era. Procedural players (draft
// classes past the chain, undrafted fringe, the Minha Carreira player) are not
// in it, so real-history rules never touch them.
let realIdsMemo: Set<string> | null = null;
const realIds = (): Set<string> => {
  if (!realIdsMemo) realIdsMemo = new Set(ERAS.flatMap((e) => Object.keys(e.players)));
  return realIdsMemo;
};

const rosterIds = (teams: Team[]) => new Set(teams.flatMap((t) => t.roster));

/* ------------------------------------------------------------------ */
/* Relocation                                                           */
/* ------------------------------------------------------------------ */

/**
 * Franchises that change id between the two seasons: one id leaves the data
 * and another arrives, and most of the leaving team's players move to the new
 * one (the Hornets: cha -> nop in 2002). Only that one in the chain today.
 */
export const relocationsAt = (chainIndex: number): { from: string; to: string }[] => {
  const cur = ERAS[chainIndex];
  const next = ERAS[chainIndex + 1];
  if (!cur || !next) return [];
  const curIds = new Set(cur.teams.map((t) => t.id));
  const nextIds = new Set(next.teams.map((t) => t.id));
  const gone = [...curIds].filter((id) => !nextIds.has(id));
  const added = [...nextIds].filter((id) => !curIds.has(id));
  const out: { from: string; to: string }[] = [];
  gone.forEach((from) => {
    const count: Record<string, number> = {};
    cur.offseasonMoves.moves.forEach((m) => {
      if (m.fromTeamId === from && added.includes(m.toTeamId)) count[m.toTeamId] = (count[m.toTeamId] ?? 0) + 1;
    });
    const to = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (to) out.push({ from, to });
  });
  return out;
};

/**
 * Every reference to team `from` becomes `to`, anywhere in the save: rosters,
 * picks, history, rivalries, the user's own team. Team ids are short codes
 * ("cha") that no other field ever equals, so an exact match on values and
 * keys is safe; composite strings (event text, pick ids) are left alone,
 * except pick ids, which are rebuilt.
 */
export const renameTeamId = <T,>(value: T, from: string, to: string): T => {
  const walk = (v: unknown): unknown => {
    if (v === from) return to;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        let next = walk(x);
        // Pick ids are `pick_<team>_<draft>`: keep them in step with originalTeamId.
        if (k === 'id' && typeof next === 'string' && next.startsWith(`pick_${from}_`)) next = `pick_${to}_${next.slice(`pick_${from}_`.length)}`;
        out[k === from ? to : k] = next;
      }
      return out;
    }
    return v;
  };
  return walk(value) as T;
};

/** The save with this transition's relocations applied, and the news. */
export const applyRelocations = (season: SeasonState): { season: SeasonState; events: Event[] } => {
  if (!nextRealEra(season)) return { season, events: [] };
  let s = season;
  const events: Event[] = [];
  relocationsAt(season.eraChainIndex!).forEach(({ from, to }) => {
    if (!s.teams.some((t) => t.id === from) || s.teams.some((t) => t.id === to)) return;
    const name = s.teams.find((t) => t.id === from)!.name;
    s = renameTeamId(s, from, to);
    const realName = ERAS[season.eraChainIndex! + 1].teams.find((t) => t.id === to)?.name ?? to;
    events.push({ message: `🚚 MUDANÇA: o ${name} deixa a cidade e passa a ser o ${realName}.`, type: 'era', teamIds: [to] });
  });
  return { season: s, events };
};

/* ------------------------------------------------------------------ */
/* Expansion                                                            */
/* ------------------------------------------------------------------ */

/**
 * The franchises the next real season has and the save doesn't, ready to play:
 * a coach, a CPU staff, their own picks from the next draft on (this summer's
 * board was set by last season's records, which they don't have). The roster
 * starts empty: the real expansion draft and signings arrive through the moves
 * and realArrivals, and CPU free agency fills it to the minimum.
 */
export const expansionTeams = (
  season: Pick<SeasonState, 'era' | 'eraChainIndex'>,
  teams: Team[],
  coaches: { [id: string]: Coach },
  firstDraft: number,
): { teams: Team[]; coaches: { [id: string]: Coach }; events: Event[] } => {
  const next = nextRealEra(season);
  if (!next) return { teams: [], coaches: {}, events: [] };
  const have = new Set(teams.map((t) => t.id));
  const usedIds = new Set(Object.keys(coaches));
  const outCoaches: { [id: string]: Coach } = {};
  const events: Event[] = [];
  const out = next.teams.filter((t) => !have.has(t.id)).map((raw) => {
    // A new franchise starts near the bottom, and so does the coach it can hire.
    const coach = generateCoach(usedIds, 0.25, raw.coach);
    outCoaches[coach.id] = coach;
    const base: Team = {
      ...raw,
      roster: [],
      starters: undefined,
      coachId: coach.id,
      wins: 0, losses: 0, momentum: 0,
      stats: { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
      performanceHistory: [{ gamesPlayed: 0, wins: 0 }],
    };
    const [withPicks] = initialPickAssets([base], firstDraft);
    events.push({ message: `🆕 EXPANSÃO: o ${raw.name} entra na liga nesta temporada.`, type: 'era', teamIds: [raw.id] });
    return { ...withPicks, staff: generateTeamStaff(withPicks) };
  });
  return { teams: out, coaches: outCoaches, events };
};

/* ------------------------------------------------------------------ */
/* Who really leaves                                                    */
/* ------------------------------------------------------------------ */

/** Real players who play in the next real season: the summer's procedural retirement leaves them alone. */
export const realStayers = (season: Pick<SeasonState, 'era' | 'eraChainIndex'>): Set<string> => {
  const next = nextRealEra(season);
  return next ? new Set(Object.keys(next.players)) : new Set();
};

/**
 * Real players still active in the save who are not in the next real season:
 * they left the league (retired, went abroad, or sat out a year — a comeback
 * brings them back through realArrivals). Flagged retired like any retirement,
 * so their records stay.
 */
export const realDepartures = (
  season: Pick<SeasonState, 'era' | 'eraChainIndex'>,
  teams: Team[],
  players: PlayerMap,
  seasonNumber: number,
  keep: Set<string>,
): { teams: Team[]; players: PlayerMap; left: { playerId: string; name: string; age: number; ovr: number; teamId?: string }[] } => {
  const next = nextRealEra(season);
  if (!next) return { teams, players, left: [] };
  const real = realIds();
  const teamOf = new Map<string, string>();
  teams.forEach((t) => t.roster.forEach((id) => teamOf.set(id, t.id)));
  const out: PlayerMap = { ...players };
  const left: { playerId: string; name: string; age: number; ovr: number; teamId?: string }[] = [];
  for (const id in players) {
    const p = players[id];
    if (p.retired || p.prospect || keep.has(id) || !real.has(id) || next.players[id]) continue;
    const teamId = teamOf.get(id);
    out[id] = { ...p, retired: true, contractYears: 0, nextSalary: undefined, birdTeamId: undefined, retiredFrom: { teamId, season: seasonNumber } };
    left.push({ playerId: id, name: p.name, age: p.age, ovr: p.ovr, teamId });
  }
  const gone = new Set(left.map((l) => l.playerId));
  const outTeams = teams.map((t) => {
    if (!t.roster.some((id) => gone.has(id))) return t;
    const starters = t.starters ? Object.fromEntries(Object.entries(t.starters).filter(([, pid]) => !gone.has(pid))) : t.starters;
    return { ...t, roster: t.roster.filter((id) => !gone.has(id)), starters };
  });
  left.sort((a, b) => b.ovr - a.ovr);
  return { teams: outTeams, players: out, left };
};

/* ------------------------------------------------------------------ */
/* Who really arrives                                                   */
/* ------------------------------------------------------------------ */

// What the next real season says about a player's game. His career, awards
// and history in the save stay his; the rating is the real one of that year.
const RATING_FIELDS = ['ovr', 'off', 'def', 'attributes', 'potential', 'usage', 'ts', 'age', 'pos', 'positions'] as const;

/**
 * Players on a real roster next season who are on no roster in the save:
 * comebacks (Jordan, 1995), signings from abroad or of undrafted players, and
 * the save's own free agents whom a real team signed. Each goes to his real
 * team when it is a CPU team with room. One whose real team is the user's
 * goes to the market with the user's Bird rights (the CPU can't sign him
 * before opening night). Rookies of this summer's real draft come through the
 * draft instead (`draftIds`).
 */
export const realArrivals = (
  season: Pick<SeasonState, 'era' | 'eraChainIndex'>,
  teams: Team[],
  players: PlayerMap,
  userTeamId: string,
  draftIds: Set<string>,
): { teams: Team[]; players: PlayerMap; events: Event[]; arrived: { playerId: string; name: string; toTeamId?: string; comeback: boolean }[] } => {
  const next = nextRealEra(season);
  if (!next) return { teams, players, events: [], arrived: [] };
  const rostered = rosterIds(teams);
  const outPlayers: PlayerMap = { ...players };
  const outTeams = teams.map((t) => ({ ...t, roster: [...t.roster] }));
  const events: Event[] = [];
  const arrived: { playerId: string; name: string; toTeamId?: string; comeback: boolean }[] = [];
  next.teams.forEach((realTeam) => {
    realTeam.roster.forEach((id) => {
      if (rostered.has(id) || draftIds.has(id)) return;
      const real = next.players[id];
      if (!real) return;
      const mine = players[id];
      const comeback = !!mine?.retired;
      const rating = Object.fromEntries(RATING_FIELDS.map((k) => [k, real[k]]));
      const base: Player = mine
        ? { ...mine, ...rating, retired: undefined, retiredFrom: undefined, prospect: undefined }
        : { ...real };
      const team = outTeams.find((t) => t.id === realTeam.id);
      if (team && team.id !== userTeamId && team.roster.length < MAX_ROSTER_SIZE) {
        outPlayers[id] = { ...base, salary: real.salary, contractYears: Math.max(1, real.contractYears ?? 1), birdTeamId: undefined, nextSalary: undefined };
        team.roster.push(id);
        arrived.push({ playerId: id, name: base.name, toTeamId: team.id, comeback });
        if (comeback || base.ovr >= 80) {
          events.push({ message: comeback ? `🔙 VOLTOU: ${base.name} está de volta à NBA, pelo ${team.name}.` : `🏀 CHEGOU: ${base.name} assina com o ${team.name}.`, type: 'trade', teamIds: [team.id] });
        }
      } else {
        const onMarket: Player = { ...base, contractYears: 0, nextSalary: undefined, birdTeamId: team?.id === userTeamId ? userTeamId : undefined };
        outPlayers[id] = { ...onMarket, salary: askingSalary(onMarket) };
        arrived.push({ playerId: id, name: base.name, comeback });
        if (team?.id === userTeamId) {
          events.push({
            message: `${comeback ? '🔙' : '🏀'} ${base.name} ${comeback ? 'voltou à NBA' : 'chegou à liga'} e, na história real, jogou pelo seu time nesta temporada. Ele está no mercado, e você tem a preferência até a abertura.`,
            type: 'trade', teamIds: [userTeamId],
          });
        }
      }
      rostered.add(id);
    });
  });
  const touched = new Set(arrived.map((a) => a.toTeamId).filter(Boolean));
  const sorted = outTeams.map((t) => (touched.has(t.id)
    ? { ...t, roster: [...t.roster].sort((a, b) => (outPlayers[b]?.ovr ?? 0) - (outPlayers[a]?.ovr ?? 0)) }
    : teams.find((x) => x.id === t.id) ?? t));
  return { teams: sorted, players: outPlayers, events, arrived };
};
