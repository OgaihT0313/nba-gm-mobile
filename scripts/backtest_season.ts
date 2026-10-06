// Backtest: plays the default league (the real 2025-26 rosters) through the
// season engine many times and holds it up against what really happened in
// 2025-26 — team records and every player's real per-game line, exported from
// Basketball-Reference by nba-gm-simulator/pipeline/export_reality.py.
//
// diagnose_season.ts asks "does this look like an NBA season?". This asks the
// sharper question the ratings model has to answer: "given these rosters, does
// it produce THE 2025-26 season?" Rosters are the end-of-season ones, so
// mid-season trades blur the team side a little; nothing here asserts, it
// reports the numbers the calibration is read off.
//
// Run: bash scratchpad/run.sh backtest_season [runs]
import { teamsData, playersData } from '../constants';
import type { Team, Player, SeasonState } from '../types';
import { simulationEngine, getRotationWeights } from '../services/simulationService';
import { generateSchedule } from '../services/scheduleService';
import { simulateOneDay } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches } from '../services/coachService';
import { initialPickAssets } from '../services/draftService';
import reality from './fixtures/reality_2025_26.json';

declare const process: { argv: string[] };
const RUNS = Number(process.argv[2] || 10);

type RealTeam = { w: number; l: number; mov: number };
type RealPlayer = { gp: number; mpg: number; ppg: number; rpg: number; apg: number; spg: number; bpg: number; bpm: number; vorp: number; mp: number; awards: string };
const REAL_TEAMS = reality.teams as unknown as Record<string, RealTeam>;
const REAL_PLAYERS = reality.players as unknown as Record<string, RealPlayer>;

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const f = (v: number, d = 1) => v.toFixed(d);
const pearson = (xs: number[], ys: number[]) => {
  const mx = mean(xs), my = mean(ys);
  let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) { n += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return n / (Math.sqrt(dx * dy) || 1);
};
const ranks = (a: number[]) => { const idx = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); idx.forEach(([, i], k) => { r[i] = k; }); return r as number[]; };
const spearman = (xs: number[], ys: number[]) => pearson(ranks(xs), ranks(ys));

const buildSeason = (userTeamId: string): SeasonState => {
  const initialTeams: Team[] = initialPickAssets(
    (teamsData as Team[]).map(t => ({
      ...t, wins: 0, losses: 0, momentum: 0,
      stats: { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
      performanceHistory: [{ gamesPlayed: 0, wins: 0 }],
    })),
    1,
  );
  const { coaches, teams } = initCoaches(initialTeams);
  const players: { [k: string]: Player } = JSON.parse(JSON.stringify(playersData));
  const userTeam = teams.find(t => t.id === userTeamId)!;
  return {
    status: 'active', playoffStage: 'none', gamesPlayed: 0, teams,
    players, events: [], playoff: null, awards: null, userTeamId,
    cup: simulationEngine.initCupGroups(teams),
    gmLegacy: { seasons: 0, titles: 0 }, awardHistory: [],
    owner: buildSeasonOwner(userTeam, teams, players),
    schedule: generateSchedule(teams), coaches,
  };
};

// Preseason talent: the engine's own minutes-weighted rotation OVR.
const talentOf = (t: Team, players: { [k: string]: Player }) => {
  const { ids, weights } = getRotationWeights(t, players);
  let num = 0, den = 0;
  ids.forEach((id, i) => { const p = players[id]; if (!p) return; num += p.ovr * weights[i]; den += weights[i]; });
  return den ? num / den : 0;
};

const teamWins: Record<string, number[]> = {};
const talent: Record<string, number> = {};
const STATS = ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'mpg'] as const;
const simLines: Record<string, Record<string, number[]>> = {};

console.log(`Backtest 2025-26: ${RUNS} temporadas com os elencos reais...`);
for (let run = 0; run < RUNS; run++) {
  let season = buildSeason((teamsData as Team[])[run % teamsData.length].id);
  if (run === 0) season.teams.forEach(t => { talent[t.id] = talentOf(t, season.players); });
  for (let day = 0; day < 82; day++) season = simulateOneDay(season).season;
  season.teams.forEach(t => { (teamWins[t.id] ??= []).push(t.wins || 0); });
  Object.values(season.players).forEach(p => {
    const s = p.seasonStats;
    if (!s || s.gp < 20) return;
    const line = (simLines[p.id] ??= {});
    STATS.forEach(k => { (line[k] ??= []).push(s[k] as number); });
  });
}

// --- teams -----------------------------------------------------------------
const ids = Object.keys(REAL_TEAMS).filter(id => teamWins[id]);
const simW = ids.map(id => mean(teamWins[id]));
const realW = ids.map(id => REAL_TEAMS[id].w);
const tal = ids.map(id => talent[id]);
const err = ids.map((_, i) => simW[i] - realW[i]);
console.log('\n=== TIMES ===');
console.log(`Vitórias simuladas x reais      r = ${f(pearson(simW, realW), 3)}   erro médio abs = ${f(mean(err.map(Math.abs)))}   RMSE = ${f(Math.sqrt(mean(err.map(e => e * e))))}`);
console.log(`Força do elenco (OVR) x reais   r = ${f(pearson(tal, realW), 3)}   (sem o ruído da simulação)`);
const order = ids.map((id, i) => ({ id, sim: simW[i], real: realW[i], d: err[i] })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
console.log('Maiores erros:', order.slice(0, 8).map(o => `${o.id.toUpperCase()} ${f(o.sim, 0)} vs ${o.real}`).join('  |  '));

// --- players ---------------------------------------------------------------
console.log('\n=== JOGADORES (≥20 jogos nos dois lados) ===');
const both = Object.keys(simLines).filter(id => REAL_PLAYERS[id] && REAL_PLAYERS[id].gp >= 20);
STATS.forEach(k => {
  const sim = both.map(id => mean(simLines[id][k]));
  const real = both.map(id => (REAL_PLAYERS[id] as unknown as Record<string, number>)[k]);
  const bias = mean(sim.map((v, i) => v - real[i]));
  const mae = mean(sim.map((v, i) => Math.abs(v - real[i])));
  const top = (arr: number[]) => [...arr].sort((a, b) => b - a)[0];
  console.log(`${k.toUpperCase().padEnd(4)} r = ${f(pearson(sim, real), 3)}  viés = ${bias >= 0 ? '+' : ''}${f(bias, 2)}  erro abs = ${f(mae, 2)}   líder sim ${f(top(sim))} / real ${f(top(real))}`);
});

const name = (id: string) => (playersData as Record<string, Player>)[id]?.name ?? id;
const topBy = (k: 'ppg') => {
  const s = both.map(id => ({ id, v: mean(simLines[id][k]) })).sort((a, b) => b.v - a.v).slice(0, 12);
  return s.map(x => `${name(x.id)} ${f(x.v)} (${f(REAL_PLAYERS[x.id][k])})`).join(', ');
};
console.log('\nTop 12 pontuadores na sim (real entre parênteses):\n  ' + topBy('ppg'));

// --- ratings vs real impact --------------------------------------------------
// VORP is the season's total value over replacement (BPM x minutes): the
// closest public single number to "how much did this player matter".
const P = playersData as Record<string, Player>;
const rated = Object.keys(REAL_PLAYERS).filter(id => P[id] && REAL_PLAYERS[id].mp >= 500);
console.log('\n=== OVR x IMPACTO REAL (≥500 min) ===');
console.log(`OVR x BPM   spearman = ${f(spearman(rated.map(id => P[id].ovr), rated.map(id => REAL_PLAYERS[id].bpm)), 3)}`);
console.log(`OVR x VORP  spearman = ${f(spearman(rated.map(id => P[id].ovr), rated.map(id => REAL_PLAYERS[id].vorp)), 3)}`);
const mvpVote = rated.filter(id => /MVP-\d/.test(REAL_PLAYERS[id].awards)).sort((a, b) => Number(REAL_PLAYERS[a].awards.match(/MVP-(\d+)/)![1]) - Number(REAL_PLAYERS[b].awards.match(/MVP-(\d+)/)![1]));
const ovrRank = (id: string) => 1 + Object.values(P).filter(p => p.ovr > P[id].ovr).length;
console.log('Votação real de MVP -> posição do jogador no ranking de OVR:');
console.log('  ' + mvpVote.slice(0, 10).map(id => `${name(id)} (#${ovrRank(id)}, ${P[id].ovr})`).join(', '));
const allNba = rated.filter(id => /NBA[123]/.test(REAL_PLAYERS[id].awards));
console.log(`All-NBA reais no top 15 de OVR: ${allNba.filter(id => ovrRank(id) <= 15).length} de ${allNba.length}`);
const overrated = rated.map(id => ({ id, gap: ovrRank(id) - (1 + rated.filter(o => REAL_PLAYERS[o].vorp > REAL_PLAYERS[id].vorp).length) }))
  .sort((a, b) => a.gap - b.gap).slice(0, 10);
console.log('Mais superavaliados (rank OVR muito acima do rank de VORP):');
console.log('  ' + overrated.map(o => `${name(o.id)} OVR ${P[o.id].ovr} (VORP ${REAL_PLAYERS[o.id].vorp})`).join(', '));
