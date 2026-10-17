// Minha Carreira's moments, measured (PLANO-CARREIRA.md, fase 2): real players
// of the 2025-26 league stand in for "you", against the real man guarding them,
// and three robots decide every moment of many games -- by the read, at random,
// and against the read. Targets:
//   - reading well is worth +1 to +2 points a game over a random choice;
//   - a random choice is worth ~0 (the engine already counts average decisions);
//   - the coach's trust moves more with how you decide than with luck.
//
// Not wired into the app bundle. To run (like check_staff):
//   npx tsc scripts/check_moments.ts --ignoreConfig --ignoreDeprecations 6.0 \
//     --outDir .check --module commonjs --target es2020 --moduleResolution node \
//     --esModuleInterop --resolveJsonModule --skipLibCheck
//   cp -r data .check/data && node .check/scripts/check_moments.js [games]
import { teamsData, playersData } from '../constants';
import type { Player, Team } from '../types';
import { buildMoments, resolveMoment, trustFromMoments, momentTotals, chanceOf, type Moment } from '../services/career/careerMoments';

declare const process: { argv: string[] };
const GAMES = Number(process.argv[2] || 3000);

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL ${label} ${detail}`); }
};
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const f = (v: number, d = 2) => v.toFixed(d);

const teams = teamsData as Team[];
const players = playersData as { [id: string]: Player };
// "You": rotation players across the OVR range.
const pool = Object.values(players).filter((p) => p.ovr >= 70 && teams.some((t) => t.roster.includes(p.id)));

type Bot = 'read' | 'random' | 'against';
const choose = (bot: Bot, m: Moment): string => {
  if (bot === 'read') return m.best;
  if (bot === 'against') return m.worst;
  return m.options[Math.floor(Math.random() * m.options.length)].id;
};

const res: Record<Bot, { team: number[]; me: number[]; trust: number[]; made: number[] }> = {
  read: { team: [], me: [], trust: [], made: [] },
  random: { team: [], me: [], trust: [], made: [] },
  against: { team: [], me: [], trust: [], made: [] },
};
const byRank: number[][] = [[], [], [], [], []];
let bestIsBest = 0;
let momentsSeen = 0;

for (let g = 0; g < GAMES; g++) {
  const me = pool[Math.floor(Math.random() * pool.length)];
  const myTeam = teams.find((t) => t.roster.includes(me.id))!;
  const opps = teams.filter((t) => t.id !== myTeam.id);
  const opp = opps[Math.floor(Math.random() * opps.length)];
  const rank = Math.floor(Math.random() * 5);
  const moments = buildMoments(me, opp, players, rank);
  byRank[rank].push(moments.length);
  moments.forEach((m) => {
    momentsSeen++;
    const def = players[m.defenderId];
    const top = [...m.options].sort((a, b) => chanceOf(m, b, me, def) * b.pts - chanceOf(m, a, me, def) * a.pts)[0];
    if (top.id === m.best) bestIsBest++;
  });
  (['read', 'random', 'against'] as Bot[]).forEach((bot) => {
    const results = moments.map((m) => resolveMoment(m, choose(bot, m), me, players));
    res[bot].team.push(results.reduce((s, r) => s + r.teamDelta + r.oppDelta, 0));
    res[bot].me.push(momentTotals(results).pts);
    res[bot].trust.push(trustFromMoments(results));
    res[bot].made.push(results.filter((r) => r.success).length / Math.max(1, results.length));
  });
}

console.log(`${GAMES} jogos, ${pool.length} jogadores reais como "você"`);
console.log(`Momentos por jogo por papel (estrela..fora): ${byRank.map((r) => f(mean(r), 1)).join(' / ')}`);
(['read', 'random', 'against'] as Bot[]).forEach((bot) => {
  const r = res[bot];
  console.log(`  ${bot.padEnd(8)} saldo do time ${f(mean(r.team))} pts/jogo · seus pontos ${f(mean(r.me))} · confiança ${f(mean(r.trust))} · acerto ${f(100 * mean(r.made), 0)}%`);
});
console.log(`  A opção da leitura é a de maior valor esperado em ${f((100 * bestIsBest) / momentsSeen, 0)}% dos momentos`);

const edge = mean(res.read.team) - mean(res.random.team);
check('ler bem rende +1 a +2 pts por jogo sobre o aleatório', edge >= 1 && edge <= 2.2, f(edge));
check('a escolha aleatória fica perto de zero', Math.abs(mean(res.random.team)) < 0.5, f(mean(res.random.team)));
check('ir contra a leitura custa pontos', mean(res.against.team) < -0.5, f(mean(res.against.team)));
check('a confiança premia ler bem', mean(res.read.trust) > 1.5 && mean(res.against.trust) < -1, `${f(mean(res.read.trust))} / ${f(mean(res.against.trust))}`);
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
