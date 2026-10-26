// League shape for the historical eras -- an era season must land in a real
// NBA shape (win spread, best/worst record) -- and how close it gets to that
// season's real standings: r between simulated and real wins per team, from
// scripts/fixtures/era_records.json (pipeline/export_era_records.py).
//
// Run: npx tsx scripts/check_eras.ts [seasonsPerEra] [all]
import type { Team, Player, SeasonState } from '../types';
import { ERAS } from '../data/eras';
import eraRecords from './fixtures/era_records.json';
import { simulationEngine } from '../services/simulationService';
import { generateSchedule } from '../services/scheduleService';
import { simulateOneDay } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches } from '../services/coachService';
import { initialPickAssets } from '../services/draftService';

declare const process: { argv: string[] };
const RUNS = Number(process.argv[2] || 4);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };

const build = (teamsIn: Team[], playersIn: { [k: string]: Player }): SeasonState => {
  const { coaches, teams } = initCoaches(initialPickAssets(teamsIn.map(t => ({
    ...t, wins: 0, losses: 0, momentum: 0,
    stats: { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
    performanceHistory: [{ gamesPlayed: 0, wins: 0 }],
  })), 1));
  const players = JSON.parse(JSON.stringify(playersIn));
  return {
    status: 'active', playoffStage: 'none', gamesPlayed: 0, teams, players, events: [], playoff: null,
    awards: null, userTeamId: teams[0].id, cup: simulationEngine.initCupGroups(teams),
    gmLegacy: { seasons: 0, titles: 0 }, awardHistory: [],
    owner: buildSeasonOwner(teams[0], teams, players), schedule: generateSchedule(teams), coaches,
  };
};

const REAL = eraRecords as unknown as Record<string, Record<string, number>>;
const pearson = (xs: number[], ys: number[]) => {
  const mx = mean(xs), my = mean(ys);
  let n = 0, dx = 0, dy = 0;
  xs.forEach((x, i) => { n += (x - mx) * (ys[i] - my); dx += (x - mx) ** 2; dy += (ys[i] - my) ** 2; });
  return n / (Math.sqrt(dx * dy) || 1);
};
const all: { sd: number; best: number; worst: number; r?: number }[] = [];
// Every team plays 82, odd leagues included (23-29 teams before 2004): the
// calendar used to assume an even league and handed out 72 to 82 games.
const shortSeasons: string[] = [];
ERAS.filter((_, i) => process.argv[3] === 'all' || i % 3 === 0).forEach(era => {
  const simWins: Record<string, number[]> = {};
  const sds: number[] = [], best: number[] = [], worst: number[] = [];
  for (let r = 0; r < RUNS; r++) {
    let s = build(era.teams, era.players);
    const days = Math.max(...s.schedule.map(g => g.day));
    for (let d = 0; d < days; d++) s = simulateOneDay(s).season;
    const games = s.teams.map(t => (t.wins || 0) + (t.losses || 0));
    if (games.some(g => g !== 82) || s.status !== 'playoffs_idle') {
      shortSeasons.push(`${era.label} (${s.teams.length} times): ${Math.min(...games)}-${Math.max(...games)} jogos, ${s.status}`);
    }
    const w = s.teams.map(t => t.wins || 0);
    s.teams.forEach(t => { (simWins[t.id] ??= []).push(t.wins || 0); });
    sds.push(sd(w)); best.push(Math.max(...w)); worst.push(Math.min(...w));
  }
  const real = REAL[era.id];
  const ids = real ? Object.keys(real).filter(id => simWins[id]) : [];
  const r = ids.length > 10 ? pearson(ids.map(id => mean(simWins[id])), ids.map(id => real[id])) : undefined;
  all.push({ sd: mean(sds), best: mean(best), worst: mean(worst), r });
  console.log(`${era.label.padEnd(36)} dp vitórias ${mean(sds).toFixed(1)}   melhor ${mean(best).toFixed(0)}   pior ${mean(worst).toFixed(0)}`
    + (r !== undefined ? `   r x real ${r.toFixed(2)}` : ''));
});
const rs = all.map(a => a.r).filter((x): x is number => x !== undefined);
if (rs.length) console.log(`
Vitórias simuladas x reais: r médio ${mean(rs).toFixed(2)} (pior ${Math.min(...rs).toFixed(2)}) em ${rs.length} eras`);
console.log(`\nMédia das eras: dp ${mean(all.map(a => a.sd)).toFixed(1)} (real ~12-14), melhor ${mean(all.map(a => a.best)).toFixed(0)} (real ~60-67), pior ${mean(all.map(a => a.worst)).toFixed(0)} (real ~15-22)`);
if (shortSeasons.length) {
  console.log(`\n  FAIL temporadas sem 82 jogos para todos:\n    ${shortSeasons.join('\n    ')}`);
  (globalThis as unknown as { process: { exitCode: number } }).process.exitCode = 1;
} else {
  console.log('\nTodos os times jogaram 82 em todas as eras simuladas.');
}
