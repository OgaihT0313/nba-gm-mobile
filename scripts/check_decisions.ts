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

console.log(`Simulando ${RUNS} temporadas respondendo as decisoes...`);
for (let run = 0; run < RUNS; run++) {
  let season = buildSeason((teamsData as Team[])[run % teamsData.length].id);
  let raisedThisSeason = 0;
  let guard = 0;

  while (season.gamesPlayed < 82 && guard++ < 500) {
    season = simulateOneDay(season).season;

    // Stand in for the player: answer everything the queue raises, picking at
    // random among the options that are actually available.
    while (season.decisions && season.decisions.length) {
      const d: Decision = season.decisions[0];
      raisedThisSeason++;
      byKind[d.kind] = (byKind[d.kind] || 0) + 1;

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
    }
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

// The gate.
//
// The design budget for the FINISHED queue is 4-8 a season: roughly one every
// 10-20 games, enough to feel like the job and rare enough that each one is
// worth reading. Phase 1 ships one decision type of the three, so it is checked
// against its own share -- 3 to 6. The deadline stance fires once a season and
// trade requests land around one or two, which is what carries the total into
// the 4-8 band when phase 2 arrives. Raise this floor then.
console.log('');
check('frequencia da fase 1 dentro de 3-6 por temporada', media >= 3 && media <= 6, `medido ${media.toFixed(1)}`);
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

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
