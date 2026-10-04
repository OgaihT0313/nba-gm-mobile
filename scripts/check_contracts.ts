// Runs whole careers headlessly -- several seasons back to back, offseasons
// included -- and measures the contract economy. The cycle only exists ACROSS
// seasons (a contract signed now matters two summers from now), so neither
// diagnose_season nor check_decisions can see it.
//
// It reports; the gates at the bottom are the claims the contract system makes.
//
// Not wired into the app bundle -- nothing imports it. To run:
//
//   npx tsc scripts/check_contracts.ts --ignoreConfig --ignoreDeprecations 6.0 \
//     --outDir .check --module commonjs --target es2020 --moduleResolution node \
//     --esModuleInterop --resolveJsonModule --skipLibCheck
//   cp -r data .check/data && node .check/scripts/check_contracts.js [careers] [years]
import { teamsData, playersData, getTeamSalary, SALARY_CAP } from '../constants';
import type { Team, Player, SeasonState } from '../types';
import { simulationEngine } from '../services/simulationService';
import { generateSchedule } from '../services/scheduleService';
import { simulateOneDay } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches } from '../services/coachService';
import { initialPickAssets, makeUserPick, consensusValue } from '../services/draftService';
import { resolveDecision } from '../services/decisionService';
import { startOffseason, finishDraft, startSeason } from '../services/offseasonService';
import { getFreeAgents, signFreeAgentLegality, evaluateSigningInterest, signPlayer } from '../services/freeAgencyService';
import { expectedSalary, playerValue } from '../services/tradeService';

declare const process: { argv: string[] };
const CAREERS = Number(process.argv[2] || 3);
const YEARS = Number(process.argv[3] || 6);
// `passivo` as a third argument: the user never re-signs anyone, the worst case.
const RESIGN = process.argv[4] !== 'passivo';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL ${label} ${detail}`); }
};
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
const M = (v: number) => `$${(v / 1e6).toFixed(0)}M`;

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

// The regular season, answering every decision at random among the enabled
// options -- the same stand-in player check_decisions uses.
const playRegularSeason = (s: SeasonState): SeasonState => {
  let guard = 0;
  while (s.gamesPlayed < 82 && guard++ < 500) {
    s = simulateOneDay(s).season;
    while (s.decisions && s.decisions.length) {
      const d = s.decisions[0];
      const enabled = d.options.filter(o => !o.disabled);
      if (!enabled.length) { s = { ...s, decisions: s.decisions.slice(1) }; continue; }
      s = resolveDecision(s, d.id, enabled[Math.floor(Math.random() * enabled.length)].id);
    }
  }
  return s;
};

// Playoffs are not what this measures. The best record is crowned and the
// save goes straight to the offseason, carrying exactly what startOffseason
// reads from a real one.
const crown = (s: SeasonState): SeasonState => {
  const champ = [...s.teams].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0))[0];
  return {
    ...s, status: 'offseason', playoff: null,
    awardHistory: [...s.awardHistory, { season: s.gmLegacy.seasons + 1, championId: champ.id } as any],
    gmLegacy: { seasons: s.gmLegacy.seasons + 1, titles: s.gmLegacy.titles },
  };
};

// The user's summer, played like a reasonable GM who is not trying hard:
// staff picks in the draft, then sign the best legal, willing free agents until
// the roster has 13.
const userSummer = (s: SeasonState): SeasonState => {
  let guard = 0;
  while (s.draft && !s.draft.complete && guard++ < 100) {
    const best = [...s.draft.available].sort((a, b) => consensusValue(s.draft!.reports[b]) - consensusValue(s.draft!.reports[a]))[0];
    const r = makeUserPick(s.draft, s.teams, s.players, s.userTeamId, best);
    s = { ...s, draft: r.draft, teams: r.teams, players: r.players };
  }
  s = finishDraft(s);
  // Bring back his own free agents who would make the top nine, whatever the
  // bill -- the Bird right is the one thing an over-the-cap team can still do.
  if (RESIGN) {
    const mine = Object.values(s.players).filter(p => p.birdTeamId === s.userTeamId)
      .sort((a, b) => playerValue(b) - playerValue(a));
    for (const p of mine) {
      const me = s.teams.find(t => t.id === s.userTeamId)!;
      const ninth = me.roster.map(id => playerValue(s.players[id])).sort((a, b) => b - a)[8] ?? 0;
      if (playerValue(p) <= ninth || !signFreeAgentLegality(me, p, s.players).legal) continue;
      const signed = signPlayer(me, p, s.players);
      s = { ...s, players: { ...s.players, [p.id]: signed.player }, teams: s.teams.map(t => t.id === me.id ? signed.team : t) };
    }
  }
  for (let i = 0; i < 18; i++) {
    const me = s.teams.find(t => t.id === s.userTeamId)!;
    if (me.roster.length >= 13) break;
    const fa = getFreeAgents(s.teams, s.players).find(p =>
      signFreeAgentLegality(me, p, s.players).legal && evaluateSigningInterest(p, me, s.teams, s.players).willing);
    if (!fa) break;
    const signed = signPlayer(me, fa, s.players);
    s = { ...s, players: { ...s.players, [fa.id]: signed.player }, teams: s.teams.map(t => t.id === me.id ? signed.team : t) };
  }
  return startSeason(s);
};

interface YearRow {
  payMed: number; payMax: number; overCap: number; rosterMin: number; rosterMed: number;
  pool: number; poolGood: number; goodExpired: number; goodStayed: number; goodMoved: number; goodUnsigned: number;
  ratioGood: number; userPay: number; userGood: number;
}
const rows: YearRow[][] = Array.from({ length: YEARS }, () => []);

const teamOfMap = (s: SeasonState) => {
  const m = new Map<string, string>();
  s.teams.forEach(t => t.roster.forEach(id => m.set(id, t.id)));
  return m;
};

console.log(`Simulando ${CAREERS} carreiras de ${YEARS} temporadas...`);
for (let c = 0; c < CAREERS; c++) {
  let s = buildSeason((teamsData as Team[])[(c * 7) % teamsData.length].id);
  for (let y = 0; y < YEARS; y++) {
    s = playRegularSeason(s);
    check('a temporada chega ao jogo 82', s.gamesPlayed >= 82, `carreira ${c} ano ${y}: ${s.gamesPlayed}`);
    s = crown(s);

    const before = s;
    const teamBefore = teamOfMap(before);
    // "Good" = a real rotation player whose leaving would be felt.
    const good = (p: Player | undefined) => !!p && p.ovr >= 80;
    const expiring = Object.values(before.players).filter(p => teamBefore.has(p.id) && p.contractYears <= 1 && good(p));

    const meBefore = before.teams.find(t => t.id === before.userTeamId)!;
    const myExp = meBefore.roster.map(id => before.players[id]).filter(p => p.contractYears <= 1);
    const off = startOffseason(s);
    s = userSummer(off);
    if (process.argv[5] === 'debug') {
      const ms = before.teams.flatMap(t => { const g = (t.wins ?? 0) + (t.losses ?? 0); return t.roster.map(id => ({ m: before.players[id].morale ?? 70, w: (t.wins ?? 0) / g, o: before.players[id].ovr })); }).filter(x => x.o >= 76);
      const by = (lo: number, hi: number) => ms.filter(x => x.w >= lo && x.w < hi).map(x => x.m);
      console.log(`  moral 76+ fim de temporada: geral q25/50/75 ${q(ms.map(x => x.m), .25).toFixed(0)}/${q(ms.map(x => x.m), .5).toFixed(0)}/${q(ms.map(x => x.m), .75).toFixed(0)} | <40% vit ${q(by(0, .4), .5).toFixed(0)} | 40-60% ${q(by(.4, .6), .5).toFixed(0)} | >60% ${q(by(.6, 1.01), .5).toFixed(0)} | <40 moral: ${(100 * ms.filter(x => x.m < 40).length / ms.length).toFixed(0)}%`);
      const top8 = s.teams.map(t => t.roster.map(id => s.players[id].ovr).sort((a, b) => b - a).slice(0, 8)).map(a => a.reduce((x, y) => x + y, 0) / 8);
      const after = teamOfMap(s);
      console.log(`  ano ${y + 1}: liga top8 ${mean(top8).toFixed(1)} | eu ${meBefore.roster.length} jog, top8 ${(meBefore.roster.map(id => before.players[id].ovr).sort((a, b) => b - a).slice(0, 8).reduce((x, y) => x + y, 0) / 8).toFixed(1)}, vencendo: `
        + myExp.map(p => `${p.name.split(' ').pop()} ${p.ovr}/${p.age} m${Math.round(p.morale ?? 70)} ${off.players[p.id].birdTeamId ? 'B' : '-'}->${after.get(p.id) === s.userTeamId ? 'FICOU' : after.get(p.id) ?? 'livre'}`).join(', '));
    }
    const teamAfter = teamOfMap(s);

    const pays = s.teams.map(t => getTeamSalary(t, s.players));
    const sizes = s.teams.map(t => t.roster.length);
    const pool = getFreeAgents(s.teams, s.players);
    const rostered = Object.values(s.players).filter(p => teamAfter.has(p.id));
    const goodRostered = rostered.filter(p => p.ovr >= 80);
    const me = s.teams.find(t => t.id === s.userTeamId)!;
    rows[y].push({
      payMed: q(pays, 0.5), payMax: Math.max(...pays), overCap: pays.filter(p => p > SALARY_CAP).length,
      rosterMin: Math.min(...sizes), rosterMed: q(sizes, 0.5),
      pool: pool.length, poolGood: pool.filter(p => p.ovr >= 76).length,
      goodExpired: expiring.length,
      goodStayed: expiring.filter(p => teamAfter.get(p.id) === teamBefore.get(p.id)).length,
      goodMoved: expiring.filter(p => teamAfter.has(p.id) && teamAfter.get(p.id) !== teamBefore.get(p.id)).length,
      goodUnsigned: expiring.filter(p => !teamAfter.has(p.id)).length,
      // How far salaries have drifted from what the player is now worth.
      ratioGood: mean(goodRostered.map(p => p.salary / expectedSalary(p.ovr, p.age))),
      userPay: getTeamSalary(me, s.players), userGood: me.roster.filter(id => good(s.players[id])).length,
    });
    check('todo time abre a temporada com elenco legal', Math.min(...sizes) >= 8, `min ${Math.min(...sizes)}`);
  }
  console.log(`  carreira ${c + 1}/${CAREERS} ok`);
}

console.log(`\n================ CICLO DE CONTRATOS (${CAREERS} carreiras x ${YEARS} anos) ================\n`);
console.log('ano | folha med  max  >teto | elenco min/med | pool  76+ | 80+ vencendo: fica/troca/sem time | salario/valor 80+ | usuario folha 80+');
rows.forEach((r, y) => {
  const a = (k: keyof YearRow) => mean(r.map(x => x[k]));
  console.log(
    `${String(y + 1).padStart(3)} | ${M(a('payMed')).padStart(6)} ${M(a('payMax')).padStart(5)} ${a('overCap').toFixed(1).padStart(5)} | `
    + `${a('rosterMin').toFixed(1).padStart(5)} / ${a('rosterMed').toFixed(1).padStart(4)} | ${a('pool').toFixed(0).padStart(4)} ${a('poolGood').toFixed(1).padStart(4)} | `
    + `${a('goodExpired').toFixed(1).padStart(5)}: ${a('goodStayed').toFixed(1)} / ${a('goodMoved').toFixed(1)} / ${a('goodUnsigned').toFixed(1)}          | `
    + `${a('ratioGood').toFixed(2).padStart(17)} | ${M(a('userPay')).padStart(6)} ${a('userGood').toFixed(1)}`,
  );
});

// The gates -- what the contract system claims, per year, averaged over careers.
rows.forEach((r, y) => {
  const a = (k: keyof YearRow) => mean(r.map(x => x[k]));
  // The defect this whole system exists to fix: before it, 22 players rated 80+
  // spent the first season with no team, and the number never went to zero.
  check('nenhum jogador 80+ termina o verao sem time', a('goodUnsigned') === 0, `ano ${y + 1}: ${a('goodUnsigned').toFixed(1)}`);
  check('ninguem 76+ fica parado no mercado', a('poolGood') <= 2, `ano ${y + 1}: ${a('poolGood').toFixed(1)}`);
  // Stable, not collapsing (the old economy fell to $110M by year five).
  check('folha mediana estavel', a('payMed') >= 140e6 && a('payMed') <= 215e6, `ano ${y + 1}: ${M(a('payMed'))}`);
  check('salario acompanha o valor (80+)', a('ratioGood') >= 0.8 && a('ratioGood') <= 1.15, `ano ${y + 1}: ${a('ratioGood').toFixed(2)}`);
});
const stayed = mean(rows.flat().map(r => r.goodStayed)), moved = mean(rows.flat().map(r => r.goodMoved));
// Both halves of a market: teams keep most of what they want to keep, and the
// stars who want out actually go somewhere.
check('renovacoes e mudancas acontecem as duas', stayed > 0 && moved > 0, `fica ${stayed.toFixed(1)} / troca ${moved.toFixed(1)}`);

console.log(failures ? `\n${failures} falha(s).` : '\nSem falhas.');
