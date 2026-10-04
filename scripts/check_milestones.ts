// Exercises career milestones and the headlines on the shipped rosters (with
// the real careers seeded by pipeline/sync_careers.py).
//
// What it gates:
//   · the careers are actually seeded -- without them every milestone is fake;
//   · a mark is reached ONCE (no player crosses 30,000 twice), lifts the
//     player's morale that night, and only for careers that count;
//   · a veteran chasing a big mark is less likely to retire, and the chase is
//     judged on banked totals in the offseason (no double-counted season);
//   · the front page always has something to say once the season is going,
//     never more than MAX_HEADLINES, and every headline has a title.
//
// Not wired into the app bundle. To run (see check_decisions.ts for tsc):
//   node <outDir>/scripts/check_milestones.js [seasons]
import { teamsData, playersData } from '../constants';
import type { Team, Player, SeasonState } from '../types';
import { simulationEngine } from '../services/simulationService';
import { generateSchedule } from '../services/scheduleService';
import { simulateOneDay } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches } from '../services/coachService';
import { initialPickAssets } from '../services/draftService';
import { resolveDecision } from '../services/decisionService';
import { liveTotal, chasingMilestone, countsMilestones, MILESTONE_MORALE, CHASE_RETIREMENT_FACTOR } from '../services/milestoneService';
import { retirementChance } from '../services/retirementService';
import { headlines, MAX_HEADLINES } from '../services/headlineService';

declare const process: { argv: string[] };
const RUNS = Number(process.argv[2] || 4);

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL ${label} ${detail}`); }
};
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

const buildSeason = (userTeamId: string): SeasonState => {
  const initialTeams: Team[] = initialPickAssets((teamsData as Team[]).map(t => ({
    ...t, wins: 0, losses: 0, momentum: 0,
    stats: { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
    performanceHistory: [{ gamesPlayed: 0, wins: 0 }],
  })), 1);
  const { coaches, teams } = initCoaches(initialTeams);
  const players: { [k: string]: Player } = JSON.parse(JSON.stringify(playersData));
  return {
    status: 'active', playoffStage: 'none', gamesPlayed: 0, teams, players,
    events: [], playoff: null, awards: null, userTeamId,
    cup: simulationEngine.initCupGroups(teams), gmLegacy: { seasons: 0, titles: 0 }, awardHistory: [],
    owner: buildSeasonOwner(teams.find(t => t.id === userTeamId)!, teams, players),
    schedule: generateSchedule(teams), coaches,
  };
};

// --- the data ---------------------------------------------------------------
const all = Object.values(playersData as unknown as { [k: string]: Player });
const seeded = all.filter(p => p.career?.seeded);
console.log(`Carreiras reais carregadas: ${seeded.length}/${all.length}`);
check('as carreiras reais estao carregadas', seeded.length >= all.length * 0.9, `${seeded.length}/${all.length}`);
const lebron = all.find(p => p.name === 'LeBron James');
check('LeBron tem a carreira real', !!lebron && (lebron.career?.pts ?? 0) > 40000, `${lebron?.career?.pts}`);

// --- unit checks --------------------------------------------------------------
{
  const vet = {
    id: 'v', name: 'Vet', age: 37, ovr: 80, salary: 1, contractYears: 1,
    career: { seeded: true, pts: 29500, gp: 1100, reb: 0, ast: 0, stl: 0, blk: 0, seasons: 15, peakOvr: 90,
      titles: 0, mvp: 0, dpoy: 0, roy: 0, smoy: 0, mip: 0, allStar: 0, allNba: 0, finalsMvp: 0 },
    seasonStats: { gp: 60, mpg: 30, ppg: 18, rpg: 4, apg: 4, spg: 1, bpg: 0.3, tpg: 2 },
  } as unknown as Player;
  // In the offseason the season is already banked: 29,500 is the total, and
  // 500 points away from 30,000 at 18 a game is well within a season.
  check('veterano perto de 30 mil esta perseguindo o marco', chasingMilestone(vet)?.mark === 30000, JSON.stringify(chasingMilestone(vet)));
  check('em temporada, o total soma o ano em curso', liveTotal(vet, 'pts') === 29500 + 18 * 60, `${liveTotal(vet, 'pts')}`);
  check('na offseason, nao conta o ano duas vezes', liveTotal(vet, 'pts', true) === 29500, `${liveTotal(vet, 'pts', true)}`);
  const far = { ...vet, career: { ...vet.career!, pts: 21000 } } as Player;
  const unseeded = { ...vet, career: { ...vet.career!, seeded: false } } as Player;
  check('perseguir o marco adia a aposentadoria',
    Math.abs(retirementChance(vet, true) - retirementChance(far, true) * CHASE_RETIREMENT_FACTOR) < 1e-9,
    `${retirementChance(vet, true)} vs ${retirementChance(far, true)}`);
  check('carreira sem semente nao conta marcos', !countsMilestones(unseeded) && !chasingMilestone(unseeded), '');
}

// --- seasons ------------------------------------------------------------------
const perSeason: number[] = [];
const userPerSeason: number[] = [];
const frontEmptyAfter15: number[] = [];
const kickers: Record<string, number> = {};
console.log(`Simulando ${RUNS} temporadas...`);
for (let r = 0; r < RUNS; r++) {
  let s = buildSeason((teamsData as Team[])[(r * 7) % teamsData.length].id);
  const seen = new Set<string>();
  let empty = 0;
  while (s.gamesPlayed < 82) {
    const before = s;
    s = simulateOneDay(s).season;
    const fresh = (s.milestones ?? []).filter(m => m.day === s.gamesPlayed);
    fresh.forEach(m => {
      const key = `${m.playerId}:${m.stat}:${m.value}`;
      check('cada marco acontece uma vez', !seen.has(key), key);
      seen.add(key);
      const p0 = before.players[m.playerId], p1 = s.players[m.playerId];
      check('o marco conta so para carreira valida', countsMilestones(p1), m.name);
      // The lift lands on top of whatever the day's morale update did; it
      // must at least be there.
      check('o marco levanta o animo', (p1.morale ?? 70) >= Math.min(100, (p0.morale ?? 70) + MILESTONE_MORALE) - 15, `${m.name} ${p0.morale} -> ${p1.morale}`);
    });
    const front = headlines(s);
    check('no maximo MAX_HEADLINES manchetes', front.length <= MAX_HEADLINES, `${front.length}`);
    front.forEach(h => { check('manchete tem titulo', !!h.title, h.id); kickers[h.kicker] = (kickers[h.kicker] || 0) + 1; });
    if (s.gamesPlayed > 15 && !front.length) empty++;
    while (s.decisions && s.decisions.length) {
      const d = s.decisions[0];
      const enabled = d.options.filter(o => !o.disabled);
      s = resolveDecision(s, d.id, enabled[0].id);
    }
  }
  perSeason.push(seen.size);
  userPerSeason.push((s.milestones ?? []).filter(m => m.teamId === s.userTeamId).length);
  frontEmptyAfter15.push(empty);
  console.log(`  temporada ${r + 1}/${RUNS}: ${seen.size} marcos`);
}

console.log('\n================ MARCOS E MANCHETES ================\n');
console.log(`Marcos atingidos por temporada na liga: ${mean(perSeason).toFixed(1)}  (no seu time: ${mean(userPerSeason).toFixed(1)})`);
console.log(`Dias sem manchete depois do jogo 15: ${mean(frontEmptyAfter15).toFixed(1)}`);
console.log(`Manchetes por tipo (dias exibidos): ${Object.entries(kickers).map(([k, v]) => `${k} ${(v / RUNS).toFixed(0)}`).join('  |  ')}`);
check('marcos acontecem', mean(perSeason) >= 10, `${mean(perSeason).toFixed(1)}`);
check('a primeira pagina quase nunca fica vazia', mean(frontEmptyAfter15) <= 5, `${mean(frontEmptyAfter15).toFixed(1)}`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
