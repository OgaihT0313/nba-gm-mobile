import { Player, Team, PlayerAttributes } from '../types';
import { getPlayerPositions, getPlayerAttributes, LINEUP_POSITIONS } from '../constants';
import { simulationEngine } from './simulationService';
import { playerValue } from './tradeService';
import { getFreeAgents, signFreeAgentLegality, evaluateSigningInterest } from './freeAgencyService';

// Scout advisor: reads the user's roster the way the sim does and tells the GM
// what's actually wrong with it, then names players who'd fix it.
//
// Everything is measured against the LEAGUE, not against arbitrary constants —
// a "weak" starter is one clearly below what other teams start at that
// position, so the advice stays honest as rosters drift across seasons.

type PlayerMap = { [key: string]: Player };


// How far below the league's positional average a starter must be before it's
// worth telling the GM about (points of OVR).
const WEAK_STARTER_MARGIN = 4;
// Same idea for team attribute signals.
const WEAK_ATTRIBUTE_MARGIN = 3;

export interface Need {
  kind: 'hole' | 'weak-starter' | 'attribute';
  label: string;
  detail: string;
  positions: string[];
  attribute?: keyof PlayerAttributes;
  severity: number;
}

export interface Recommendation {
  player: Player;
  reason: string;
  teamName?: string;
}

export interface ScoutReport {
  needs: Need[];
  freeAgents: Recommendation[];
  tradeTargets: Recommendation[];
}

// The four team-construction signals the sim's `getTeamProfile` folds into
// expected points. Mirrored here (that one isn't exported) so the advice lines
// up with what actually decides games.
const PROFILE_SIGNALS: { attribute: keyof PlayerAttributes; label: string; mode: 'avg' | 'best' }[] = [
  { attribute: 'shooting', label: 'Arremesso', mode: 'avg' },
  { attribute: 'rebounding', label: 'Rebote', mode: 'avg' },
  { attribute: 'playmaking', label: 'Criação', mode: 'best' },
  { attribute: 'interiorD', label: 'Proteção do garrafão', mode: 'best' },
];

const rotationOf = (team: Team, players: PlayerMap): Player[] =>
  simulationEngine.getTeamRotation(team, players, 8).map((id) => players[id]).filter(Boolean);

const signalValue = (rotation: Player[], attribute: keyof PlayerAttributes, mode: 'avg' | 'best'): number => {
  if (rotation.length === 0) return 0;
  const vals = rotation.map((p) => getPlayerAttributes(p)[attribute]);
  return mode === 'best' ? Math.max(...vals) : vals.reduce((s, v) => s + v, 0) / vals.length;
};

export const buildScoutReport = (userTeam: Team, teams: Team[], players: PlayerMap): ScoutReport => {
  const needs: Need[] = [];

  // --- 1. Positional holes: a lineup slot nobody on the roster is eligible for.
  const covered = new Set<string>();
  userTeam.roster.forEach((id) => {
    const p = players[id];
    if (p) getPlayerPositions(p).forEach((pos) => covered.add(pos));
  });
  LINEUP_POSITIONS.filter((pos) => !covered.has(pos)).forEach((pos) =>
    needs.push({
      kind: 'hole',
      label: `Sem ${pos}`,
      detail: `Ninguém no elenco pode jogar de ${pos}.`,
      positions: [pos],
      severity: 100,
    })
  );

  // --- 2. Weak starters, judged against what the league starts at that slot.
  const leagueStarterOvr = new Map<string, number[]>();
  teams.forEach((t) => {
    simulationEngine.getLineup(t, players).slots.forEach((slot) => {
      const p = slot.playerId ? players[slot.playerId] : null;
      if (!p) return;
      const arr = leagueStarterOvr.get(slot.pos) || [];
      arr.push(p.ovr);
      leagueStarterOvr.set(slot.pos, arr);
    });
  });
  const avgAt = (pos: string) => {
    const arr = leagueStarterOvr.get(pos) || [];
    return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 75;
  };

  simulationEngine.getLineup(userTeam, players).slots.forEach((slot) => {
    const p = slot.playerId ? players[slot.playerId] : null;
    if (!p) return;
    const league = avgAt(slot.pos);
    const gap = league - p.ovr;
    if (gap >= WEAK_STARTER_MARGIN) {
      needs.push({
        kind: 'weak-starter',
        label: `${slot.pos} fraco`,
        detail: `${p.name} (${p.ovr}) está ${gap.toFixed(0)} abaixo da média da liga na posição (${league.toFixed(0)}).`,
        positions: [slot.pos],
        severity: gap,
      });
    }
  });

  // --- 3. Team attribute signals below the league average.
  const userRotation = rotationOf(userTeam, players);
  const others = teams.filter((t) => t.id !== userTeam.id).map((t) => rotationOf(t, players));
  PROFILE_SIGNALS.forEach(({ attribute, label, mode }) => {
    const mine = signalValue(userRotation, attribute, mode);
    const leagueVals = others.map((r) => signalValue(r, attribute, mode)).filter((v) => v > 0);
    if (leagueVals.length === 0) return;
    const league = leagueVals.reduce((s, v) => s + v, 0) / leagueVals.length;
    const gap = league - mine;
    if (gap >= WEAK_ATTRIBUTE_MARGIN) {
      needs.push({
        kind: 'attribute',
        label: `${label} abaixo da liga`,
        detail: `Sua rotação marca ${mine.toFixed(0)} em ${label.toLowerCase()}; a média da liga é ${league.toFixed(0)}.`,
        positions: [],
        attribute,
        severity: gap,
      });
    }
  });

  needs.sort((a, b) => b.severity - a.severity);

  // --- Recommendations ---------------------------------------------------
  // A player "fits" if he plugs a hole/weak slot, or is strong in an attribute
  // the team is short on.
  const neededPositions = new Set(needs.flatMap((n) => n.positions));
  const neededAttributes = needs.map((n) => n.attribute).filter(Boolean) as (keyof PlayerAttributes)[];

  const fitReason = (p: Player): string | null => {
    const posHit = getPlayerPositions(p).find((pos) => neededPositions.has(pos));
    if (posHit) {
      const need = needs.find((n) => n.positions.includes(posHit));
      if (need?.kind === 'hole') return `Cobre a lacuna em ${posHit}`;
      // Only worth naming if he'd actually be an upgrade on the weak starter.
      const league = avgAt(posHit);
      if (p.ovr >= league) return `Melhora o ${posHit} (${p.ovr} vs média ${league.toFixed(0)})`;
    }
    const attrHit = neededAttributes.find((a) => getPlayerAttributes(p)[a] >= 82);
    if (attrHit) {
      const label = PROFILE_SIGNALS.find((s) => s.attribute === attrHit)?.label ?? attrHit;
      return `${label} ${getPlayerAttributes(p)[attrHit]} — sua fraqueza de time`;
    }
    return null;
  };

  const freeAgents: Recommendation[] = getFreeAgents(teams, players)
    .map((p) => ({ p, reason: fitReason(p) }))
    .filter((x): x is { p: Player; reason: string } => x.reason !== null)
    .filter(({ p }) => signFreeAgentLegality(userTeam, p, players).legal)
    .filter(({ p }) => evaluateSigningInterest(p, userTeam, teams, players).willing)
    .sort((a, b) => playerValue(b.p) - playerValue(a.p))
    .slice(0, 4)
    .map(({ p, reason }) => ({ player: p, reason }));

  // Trade targets exclude each team's top 2 by OVR — the same "non-core"
  // definition the CPU offer builder uses. Nobody trades their franchise player,
  // so recommending them would be noise.
  const tradeTargets: Recommendation[] = [];
  teams
    .filter((t) => t.id !== userTeam.id)
    .forEach((t) => {
      const sorted = [...t.roster].map((id) => players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
      sorted.slice(2).forEach((p) => {
        const reason = fitReason(p);
        if (reason) tradeTargets.push({ player: p, reason, teamName: t.name });
      });
    });
  tradeTargets.sort((a, b) => playerValue(b.player) - playerValue(a.player));

  return { needs: needs.slice(0, 4), freeAgents, tradeTargets: tradeTargets.slice(0, 4) };
};
