// An era save walked through real history, season after season, offseasons
// included: does the league the save walks into look like the real one?
// (services/eraHistoryService.ts: expansion, the Hornets' move, real
// departures and arrivals.)
//
//   - every summer the save has exactly the real season's franchises;
//   - every team opens the season with a legal roster and plays 82 games
//     (fewer in the real short seasons is not modelled: 82 everywhere);
//   - Michael Jordan leaves in 1993 and comes back in 1994-95 (the data's
//     seasons; he really returned in March 1995);
//   - the Hornets become New Orleans in 2002 and Charlotte comes back in 2004;
//   - how much of each real roster the save reproduces, a number to watch.
//
// Run like diagnose_season (see its header), then:
//   node .check/scripts/check_era_chain.js [years] [startEraId] [userTeamId]
import './harness';
import type { Team, Player, SeasonState } from '../types';
import { ERAS, eraById } from '../data/eras';
import { simulationEngine } from '../services/simulationService';
import { generateSchedule } from '../services/scheduleService';
import { simulateOneDay } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches } from '../services/coachService';
import { initStaff } from '../services/staffService';
import { initialPickAssets, makeUserPick, consensusValue } from '../services/draftService';
import { resolveDecision } from '../services/decisionService';
import { startOffseason, finishDraft, startSeason } from '../services/offseasonService';
import { getFreeAgents, signFreeAgentLegality, evaluateSigningInterest, signPlayer } from '../services/freeAgencyService';
import { MIN_ROSTER_SIZE, MAX_ROSTER_SIZE, playerValue } from '../services/tradeService';

declare const process: { argv: string[] };
const YEARS = Number(process.argv[2] || 26);
const START = process.argv[3] || 'showtime-begins-1979-80';
const USER = process.argv[4] || 'chi';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL ${label} ${detail}`); }
};
const pct = (v: number) => `${Math.round(100 * v)}%`;

const buildSeason = (eraId: string): SeasonState => {
  const era = eraById(eraId)!;
  const initial: Team[] = initialPickAssets(era.teams.map(t => ({
    ...t, wins: 0, losses: 0, momentum: 0,
    stats: { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
    performanceHistory: [{ gamesPlayed: 0, wins: 0 }],
  })), 1);
  const { coaches, teams: coached } = initCoaches(initial);
  const teams = initStaff(coached);
  const players: { [k: string]: Player } = JSON.parse(JSON.stringify(era.players));
  return {
    status: 'active', playoffStage: 'none', gamesPlayed: 0, teams, players,
    events: [], playoff: null, awards: null, userTeamId: USER,
    gmLegacy: { seasons: 0, titles: 0 }, awardHistory: [],
    owner: buildSeasonOwner(teams.find(t => t.id === USER)!, teams, players),
    schedule: generateSchedule(teams), coaches,
    era: { id: era.id, label: era.label, seasonLabel: era.seasonLabel },
    eraChainIndex: ERAS.findIndex(e => e.id === era.id),
  };
};

const playRegularSeason = (s: SeasonState): SeasonState => {
  let guard = 0;
  while (s.status === 'active' && guard++ < 400) {
    s = simulateOneDay(s).season;
    while (s.decisions && s.decisions.length) {
      const d = s.decisions[0];
      const enabled = d.options.filter(o => !o.disabled);
      if (!enabled.length) { s = { ...s, decisions: s.decisions.slice(1) }; continue; }
      s = resolveDecision(s, d.id, enabled[Math.floor(Math.random() * enabled.length)].id);
    }
  }
  return s;
};

// Playoffs are not what this measures: the best record is crowned.
const crown = (s: SeasonState): SeasonState => {
  const champ = [...s.teams].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0))[0];
  return {
    ...s, status: 'offseason', playoff: null,
    awardHistory: [...s.awardHistory, { season: s.gmLegacy.seasons + 1, championId: champ.id } as any],
    gmLegacy: { seasons: s.gmLegacy.seasons + 1, titles: s.gmLegacy.titles },
  };
};

// A plain GM summer: the best board pick, his own free agents back when they
// would make the top nine (a comeback with his Bird rights included), the
// market to 13, the worst cut over 18.
const userSummer = (s: SeasonState): SeasonState => {
  let guard = 0;
  while (s.draft && !s.draft.complete && guard++ < 100) {
    const best = [...s.draft.available].sort((a, b) => consensusValue(s.draft!.reports[b]) - consensusValue(s.draft!.reports[a]))[0];
    const r = makeUserPick(s.draft, s.teams, s.players, s.userTeamId, best);
    s = { ...s, draft: r.draft, teams: r.teams, players: r.players };
  }
  s = finishDraft(s);
  const mine = Object.values(s.players).filter(p => p.birdTeamId === s.userTeamId).sort((a, b) => playerValue(b) - playerValue(a));
  for (const p of mine) {
    const me = s.teams.find(t => t.id === s.userTeamId)!;
    const ninth = me.roster.map(id => playerValue(s.players[id])).sort((a, b) => b - a)[8] ?? 0;
    if (playerValue(p) <= ninth || !signFreeAgentLegality(me, p, s.players).legal) continue;
    const signed = signPlayer(me, p, s.players);
    s = { ...s, players: { ...s.players, [p.id]: signed.player }, teams: s.teams.map(t => t.id === me.id ? signed.team : t) };
  }
  for (let i = 0; i < 18; i++) {
    const me = s.teams.find(t => t.id === s.userTeamId)!;
    if (me.roster.length >= 13) break;
    const fa = getFreeAgents(s.teams, s.players).find(p =>
      signFreeAgentLegality(me, p, s.players).legal && evaluateSigningInterest(p, me, s.teams, s.players).willing);
    if (!fa) break;
    const signed = signPlayer(me, fa, s.players);
    s = { ...s, players: { ...s.players, [fa.id]: signed.player }, teams: s.teams.map(t => t.id === me.id ? signed.team : t) };
  }
  const me = s.teams.find(t => t.id === s.userTeamId)!;
  if (me.roster.length > MAX_ROSTER_SIZE) {
    const cut = [...me.roster].sort((a, b) => playerValue(s.players[a]) - playerValue(s.players[b])).slice(0, me.roster.length - MAX_ROSTER_SIZE);
    s = { ...s, teams: s.teams.map(t => t.id === me.id ? { ...t, roster: t.roster.filter(id => !cut.includes(id)) } : t) };
  }
  return startSeason(s);
};

const where = (s: SeasonState, id: string): string => {
  const t = s.teams.find(x => x.roster.includes(id));
  if (t) return t.id;
  const p = s.players[id];
  return !p ? 'fora' : p.retired ? 'aposentado' : 'mercado';
};

console.log(`Save de era a partir de ${START}, usuário ${USER}, ${YEARS} temporadas`);
let s = buildSeason(START);
const jordan: Record<string, string> = {};
for (let y = 0; y < YEARS; y++) {
  const idx = s.eraChainIndex!;
  const real = ERAS[idx];
  const label = real?.seasonLabel ?? `+${y}`;
  // The season the save is playing: does it have the real league?
  if (real) {
    const ids = new Set(s.teams.map(t => t.id));
    const realIds = new Set(real.teams.map(t => t.id));
    const missing = [...realIds].filter(id => !ids.has(id));
    const extra = [...ids].filter(id => !realIds.has(id));
    check(`${label}: times da temporada real`, !missing.length && !extra.length, `faltam [${missing}] sobram [${extra}]`);
    // How much of the real rosters the save has (by player, on the right team).
    const realTeamOf = new Map<string, string>();
    real.teams.forEach(t => t.roster.forEach(id => realTeamOf.set(id, t.id)));
    let same = 0;
    realTeamOf.forEach((teamId, id) => { if (s.teams.find(t => t.id === teamId)?.roster.includes(id)) same++; });
    const inLeague = [...realTeamOf.keys()].filter(id => s.teams.some(t => t.roster.includes(id))).length;
    console.log(`  ${label}: ${s.teams.length} times, ${pct(same / realTeamOf.size)} dos jogadores reais no time real, ${pct(inLeague / realTeamOf.size)} na liga · Jordan: ${where(s, 'michael_jordan')}`);
  }
  jordan[label] = where(s, 'michael_jordan');
  // From the first summer on (the opening rosters are the data's own: Utah
  // starts 1979-80 with 19).
  if (y > 0) s.teams.forEach(t => check(`${label}: elenco do ${t.id}`, t.roster.length >= MIN_ROSTER_SIZE && t.roster.length <= MAX_ROSTER_SIZE, `${t.roster.length} jogadores`));
  s = playRegularSeason(s);
  const games = s.teams.map(t => (t.wins ?? 0) + (t.losses ?? 0));
  check(`${label}: 82 jogos para todos`, games.every(g => g === 82), `${Math.min(...games)}-${Math.max(...games)}`);
  s = crown(s);
  s = startOffseason(s);
  // A comeback whose real team is the user's reaches the market with the
  // user's Bird rights, so the CPU can't sign him first (Jordan, Bulls, 1994-95).
  if (label === '1993-94' && USER === 'chi') {
    const mj = s.players.michael_jordan;
    check('Jordan volta ao mercado com a preferência do Bulls', !!mj && !mj.retired && mj.birdTeamId === 'chi' && !s.teams.some(t => t.roster.includes('michael_jordan')),
      `aposentado=${mj?.retired} preferência=${mj?.birdTeamId} time=${where(s, 'michael_jordan')}`);
  }
  s = userSummer(s);
  check(`${label}: a temporada seguinte abre`, s.status === 'active', s.status);
}

console.log('');
const at = (season: string) => jordan[season];
if (START === 'showtime-begins-1979-80' && YEARS >= 17) {
  check('Jordan joga em 1992-93', at('1992-93') !== 'aposentado' && at('1992-93') !== 'mercado', at('1992-93'));
  check('Jordan sai em 1993-94', at('1993-94') === 'aposentado', at('1993-94'));
  check('Jordan volta em 1994-95', at('1994-95') !== 'aposentado' && at('1994-95') !== 'fora', at('1994-95'));
}
console.log(`Jordan por temporada: ${Object.entries(jordan).filter(([k]) => k >= '1984').map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(failures ? `\n${failures} falhas.` : '\nSem falhas.');
