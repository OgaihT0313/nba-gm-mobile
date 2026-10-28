// Shared by every check script: import it FIRST, for its side effects.
//
//   import './harness';
//
// 1. A fixed seed. The engine draws everything from Math.random, so the checks
//    used to be a fresh lottery each run: the same code passed one run and
//    failed the next (check_decisions, check_development, the leader check).
//    Math.random is replaced by a seeded generator (mulberry32), so a run is
//    reproducible; SEED=<n> explores another draw:
//      SEED=7 node .check/scripts/check_decisions.js
// 2. A failing exit code. The scripts print "FAIL ..." and used to exit 0
//    anyway, so nothing automatic could notice. Any line that starts with FAIL
//    (or a diagnose_season metric out of range) now makes the process exit 1.

type Proc = { env: { [k: string]: string | undefined }; exitCode?: number; on: (ev: string, fn: () => void) => void };
const proc = (globalThis as unknown as { process: Proc }).process;

export const SEED = Number(proc.env.SEED ?? 20261025) >>> 0;

const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
Math.random = mulberry32(SEED);

// Lines that mean the run failed, whatever the script's own wording.
const FAILURE = [/^\s*FAIL\b/, /^\s*([1-9]\d*) de \d+ m[eé]tricas fora da faixa/];
let failed = 0;
const log = console.log.bind(console);
console.log = (...args: unknown[]) => {
  const text = args.map(String).join(' ');
  text.split('\n').forEach((line) => { if (FAILURE.some((re) => re.test(line))) failed++; });
  log(...args);
};

log(`(semente ${SEED}; SEED=<n> para outro sorteio)`);
proc.on('exit', () => { if (failed) proc.exitCode = 1; });
