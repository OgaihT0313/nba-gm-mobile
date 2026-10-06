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
import { resolveDecision, extensionTerms } from '../services/decisionService';
import { OFFER_TTL, MAX_PENDING_OFFERS } from '../services/tradeService';
import { MAX_PRESS_PER_SEASON, PRESS_MIN_GAP, PROMISE_KEPT, PROMISE_BROKEN, calloutResponse, settlePromise } from '../services/pressService';
import { evaluateSeasonOutcome } from '../services/ownerService';
import { personalityOf } from '../services/personalityService';

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
let offersSeen = 0;
let soldCount = 0, boughtCount = 0, shoppedCount = 0, minutesCount = 0, extendedCount = 0, requotedCount = 0;
const stanceSeasons = new Set<number>();
const pressPerSeason: number[] = [];
const pressByOption: Record<string, number> = {};
let promisesMade = 0;

console.log(`Simulando ${RUNS} temporadas respondendo as decisoes...`);
for (let run = 0; run < RUNS; run++) {
  let season = buildSeason((teamsData as Team[])[run % teamsData.length].id);
  let raisedThisSeason = 0;
  let soldThisSeason = false;
  const pressDays: number[] = [];
  const askedThisSeason = new Set<string>();
  let guard = 0;

  while (season.gamesPlayed < 82 && guard++ < 500) {
    const offersBefore = new Set((season.tradeOffers ?? []).map(o => o.id));
    season = simulateOneDay(season).season;
    // The inbox: bounded, and nothing in it older than its shelf life.
    const pending = season.tradeOffers ?? [];
    offersSeen += pending.filter(o => !offersBefore.has(o.id)).length;
    check('caixa de propostas no limite', pending.length <= MAX_PENDING_OFFERS, `${pending.length}`);
    pending.forEach(o => check('proposta pendente dentro do prazo', o.day === undefined || season.gamesPlayed - o.day < OFFER_TTL,
      `dia ${o.day}, hoje ${season.gamesPlayed}`));

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

      if (d.kind === 'press_conference') {
        check('coletivas espacadas', !pressDays.length || d.day - pressDays[pressDays.length - 1] >= PRESS_MIN_GAP,
          `${pressDays.join(',')} -> ${d.day}`);
        pressDays.push(d.day);
        check('coletiva registrada no dono', (season.owner.press?.days ?? []).includes(d.day), `dia ${d.day}`);
      }

      const enabled = d.options.filter(o => !o.disabled);
      check('toda decisao tem opcao habilitada', enabled.length > 0, `-> ${d.id}`);
      check('toda decisao tem manchete', !!d.headline && !!d.body, `-> ${d.id}`);
      if (enabled.length === 0) { season = { ...season, decisions: season.decisions.slice(1) }; continue; }

      // Answers are picked least-used-first (ties at random): the
      // "was every option exercised" checks below read a handful of rare
      // decisions -- ~12 press conferences, ~8 extension talks -- and a uniform
      // pick left one answer unexercised often enough to make them flaky.
      const used = (o: { id: string }) => byOption[o.id.split(':')[0]] ?? 0;
      const least = Math.min(...enabled.map(used));
      const pool = enabled.filter(o => used(o) === least);
      const pick = pool[Math.floor(Math.random() * pool.length)];
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
      if (action === 'extend') {
        const target = pick.id.split(':')[1];
        const p0 = before.players[target], p1 = season.players[target];
        // The new money waits for the new season; the years are added now, so
        // he is no longer an expiring contract.
        check('estender adiciona anos', p1.contractYears > p0.contractYears, `${p0.contractYears} -> ${p1.contractYears}`);
        check('estender agenda o salario novo sem mexer no atual',
          p1.nextSalary !== undefined && p1.salary === p0.salary, `${p0.salary} -> ${p1.salary} / next ${p1.nextSalary}`);
        extendedCount++;
        // A second talk queued the same night must now quote a payroll that
        // includes this deal -- it was generated before it existed.
        const me = season.teams.find(t => t.id === season.userTeamId)!;
        (season.decisions ?? []).filter(x => x.kind === 'contract_extension' && x.subjectId).forEach(x => {
          const quoted = x.options.find(o => o.id.startsWith('extend:'))?.detail.match(/Folha projetada: \$([\d.]+)M/);
          if (!quoted) return;
          const other = season.players[x.subjectId!];
          const base = me.roster.reduce((s, id) => {
            const q = season.players[id];
            return q && q.contractYears > 1 ? s + (q.nextSalary ?? q.salary) : s;
          }, 0);
          const expected = (base + extensionTerms(other).salary) / 1e6;
          check('a extensao seguinte cita a folha atualizada', Math.abs(Number(quoted[1]) - expected) < 0.11,
            `citou ${quoted[1]}M, esperado ${expected.toFixed(1)}M`);
          requotedCount++;
        });
      }
      if (d.kind === 'contract_extension') {
        check('extensao so para jogador no ultimo ano', before.players[d.subjectId!].contractYears === 1,
          `-> ${d.subjectId} (${before.players[d.subjectId!].contractYears})`);
      }
      if (action.startsWith('press_')) pressByOption[action] = (pressByOption[action] || 0) + 1;
      if (action === 'press_back') {
        check('bancar o elenco custa confianca do dono',
          (season.owner.adjustment ?? 0) < (before.owner.adjustment ?? 0), `${before.owner.adjustment} -> ${season.owner.adjustment}`);
      }
      if (action === 'press_callout') {
        const target = pick.id.split(':')[1];
        const m0 = before.players[target].morale ?? 70, m1 = season.players[target].morale ?? 70;
        check('cobrar em publico derruba o animo do cobrado', m1 < m0 || m0 === 0, `${m0} -> ${m1}`);
        // The archetype decides how hard: the leader barely feels it.
        check('o tamanho da queda depende da personalidade',
          m1 === Math.max(0, m0 + calloutResponse(season.players[target]).morale), `${personalityOf(season.players[target]).id} ${m0} -> ${m1}`);
      }
      if (action === 'press_promise') {
        check('promessa fica registrada', !!season.owner.press?.promise, '');
        check('so uma promessa por temporada', !before.owner.press?.promise, '');
        promisesMade++;
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
  pressPerSeason.push(pressDays.length);
  check('coletivas por temporada no limite', pressDays.length <= MAX_PRESS_PER_SEASON, `${pressDays.length}`);
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
console.log(`Extensoes re-cotadas depois de outra: ${requotedCount}`);
console.log(`Propostas de troca recebidas por temporada: ${(offersSeen / RUNS).toFixed(1)}`);
console.log(`Temporadas que chegaram ao fim: ${seasonsFinished}/${RUNS}`);
console.log(`Pedidos de troca atendidos: minutos ${minutesCount} / mercado ${shoppedCount}`);
console.log(`Coletivas por temporada: ${mean(pressPerSeason).toFixed(1)}  (temporadas sem nenhuma: ${pressPerSeason.filter(x => x === 0).length})`);
console.log(`Respostas na coletiva: ${Object.entries(pressByOption).map(([k, v]) => `${k} ${v}`).join('  |  ') || '(nenhuma)'}  -- promessas ${promisesMade}`);

// The gate. All three decision types ship now, so this is the real budget:
// 4-8 a season, roughly one every 10-20 games. Enough to feel like the job,
// rare enough that each one is worth reading. Below it the season runs itself
// and you watch; above it the game is paperwork.
console.log('');
check('frequencia dentro do orcamento de 4-8 por temporada', media >= 4 && media <= 8, `medido ${media.toFixed(1)}`);
check('a postura de prazo aparece em toda temporada', stanceSeasons.size === RUNS,
  `${stanceSeasons.size}/${RUNS}`);
check('nenhuma temporada sem nenhuma decisao', min > 0, `min ${min}`);
// On the 95th percentile, not the single worst season. The maximum of a
// random sample is not a property of the model -- it drifts up the more seasons
// you run (120 seasons: max 12, but one 30-season run hit 15), the same trap
// check_watch_director already had to climb out of. Nineteen seasons in twenty
// must stay readable; the rare pile-up of injuries is the sim, not the queue.
const sortedSeasons = [...perSeason].sort((x, y) => x - y);
const p95 = sortedSeasons[Math.min(sortedSeasons.length - 1, Math.floor(0.95 * sortedSeasons.length))];
check('nenhuma temporada virou burocracia', p95 <= 11, `p95 ${p95} (max ${max})`);
// `sign` is deliberately NOT required: in-season the free agent market is empty
// (every player starts on a roster and the median roster is already at
// MAX_ROSTER_SIZE), so the option only appears in saves where waivers or an
// undrafted class have put somebody on the market. It must never be a dead
// button, which is why it is added conditionally rather than disabled.
check('as opcoes sempre disponiveis foram exercitadas',
  rushedCount > 0 && promotedCount > 0 && shortenedCount > 0,
  `rush ${rushedCount} / promote ${promotedCount} / shorten ${shortenedCount}`);
check('a extensao de contrato foi oferecida e exercitada', (byKind['contract_extension'] ?? 0) > 0 && extendedCount > 0,
  `${byKind['contract_extension'] ?? 0} oferecidas / ${extendedCount} estendidas`);
check('as tres posturas de prazo foram exercitadas',
  soldCount > 0 && boughtCount > 0,
  `buy ${boughtCount} / sell ${soldCount}`);
// The failure this whole phase exists to fix: a system that is built, wired,
// and never fires. It is meant to be RARE -- a star only asks out when the team
// is genuinely bad -- but never is not rare, it is dead.
check('o pedido de troca dispara em algum momento', (byKind['trade_request'] ?? 0) > 0,
  `${byKind['trade_request'] ?? 0} em ${RUNS} temporadas`);

// The press layer must actually happen, and every answer kind must be reachable.
check('a coletiva acontece', mean(pressPerSeason) >= 0.5, `${mean(pressPerSeason).toFixed(2)} por temporada`);
check('todas as respostas da coletiva foram exercitadas',
  ['press_back', 'press_callout', 'press_promise', 'press_humble', 'press_praise'].every(k => (pressByOption[k] ?? 0) > 0),
  JSON.stringify(pressByOption));

// The promise settles at the end-of-season verdict: same season, same record,
// kept is worth more than broken, and the owner says why.
{
  const owner = { mandate: 'playoffs' as const, targetWins: 45, confidence: 60, fired: false };
  const team = { id: 'x', name: 'Teste', wins: 45, losses: 37 } as Team;
  const promised = (kind: 'playoffs' | 'conf_finals') => ({ ...owner, press: { days: [20], promise: { kind, day: 20 } } });
  const none = evaluateSeasonOutcome(owner, team, false, false);
  const broken = evaluateSeasonOutcome(promised('playoffs'), team, false, false);
  const kept = evaluateSeasonOutcome(promised('playoffs'), team, true, false);
  const keptNone = evaluateSeasonOutcome(owner, team, true, false);
  check('promessa quebrada pesa no veredito', broken.confidence === Math.max(0, none.confidence + PROMISE_BROKEN), `${none.confidence} -> ${broken.confidence}`);
  check('promessa cumprida pesa no veredito', kept.confidence === Math.min(100, keptNone.confidence + PROMISE_KEPT), `${keptNone.confidence} -> ${kept.confidence}`);
  check('o dono cita a promessa', broken.message.includes('coletiva'), broken.message);
  const cf = evaluateSeasonOutcome(promised('conf_finals'), team, true, false, false);
  check('final de conferencia exige chegar la', cf.confidence === Math.max(0, keptNone.confidence + PROMISE_BROKEN), `${cf.confidence}`);
  check('sem promessa, nada muda', settlePromise(undefined, false, false) === undefined, '');
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
