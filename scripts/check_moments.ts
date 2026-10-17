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
import { buildMoments, resolveMoment, trustFromMoments, momentTotals, chanceOf, stageOf, type Moment } from '../services/career/careerMoments';
import { buildFive, planQuarter, restagePossession } from '../services/watchDirector';
import { initCoaches } from '../services/coachService';

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
// --- The court plays the decided moment out (restagePossession) ---
// Real quarters with a real starter as "you": every kind of option staged on
// the next trip, then read back -- who shoots, whether it falls, the assist.
{
  const { coaches } = initCoaches(teams.map((t) => ({ ...t })));
  let staged = 0, tried = 0, shooterOk = 0, resultOk = 0, assistOk = 0, assistTried = 0;
  for (let g = 0; g < 300; g++) {
    const home = teams[g % teams.length];
    const away = teams[(g + 7) % teams.length];
    const fh = buildFive(home, players, 'home');
    const fa = buildFive(away, players, 'away');
    const me = players[fh.players[g % 5].playerId];
    if (!me) continue;
    const plan = planQuarter({ home, away, players, coaches, fiveHome: fh, fiveAway: fa, userSide: 'home', play: 'pick_roll', timeout: false, quarter: 1, from: 0, coached: false });
    const moment = buildMoments(me, away, players, 0)[0];
    const option = moment.options[g % moment.options.length];
    const r = resolveMoment(moment, option.id, me, players);
    const st = stageOf(moment, r);
    const side = st.onDefense ? 'away' : 'home';
    const mate = fh.players.find((pl) => pl.playerId !== me.id)!.playerId;
    const wantId = st.shooter === 'me' ? me.id : st.shooter === 'mate' ? mate : moment.defenderId;
    const after = 60;
    tried++;
    const out = restagePossession(plan, players, {
      side, mustHave: me.id, shooterId: wantId,
      play: st.play, made: st.made, points: st.points, shotKind: st.shotKind, assistId: st.assist ? me.id : undefined, after,
    });
    if (!out) continue;
    staged++;
    const poss = out.plan.possessions.find((x) => x.start >= after && x.side === side && !x.freeThrow
      && [x.fiveHome, x.fiveAway].some((f) => f?.players.some((pl) => pl.playerId === me.id)))!;
    const five = side === 'away' ? poss.fiveAway! : poss.fiveHome!;
    if (five.players[poss.shooter]?.playerId === wantId || !five.players.some((pl) => pl.playerId === wantId)) shooterOk++;
    if (poss.made === st.made && (!st.made || poss.points === st.points)) resultOk++;
    if (st.assist && st.made) { assistTried++; if (poss.assistName === me.name) assistOk++; }
  }
  console.log(`\nEncenação: ${staged}/${tried} lances encenados (o resto: você fora de quadra no resto do quarto)`);
  console.log(`  arremessador certo ${shooterOk}/${staged} · resultado certo ${resultOk}/${staged} · assistência sua ${assistOk}/${assistTried}`);
  check('a maioria dos lances é encenada', staged >= tried * 0.8, `${staged}/${tried}`);
  check('a quadra mostra quem a escolha manda arremessar', shooterOk === staged, `${shooterOk}/${staged}`);
  check('a quadra mostra o resultado sorteado', resultOk === staged, `${resultOk}/${staged}`);
  check('o passe certo vira assistência sua', assistOk === assistTried, `${assistOk}/${assistTried}`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
