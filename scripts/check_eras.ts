// League shape for the historical eras: their ratings come from the classic
// pipeline, not the BPM model the default league now uses, and the engine's
// matchup strength is shared -- so this checks that an era season still lands
// in a real NBA shape (win spread, best/worst record) and reports how close it
// gets to that season's real standings where BBRef would have them.
//
// Run: bash scratchpad/run.sh check_eras [seasonsPerEra]
import type { Team, Player, SeasonState } from '../types';
import { ERAS } from '../data/eras';
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

const all: { sd: number; best: number; worst: number }[] = [];
ERAS.filter((_, i) => i % 3 === 0).forEach(era => {
  const sds: number[] = [], best: number[] = [], worst: number[] = [];
  for (let r = 0; r < RUNS; r++) {
    let s = build(era.teams, era.players);
    const days = Math.max(...s.schedule.map(g => g.day));
    for (let d = 0; d < days; d++) s = simulateOneDay(s).season;
    const w = s.teams.map(t => t.wins || 0);
    sds.push(sd(w)); best.push(Math.max(...w)); worst.push(Math.min(...w));
  }
  all.push({ sd: mean(sds), best: mean(best), worst: mean(worst) });
  console.log(`${era.label.padEnd(36)} dp vitórias ${mean(sds).toFixed(1)}   melhor ${mean(best).toFixed(0)}   pior ${mean(worst).toFixed(0)}`);
});
console.log(`\nMédia das eras: dp ${mean(all.map(a => a.sd)).toFixed(1)} (real ~12-14), melhor ${mean(all.map(a => a.best)).toFixed(0)} (real ~60-67), pior ${mean(all.map(a => a.worst)).toFixed(0)} (real ~15-22)`);
