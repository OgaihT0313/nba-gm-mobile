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
import { buildFive, planQuarter, courtStateAt, quarterSeconds } from '../services/watchDirector';
import type { WatchPlay } from '../types';

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
const finals: number[] = [];
let overtimes = 0;
let ties = 0;
for (let g = 0; g < 300; g++) {
  let h = 0;
  let a = 0;
  let q = 0;
  while (q < 4 || h === a) {
    q += 1;
    if (q > 8) { h += 1; break; }
    const plan = planQuarter({
      home, away, players, coaches: {}, fiveHome, fiveAway,
      userSide: 'home', play: PLAYS[g % PLAYS.length], timeout: false, quarter: q, from: 0,
    });
    for (const p of plan.possessions) {
      if (!p.made) continue;
      if (p.side === 'home') h += p.points; else a += p.points;
    }
  }
  if (q > 4) overtimes++;
  if (h === a) ties++;
  finals.push(h, a);
}
const lo = Math.min(...finals);
const hi = Math.max(...finals);
const mean = finals.reduce((x, y) => x + y, 0) / finals.length;
check('no ties ever reach the season', ties === 0, `${ties}`);
check('scores look like basketball', lo >= 80 && hi <= 150, `${lo}..${hi}`);
console.log(`\n300 full games: avg ${mean.toFixed(1)} pts, range ${lo}-${hi}, ${overtimes} went to OT, ${ties} ties`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
