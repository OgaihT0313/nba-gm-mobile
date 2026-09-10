// Runs the season engine headless, many times, and measures what it actually
// produces — league standings shape, score distribution, individual box-score
// leaders — against real NBA reference ranges. This is the instrument the
// calibration work is read off of; it asserts nothing, it just reports.
//
// Not wired into the app bundle — nothing imports it. To run:
//
//   npx tsc scripts/diagnose_season.ts --ignoreConfig --ignoreDeprecations 6.0 \
//     --outDir .check --module commonjs --target es2020 --moduleResolution node \
//     --esModuleInterop --resolveJsonModule --skipLibCheck
//   cp -r data .check/data && node .check/scripts/diagnose_season.js [seasons]
import { teamsData, playersData } from '../constants';
import type { Team, Player, SeasonState } from '../types';
import { simulationEngine, getRotationWeights } from '../services/simulationService';
import { generateSchedule } from '../services/scheduleService';
import { simulateOneDay } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches } from '../services/coachService';
import { initialPickAssets } from '../services/draftService';

declare const process: { argv: string[] };
const RUNS = Number(process.argv[2] || 12);

// --- statistics helpers -----------------------------------------------------
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
const pct = (n: number, d: number) => (d ? (100 * n) / d : 0);
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
const f = (v: number, d = 1) => v.toFixed(d);

// A verdict line: measured value vs the real-NBA reference band.
const rows: { label: string; got: string; want: string; ok: boolean }[] = [];
const check = (label: string, got: number, lo: number, hi: number, d = 1, unit = '') => {
  rows.push({ label, got: f(got, d) + unit, want: `${f(lo, d)}-${f(hi, d)}${unit}`, ok: got >= lo && got <= hi });
};

// --- build a season exactly like initSeason in App.tsx ----------------------
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

// --- accumulators across every run -----------------------------------------
const teamScores: number[] = [];
const margins: number[] = [];
const winsAll: number[] = [];
const bestWins: number[] = [];
const worstWins: number[] = [];
const winSd: number[] = [];
const sixtyWin: number[] = [];
const twentyLose: number[] = [];
let homeWins = 0, gamesTotal = 0, floorHits = 0, blowouts = 0, close = 0;
const leadPpg: number[] = [], leadRpg: number[] = [], leadApg: number[] = [], leadSpg: number[] = [], leadBpg: number[] = [], leadMpg: number[] = [];
const talentR: number[] = [];
const twentyPpgCount: number[] = [];
const gpAvg: number[] = [];

// Preseason talent proxy: the same weighted-rotation average the engine rates
// a team by, taken before a game is played.
const talentOf = (t: Team, players: { [k: string]: Player }) => {
  const { ids, weights } = getRotationWeights(t, players);
  let num = 0, den = 0;
  ids.forEach((id, i) => { const p = players[id]; if (!p) return; num += p.ovr * weights[i]; den += weights[i]; });
  return den ? num / den : 0;
};

const pearson = (xs: number[], ys: number[]) => {
  const mx = mean(xs), my = mean(ys);
  let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) { n += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return n / (Math.sqrt(dx * dy) || 1);
};

console.log(`Simulando ${RUNS} temporadas de 82 jogos...`);
for (let run = 0; run < RUNS; run++) {
  let season = buildSeason((teamsData as Team[])[run % teamsData.length].id);
  const talentPre = new Map(season.teams.map(t => [t.id, talentOf(t, season.players)]));

  for (let day = 0; day < 82; day++) {
    const before = season.schedule.filter(g => g.day === day + 1);
    season = simulateOneDay(season).season;
    before.forEach(g => {
      const played = season.schedule.find(x => x.day === g.day && x.homeTeamId === g.homeTeamId && x.awayTeamId === g.awayTeamId);
      if (!played || !played.played || played.homeScore == null || played.awayScore == null) return;
      const h = played.homeScore, a = played.awayScore;
      teamScores.push(h, a);
      const m = Math.abs(h - a);
      margins.push(m);
      gamesTotal++;
      if (h > a) homeWins++;
      if (h === 80) floorHits++;
      if (a === 80) floorHits++;
      if (m >= 20) blowouts++;
      if (m <= 5) close++;
    });
  }

  const ws = season.teams.map(t => t.wins || 0);
  winsAll.push(...ws);
  bestWins.push(Math.max(...ws));
  worstWins.push(Math.min(...ws));
  winSd.push(sd(ws));
  sixtyWin.push(ws.filter(w => w >= 60).length);
  twentyLose.push(ws.filter(w => w <= 20).length);
  talentR.push(pearson(season.teams.map(t => talentPre.get(t.id) || 0), ws));

  const ps = Object.values(season.players).filter(p => (p.seasonStats?.gp || 0) >= 41);
  const top = (sel: (p: Player) => number) => Math.max(...ps.map(sel));
  leadPpg.push(top(p => p.seasonStats!.ppg));
  leadRpg.push(top(p => p.seasonStats!.rpg));
  leadApg.push(top(p => p.seasonStats!.apg));
  leadSpg.push(top(p => p.seasonStats!.spg));
  leadBpg.push(top(p => p.seasonStats!.bpg));
  leadMpg.push(top(p => p.seasonStats!.mpg));
  twentyPpgCount.push(ps.filter(p => p.seasonStats!.ppg >= 20).length);
  gpAvg.push(mean(Object.values(season.players).filter(p => (p.seasonStats?.gp || 0) > 0).map(p => p.seasonStats!.gp)));
  console.log(`  temporada ${run + 1}/${RUNS} - melhor ${Math.max(...ws)}-${82 - Math.max(...ws)}, pior ${Math.min(...ws)}-${82 - Math.min(...ws)}`);
}

// --- report -----------------------------------------------------------------
console.log(`\n================ DIAGNOSTICO (${RUNS} temporadas, ${gamesTotal} jogos) ================\n`);

console.log('- TABELA / DISPERSAO DE FORCA -');
check('Melhor campanha (vitorias)', mean(bestWins), 58, 68, 1);
check('Pior campanha (vitorias)', mean(worstWins), 12, 22, 1);
check('Desvio-padrao de vitorias na liga', mean(winSd), 10, 14, 1);
check('Times com 60+ vitorias', mean(sixtyWin), 0.5, 3, 2);
check('Times com <=20 vitorias', mean(twentyLose), 0.5, 3, 2);
check('Correlacao talento x vitorias', mean(talentR), 0.75, 0.92, 2);

console.log('\n- PLACARES -');
check('Pontos por time por jogo', mean(teamScores), 110, 118, 1);
check('Desvio-padrao do placar', sd(teamScores), 11, 14, 1);
// Score tails, as PERCENTILES rather than the observed min/max.
//
// The extreme of a sample is not a property of the model: run more seasons
// and the highest score seen always goes up, so a min/max check silently
// tightens as the sample grows and can only be passed by widening its band,
// which measures nothing. A percentile is stable at any sample size.
//
// Real NBA team scores sit around a mean of 114 with sd ~12.5, giving a
// p99.9 in the low 150s and a p0.1 in the high 70s. The "floor plateau"
// check below is what catches a clamp; these two check the shape.
check('Cauda alta do placar (p99.9)', q(teamScores, 0.999), 146, 160, 0);
check('Cauda baixa do placar (p00.1)', q(teamScores, 0.001), 70, 88, 0);
check('Margem media de vitoria', mean(margins), 10.5, 13, 1);
check('Vitorias em casa', pct(homeWins, gamesTotal), 52, 60, 1, '%');
check('Jogos decididos por <=5 pts', pct(close, gamesTotal), 22, 30, 1, '%');
check('Jogos com 20+ de margem', pct(blowouts, gamesTotal), 18, 26, 1, '%');
check('Placares travados no piso de 80', pct(floorHits, gamesTotal * 2), 0, 0.2, 2, '%');

console.log('\n- PRODUCAO INDIVIDUAL (lideres da liga) -');
check('Cestinha (PPG)', mean(leadPpg), 30, 36, 1);
check('Lider de rebotes (RPG)', mean(leadRpg), 12, 15, 1);
check('Lider de assistencias (APG)', mean(leadApg), 9.5, 12, 1);
check('Lider de roubos (SPG)', mean(leadSpg), 1.9, 2.6, 2);
check('Lider de tocos (BPG)', mean(leadBpg), 2.5, 4, 2);
check('Maior media de minutos (MPG)', mean(leadMpg), 34, 38, 1);
// Varies hugely by era - ~40 in 2023-24, ~48 in 2020-21, ~25 in the
// 1990s - and this app spans 1979 to 2020, so the band is the historical
// range rather than one season's figure.
check('Jogadores com 20+ PPG', mean(twentyPpgCount), 30, 50, 1);
check('Jogos disputados medios (quem joga)', mean(gpAvg), 60, 78, 1);

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
console.log('');
let fails = 0;
rows.forEach(r => { if (!r.ok) fails++; });
console.log(`${pad('METRICA', 44)} ${pad('MEDIDO', 12)} ${pad('REAL (NBA)', 14)} STATUS`);
console.log('-'.repeat(84));
rows.forEach(r => console.log(`${pad(r.label, 44)} ${pad(r.got, 12)} ${pad(r.want, 14)} ${r.ok ? 'ok' : '<<< FORA'}`));
console.log('-'.repeat(84));
console.log(`${fails} de ${rows.length} metricas fora da faixa real.`);

console.log('\n- DISTRIBUICAO DE PLACARES (percentis) -');
[0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99].forEach(p => console.log(`  p${String(p * 100).padStart(2)}: ${f(q(teamScores, p), 0)} pts`));
console.log('\n- DISTRIBUICAO DE VITORIAS POR TIME (percentis) -');
[0.05, 0.25, 0.5, 0.75, 0.95].forEach(p => console.log(`  p${String(p * 100).padStart(2)}: ${f(q(winsAll, p), 0)} vitorias`));
