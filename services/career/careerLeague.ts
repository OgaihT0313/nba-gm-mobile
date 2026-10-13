// The career's league: a normal SeasonState with nobody at the controls
// (userTeamId = NO_TEAM), advanced by the same pure services the GM mode uses
// -- simulateOneDay, the playoff rounds, the three offseason steps. Around
// each step the career reads what happened to its player (his box score, his
// role, a trade) and keeps the coach's trust and his training going.
//
// Everything here is pure and synchronous, so a whole career can run headless
// (scripts/check_career.ts) exactly the way the screens run it.
import type { Player, SeasonState, Team } from '../../types';
import { teamsData, playersData } from '../../constants';
import { simulationEngine, getRotationWeights } from '../simulationService';
import { buildSeasonOwner } from '../ownerService';
import { generateSchedule } from '../scheduleService';
import { simulateOneDay } from '../seasonRunner';
import { initialPickAssets, makeScoutReport } from '../draftService';
import { startOffseason, finishDraft, startSeason } from '../offseasonService';
import { initCoaches } from '../coachService';
import { MAX_ROSTER_SIZE } from '../tradeService';
import { NO_TEAM, type CareerGame, type CareerSeasonLine, type CareerState, type CareerCreation, type CombineResult } from './careerTypes';
import { buildCareerPlayer, rollPotential, STARTING_OVR } from './careerCreate';
import { afterGame, favorFor, roleOf, roleFromMinutes, initialTrust, applyWeeklyTraining, TRAINING_DAYS, capAtCeiling } from './careerTrust';

/* ------------------------------------------------------------------ */
/* Starting a career                                                    */
/* ------------------------------------------------------------------ */

/** The 2025-26 league, nobody's GM -- the season before your draft. */
export const newLeague = (): SeasonState => {
  const teams: Team[] = initialPickAssets(
    teamsData.map((t) => ({
      ...t, wins: 0, losses: 0, momentum: 0,
      stats: { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
      performanceHistory: [{ gamesPlayed: 0, wins: 0 }],
    })),
    1,
  );
  const { coaches, teams: withCoaches } = initCoaches(teams);
  return {
    status: 'active',
    playoffStage: 'none',
    gamesPlayed: 0,
    teams: withCoaches,
    players: { ...playersData },
    events: [],
    playoff: null,
    awards: null,
    userTeamId: NO_TEAM,
    cup: simulationEngine.initCupGroups(withCoaches),
    gmLegacy: { seasons: 0, titles: 0 },
    awardHistory: [],
    // Nobody's owner: required by the type, never read with no user team.
    owner: buildSeasonOwner(withCoaches[0], withCoaches, playersData),
    schedule: generateSchedule(withCoaches),
    coaches,
  };
};

/** A new career: the prospect exists, the league starts the season before his draft. */
export const newCareer = (creation: CareerCreation): CareerState => {
  const { tier, ceiling } = rollPotential();
  const me = buildCareerPlayer(creation, STARTING_OVR, tier);
  return {
    version: 1,
    mode: 'live',
    phase: 'predraft',
    league: newLeague(),
    meId: me.id,
    creation,
    ceiling,
    trust: 50,
    training: 'shooting',
    devPoints: 0,
    spent: {},
    ratingCarry: 0,
    games: [],
    seasons: [],
    lastTrainingDay: 0,
    feed: [],
    // The prospect waits outside the league until the draft.
    prospect: me,
  };
};

/* ------------------------------------------------------------------ */
/* Reading the league                                                   */
/* ------------------------------------------------------------------ */

export const myTeam = (s: CareerState): Team | undefined => s.league.teams.find((t) => t.roster.includes(s.meId));
export const me = (s: CareerState): Player | undefined => s.league.players[s.meId] ?? s.prospect;

/** The season label of the league's current season ("2026-27"). */
const labelForYear = (y: number) => `${y}-${String(y + 1).slice(-2)}`;
export const seasonLabel = (s: CareerState) => labelForYear(2025 + s.league.gmLegacy.seasons);

/** Your team's next game in the schedule, if the season is on. */
export const nextGame = (s: CareerState) => {
  const t = myTeam(s);
  if (!t || s.league.status !== 'active') return null;
  const g = s.league.schedule.find((x) => !x.played && (x.homeTeamId === t.id || x.awayTeamId === t.id));
  if (!g) return null;
  const home = g.homeTeamId === t.id;
  return { day: g.day, home, opponentId: home ? g.awayTeamId : g.homeTeamId };
};

/* ------------------------------------------------------------------ */
/* One day                                                              */
/* ------------------------------------------------------------------ */

const withFavor = (league: SeasonState, meId: string, trust: number): SeasonState => ({
  ...league,
  teams: league.teams.map((t) => {
    const mine = t.roster.includes(meId);
    if (!mine && !t.favor) return t;
    return { ...t, favor: mine ? { [meId]: favorFor(trust) } : undefined };
  }),
});

/**
 * One day of the regular season. The coach's trust goes into tonight's
 * rotation (Team.favor), the day is simulated like any other, and then your
 * game -- if your team played -- is read off the box score.
 */
export const simDay = (s: CareerState): CareerState => {
  if (s.league.status !== 'active') return s;
  const before = s.league;
  const teamBefore = myTeam(s);
  const statsBefore = before.players[s.meId]?.seasonStats;
  const dayIdx = before.gamesPlayed + 1;
  let league = simulateOneDay(withFavor(before, s.meId, s.trust)).season;
  // Nobody is the GM: anything raised for a user team is moot. (None should
  // be -- the user team doesn't exist -- but a queued decision would stop a
  // GM's clock, so make sure.)
  if (league.decisions?.length) league = { ...league, decisions: [] };

  let next: CareerState = { ...s, league };
  const team = myTeam(next);
  const feed = [...s.feed];
  if (teamBefore && team && teamBefore.id !== team.id) {
    feed.unshift({ day: dayIdx, text: `Você foi trocado: agora joga pelo ${team.name}.` });
  }

  const game = teamBefore
    ? league.schedule.find((g) => g.day === dayIdx && (g.homeTeamId === teamBefore.id || g.awayTeamId === teamBefore.id))
    : undefined;
  if (game && game.played) {
    const home = game.homeTeamId === teamBefore!.id;
    const statsAfter = league.players[s.meId]?.seasonStats;
    const line = gameLine(statsBefore, statsAfter);
    const teamScore = (home ? game.homeScore : game.awayScore) ?? 0;
    const oppScore = (home ? game.awayScore : game.homeScore) ?? 0;
    const trust = afterGame(s, line, teamScore > oppScore);
    const g: CareerGame = { day: dayIdx, opponentId: home ? game.awayTeamId : game.homeTeamId, home, teamScore, oppScore, line, trust };
    next = { ...next, trust, games: [...s.games, g] };
    // A role change is news once it has held for ROLE_HOLD games: the
    // rotation's tail flickers night to night, and the feed shouldn't.
    const role = roleOf(next);
    const announced = s.announcedRole ?? role.rank;
    let pendingRole = s.pendingRole;
    let announcedRole = s.announcedRole ?? role.rank;
    if (role.rank === announced || role.label === 'Lesionado') pendingRole = undefined;
    else if (!pendingRole || pendingRole.rank !== role.rank) pendingRole = { rank: role.rank, since: dayIdx };
    else if (dayIdx - pendingRole.since >= ROLE_HOLD) {
      feed.unshift({ day: dayIdx, text: role.rank < announced ? `O técnico te deu mais espaço: ${role.label.toLowerCase()}.` : `Você perdeu espaço: ${role.label.toLowerCase()}.` });
      announcedRole = role.rank;
      pendingRole = undefined;
    }
    next = { ...next, announcedRole, pendingRole };
  }
  if (league.gamesPlayed - next.lastTrainingDay >= TRAINING_DAYS) next = applyWeeklyTraining(next);
  next = { ...next, feed: feed.slice(0, 40) };
  // Your season's regular season is over (the one before your draft has no
  // playoffs of yours to speak of: it stays 'predraft').
  if (league.status !== 'active' && s.phase === 'season') next = { ...next, phase: 'playoffs' };
  return next;
};

/** Tonight's line, from the season averages before and after. */
const gameLine = (before: Player['seasonStats'], after: Player['seasonStats']): CareerGame['line'] => {
  if (!after) return undefined;
  const gp0 = before?.gp ?? 0;
  if (after.gp <= gp0) return undefined;
  const tot = (k: 'mpg' | 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'tpg') =>
    Math.max(0, Math.round(after[k] * after.gp - (before ? before[k] * gp0 : 0)));
  return { min: tot('mpg'), pts: tot('ppg'), reb: tot('rpg'), ast: tot('apg'), stl: tot('spg'), blk: tot('bpg'), tov: tot('tpg') };
};

/** Games a new role has to hold before the feed calls it. */
const ROLE_HOLD = 5;

/** Days until your team's next game is played (or the regular season ends). */
export const simToNextGame = (s: CareerState): CareerState => {
  let next = s;
  const start = s.games.length;
  for (let guard = 0; guard < 10 && next.league.status === 'active' && next.games.length === start; guard++) next = simDay(next);
  return next;
};

/* ------------------------------------------------------------------ */
/* Playoffs and the summer                                              */
/* ------------------------------------------------------------------ */

/** One playoff round (the play-in counts as one). Crowns the champion at the end. */
export const simPlayoffRound = (s: CareerState): CareerState => {
  const lg = s.league;
  if (!lg.playoff || lg.status === 'offseason') return s;
  const { updatedPlayoff, newChampion } = simulationEngine.advancePlayoffRound(lg.playoff, lg.players, lg.coaches, NO_TEAM);
  let league: SeasonState = { ...lg, playoff: updatedPlayoff };
  if (newChampion) {
    league = {
      ...league,
      status: 'offseason',
      awardHistory: [...lg.awardHistory, {
        season: lg.gmLegacy.seasons + 1,
        championId: newChampion.id,
        mvp: lg.awards?.mvp ?? '', dpoy: lg.awards?.dpoy ?? '', roy: lg.awards?.roy ?? '', smoy: lg.awards?.smoy ?? '', mip: lg.awards?.mip,
        finalsMvp: updatedPlayoff.awards.finalsMVP,
      }],
      gmLegacy: { seasons: lg.gmLegacy.seasons + 1, titles: 0 },
    };
  }
  return { ...s, league };
};

/** Every remaining playoff round. */
export const simPlayoffs = (s: CareerState): CareerState => {
  let next = s;
  for (let guard = 0; guard < 12 && next.league.status !== 'offseason'; guard++) next = simPlayoffRound(next);
  return next;
};

/** The finished season, as a line in your career. */
const seasonLineFor = (s: CareerState): CareerSeasonLine | null => {
  const p = s.league.players[s.meId];
  const t = myTeam(s);
  if (!p || !t) return null;
  const st = p.seasonStats;
  const lg = s.league;
  const honors: string[] = [];
  const a = lg.awards;
  if (a?.mvp === s.meId) honors.push('MVP');
  if (a?.roy === s.meId) honors.push('Calouro do Ano');
  if (a?.dpoy === s.meId) honors.push('Defensor do Ano');
  if (a?.smoy === s.meId) honors.push('Sexto Homem');
  if (a?.mip === s.meId) honors.push('Maior Evolução');
  if (a?.allNba?.some((team) => team.includes(s.meId))) honors.push('All-NBA');
  if ([...(lg.allStar?.eastRoster ?? []), ...(lg.allStar?.westRoster ?? [])].includes(s.meId)) honors.push('All-Star');
  const champ = lg.awardHistory[lg.awardHistory.length - 1]?.championId;
  if (champ && champ === t.id) honors.push('Campeão');
  if (lg.playoff?.awards?.finalsMVP === s.meId) honors.push('MVP das Finais');
  return {
    season: s.seasons.length + 1,
    // Crowning the champion already counted this season as done.
    label: labelForYear(2025 + lg.gmLegacy.seasons - 1),
    teamId: t.id,
    age: p.age,
    ovr: p.ovr,
    role: roleFromMinutes(st?.mpg ?? 0, p.ovr),
    gp: st?.gp ?? 0,
    mpg: st?.mpg ?? 0,
    ppg: st?.ppg ?? 0,
    rpg: st?.rpg ?? 0,
    apg: st?.apg ?? 0,
    teamWins: t.wins ?? 0,
    teamLosses: t.losses ?? 0,
    honors,
  };
};

/**
 * Champion crowned to opening night, the way the GM's offseason runs it with
 * nobody's team in it: progression (your training focus counts), retirements,
 * contracts, the draft, free agency. For the season before your draft this is
 * also where you enter the league (draftProspect).
 */
export const runSummer = (s: CareerState, draftProspect?: { player: Player; combine?: CombineResult }): CareerState => {
  if (s.league.status !== 'offseason') return s;
  const line = draftProspect ? null : seasonLineFor(s);
  const mine = s.league.players[s.meId];
  let league = s.league;
  if (mine) league = { ...league, players: { ...league.players, [s.meId]: { ...mine, trainingFocus: trainingFocusOf(s) } } };
  const extra = draftProspect ? (() => {
    const report = makeScoutReport(draftProspect.player);
    // A prospect the teams saw at the combine is a better-known one.
    if (draftProspect.combine) report.uncertainty = Math.max(2, report.uncertainty - 3);
    return { players: { [draftProspect.player.id]: draftProspect.player }, reports: { [draftProspect.player.id]: report } };
  })() : undefined;
  league = startOffseason(league, { extraProspects: extra, focusIds: [s.meId] });

  // Draft night, settled: where you went, or that nobody called your name.
  let draft = s.draft;
  let draftNight = s.draftNight;
  if (draftProspect && league.draft) {
    draftNight = league.draft.picks.map((p) => ({
      pick: p.pick, teamId: p.teamId, playerId: p.playerId,
      name: league.players[p.playerId]?.name ?? '', pos: league.players[p.playerId]?.pos ?? '',
    }));
    const pick = league.draft.picks.find((p) => p.playerId === s.meId);
    draft = pick
      ? { teamId: pick.teamId, pick: pick.pick, label: `${pick.pick}ª escolha` }
      : { teamId: null, pick: null, label: 'Não draftado' };
  }
  // Any prospect left on the board (the class had one more than the picks)
  // goes to free agency like an undrafted player.
  const players = { ...league.players };
  (league.draft?.available ?? []).forEach((id) => {
    if (players[id]?.prospect) players[id] = { ...players[id], prospect: false, contractYears: 0, salary: 1_050_000 };
  });
  league = { ...league, players };

  league = finishDraft(league);
  league = startSeason(league);
  let next: CareerState = { ...s, league, draft, draftNight, phase: draftProspect ? 'draft' : 'season', games: [], lastTrainingDay: 0 };
  if (line) next = { ...next, seasons: [...s.seasons, line] };
  next = ensureOnRoster(next);
  next = capAtCeiling(next);
  if (draftProspect) {
    next = { ...next, prospect: undefined, trust: initialTrust(next.draft?.pick ?? null) };
  }
  const t = myTeam(next);
  if (t) next = { ...next, feed: [{ day: 0, text: draftProspect ? `${next.draft?.label ?? ''}: você é do ${t.name}.` : `Nova temporada no ${t.name}.` }, ...next.feed].slice(0, 40) };
  return next;
};

const trainingFocusOf = (s: CareerState): Player['trainingFocus'] =>
  s.training === 'shooting' || s.training === 'defense' || s.training === 'physical' ? s.training : undefined;

/**
 * Nobody signed you (undrafted, or cut): the team with the most room at the
 * end of its bench gives you a minimum deal. A career doesn't stall on an
 * empty market in this phase -- being released is for later.
 */
const ensureOnRoster = (s: CareerState): CareerState => {
  if (myTeam(s)) return s;
  const p = s.league.players[s.meId];
  if (!p) return s;
  const team = [...s.league.teams]
    .filter((t) => t.roster.length < MAX_ROSTER_SIZE)
    .sort((a, b) => a.roster.length - b.roster.length)[0] ?? s.league.teams[0];
  const league = {
    ...s.league,
    players: { ...s.league.players, [s.meId]: { ...p, prospect: false, salary: 1_150_000, contractYears: 2 } },
    teams: s.league.teams.map((t) => (t.id === team.id ? { ...t, roster: [...t.roster, s.meId] } : t)),
  };
  return { ...s, league, feed: [{ day: 0, text: `Contrato mínimo de dois anos com o ${team.name}. Agora é conquistar espaço.` }, ...s.feed] };
};

export { getRotationWeights };
