// Runs services/watchDirector.ts outside the app, on real teams and rosters,
// to check the numbers before anything reaches a phone: that a quarter's
// possessions tile the clock, that the points the screen sums off those
// possessions equal what the director planned, that nobody is rendered
// outside the arena, and that a mid-quarter timeout can't rewrite points
// already on the board. Also prints per-play scoring splits, which is how the
// playBias multipliers were calibrated.
//
// Not wired into the app bundle — nothing imports it. To run:
//
//   npx tsc scripts/check_watch_director.ts --ignoreConfig --ignoreDeprecations 6.0 //     --outDir .check --module commonjs --target es2020 --moduleResolution node //     --esModuleInterop --resolveJsonModule --skipLibCheck
//   cp -r data .check/data && node .check/scripts/check_watch_director.js
import { teamsData, playersData } from '../constants';
import { buildFive, planQuarter, courtStateAt, quarterSeconds, breakRecovery, rotationAt, advanceClock, SCREEN_SPRINT, type Energy, type FiveOnCourt } from '../services/watchDirector';
import type { WatchPlay, Player } from '../types';
import { simulationEngine, getRotationWeights } from '../services/simulationService';

const home = teamsData[0];
const away = teamsData[1];
const players = playersData;
const fiveHome = buildFive(home, players, 'home');
const fiveAway = buildFive(away, players, 'away');

console.log('HOME five:', fiveHome.players.map((p) => `${p.slot} ${p.name}`).join(' | '));
console.log('AWAY five:', fiveAway.players.map((p) => `${p.slot} ${p.name}`).join(' | '));

const PLAYS: WatchPlay[] = ['pick_roll', 'pindown', 'post_up', 'iso'];
let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL ${label} ${detail}`); }
};

for (const play of PLAYS) {
  // 40 quarters per play so the random pieces get exercised.
  const totals: number[] = [];
  const scorers = new Map<string, number>();
  for (let n = 0; n < 40; n++) {
    const plan = planQuarter({
      home, away, players, coaches: {}, fiveHome, fiveAway,
      userSide: 'home', play, timeout: false, quarter: 1, from: 0,
    });
    const total = quarterSeconds(1);

    // Coverage: possessions tile the quarter with no hole bigger than a
    // possession, and none run past the buzzer.
    const homeP = plan.possessions.filter((p) => p.side === 'home');
    check('possessions exist', plan.possessions.length > 20, `${plan.possessions.length}`);
    check('starts at 0', plan.possessions[0].start === 0, `${plan.possessions[0].start}`);
    check('ends by buzzer', plan.possessions.every((p) => p.end <= total + 0.01));

    // Score bookkeeping: what the screen sums off the possessions must equal
    // what the director planned for the quarter.
    let scored = 0;
    for (const p of homeP) if (p.made) scored += p.points;
    check('home points match plan', scored === plan.pointsHome, `${scored} vs ${plan.pointsHome}`);
    totals.push(plan.pointsHome);

    for (const p of homeP) if (p.made) scorers.set(p.scorerName, (scorers.get(p.scorerName) ?? 0) + p.points);

    // Continuity: a possession is authored in its own frame, so without the
    // stitch pass every change of possession snaps all ten players to new
    // spots. Sampling a tenth of a game-second apart, nobody should cover
    // more ground than a sprint.
    if (n === 0) {
      let maxJump = 0;
      let worst = '';
      let prevSt = courtStateAt(plan, 0, fiveHome, fiveAway)!;
      for (let t = 0.1; t < total; t += 0.1) {
        const st = courtStateAt(plan, t, fiveHome, fiveAway)!;
        for (let i = 0; i < 10; i++) {
          const d = Math.hypot(st.players[i].x - prevSt.players[i].x, st.players[i].z - prevSt.players[i].z);
          if (d > maxJump) { maxJump = d; worst = `${st.players[i].name} at t=${t.toFixed(1)}s`; }
        }
        prevSt = st;
      }
      check('no teleports between possessions', maxJump < 3, `${maxJump.toFixed(2)}ft per 0.1s (${worst})`);
      console.log(`${play.padEnd(10)} max player movement ${maxJump.toFixed(2)} ft per 0.1 game-second`);
    }

    // Geometry: nobody leaves the building at any point in the quarter.
    for (let t = 0; t < total; t += 7) {
      const st = courtStateAt(plan, t, fiveHome, fiveAway);
      if (!st) { check('court state', false, `t=${t}`); continue; }
      check('ten players', st.players.length === 10, `${st.players.length}`);
      check('home five first', st.players.slice(0, 5).every((p) => p.side === 'home'));
      check('away five last', st.players.slice(5).every((p) => p.side === 'away'));
      for (const p of st.players) {
        check('player on court', Math.abs(p.x) < 60 && Math.abs(p.z) < 32, `${p.name} ${p.x.toFixed(0)},${p.z.toFixed(0)}`);
        check('rotY finite', Number.isFinite(p.rotY));
      }
      check('ball in bounds', Math.abs(st.ball.x) < 60 && Math.abs(st.ball.z) < 32 && st.ball.y > -1 && st.ball.y < 25,
        `${st.ball.x.toFixed(0)},${st.ball.y.toFixed(1)},${st.ball.z.toFixed(0)}`);
    }
  }

  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  const top = [...scorers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  console.log(`${play.padEnd(10)} avg Q pts ${avg.toFixed(1)} (min ${Math.min(...totals)}, max ${Math.max(...totals)})`);
  console.log(`           top scorers: ${top.map(([n, p]) => `${n} ${(p / 40).toFixed(1)}`).join(', ')}`);
}

// Screen pacing (PLANO-3D Etapa 4b), driven the way WatchGameScreen drives it:
// 60 fps frames through advanceClock. Between cuts nobody may move faster on
// screen than the director's SCREEN_SPRINT (ft per REAL second, 5% slack for
// frame sampling); every shot must be on screen; and a quarter has to fit a
// watchable length at normal speed.
{
  const FRAME = 1 / 60;
  let worstSpeed = 0;
  let worstAt = '';
  const quarterReal: number[] = [];
  let shotsSeen = 0;
  let shotsTotal = 0;
  let cuts = 0;
  for (const play of PLAYS) {
    for (let n = 0; n < 10; n++) {
      const plan = planQuarter({
        home, away, players, coaches: {}, fiveHome, fiveAway,
        userSide: 'home', play, timeout: false, quarter: 1, from: 0,
      });
      const total = quarterSeconds(1);
      let t = 0;
      let real = 0;
      let prev = courtStateAt(plan, 0, fiveHome, fiveAway)!;
      const seen = new Set<number>();
      while (t < total && real < 3600) {
        const step = advanceClock(plan, t, FRAME, { speed: 1, userSide: 'home' });
        real += FRAME;
        t = Math.min(total, step.seconds);
        // A shot is on screen when some frame shows the ball in its last
        // game-second before the rim.
        plan.possessions.forEach((p, i) => {
          if (t >= p.shotAt - 1 && t <= p.shotAt) seen.add(i);
        });
        const st = courtStateAt(plan, t, fiveHome, fiveAway);
        if (!st) break;
        if (step.cut) cuts++;
        else {
          for (let i = 0; i < 10; i++) {
            const v = Math.hypot(st.players[i].x - prev.players[i].x, st.players[i].z - prev.players[i].z) / FRAME;
            if (v > worstSpeed) { const ps = plan.possessions.find((q) => q.start <= t && t < q.end); worstSpeed = v; worstAt = `${play} ${st.players[i].name} t=${t.toFixed(1)}s` + (ps ? ` frac ${((t - ps.start) / (ps.end - ps.start)).toFixed(2)} ${ps.side} ${ps.end - ps.start}s` : ''); }
          }
        }
        prev = st;
      }
      quarterReal.push(real);
      shotsTotal += plan.possessions.filter((p) => p.shotAt < total).length;
      shotsSeen += seen.size;
    }
  }
  const avgQ = quarterReal.reduce((a, b) => a + b, 0) / quarterReal.length;
  check('screen speed is a sprint, not a teleport', worstSpeed <= SCREEN_SPRINT * 1.05, `${worstSpeed.toFixed(1)} ft/s (${worstAt})`);
  check('every shot is on screen', shotsSeen === shotsTotal, `${shotsSeen}/${shotsTotal}`);
  check('quarter fits a watchable length', avgQ >= 90 && avgQ <= 240, `${avgQ.toFixed(0)} s`);
  console.log(`pacing: max on-screen speed ${worstSpeed.toFixed(1)} ft/s between cuts (limit ${SCREEN_SPRINT}); `
    + `quarter ${avgQ.toFixed(0)} s real at 1x (${Math.min(...quarterReal).toFixed(0)}-${Math.max(...quarterReal).toFixed(0)}); `
    + `${(cuts / quarterReal.length).toFixed(0)} cuts per quarter; shots on screen ${shotsSeen}/${shotsTotal}`);
}

// Actions (PLANO-3D Etapa 4): every basket has its finish on screen before the
// ball reaches the rim -- the shooter in a shot/layup/dunk and his defender
// contesting -- and every assisted-shape trip shows the pass. Also prints how
// the made twos at the rim split between dunks and layups.
{
  let baskets = 0, finished = 0, contested = 0, passTrips = 0, passShown = 0;
  const finishes: Record<string, number> = { shot: 0, layup: 0, dunk: 0 };
  for (const play of PLAYS) {
    for (let n = 0; n < 10; n++) {
      const plan = planQuarter({
        home, away, players, coaches: {}, fiveHome, fiveAway,
        userSide: 'home', play, timeout: false, quarter: 1, from: 0,
      });
      for (const p of plan.possessions) {
        const release = p.beats[p.beats.length - 3].t;
        const gather = p.beats[p.beats.length - 4].t;
        // Sample the gather and the flight.
        const at = [gather + (release - gather) * 0.5, release + (p.shotAt - release) * 0.5];
        const shooterIdx = (p.side === 'home' ? 0 : 5) + p.shooter;
        const defIdx = (p.side === 'home' ? 5 : 0) + p.shooter;
        if (p.made) {
          baskets++;
          finishes[p.finish ?? 'shot']++;
          const ok = at.every((t) => {
            const st = courtStateAt(plan, t, fiveHome, fiveAway)!;
            return st.players[shooterIdx].action === (p.finish ?? 'shot');
          });
          if (ok) finished++;
          const st = courtStateAt(plan, at[1], fiveHome, fiveAway)!;
          if (st.players[defIdx].action === 'contest') contested++;
        }
        if (p.passer !== null && p.passer !== p.shooter) {
          passTrips++;
          const mid = p.beats[2].t + (p.beats[3].t - p.beats[2].t) * 0.5;
          const st = courtStateAt(plan, mid, fiveHome, fiveAway)!;
          if (st.players[(p.side === 'home' ? 0 : 5) + p.passer].action === 'pass') passShown++;
        }
      }
    }
  }
  check('every basket shows its finish', finished === baskets, `${finished}/${baskets}`);
  check('every basket is contested', contested === baskets, `${contested}/${baskets}`);
  check('every pass is shown', passShown === passTrips, `${passShown}/${passTrips}`);
  const rim = finishes.layup + finishes.dunk;
  console.log(`actions: ${finished}/${baskets} baskets show their finish, ${passShown}/${passTrips} passes; `
    + `made: ${finishes.shot} jumpers, ${finishes.layup} layups, ${finishes.dunk} dunks `
    + `(${rim ? Math.round((100 * finishes.dunk) / rim) : 0}% of finishes at the rim)`);
}

// A timeout mid-quarter must not rewrite points already on the board.
const plan = planQuarter({
  home, away, players, coaches: {}, fiveHome, fiveAway,
  userSide: 'home', play: 'pick_roll', timeout: false, quarter: 1, from: 0,
});
const cut = 400;
const before = plan.possessions.filter((p) => p.made && p.shotAt <= cut)
  .reduce((acc, p) => acc + (p.side === 'home' ? p.points : 0), 0);
const rest = planQuarter({
  home, away, players, coaches: {}, fiveHome, fiveAway,
  userSide: 'home', play: 'iso', timeout: true, quarter: 1, from: cut,
});
const merged = [...plan.possessions.filter((p) => p.start < cut), ...rest.possessions];
const afterSame = merged.filter((p) => p.made && p.shotAt <= cut)
  .reduce((acc, p) => acc + (p.side === 'home' ? p.points : 0), 0);
check('timeout keeps scored points', before === afterSame, `${before} vs ${afterSame}`);
check('timeout only replans remainder', rest.possessions.every((p) => p.start >= cut));
console.log(`timeout: ${before} pts kept, remainder replanned from ${cut}s (${rest.possessions.length} new possessions)`);

// Full games, driven exactly the way WatchGameScreen drives them: plan a
// quarter, sum the baskets that actually went in, go to overtime on a tie.
// This is the number that gets pinned into the season, so it has to look like
// a basketball score and never like a draw.
// The rotation carries from quarter to quarter -- the five and everyone's
// energy at the buzzer, plus the break's recovery -- exactly as the screen
// threads it. `autoHome: false` is a GM who never subs: the starters play it out.
interface GameResult { h: number; a: number; q: number; minutes: Map<string, number>; q4Home: number; badFives: number }
const playGame = (play: WatchPlay, autoHome: boolean): GameResult => {
  let h = 0;
  let a = 0;
  let q = 0;
  let q4Home = 0;
  let badFives = 0;
  let fh: FiveOnCourt = fiveHome;
  let fa: FiveOnCourt = fiveAway;
  let energy: Energy | undefined;
  const minutes = new Map<string, number>();
  while (q < 4 || h === a) {
    q += 1;
    if (q > 8) { h += 1; break; }
    const plan = planQuarter({
      home, away, players, coaches: {}, fiveHome: fh, fiveAway: fa, energy,
      autoSubs: { home: autoHome, away: true },
      userSide: 'home', play, timeout: false, quarter: q, from: 0,
    });
    for (const p of plan.possessions) {
      const secs = p.end - p.start;
      for (const pl of p.fiveHome!.players) minutes.set(pl.playerId, (minutes.get(pl.playerId) ?? 0) + secs / 60);
      // Five distinct bodies, every one of them on the roster.
      const ids = p.fiveHome!.players.map((x) => x.playerId);
      if (new Set(ids).size !== 5 || !ids.every((id) => home.roster.includes(id))) badFives++;
      const idsA = p.fiveAway!.players.map((x) => x.playerId);
      if (new Set(idsA).size !== 5 || !idsA.every((id) => away.roster.includes(id))) badFives++;
      if (!p.made) continue;
      if (p.side === 'home') h += p.points; else a += p.points;
      if (q === 4 && p.side === 'home') q4Home += p.points;
    }
    fh = plan.endFiveHome;
    fa = plan.endFiveAway;
    energy = breakRecovery(plan.endEnergy, q);
  }
  return { h, a, q, minutes, q4Home, badFives };
};

const finals: number[] = [];
let overtimes = 0;
let ties = 0;
let badFives = 0;
const minutesSum = new Map<string, number>();
const q4Auto: number[] = [];
const GAMES = 300;
for (let g = 0; g < GAMES; g++) {
  const r = playGame(PLAYS[g % PLAYS.length], true);
  if (r.q > 4) overtimes++;
  if (r.h === r.a) ties++;
  badFives += r.badFives;
  finals.push(r.h, r.a);
  if (r.q === 4) q4Auto.push(r.q4Home);
  r.minutes.forEach((m, id) => minutesSum.set(id, (minutesSum.get(id) ?? 0) + m));
}
check('every five is five distinct rostered players', badFives === 0, `${badFives}`);

// Minutes the automatic rotation hands out, against what the season's box
// score gives the same players (getRotationWeights' curve: ~36 for the top
// starter tapering to the end of the bench).
const perGame = [...minutesSum.entries()].map(([id, m]) => ({ id, m: m / GAMES })).sort((x, y) => y.m - x.m);
console.log('\nminutes per game, automatic rotation (home):');
console.log('  ' + perGame.map((x) => `${players[x.id].name.split(' ').pop()} ${x.m.toFixed(1)}`).join(' | '));
const starterIds = fiveHome.players.map((p) => p.playerId);
const starterMin = perGame.filter((x) => starterIds.includes(x.id)).map((x) => x.m);
const benchMin = perGame.filter((x) => !starterIds.includes(x.id)).reduce((s2, x) => s2 + x.m, 0);
check('starters play real-NBA starter minutes', starterMin.every((m) => m >= 26 && m <= 40),
  starterMin.map((m) => m.toFixed(1)).join(','));
check('the bench actually plays', benchMin >= 40 && benchMin <= 110, benchMin.toFixed(1));

// Riding the starters: stronger names on the floor, but they wear down. The
// fourth quarter is where it shows.
const q4Ride: number[] = [];
let rideMinutes = 0;
for (let g = 0; g < GAMES; g++) {
  const r = playGame(PLAYS[g % PLAYS.length], false);
  if (r.q === 4) q4Ride.push(r.q4Home);
  rideMinutes += starterIds.reduce((s2, id) => s2 + (r.minutes.get(id) ?? 0), 0) / 5;
}
const avgOf = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / (xs.length || 1);
console.log(`4th quarter, home: auto rotation ${avgOf(q4Auto).toFixed(1)} pts vs starters all game ${avgOf(q4Ride).toFixed(1)} pts (starters ${(rideMinutes / GAMES).toFixed(1)} min)`);
check('a five that never rests fades late', avgOf(q4Ride) < avgOf(q4Auto) - 1,
  `${avgOf(q4Ride).toFixed(1)} vs ${avgOf(q4Auto).toFixed(1)}`);

// What the screen played is what the season records: the minutes go into the
// box score, and through it into load. A GM who rides his starters pays for it
// in the very next game's injury risk.
{
  const loadAfter = (autoHome: boolean) => {
    const r = playGame('pick_roll', autoHome);
    const minutes: { [id: string]: number } = {};
    r.minutes.forEach((m, id) => { minutes[id] = m; });
    const ps: { [k: string]: Player } = JSON.parse(JSON.stringify(players));
    const team = JSON.parse(JSON.stringify(home));
    team.wins = 1; team.losses = 0;
    simulationEngine.recordGameStats(team, 110, 100, ps, minutes);
    const mpg = starterIds.map((id) => ps[id].seasonStats?.mpg ?? 0);
    return { load: starterIds.reduce((acc, id) => acc + (ps[id].load ?? 0), 0) / 5, mpg };
  };
  const auto = loadAfter(true);
  const ride = loadAfter(false);
  console.log(`load after one game, starters: auto rotation ${auto.load.toFixed(1)} vs never subbed ${ride.load.toFixed(1)}`);
  check('box score records the minutes played on screen', ride.mpg.every((m) => m > 44), ride.mpg.map((m) => m.toFixed(0)).join(','));
  check('riding the starters costs load', ride.load > auto.load + 3, `${ride.load.toFixed(1)} vs ${auto.load.toFixed(1)}`);
}

// The GM's own five survives the coach. Seen live before the fix: swap a
// reserve in for a starter, and the automatic rotation sent the starter back
// at the very first dead ball.
{
  const reserve = home.roster.find((id) => !starterIds.includes(id) && players[id] && players[id].ovr >= 70)!;
  const mine = { ...fiveHome, players: fiveHome.players.map((p, i) => (i === 1 ? { playerId: reserve, name: players[reserve].name, slot: p.slot } : p)) };
  const chosen = mine.players.map((p) => p.playerId);
  const plan = planQuarter({
    home, away, players, coaches: {}, fiveHome: mine, fiveAway,
    userPriority: [...chosen, ...getRotationWeights(home, players).ids.filter((id) => !chosen.includes(id))],
    userSide: 'home', play: 'pick_roll', timeout: false, quarter: 1, from: 0,
  });
  const early = plan.possessions.filter((p) => p.start < 180);
  // ...and behind it the coach still only uses his rotation.
  const rotationIds = new Set([...chosen, ...getRotationWeights(home, players).ids]);
  check('nobody outside the rotation plays', plan.possessions.every((p) => p.fiveHome!.players.every((x) => rotationIds.has(x.playerId))));
  check("the GM's choice is not undone at the next dead ball",
    early.every((p) => p.fiveHome!.players.some((x) => x.playerId === reserve)), players[reserve].name);
}

// A timeout reads the rotation as it stood, so the remainder starts from the
// same five and the same legs.
{
  const pl = planQuarter({
    home, away, players, coaches: {}, fiveHome, fiveAway,
    userSide: 'home', play: 'pick_roll', timeout: false, quarter: 1, from: 0,
  });
  const at = rotationAt(pl, 500);
  check('rotation readable mid-quarter', !!at && at.fiveHome.players.length === 5 && Object.keys(at.energy).length > 10);
}
const lo = Math.min(...finals);
const hi = Math.max(...finals);
const mean = finals.reduce((x, y) => x + y, 0) / finals.length;
check('no ties ever reach the season', ties === 0, `${ties}`);

// Checked on the CENTRE of the distribution, not its edges.
//
// This used to assert that the observed min and max of 300 games fell inside a
// band, which is the same sample-size trap diagnose_season.ts already had to
// drop: the extreme of a sample is not a property of the model, it drifts
// outward the more you run, and the only way to keep such a check passing is to
// widen it forever. It flipped on roughly one run in four. The mean and the
// spread are stable at any sample size and say the same thing about whether the
// watched game produces basketball.
const sorted = [...finals].sort((x, y) => x - y);
const pct = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
const sd = Math.sqrt(finals.reduce((s, v) => s + (v - mean) ** 2, 0) / finals.length);
check('watched games score like the rest of the league', mean >= 110 && mean <= 122, mean.toFixed(1));
check('watched games carry a real spread', sd >= 10 && sd <= 16, sd.toFixed(1));
check('the bulk of scores is plausible', pct(0.05) >= 88 && pct(0.95) <= 145,
  `p5 ${pct(0.05)} / p95 ${pct(0.95)}`);
console.log(`\n300 full games: avg ${mean.toFixed(1)} pts, range ${lo}-${hi}, ${overtimes} went to OT, ${ties} ties`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
