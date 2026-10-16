// Does the staff matter, and does it leave the league where it was?
// (PLANO-STAFF.md, phase 1: preparador + olheiro.)
//
//   1. The league's staffs: opening night (initStaff) and after ten offseasons
//      of CPU refills (staffOffseason). The rating average must stay ~3, the
//      rule that keeps every calibrated number in place.
//   2. Preparador, controlled: one team with a 5, a 3 or a 1 trainer, every
//      other team neutral (no staff = 3), full seasons. Reads games lost to
//      injury. Target: 25-35% fewer with a 5 than with a 1.
//   3. Olheiro, controlled: the same draft classes scouted by a 5 and a 1,
//      spending the whole budget top-down the board. Reads the projection
//      error on the top 15 of the board. Target: ~40% lower with a 5.
//
// Run like diagnose_season (see its header), then:
//   node .check/scripts/check_staff.js [seasonsPerArm]
import { teamsData, playersData } from '../constants';
import type { Team, Player, SeasonState, DraftState } from '../types';
import { simulationEngine } from '../services/simulationService';
import { generateSchedule } from '../services/scheduleService';
import { simulateOneDay } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches } from '../services/coachService';
import { initialPickAssets, generateDraftClass, scoutProspect, consensusValue } from '../services/draftService';
import {
  initStaff, staffOffseason, staffPayroll, staffBudget, makeMember, scoutBudgetFor, STAFF_ROLES,
} from '../services/staffService';

declare const process: { argv: string[] };
const N = Number(process.argv[2] || 12);
// Which sections to run, e.g. "13" skips the slow preparador seasons.
const ONLY = process.argv[3] || '123';

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const se = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1) / a.length); };
const f = (v: number, d = 1) => v.toFixed(d);

const baseTeams = (): Team[] => initialPickAssets(
  (teamsData as Team[]).map(t => ({
    ...t, wins: 0, losses: 0, momentum: 0,
    stats: { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
    performanceHistory: [{ gamesPlayed: 0, wins: 0 }],
  })),
  1,
);

// --- 1. the league's staffs ----------------------------------------------------
if (ONLY.includes('1')) {
console.log('=== 1. Staff da liga ===');
const ratingsOf = (teams: Team[]) => teams.flatMap(t => STAFF_ROLES.map(r => t.staff?.[r]?.rating ?? 3));
const dist = (rs: number[]) => [1, 2, 3, 4, 5].map(k => `${k}:${f((100 * rs.filter(r => r === k).length) / rs.length, 0)}%`).join(' ');
{
  const open: number[] = [];
  const later: number[] = [];
  let over = 0;
  let checked = 0;
  for (let i = 0; i < 40; i++) {
    let teams = initStaff(baseTeams());
    open.push(...ratingsOf(teams));
    // Nobody is the user: every team refills like the CPU does.
    for (let y = 0; y < 10; y++) teams = staffOffseason(teams, '__none__').teams;
    later.push(...ratingsOf(teams));
    teams.forEach(t => { checked++; if (staffPayroll(t) > staffBudget(t)) over++; });
  }
  console.log(`  Início:        média ${f(mean(open), 2)}   ${dist(open)}`);
  console.log(`  Após 10 anos:  média ${f(mean(later), 2)}   ${dist(later)}`);
  console.log(`  Times acima do orçamento após 10 anos: ${over} de ${checked}`);
}

}

// --- 2. preparador ---------------------------------------------------------------
if (ONLY.includes('2')) {
console.log(`\n=== 2. Preparador físico (experimento controlado, ${N} temporadas por braço) ===`);
const seasonWithTrainer = (targetId: string, rating: number | null): SeasonState => {
  const { coaches, teams: coached } = initCoaches(baseTeams());
  const teams = coached.map(t => (t.id === targetId && rating !== null
    ? { ...t, staff: { trainer: makeMember('trainer', rating) } }
    : t));
  const players: { [k: string]: Player } = JSON.parse(JSON.stringify(playersData));
  const userId = teams.find(t => t.id !== targetId)!.id;
  return {
    status: 'active', playoffStage: 'none', gamesPlayed: 0, teams, players,
    events: [], playoff: null, awards: null, userTeamId: userId,
    cup: simulationEngine.initCupGroups(teams), gmLegacy: { seasons: 0, titles: 0 }, awardHistory: [],
    owner: buildSeasonOwner(teams.find(t => t.id === userId)!, teams, players),
    schedule: generateSchedule(teams), coaches,
  };
};
// Player-games the target's top eight (by OVR at the start) spend injured.
const gamesLost = (s: SeasonState, id: string): { lost: number; injuries: number } => {
  const top8 = [...s.teams.find(t => t.id === id)!.roster].sort((a, b) => s.players[b].ovr - s.players[a].ovr).slice(0, 8);
  let lost = 0;
  let injuries = 0;
  let prev = new Set<string>();
  for (let d = 0; d < 82; d++) {
    s = simulateOneDay(s).season;
    const abs = s.teams.find(t => t.id === id)!.playerAbsences ?? {};
    const now = new Set(top8.filter(p => abs[p]?.reason === 'injury'));
    now.forEach(p => { if (!prev.has(p)) injuries++; });
    lost += now.size;
    prev = now;
  }
  return { lost, injuries };
};
{
  const TARGETS = ['mia', 'sac', 'chi'];
  const arms: [string, number | null][] = [['Nota 5', 5], ['Nota 3', 3], ['Sem staff (neutro)', null], ['Nota 1', 1]];
  const res: Record<string, { lost: number[]; inj: number[] }> = {};
  for (const id of TARGETS) for (const [label, r] of arms) for (let i = 0; i < N; i++) {
    const g = gamesLost(seasonWithTrainer(id, r), id);
    (res[label] ??= { lost: [], inj: [] }).lost.push(g.lost);
    res[label].inj.push(g.injuries);
  }
  arms.forEach(([label]) => {
    console.log(`  ${label.padEnd(20)} ${f(mean(res[label].lost))} jogos perdidos pelo top 8 (±${f(1.96 * se(res[label].lost))})   ${f(mean(res[label].inj))} lesões`);
  });
  const hi = mean(res['Nota 5'].lost);
  const lo = mean(res['Nota 1'].lost);
  console.log(`  Nota 5 contra nota 1: ${f((100 * (lo - hi)) / lo)}% menos jogos perdidos (meta 25-35%)`);
}

}

// --- 3. olheiro --------------------------------------------------------------------
if (ONLY.includes('3')) {
console.log('\n=== 3. Olheiro-chefe (mesmas classes, orçamento gasto de cima para baixo) ===');
{
  const errs: Record<number, number[]> = { 1: [], 3: [], 5: [] };
  const potHits: Record<number, number[]> = { 1: [], 3: [], 5: [] };
  for (let rep = 0; rep < 300; rep++) {
    const { prospects, reports, ids } = generateDraftClass(30);
    for (const rating of [1, 3, 5]) {
      let draft: DraftState = {
        order: [], picks: [], available: [...ids], complete: false,
        reports: JSON.parse(JSON.stringify(reports)), scoutBudget: scoutBudgetFor(rating), scoutRating: rating,
      };
      // Spend every report on the best-looking prospect still unsolved.
      while (draft.scoutBudget > 0) {
        const target = [...ids]
          .filter(id => !draft.reports[id].potentialKnown)
          .sort((a, b) => consensusValue(draft.reports[b]) - consensusValue(draft.reports[a]))[0];
        if (!target) break;
        const next = scoutProspect(draft, prospects, target);
        if (!next) break;
        draft = next;
      }
      const top = [...ids].sort((a, b) => consensusValue(draft.reports[b]) - consensusValue(draft.reports[a])).slice(0, 15);
      errs[rating].push(mean(top.map(id => Math.abs(draft.reports[id].estimate - prospects[id].ovr))));
      potHits[rating].push(mean(top.map(id => (draft.reports[id].potentialGuess === prospects[id].potential ? 1 : 0))));
    }
  }
  [5, 3, 1].forEach(r => console.log(`  Nota ${r}: ${scoutBudgetFor(r)} avaliações, erro médio no top 15 ${f(mean(errs[r]), 2)} OVR, potencial certo ${f(100 * mean(potHits[r]), 0)}%`));
  console.log(`  Nota 5 contra nota 1: erro ${f((100 * (mean(errs[1]) - mean(errs[5]))) / mean(errs[1]))}% menor (meta ~40%)`);
}
}
