// Do coaches matter, or are they decoration? A controlled experiment.
//
// Every other team gets the same neutral coach (75/75/75, scheme matching the
// team) so the only thing that varies is ONE team's bench boss. That team is
// played through full seasons under three hires -- elite (95, his scheme),
// neutral (75) and poor (58, the opposite scheme) -- and the win difference is
// read off. The same idea isolates player development: identical young rosters
// progressed for three offseasons under a 95 vs a 58 development coach.
//
// Also reports what the league's actual opening-night staffs (initCoaches)
// are worth, in points per game and in wins, so "how much does my coach
// matter" has a number next to it.
//
// Run: bash scratchpad/run.sh check_coaches [seasonsPerArm]
import { teamsData, playersData } from '../constants';
import type { Team, Player, SeasonState, Coach } from '../types';
import { simulationEngine } from '../services/simulationService';
import { generateSchedule } from '../services/scheduleService';
import { simulateOneDay } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches, coachOffenseMod, coachDefenseMod, developmentMultiplier } from '../services/coachService';
import { initialPickAssets } from '../services/draftService';

declare const process: { argv: string[] };
const N = Number(process.argv[2] || 24);

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const se = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1) / a.length); };
const f = (v: number, d = 1) => v.toFixed(d);

const OPPOSITE: Record<NonNullable<Team['style']>, NonNullable<Team['style']>> = {
  'Pace and Space': 'Defense First', 'Run and Gun': 'Grit and Grind',
  'Grit and Grind': 'Run and Gun', 'Defense First': 'Pace and Space', 'Balanced': 'Run and Gun',
};
const coach = (id: string, r: number, style: Coach['style']): Coach =>
  ({ id, name: id, age: 50, offense: r, defense: r, development: r, style });

const baseTeams = (): Team[] => initialPickAssets(
  (teamsData as Team[]).map(t => ({
    ...t, wins: 0, losses: 0, momentum: 0,
    stats: { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
    performanceHistory: [{ gamesPlayed: 0, wins: 0 }],
  })),
  1,
);

// A season where every team has a neutral coach except `target`, who gets `hire`.
const seasonWith = (targetId: string, hire: (t: Team) => Coach): SeasonState => {
  const coaches: Record<string, Coach> = {};
  const teams = baseTeams().map(t => {
    const c = t.id === targetId ? hire(t) : coach(`neutral_${t.id}`, 75, t.style ?? 'Balanced');
    coaches[c.id] = c;
    return { ...t, coachId: c.id };
  });
  const players: { [k: string]: Player } = JSON.parse(JSON.stringify(playersData));
  // The user's team skips CPU-only logic (tanking, CPU trades), so the target
  // is never the user: a different, fixed team holds that seat.
  const userId = teams.find(t => t.id !== targetId)!.id;
  return {
    status: 'active', playoffStage: 'none', gamesPlayed: 0, teams, players,
    events: [], playoff: null, awards: null, userTeamId: userId,
    cup: simulationEngine.initCupGroups(teams), gmLegacy: { seasons: 0, titles: 0 }, awardHistory: [],
    owner: buildSeasonOwner(teams.find(t => t.id === userId)!, teams, players),
    schedule: generateSchedule(teams), coaches,
  };
};
const winsOf = (s: SeasonState, id: string) => {
  for (let d = 0; d < 82; d++) s = simulateOneDay(s).season;
  return s.teams.find(t => t.id === id)!.wins || 0;
};

// --- 1. points per game, straight from the formula ------------------------
console.log('=== 1. Efeito por jogo (fórmula, sem ruído) ===');
const sample = baseTeams()[0];
const style = sample.style ?? 'Balanced';
for (const [label, c] of [
  ['Elite 95, esquema certo', coach('e', 95, style)],
  ['Bom 85, esquema certo', coach('g', 85, style)],
  ['Neutro 75', coach('n', 75, style)],
  ['Fraco 58, esquema certo', coach('w', 58, style)],
  ['Elite 95, esquema oposto', coach('m', 95, OPPOSITE[style])],
] as [string, Coach][]) {
  const net = coachOffenseMod(c, sample) + coachDefenseMod(c, sample);
  console.log(`  ${label.padEnd(26)} saldo ${net >= 0 ? '+' : ''}${f(net, 2)} pts/jogo   desenvolvimento x${f(developmentMultiplier(c, sample), 2)}`);
}

// What the opening-night staffs are actually worth across the league.
const spread: number[] = [];
for (let i = 0; i < 40; i++) {
  const { coaches, teams } = initCoaches(baseTeams());
  teams.forEach(t => { const c = coaches[t.coachId!]; spread.push(coachOffenseMod(c, t) + coachDefenseMod(c, t)); });
}
spread.sort((a, b) => a - b);
console.log(`  Técnicos sorteados no início: saldo de ${f(spread[0], 2)} a +${f(spread[spread.length - 1], 2)} pts/jogo (mediana ${f(spread[Math.floor(spread.length / 2)], 2)}), desvio ${f(Math.sqrt(mean(spread.map(v => (v - mean(spread)) ** 2))), 2)}`);

// --- 2. wins, controlled experiment ----------------------------------------
console.log(`\n=== 2. Vitórias por temporada (experimento controlado, ${N} temporadas por braço) ===`);
const TARGETS = ['mia', 'sac', 'chi'];   // mid-table teams: room to move both ways
const arms: { label: string; hire: (t: Team) => Coach }[] = [
  { label: 'Elite 95 (esquema do time)', hire: t => coach('elite', 95, t.style ?? 'Balanced') },
  { label: 'Neutro 75', hire: t => coach('mid', 75, t.style ?? 'Balanced') },
  { label: 'Fraco 58 (esquema oposto)', hire: t => coach('poor', 58, OPPOSITE[t.style ?? 'Balanced']) },
];
const result: Record<string, number[]> = {};
for (const id of TARGETS) {
  for (const arm of arms) {
    for (let i = 0; i < N; i++) (result[arm.label] ??= []).push(winsOf(seasonWith(id, arm.hire), id));
  }
}
const neutral = mean(result['Neutro 75']);
arms.forEach(a => {
  const m = mean(result[a.label]);
  console.log(`  ${a.label.padEnd(28)} ${f(m)} vitórias  (±${f(1.96 * se(result[a.label]))})   vs neutro ${m - neutral >= 0 ? '+' : ''}${f(m - neutral)}`);
});

// --- 3. development --------------------------------------------------------
console.log('\n=== 3. Desenvolvimento de jovens (3 offseasons, mesmo elenco) ===');
const youngGain = (mult: number): number => {
  const gains: number[] = [];
  for (let rep = 0; rep < 40; rep++) {
    let players: { [k: string]: Player } = JSON.parse(JSON.stringify(playersData));
    const young = Object.values(players).filter(p => p.age <= 22).map(p => p.id);
    const start = new Map(young.map(id => [id, players[id].ovr]));
    for (let y = 0; y < 3; y++) {
      // Real minutes so opportunity-gated growth fires; same for both arms.
      Object.values(players).forEach(p => { p.seasonStats = { gp: 70, mpg: 28, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 }; });
      const bonus: { [id: string]: number } = {};
      Object.keys(players).forEach(id => { bonus[id] = mult; });
      players = simulationEngine.runPlayerProgression(players, bonus).updatedPlayers;
    }
    young.forEach(id => gains.push(players[id].ovr - start.get(id)!));
  }
  return mean(gains);
};
const gHi = youngGain(developmentMultiplier(coach('d', 95, 'Balanced'), { style: 'Balanced' } as Team));
const gMid = youngGain(1);
const gLo = youngGain(developmentMultiplier(coach('d', 58, 'Balanced'), { style: 'Balanced' } as Team));
console.log(`  OVR ganho em 3 anos por jogador ≤22:  técnico 95 ${f(gHi, 2)}   neutro ${f(gMid, 2)}   técnico 58 ${f(gLo, 2)}`);
