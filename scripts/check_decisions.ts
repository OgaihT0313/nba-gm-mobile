// Exercises the decision queue outside the app, on real rosters, to check the
// numbers before anything reaches a phone.
//
// The frequency budget is the whole design: a season that stops twenty times is
// worse than the one that never stopped at all. The target is 4-8 decisions a
// season, and this script is the gate on it. It also proves the queue can never
// deadlock — every decision must carry at least one enabled option, and every
// season must reach game 82.
//
// Not wired into the app bundle — nothing imports it. To run:
//
//   npx tsc scripts/check_decisions.ts --ignoreConfig --ignoreDeprecations 6.0 \
//     --outDir .check --module commonjs --target es2020 --moduleResolution node \
//     --esModuleInterop --resolveJsonModule --skipLibCheck
//   cp -r data .check/data && node .check/scripts/check_decisions.js [seasons]
import { teamsData, playersData } from '../constants';
import type { Team, Player, SeasonState, Decision } from '../types';
import { simulationEngine } from '../services/simulationService';
import { generateSchedule } from '../services/scheduleService';
import { simulateOneDay } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches } from '../services/coachService';
import { initialPickAssets } from '../services/draftService';
import { resolveDecision } from '../services/decisionService';

declare const process: { argv: string[] };
const RUNS = Number(process.argv[2] || 12);

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL ${label} ${detail}`); }
};

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
  return {
    status: 'active', playoffStage: 'none', gamesPlayed: 0, teams, players,
    events: [], playoff: null, awards: null, userTeamId,
    cup: simulationEngine.initCupGroups(teams),
    gmLegacy: { seasons: 0, titles: 0 }, awardHistory: [],
    owner: buildSeasonOwner(teams.find(t => t.id === userTeamId)!, teams, players),
    schedule: generateSchedule(teams), coaches,
  };
};

const perSeason: number[] = [];
const byKind: Record<string, number> = {};
const byOption: Record<string, number> = {};
let seasonsFinished = 0;
let signedCount = 0, promotedCount = 0, shortenedCount = 0, rushedCount = 0;
let soldCount = 0, boughtCount = 0, shoppedCount = 0, minutesCount = 0;
const stanceSeasons = new Set<number>();

console.log(`Simulando ${RUNS} temporadas respondendo as decisoes...`);
for (let run = 0; run < RUNS; run++) {
  let season = buildSeason((teamsData as Team[])[run % teamsData.length].id);
  let raisedThisSeason = 0;
  let soldThisSeason = false;
  const askedThisSeason = new Set<string>();
  let guard = 0;

  while (season.gamesPlayed < 82 && guard++ < 500) {
    season = simulateOneDay(season).season;

    // Stand in for the player: answer everything the queue raises, picking at
    // random among the options that are actually available.
    while (season.decisions && season.decisions.length) {
      const d: Decision = season.decisions[0];
      raisedThisSeason++;
      byKind[d.kind] = (byKind[d.kind] || 0) + 1;
      if (d.kind === 'trade_request' && d.subjectId) {
        // Seen live before the cooldown existed: promise a star minutes, his
        // morale lifts, sinks back under the line and he asks again. Nagging,
        // not drama.
        check('ninguem pede para sair duas vezes na mesma temporada',
          !askedThisSeason.has(d.subjectId), `-> ${d.subjectId}`);
        askedThisSeason.add(d.subjectId);
      }
      if (d.kind === 'deadline_stance') {
        // Exactly one a season, or the buy/sell question is not a moment.
        check('postura de prazo so aparece uma vez por temporada', !stanceSeasons.has(run), `temporada ${run}`);
        stanceSeasons.add(run);
      }

      const enabled = d.options.filter(o => !o.disabled);
      check('toda decisao tem opcao habilitada', enabled.length > 0, `-> ${d.id}`);
      check('toda decisao tem manchete', !!d.headline && !!d.body, `-> ${d.id}`);
      if (enabled.length === 0) { season = { ...season, decisions: season.decisions.slice(1) }; continue; }

      const pick = enabled[Math.floor(Math.random() * enabled.length)];
      const action = pick.id.split(':')[0];
      byOption[action] = (byOption[action] || 0) + 1;

      const before = season;
      season = resolveDecision(season, d.id, pick.id);
      check('resolver remove a decisao da fila',
        (season.decisions?.length ?? 0) < (before.decisions?.length ?? 0), `-> ${d.id} / ${pick.id}`);

      // The three real actions must actually change something, or the option is
      // a lie dressed up as a choice.
      const t0 = before.teams.find(t => t.id === before.userTeamId)!;
      const t1 = season.teams.find(t => t.id === season.userTeamId)!;
      if (action === 'sign') {
        check('assinar aumenta o elenco', t1.roster.length === t0.roster.length + 1, `${t0.roster.length} -> ${t1.roster.length}`);
        signedCount++;
      }
      if (action === 'promote') {
        const target = pick.id.split(':')[1];
        check('promover crava o jovem como titular',
          Object.values(t1.starters ?? {}).includes(target), `-> ${target}`);
        promotedCount++;
      }
      if (action === 'rush') {
        const target = d.subjectId!;
        const a0 = t0.playerAbsences?.[target];
        const a1 = t1.playerAbsences?.[target];
        check('apressar encurta a ausencia', !!a0 && !!a1 && a1.duration < a0.duration,
          `${a0?.duration} -> ${a1?.duration}`);
        check('apressar cobra carga',
          (season.players[target].load ?? 0) > (before.players[target].load ?? 0),
          `${before.players[target].load} -> ${season.players[target].load}`);
        rushedCount++;
      }
      if (action === 'shorten') {
        check('encurtar reduz a rotacao', (t1.rotationSize ?? 99) < (t0.rotationSize ?? 10), `${t0.rotationSize} -> ${t1.rotationSize}`);
        shortenedCount++;
      }
      if (action === 'minutes') {
        const target = pick.id.split(':')[1];
        check('prometer minutos crava o titular', Object.values(t1.starters ?? {}).includes(target), `-> ${target}`);
        check('prometer minutos levanta o animo',
          (season.players[target].morale ?? 0) > (before.players[target].morale ?? 0),
          `${before.players[target].morale} -> ${season.players[target].morale}`);
        minutesCount++;
      }
      if (action === 'shop') shoppedCount++;
      if (action === 'buy') boughtCount++;
      if (action === 'sell') {
        check('vender liga o tanking no time do usuario', !!t1.tanking, `tanking=${t1.tanking}`);
        soldThisSeason = true;
        soldCount++;
      }
    }
  }

  // The deadline-stance decision fires at game 52 and decideTanking runs at 55.
  // If the latter wrote `false` over the user's team, a teardown the player
  // chose would silently vanish three games later.
  if (soldThisSeason) {
    const me = season.teams.find(t => t.id === season.userTeamId)!;
    check('o tanking escolhido sobrevive ao prazo de trocas', !!me.tanking, `tanking=${me.tanking}`);
  }
  check('a temporada chega ao jogo 82 (sem deadlock)', season.gamesPlayed >= 82, `parou em ${season.gamesPlayed}`);
  if (season.gamesPlayed >= 82) seasonsFinished++;
  perSeason.push(raisedThisSeason);
  console.log(`  temporada ${run + 1}/${RUNS} - ${raisedThisSeason} decisoes`);
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const media = mean(perSeason);
const min = Math.min(...perSeason);
const max = Math.max(...perSeason);

console.log(`\n================ FILA DE DECISOES (${RUNS} temporadas) ================\n`);
console.log(`Decisoes por temporada: media ${media.toFixed(1)}  (min ${min}, max ${max})`);
console.log(`Por tipo:   ${Object.entries(byKind).map(([k, v]) => `${k} ${(v / RUNS).toFixed(1)}`).join('  |  ') || '(nenhuma)'}`);
console.log(`Escolhidas: ${Object.entries(byOption).map(([k, v]) => `${k} ${v}`).join('  |  ') || '(nenhuma)'}`);
console.log(`Temporadas que chegaram ao fim: ${seasonsFinished}/${RUNS}`);
console.log(`Pedidos de troca atendidos: minutos ${minutesCount} / mercado ${shoppedCount}`);

// The gate. All three decision types ship now, so this is the real budget:
// 4-8 a season, roughly one every 10-20 games. Enough to feel like the job,
// rare enough that each one is worth reading. Below it the season runs itself
// and you watch; above it the game is paperwork.
console.log('');
check('frequencia dentro do orcamento de 4-8 por temporada', media >= 4 && media <= 8, `medido ${media.toFixed(1)}`);
check('a postura de prazo aparece em toda temporada', stanceSeasons.size === RUNS,
  `${stanceSeasons.size}/${RUNS}`);
check('nenhuma temporada sem nenhuma decisao', min > 0, `min ${min}`);
check('nenhuma temporada virou burocracia', max <= 14, `max ${max}`);
// `sign` is deliberately NOT required: in-season the free agent market is empty
// (every player starts on a roster and the median roster is already at
// MAX_ROSTER_SIZE), so the option only appears in saves where waivers or an
// undrafted class have put somebody on the market. It must never be a dead
// button, which is why it is added conditionally rather than disabled.
check('as opcoes sempre disponiveis foram exercitadas',
  rushedCount > 0 && promotedCount > 0 && shortenedCount > 0,
  `rush ${rushedCount} / promote ${promotedCount} / shorten ${shortenedCount}`);
check('as tres posturas de prazo foram exercitadas',
  soldCount > 0 && boughtCount > 0,
  `buy ${boughtCount} / sell ${soldCount}`);
// The failure this whole phase exists to fix: a system that is built, wired,
// and never fires. It is meant to be RARE -- a star only asks out when the team
// is genuinely bad -- but never is not rare, it is dead.
check('o pedido de troca dispara em algum momento', (byKind['trade_request'] ?? 0) > 0,
  `${byKind['trade_request'] ?? 0} em ${RUNS} temporadas`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
