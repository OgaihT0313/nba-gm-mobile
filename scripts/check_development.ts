// Training focus and the minutes promise have to turn into numbers the engine
// reads. Run: npx tsx scripts/check_development.ts
import { playersData, teamsData } from '../constants';
import type { Player, SeasonState, Team } from '../types';
import { simulationEngine } from '../services/simulationService';
import { settleMinutesPromise, applyPromiseMorale, canPromiseMinutes, PROMISE_MPG } from '../services/developmentService';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label} ${detail}`);
  if (!ok) failures++;
};
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

const base = playersData as unknown as { [k: string]: Player };
const USER = 'usr';
const ids = Object.keys(base);
const teamOf = Object.fromEntries(ids.map((id) => [id, USER]));
// Everyone plays starter minutes, so growth isn't gated on opportunity.
const withMinutes = (focus?: Player['trainingFocus']) => Object.fromEntries(ids.map((id) => [id, {
  ...base[id], trainingFocus: focus, seasonStats: { gp: 70, mpg: 32, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
}]));

const run = (focus?: Player['trainingFocus'], pick: (p: Player) => boolean = () => true, n = 30) => {
  const off: number[] = [], def: number[] = [], ovr: number[] = [];
  for (let i = 0; i < n; i++) {
    const before = withMinutes(focus);
    const { updatedPlayers } = simulationEngine.runPlayerProgression(before, {}, teamOf, USER);
    ids.forEach((id) => {
      if (!pick(before[id])) return;
      off.push(updatedPlayers[id].off - before[id].off);
      def.push(updatedPlayers[id].def - before[id].def);
      ovr.push(updatedPlayers[id].ovr - before[id].ovr);
    });
  }
  return { off: mean(off), def: mean(def), ovr: mean(ovr) };
};

console.log('=== Foco de treino (jovens ≤23, 30 rodadas) ===');
const young = (p: Player) => p.age <= 22;
const bal = run(undefined, young), sh = run('shooting', young), de = run('defense', young), ph = run('physical', young);
const f = (r: { off: number; def: number; ovr: number }) => `off ${r.off.toFixed(2)} def ${r.def.toFixed(2)} ovr ${r.ovr.toFixed(2)}`;
console.log(`  equilibrado ${f(bal)}\n  arremesso   ${f(sh)}\n  defesa      ${f(de)}\n  físico      ${f(ph)}`);
check('arremesso põe mais no ataque que o equilibrado', sh.off > bal.off + 0.2);
check('arremesso tira da defesa', sh.def < bal.def - 0.2);
check('defesa espelha', de.def > bal.def + 0.2 && de.off < bal.off - 0.2);
check('o foco não muda o OVR', Math.abs(sh.ovr - bal.ovr) < 0.15 && Math.abs(de.ovr - bal.ovr) < 0.15);
check('físico faz o jovem evoluir menos', ph.ovr < bal.ovr - 0.05);

console.log('=== Físico no veterano (≥31) ===');
const vet = (p: Player) => p.age >= 31;
const vb = run(undefined, vet), vp = run('physical', vet);
console.log(`  sem foco ${f(vb)}\n  físico   ${f(vp)}`);
check('físico freia o declínio do veterano', vp.ovr > vb.ovr + 0.3);

console.log('=== Foco só vale no time do usuário ===');
{
  const before = withMinutes('shooting');
  const cpuOf = Object.fromEntries(ids.map((id) => [id, 'cpu']));
  const offs: number[] = [], defs: number[] = [];
  for (let i = 0; i < 30; i++) {
    const { updatedPlayers } = simulationEngine.runPlayerProgression(before, {}, cpuOf, USER);
    ids.filter((id) => young(before[id])).forEach((id) => { offs.push(updatedPlayers[id].off - before[id].off); defs.push(updatedPlayers[id].def - before[id].def); });
  }
  check('no CPU o foco é ignorado', Math.abs(mean(offs) - bal.off) < 0.15 && Math.abs(mean(defs) - bal.def) < 0.15, `off ${mean(offs).toFixed(2)}`);
}

console.log('=== Promessa de minutos ===');
const team = (teamsData as Team[])[0];
const kid = Object.values(base).find((p) => team.roster.includes(p.id) && p.age <= 23)!;
const seasonWith = (mpg: number): SeasonState => ({
  userTeamId: team.id, teams: [team], awardHistory: [{}, {}] as any, status: 'offseason', gamesPlayed: 82,
  minutesPromise: { playerId: kid.id, season: 2 },
  players: { ...base, [kid.id]: { ...kid, morale: 60, seasonStats: { gp: 70, mpg, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 } } },
} as unknown as SeasonState);
const tOf = Object.fromEntries(team.roster.map((id) => [id, team.id]));
const kept = settleMinutesPromise(seasonWith(PROMISE_MPG + 2), tOf)!;
const broken = settleMinutesPromise(seasonWith(PROMISE_MPG - 8), tOf)!;
check('24+ mpg cumpre', kept.kept);
check('16 mpg quebra', !broken.kept);
check('cumprida sobe a moral', applyPromiseMorale(seasonWith(30).players, kept)[kid.id].morale! > 60);
check('quebrada derruba a moral para perto do pedido de troca', applyPromiseMorale(seasonWith(10).players, broken)[kid.id].morale! <= 30);
check('promessa de outra temporada não é cobrada', settleMinutesPromise({ ...seasonWith(30), minutesPromise: { playerId: kid.id, season: 1 } }, tOf) === null);
const fresh = { ...seasonWith(30), minutesPromise: undefined, status: 'active', gamesPlayed: 5 } as SeasonState;
check('pode prometer no começo da temporada', canPromiseMinutes(fresh, kid).ok);
check('não pode depois do jogo 15', !canPromiseMinutes({ ...fresh, gamesPlayed: 30 }, kid).ok);
const vetP = Object.values(base).find((p) => p.age >= 30)!;
check('não pode para veterano', !canPromiseMinutes(fresh, vetP).ok);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
