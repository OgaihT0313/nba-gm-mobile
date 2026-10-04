import type { Player, Team } from '../types';

// Retirement, once a summer, right after players age.
//
// Before this nobody ever retired. Measured over eight simulated years
// (scripts/check_contracts.ts) the league just got older: the average top-eight
// fell from 81.6 to 78.6, median payroll followed it down ($192M -> $150M,
// salaries track value), and the free-agent pool grew by ~40 players a year who
// would never sign anywhere. Roughly 30-40 players leave a real NBA a year; this
// aims for that, and makes room for the draft classes that already arrive.
//
// Pure, and random only through the injected `rand`, so the harness can run it.

type PlayerMap = { [key: string]: Player };

export interface Retirement {
  playerId: string;
  name: string;
  age: number;
  ovr: number;
  /** Team he retired from; undefined if he was a free agent. */
  teamId?: string;
}

/**
 * The chance a player hangs it up this summer. Age is the driver; still being
 * good keeps a veteran going (stars play into their late thirties), and an
 * unsigned journeyman nobody wanted last year goes sooner.
 */
export const retirementChance = (p: Player, rostered: boolean): number => {
  if (p.retired || p.prospect) return 0;
  if (p.age >= 41) return 1;
  if (!rostered) {
    // A free agent nobody signed: the end comes earlier.
    if (p.age >= 34) return 0.85;
    if (p.age >= 31 && p.ovr < 72) return 0.55;
    if (p.age >= 28 && p.ovr < 64) return 0.35;
    return 0;
  }
  if (p.age < 33) return 0;
  const byAge = 0.06 + (p.age - 33) * 0.13;
  const byLevel = (76 - p.ovr) * 0.025; // a fading role player goes sooner
  const star = p.ovr >= 86 ? -0.12 : 0;
  return Math.max(0, Math.min(0.95, byAge + byLevel + star));
};

export const retirePlayers = (
  teams: Team[],
  players: PlayerMap,
  rand: () => number = Math.random,
): { teams: Team[]; players: PlayerMap; retired: Retirement[] } => {
  const teamOf = new Map<string, string>();
  teams.forEach((t) => t.roster.forEach((id) => teamOf.set(id, t.id)));

  const out: PlayerMap = { ...players };
  const retired: Retirement[] = [];
  for (const id in players) {
    const p = players[id];
    const teamId = teamOf.get(id);
    if (rand() >= retirementChance(p, !!teamId)) continue;
    // Kept in `players`, flagged: award history and career records still
    // point at him. He just leaves every roster and the market.
    out[id] = { ...p, retired: true, contractYears: 0, nextSalary: undefined, birdTeamId: undefined };
    retired.push({ playerId: id, name: p.name, age: p.age, ovr: p.ovr, teamId });
  }

  const gone = new Set(retired.map((r) => r.playerId));
  const newTeams = teams.map((t) => {
    if (!t.roster.some((id) => gone.has(id))) return t;
    const roster = t.roster.filter((id) => !gone.has(id));
    const starters = t.starters
      ? Object.fromEntries(Object.entries(t.starters).filter(([, pid]) => !gone.has(pid)))
      : t.starters;
    return { ...t, roster, starters };
  });

  retired.sort((a, b) => b.ovr - a.ovr);
  return { teams: newTeams, players: out, retired };
};
