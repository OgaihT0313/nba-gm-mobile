// Runs whole careers headlessly -- several seasons back to back, offseasons
// included -- and measures the contract economy. The cycle only exists ACROSS
// seasons (a contract signed now matters two summers from now), so neither
// diagnose_season nor check_decisions can see it.
//
// It reports; the gates at the bottom are the claims the contract system makes.
//
// Season history, records, Hall of Fame and achievements over a long career,
//
//   npx tsc scripts/check_contracts.ts --ignoreConfig --ignoreDeprecations 6.0 \
//     --outDir .check --module commonjs --target es2020 --moduleResolution node \
//     --esModuleInterop --resolveJsonModule --skipLibCheck
//   cp -r data .check/data && node .check/scripts/check_contracts.js [careers] [years]
import './harness';
import { teamsData, playersData, getTeamSalary, SALARY_CAP, releaseWithDeadMoney } from '../constants';
import type { Team, Player, SeasonState } from '../types';
import { simulationEngine } from '../services/simulationService';
import { generateSchedule } from '../services/scheduleService';
import { simulateOneDay } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches } from '../services/coachService';
import { initialPickAssets, makeUserPick, consensusValue } from '../services/draftService';
import { resolveDecision } from '../services/decisionService';
import { startOffseason, finishDraft, startSeason } from '../services/offseasonService';
import { getFreeAgents, signFreeAgentLegality, evaluateSigningInterest, signPlayer, processOffseasonContracts } from '../services/freeAgencyService';
import { expectedSalary, playerValue } from '../services/tradeService';

declare const process: { argv: string[] };
const CAREERS = Number(process.argv[2] || 3);
const YEARS = Number(process.argv[3] || 6);
// Third argument: `passivo` -- the user never re-signs anyone, the worst case;
// `competente` -- see playRegularSeason.
const RESIGN = process.argv[4] !== 'passivo';
const COMPETENT = process.argv[4] === 'competente';

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
      // `competente`: extends whoever will extend and never tears the roster
      // down -- the user who is actually trying to keep a core together.
      const keen = COMPETENT && (enabled.find(o => o.id.startsWith('extend:')) ?? enabled.find(o => ['hold', 'ride', 'keep', 'ignore'].includes(o.id)));
      s = resolveDecision(s, d.id, (keen || enabled[Math.floor(Math.random() * enabled.length)]).id);
    }
  }
  return s;
};

// The user's summer, same stand-in GM as check_contracts.
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
  // Over the limit after the draft: cut the least valuable, as the user must
  // before startSeason will open the season.
  const me = s.teams.find(t => t.id === s.userTeamId)!;
  if (me.roster.length > 18) {
    const cut = [...me.roster].sort((a, b) => playerValue(s.players[a]) - playerValue(s.players[b])).slice(0, me.roster.length - 18);
    s = { ...s, teams: s.teams.map(t => t.id === me.id ? { ...t, roster: t.roster.filter(id => !cut.includes(id)) } : t) };
  }
  const opened = startSeason(s);
  check('a temporada abre', opened.status === 'active', `elenco ${s.teams.find(t => t.id === s.userTeamId)!.roster.length}`);
  return opened;
};

import { buildSeasonRecord, evaluateAchievements, hallOfFame, hallOfFameScore, leagueRecords, franchiseRecords, jerseyCandidates, RESULT_LABEL } from '../services/historyService';

// Real playoffs this time: advance rounds until a champion, then record the
// season the way App.applyPlayoffUpdate does. `userTeamId` is hidden from the
// bracket so a 3-3 series never pauses for a live Game 7.
const playoffs = (s: SeasonState): SeasonState => {
  let playoff = s.playoff!;
  for (let i = 0; i < 20; i++) {
    const r = simulationEngine.advancePlayoffRound(playoff, s.players, s.coaches, '__none__');
    playoff = r.updatedPlayoff;
    if (r.newChampion) {
      const rec = buildSeasonRecord(s, playoff, r.newChampion);
      return {
        ...s, playoff, status: 'offseason',
        seasonHistory: [...(s.seasonHistory ?? []), rec],
        awardHistory: [...s.awardHistory, {
          season: s.gmLegacy.seasons + 1, championId: r.newChampion.id,
          mvp: s.awards!.mvp, dpoy: s.awards!.dpoy, roy: s.awards!.roy, smoy: s.awards!.smoy, mip: s.awards!.mip,
          finalsMvp: playoff.awards.finalsMVP,
        }],
        gmLegacy: { seasons: s.gmLegacy.seasons + 1, titles: s.gmLegacy.titles + (r.newChampion.id === s.userTeamId ? 1 : 0) },
      };
    }
  }
  throw new Error('playoffs did not finish');
};

let s = buildSeason((teamsData as Team[])[Number(process.argv[2] || 0) % 30].id);
const N = Number(process.argv[3] || 10);
for (let y = 0; y < N; y++) {
  s = playRegularSeason(s);
  s = playoffs(s);
  const h = s.seasonHistory![s.seasonHistory!.length - 1];
  console.log(`T${h.season} ${h.userTeamId} ${h.wins}-${h.losses} seed ${h.seed ?? '-'} ${RESULT_LABEL[h.result]} | campeão ${h.championId} x ${h.runnerUpId} | melhor ${h.bestRecord.teamId} ${h.bestRecord.wins} | pts ${s.players[h.leaders.pts!.playerId].name} ${h.leaders.pts!.value.toFixed(1)} | folha ${(h.payroll / 1e6).toFixed(0)}M`);
  const roy = s.players[s.awardHistory[s.awardHistory.length - 1].roy];
  console.log(`   ROY ${roy?.name} ${roy?.seasonStats?.ppg.toFixed(1)} pts (${roy?.ovr} OVR${roy?.draftInfo ? `, pick ${roy.draftInfo.pick}` : ''})`);
  check('o vice existe e não é o campeão', !!h.runnerUpId && h.runnerUpId !== h.championId);
  check('o campeão bate com o awardHistory', s.awardHistory[s.awardHistory.length - 1].championId === h.championId);
  check('a melhor campanha tem as vitórias máximas', h.bestRecord.wins === Math.max(...s.teams.map(t => t.wins || 0)));
  if (y < N - 1) s = userSummer(startOffseason(s));
}

const hof = hallOfFame(s.players);
console.log(`\nHall da Fama (${hof.length}):`, hof.slice(0, 12).map(p => `${p.name} (${p.career!.mvp} MVP, ${p.career!.allStar} AS, ${p.career!.pts} pts)`).join(' | '));
const retired = Object.values(s.players).filter(p => p.retired);
console.log(`Aposentados: ${retired.length}; com retiredFrom: ${retired.filter(p => p.retiredFrom).length}; candidatos à camisa: ${jerseyCandidates(s).map(p => p.name).join(', ') || '-'}`);
const drafted = Object.values(s.players).filter(p => p.draftInfo);
check('todo draftado tem time de origem', drafted.every(p => !!p.draftInfo!.teamId), `${drafted.filter(p => !p.draftInfo!.teamId).length} sem`);
const lr = leagueRecords(s);
console.log('Recordes:', `pts ${s.players[lr.single.pts!.playerId].name} ${lr.single.pts!.value.toFixed(1)} T${lr.single.pts!.season}`,
  `| campanha ${lr.bestTeam!.teamId} ${lr.bestTeam!.wins}`, `| carreira pts ${lr.career.pts.map(p => `${p.name} ${p.career!.pts}`).slice(0, 3).join(', ')}`);
console.log('Franquia:', JSON.stringify({ ...franchiseRecords(s), best: undefined, worst: undefined }));
console.log('Conquistas:', evaluateAchievements(s).map(a => `${a.unlocked ? '✓' : '·'} ${a.title}${a.unlocked ? ` T${a.season}` : a.progress ? ` ${a.progress}` : ''}`).join(' | '));
// Retired legends among seeded careers must clear the bar; check calibration.
const notable = ['LeBron James', 'Stephen Curry', 'Kevin Durant', 'Chris Paul', 'Kyle Lowry', 'Al Horford', 'Jeff Green', 'Garrett Temple'];
notable.forEach(n => { const p = Object.values(s.players).find(x => x.name === n); if (p) console.log(`  ${n}: score ${Math.round(hallOfFameScore(p.career))}${p.retired ? ' (aposentado)' : ''}`); });
console.log(failures ? `\n${failures} falha(s)` : '\nSem falhas.');
const mvps = s.awardHistory.map(a => { const p = s.players[a.mvp]; return `T${a.season} ${p?.name}${p?.draftInfo ? ` (draft #${p.draftInfo.pick} por ${p.draftInfo.teamId})` : ''}`; });
console.log('MVPs:', mvps.join(' | '));
declare const require: any;
if (process.argv[4]) {
  // Stand-in decisions: retire the first candidate's jersey so the screen has one up.
  const cand = jerseyCandidates(s)[0];
  const out = cand ? { ...s, retiredJerseys: [{ playerId: cand.id, season: s.awardHistory.length }] } : s;
  require('fs').writeFileSync(process.argv[4], JSON.stringify({ version: 1, savedAt: new Date().toISOString(), season: out }));
}
