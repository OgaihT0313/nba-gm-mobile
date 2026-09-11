// Proves the locker-room archetypes are MECHANICS and not labels.
//
// The failure this guards against is the one this project has hit twice: a
// system that is built, wired, shown on a card, and changes nothing. Every
// check below compares players who differ only by archetype and asserts the
// simulation treats them differently — if a personality could be deleted
// without moving a number, it does not deserve to exist.
//
// Not wired into the app bundle — nothing imports it. To run:
//
//   npx tsc scripts/check_personality.ts --ignoreConfig --ignoreDeprecations 6.0 \
//     --outDir .check --module commonjs --target es2020 --moduleResolution node \
//     --esModuleInterop --resolveJsonModule --skipLibCheck
//   cp -r data .check/data && node .check/scripts/check_personality.js [seasons]
import { teamsData, playersData } from '../constants';
import type { Team, Player, SeasonState } from '../types';
import { simulationEngine } from '../services/simulationService';
import { generateSchedule } from '../services/scheduleService';
import { simulateOneDay } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches } from '../services/coachService';
import { initialPickAssets } from '../services/draftService';
import { personalityOf, PERSONALITIES, PersonalityId } from '../services/personalityService';

declare const process: { argv: string[] };
const RUNS = Number(process.argv[2] || 8);

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL ${label} ${detail}`); }
};
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

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

const all = Object.values(playersData as { [k: string]: Player });

// --- 1. assignment: stable, and spread across the archetypes -----------------
console.log('- ATRIBUICAO -');
const counts: Record<string, number> = {};
all.forEach(p => { const id = personalityOf(p).id; counts[id] = (counts[id] || 0) + 1; });
Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${PERSONALITIES[k as PersonalityId].label.padEnd(14)} ${v} (${(100 * v / all.length).toFixed(0)}%)`));

(Object.keys(PERSONALITIES) as PersonalityId[]).forEach(id => {
  const share = (counts[id] || 0) / all.length;
  check(`${id} aparece numa fatia sensata da liga`, share >= 0.05 && share <= 0.45, `${(share * 100).toFixed(0)}%`);
});

const twice = all.every(p => personalityOf(p).id === personalityOf({ ...p }).id);
check('a atribuicao e estavel para o mesmo jogador', twice);
// The one input that must NOT move it: age changes every offseason, and a
// personality that reshuffled each year would be noise rather than character.
const aged = all.every(p => personalityOf(p).id === personalityOf({ ...p, age: p.age + 5 }).id);
check('envelhecer nao muda a personalidade', aged);

// --- 2. the effects actually land -------------------------------------------
console.log('\n- EFEITOS (simulando) -');
const moraleBy: Record<string, number[]> = {};
const loserStar: number[] = [];
const loserRest: number[] = [];
const teamWithLeader: number[] = [];
const teamWithoutLeader: number[] = [];
const gamesLostBy: Record<string, number[]> = {};
const growthBy: Record<string, number[]> = {};

for (let r = 0; r < RUNS; r++) {
  let season = buildSeason((teamsData as Team[])[r % teamsData.length].id);
  const ovrBefore = new Map(Object.values(season.players).map(p => [p.id, p.ovr]));
  for (let d = 0; d < 82; d++) season = simulateOneDay(season).season;

  season.teams.forEach(t => {
    const rotation = simulationEngine.getTeamRotation(t, season.players, t.rotationSize ?? 10);
    const hasLeader = rotation.some(id => season.players[id] && personalityOf(season.players[id]).id === 'lider');
    const roomMorale = rotation
      .map(id => season.players[id])
      .filter(p => p && personalityOf(p).id !== 'lider')
      .map(p => p.morale ?? 70);
    if (roomMorale.length) (hasLeader ? teamWithLeader : teamWithoutLeader).push(mean(roomMorale));
    t.roster.forEach(id => {
      const p = season.players[id];
      if (!p) return;
      const k = personalityOf(p).id;
      (moraleBy[k] ??= []).push(p.morale ?? 70);
      const wp = (t.wins ?? 0) / Math.max(1, (t.wins ?? 0) + (t.losses ?? 0));
      if (wp < 0.45) (k === 'estrela' ? loserStar : loserRest).push(p.morale ?? 70);
      const gp = p.seasonStats?.gp ?? 0;
      if (gp > 0) (gamesLostBy[k] ??= []).push(82 - gp);
      if (p.age <= 25 && gp > 20) (growthBy[k] ??= []).push(p.ovr - (ovrBefore.get(p.id) ?? p.ovr));
    });
  });
  // Development only happens at the offseason turn, so run progression once.
  const { updatedPlayers } = simulationEngine.runPlayerProgression(season.players);
  Object.values(updatedPlayers).forEach((p: Player) => {
    const gp = season.players[p.id]?.seasonStats?.gp ?? 0;
    if (p.age <= 26 && gp > 20) {
      (growthBy[personalityOf(p).id] ??= []).push(p.ovr - (ovrBefore.get(p.id) ?? p.ovr));
    }
  });
}

const line = (label: string, by: Record<string, number[]>, d = 1) =>
  console.log(`  ${label}: ` + Object.entries(by)
    .sort((a, b) => mean(b[1]) - mean(a[1]))
    .map(([k, v]) => `${PERSONALITIES[k as PersonalityId].label} ${mean(v).toFixed(d)}`).join('  |  '));

line('moral media ao fim da temporada', moraleBy);
line('jogos perdidos por lesao', gamesLostBy);
line('evolucao de OVR (ate 26 anos)', growthBy, 2);

// The workhorse is the only archetype that touches availability, which is the
// scarcest resource in the game now that injuries are real.
check('o guerreiro perde menos jogos que a media',
  mean(gamesLostBy['guerreiro'] ?? []) < mean(Object.values(gamesLostBy).flat()),
  `${mean(gamesLostBy['guerreiro'] ?? []).toFixed(1)} vs ${mean(Object.values(gamesLostBy).flat()).toFixed(1)}`);

// The star is unhappy about the RECORD, so the comparison has to be like for
// like: him against his own team-mates on the same LOSING team. Measured
// league-wide the effect vanishes into the teams that are winning, where the
// archetype deliberately does nothing.
check('numa campanha ruim a estrela fica mais infeliz que os companheiros',
  mean(loserStar) < mean(loserRest),
  `estrela ${mean(loserStar).toFixed(1)} vs resto ${mean(loserRest).toFixed(1)}`);

// Shrinking the lift is only safe if it still does something. Compared between
// teams, not between players: the leader's effect is on the ROOM.
check('elenco com lider termina com moral media mais alta',
  mean(teamWithLeader) > mean(teamWithoutLeader),
  `com ${mean(teamWithLeader).toFixed(1)} vs sem ${mean(teamWithoutLeader).toFixed(1)}`);

check('o prodigio evolui mais que a media',
  mean(growthBy['prodigio'] ?? []) > mean(Object.values(growthBy).flat()),
  `${mean(growthBy['prodigio'] ?? []).toFixed(2)} vs ${mean(Object.values(growthBy).flat()).toFixed(2)}`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
