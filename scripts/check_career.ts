// Minha Carreira, measured (PLANO-CARREIRA.md, "Medição"): whole careers run
// headless through services/career exactly as the screens drive them, and the
// outcomes compared with the real NBA by draft range.
//
// Not wired into the app bundle. To run:
//
//   npx tsc scripts/check_career.ts --ignoreConfig --ignoreDeprecations 6.0 --outDir <dir> \
//     --module commonjs --target es2020 --moduleResolution node --esModuleInterop \
//     --resolveJsonModule --skipLibCheck
//   cp -r data <dir>/data && node <dir>/scripts/check_career.js [careers] [seasons] [calibrate|era:<eraId>]
//
// The robot also lives the off-court half (fase 3): answers every press
// question with the first answer, signs the extension when it comes, takes
// its agent's pick at the end of a deal -- and retires (fase 4) at 37 or
// when the body says so at 41.
import type { PlayerAttributes } from '../types';
import { newCareer, simDay, simPlayoffs, runSummer, myTeam, seasonLineFor, seasonLabel } from '../services/career/careerLeague';
import { answerPress, acceptExtension, declineExtension, extensionOffer, EXTENSION_GAME, contractEnding, freeAgencyOffers, agentPick, signOffer, relationsOf } from '../services/career/careerLife';
import { retire, hallOfFameProgress, legendRanks } from '../services/career/careerLegacy';
import { roleOf, spendPoint, canSpend, gameScore } from '../services/career/careerTrust';
import { CAREER_STYLES, finishCombine, runCombineTest, interviewScore, defaultWeight, HEIGHT_RANGE } from '../services/career/careerCreate';
import type { CareerCreation, CareerState } from '../services/career/careerTypes';

declare const process: { argv: string[] };
const CAREERS = Number(process.argv[2] ?? 6);
const SEASONS = Number(process.argv[3] ?? 6);
const CALIBRATE = process.argv[4] === 'calibrate';
const ERA = process.argv[4]?.startsWith('era:') ? process.argv[4].slice(4) : undefined;
const RETIRE_AGE = 37;

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL ${label} ${detail}`); }
};

const randomCreation = (i: number): CareerCreation => {
  const style = CAREER_STYLES[i % CAREER_STYLES.length];
  const position = style.positions[i % style.positions.length];
  const [lo, hi] = HEIGHT_RANGE[position];
  const heightCm = Math.round((lo + hi) / 2);
  return {
    firstName: 'Teste', lastName: `Carreira${i}`, number: 7, position, style: style.id,
    heightCm, weightKg: defaultWeight(heightCm), skinTone: '#8a5a3c', personality: 'guerreiro',
  };
};

/** The bot: trains its strengths, spends every point on its style's strengths. */
const spendAll = (s: CareerState): CareerState => {
  const style = CAREER_STYLES.find((x) => x.id === s.creation.style)!;
  let next = s;
  for (let guard = 0; guard < 200; guard++) {
    const p = next.league.players[next.meId];
    const key = [...style.strengths].sort((a, b) => (p.attributes![a] - p.attributes![b]))[0] as keyof PlayerAttributes;
    if (!canSpend(next, key).ok) break;
    next = spendPoint(next, key);
  }
  return next;
};

interface Outcome {
  pick: number | null;
  lines: CareerState['seasons'];
  peakOvr: number;
  allStar: number;
  starterSeasons: number;
}

const meOf = (s: CareerState) => s.league.players[s.meId];
let presses = 0, extensions = 0, signings = 0, moves = 0, retirements = 0;
const hofScores: number[] = [];
const ptsRanks: number[] = [];
const t0 = Date.now();
const seasonMs: number[] = [];
const outcomes: Outcome[] = [];
for (let c = 0; c < CAREERS; c++) {
  let s = newCareer(randomCreation(c), ERA);
  if (ERA) check('era career starts in its season', seasonLabel(s) === s.league.era?.seasonLabel, `${seasonLabel(s)} vs ${s.league.era?.seasonLabel}`);
  // The season before the draft, then the combine and the draft.
  let ts = Date.now();
  while (s.league.status === 'active') s = simDay(s);
  s = simPlayoffs(s);
  seasonMs.push(Date.now() - ts);
  const p0 = s.prospect!;
  const combine = finishCombine(
    runCombineTest(p0.attributes!.shooting, 'safe'), runCombineTest(p0.attributes!.athleticism, 'bold'), interviewScore('humble'));
  const prospect = { ...p0, ovr: p0.ovr + combine.ovrDelta, off: p0.off + combine.ovrDelta, def: p0.def + combine.ovrDelta };
  s = runSummer({ ...s, combine }, { player: prospect, combine });
  check('drafted player is on a roster', !!myTeam(s));

  let peak = 0;
  for (let y = 0; y < SEASONS; y++) {
    ts = Date.now();
    const roles: number[] = [];
    while (s.league.status === 'active') {
      s = simDay(s);
      if (s.league.gamesPlayed % 10 === 0) roles.push(roleOf(s).rank);
      s = spendAll(s);
      if (s.press) { presses++; s = answerPress(s, s.press.answers[0].id); }
      if (s.league.gamesPlayed >= EXTENSION_GAME && s.extensionAnswered !== s.league.gmLegacy.seasons && extensionOffer(s)) {
        // Half the robots sign, half test the market (free agency gets exercised).
        if (c % 2 === 0) { extensions++; s = acceptExtension(s); } else s = declineExtension(s);
      }
    }
    s = simPlayoffs(s);
    seasonMs.push(Date.now() - ts);
    const me = s.league.players[s.meId];
    peak = Math.max(peak, me?.ovr ?? 0);
    if (CALIBRATE && y === 0) {
      // expectedGameScore: per-minute game score by OVR across the league.
      const rows = Object.values(s.league.players).filter((p) => p.seasonStats && p.seasonStats.gp > 40 && p.seasonStats.mpg > 10);
      const buckets = new Map<number, number[]>();
      rows.forEach((p) => {
        const st = p.seasonStats!;
        const gs = gameScore({ min: st.mpg, pts: st.ppg, reb: st.rpg, ast: st.apg, stl: st.spg, blk: st.bpg, tov: st.tpg });
        const b = Math.round(p.ovr / 4) * 4;
        buckets.set(b, [...(buckets.get(b) ?? []), gs / st.mpg]);
      });
      console.log('game score per minute by OVR:', [...buckets.entries()].sort((a, b) => a[0] - b[0])
        .map(([o, v]) => `${o}: ${(v.reduce((x, y) => x + y, 0) / v.length).toFixed(3)} (${v.length})`).join(' | '));
    }
    // End of a deal: the agent's pick, before the summer runs.
    if (contractEnding(s)) {
      const offers = freeAgencyOffers(s);
      check('free agency has offers', offers.length >= 2, `${offers.length}`);
      const pick = agentPick(offers);
      const o = offers.find((x) => x.teamId === pick?.teamId);
      if (o) { const before = myTeam(s)?.id; s = signOffer(s, o); signings++; if (myTeam(s)?.id !== before) moves++; }
    }
    const rel = relationsOf(s);
    check('relations stay 0-100', rel.locker >= 0 && rel.locker <= 100 && rel.front >= 0 && rel.front <= 100);
    if ((meOf(s)?.age ?? 0) >= RETIRE_AGE) { s = retire(s, seasonLineFor(s)); break; }
    s = runSummer(s);
    check('the summer never retires you', !s.league.players[s.meId]?.retired);
    check('still on a roster after the summer', !!myTeam(s));
  }
  if (s.phase === 'retired') {
    retirements++;
    check('retired: off every roster', !s.league.teams.some((t) => t.roster.includes(s.meId)));
    check('retired: summary written', !!s.retirement && s.retirement.seasons === s.seasons.length);
  }
  hofScores.push(hallOfFameProgress(s).score);
  ptsRanks.push(legendRanks(s)[0].rank);
  const lines = s.seasons;
  outcomes.push({
    pick: s.draft?.pick ?? null,
    lines,
    peakOvr: peak,
    allStar: lines.filter((l) => l.honors.includes('All-Star')).length,
    starterSeasons: lines.filter((l) => l.role === 'Titular' || l.role === 'Estrela').length,
  });
  console.log(`career ${c + 1}: ${s.creation.style} ${s.draft?.label} -> ` + lines.map((l) =>
    `${l.label.slice(2)} ${l.teamId.toUpperCase()} ${l.ovr} ${l.role.slice(0, 7)} ${l.mpg.toFixed(0)}m ${l.ppg.toFixed(1)}p${l.honors.length ? ' ' + l.honors.join('/') : ''}`).join(' | ')
    + ` (teto ${s.ceiling})`);
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
console.log(`\nseason sim: ${avg(seasonMs).toFixed(0)} ms average (node), total ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const picks = outcomes.map((o) => o.pick);
console.log(`draft: ${picks.map((p) => p ?? 'ND').join(', ')}`);
console.log(`peak OVR avg ${avg(outcomes.map((o) => o.peakOvr)).toFixed(1)}, All-Star seasons/career ${avg(outcomes.map((o) => o.allStar)).toFixed(2)}, starter seasons ${avg(outcomes.map((o) => o.starterSeasons)).toFixed(1)} of ${SEASONS}`);
check('every career got a team', outcomes.every((o) => o.lines.length >= Math.min(SEASONS, 1)));
console.log(`off the floor: ${presses} press conferences, ${extensions} extensions, ${signings} free-agency signings (${moves} to a new team), ${retirements} retirements`);
console.log(`legacy: Hall of Fame score avg ${avg(hofScores).toFixed(1)}, best points rank avg ${avg(ptsRanks).toFixed(0)}`);
check('press conferences happen', presses > 0);
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
