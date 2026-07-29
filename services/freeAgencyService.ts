import type { Player, Team, Event } from '../types';
import { SALARY_CAP, getTeamSalary, getPlayerPositions, LINEUP_POSITIONS } from '../constants';
import { MIN_ROSTER_SIZE, MAX_ROSTER_SIZE, playerValue } from './tradeService';

// The 5 position buckets a lineup must cover. A team with zero players who can
// play a slot has a "hole" the CPU prioritizes filling in free agency.

// CPU teams try to keep at least this many players under contract. Above it
// they stop signing, which deliberately leaves a surplus of unsigned free
// agents in the pool for the user to sign — the league is a closed system of
// 530 players, so if the CPU refilled every roster to the brim there'd be
// nothing left on the market.
const CPU_TARGET_ROSTER = 14;

type PlayerMap = { [key: string]: Player };

// A new contract's length, deterministic from the player's profile — stars and
// young players get longer deals, aging role players get short ones. Mirrors
// the age/OVR logic already used for trade value, no RNG so the offseason is
// reproducible.
export const newContractYears = (p: Player): number => {
    if (p.ovr >= 82) return 4;
    if (p.ovr >= 75) return 3;
    if (p.age <= 26) return 3;
    return 2;
};

// Free agents are simply every player not on any roster — the league is a
// closed pool, so there's no separate "free agent" list to keep in sync; a
// player is on the market exactly when no team holds their id. Sorted by the
// same value metric trades use (OVR × age factor) so the best available are
// first, which both the UI and the CPU rely on.
export const getFreeAgents = (teams: Team[], players: PlayerMap): Player[] => {
    const rostered = new Set<string>();
    teams.forEach(t => t.roster.forEach(id => rostered.add(id)));
    // Retired players are off every roster but are NOT on the market — they stay
    // in the players map only so historical ids resolve (see Player.retired).
    // Undrafted prospects are off every roster too, and are not signable either:
    // they're in the draft pool, and their true rating is still fogged, so they
    // must never surface in a list sorted by real value (see Player.prospect).
    return Object.values(players)
        .filter(p => !rostered.has(p.id) && !p.retired && !p.prospect)
        .sort((a, b) => playerValue(b) - playerValue(a));
};

export interface SignLegalityResult {
    legal: boolean;
    reason?: string;
}

// Whether `team` may sign `player`. Roster size is a hard cap (18 max). The
// salary cap is enforced too, but with an emergency exception: a team below the
// roster minimum can always sign (real NBA teams sign minimum deals over the
// cap to stay legal), so the user can never get soft-locked out of fielding a
// legal roster.
export const signFreeAgentLegality = (team: Team, player: Player, players: PlayerMap): SignLegalityResult => {
    if (team.roster.length >= MAX_ROSTER_SIZE) {
        return { legal: false, reason: `Elenco cheio (${MAX_ROSTER_SIZE} jogadores). Dispense ou troque alguém antes.` };
    }
    const salaryAfter = getTeamSalary(team, players) + player.salary;
    const belowMin = team.roster.length < MIN_ROSTER_SIZE;
    if (salaryAfter > SALARY_CAP && !belowMin) {
        return {
            legal: false,
            reason: `Essa contratação deixaria o elenco em $${(salaryAfter / 1_000_000).toFixed(1)}M, acima do teto de $${(SALARY_CAP / 1_000_000).toFixed(1)}M.`,
        };
    }
    return { legal: true };
};

const sortRosterByOvr = (roster: string[], players: PlayerMap): string[] =>
    [...roster].sort((a, b) => (players[b]?.ovr || 0) - (players[a]?.ovr || 0));

// Average OVR of a team's top 8 — a quick read on how competitive the roster
// is, used to judge how appealing the team is to a free agent.
const teamTop8Avg = (team: Team, players: PlayerMap): number => {
    const ovrs = team.roster.map(id => players[id]?.ovr || 0).sort((a, b) => b - a).slice(0, 8);
    return ovrs.length ? ovrs.reduce((a, b) => a + b, 0) / ovrs.length : 70;
};

export interface SigningInterest {
    willing: boolean;
    reason?: string;
}

// Whether a free agent actually *wants* to sign with `team` — players have
// agency now, they're not just assigned to whoever offers. Role players (sub-76
// OVR) need a job and take almost anything. Better players weigh two things:
//  • winning — a star chases a contender (team strength well above league avg);
//  • role/minutes — they won't sign somewhere they'd be buried behind better
//    players at their position.
// A star will still sign with a weaker team if they'd be the clear centerpiece
// there (a franchise rebuild role), but not to ride the bench on a bad team.
// Team strength is measured relative to the live league average, so this keeps
// working as OVRs drift across seasons.
export const evaluateSigningInterest = (
    player: Player,
    team: Team,
    teams: Team[],
    players: PlayerMap
): SigningInterest => {
    if (player.ovr < 76) return { willing: true }; // needs the paycheck — takes any role

    const leagueAvg = teams.reduce((s, t) => s + teamTop8Avg(t, players), 0) / Math.max(1, teams.length);
    const teamAvg = teamTop8Avg(team, players);
    const contender = teamAvg >= leagueAvg + 1.5;
    const decent = teamAvg >= leagueAvg - 0.5;

    const pos = getPlayerPositions(player);
    const blockers = team.roster.filter(id => {
        const p = players[id];
        return p && p.ovr >= player.ovr && getPlayerPositions(p).some(x => pos.includes(x));
    }).length;
    const wouldStart = blockers === 0;
    const wouldRotate = blockers <= 1;

    if (player.ovr >= 84) { // star — wants to win, or to be the guy
        if (contender) return { willing: true };
        if (wouldStart && decent) return { willing: true };
        return { willing: false, reason: `${player.name} quer disputar o título e não vê o ${team.name} como candidato.` };
    }
    // mid-tier (76-83) — wants a real role, flexible on winning
    if (decent || wouldRotate) return { willing: true };
    return { willing: false, reason: `${player.name} busca minutos e o elenco do ${team.name} já está cheio na posição dele.` };
};

// Which of the 5 lineup slots the team currently has NO player for. Used to
// steer both CPU signings and (informationally) the user toward real needs.
const positionHoles = (team: Team, players: PlayerMap): Set<string> => {
    const covered = new Set<string>();
    team.roster.forEach(id => {
        const p = players[id];
        if (p) getPlayerPositions(p).forEach(pos => covered.add(pos));
    });
    return new Set(LINEUP_POSITIONS.filter(pos => !covered.has(pos)));
};

// Best free agent for a team: prefer one who plugs a positional hole, otherwise
// the highest-value available. `pool` must already be value-sorted (getFreeAgents),
// so taking the first match preserves that ordering.
const pickBestForTeam = (team: Team, pool: Player[], players: PlayerMap): Player | undefined => {
    const holes = positionHoles(team, players);
    if (holes.size > 0) {
        const filler = pool.find(p => getPlayerPositions(p).some(pos => holes.has(pos)));
        if (filler) return filler;
    }
    return pool[0];
};

// Advances every rostered player's contract by one year and releases anyone who
// hits zero into free agency. Free agents already at 0 stay at 0 (they're
// unsigned, not counting down). This is the ongoing engine of the market: it's
// what actually puts players on the block each offseason.
export const processOffseasonContracts = (
    teams: Team[],
    players: PlayerMap
): { teams: Team[]; players: PlayerMap; events: Event[] } => {
    const updatedPlayers: PlayerMap = {};
    for (const id in players) updatedPlayers[id] = { ...players[id] };

    const events: Event[] = [];
    const newTeams = teams.map(team => {
        const kept: string[] = [];
        team.roster.forEach(id => {
            const p = updatedPlayers[id];
            if (!p) return;
            p.contractYears = Math.max(0, p.contractYears - 1);
            if (p.contractYears <= 0) {
                events.push({ message: `📄 ${p.name} chegou ao fim do contrato com o ${team.name} e virou agente livre.`, type: 'trade' });
            } else {
                kept.push(id);
            }
        });
        return { ...team, roster: kept, starters: pruneStarters(team.starters, kept) };
    });

    return { teams: newTeams, players: updatedPlayers, events };
};

// Drop any fixed-starter pick whose player just left the roster, so the sim
// doesn't try to start a player the team no longer holds.
const pruneStarters = (starters: Team['starters'], roster: string[]): Team['starters'] => {
    if (!starters) return starters;
    const rosterSet = new Set(roster);
    const pruned: { [pos: string]: string } = {};
    for (const pos in starters) {
        if (rosterSet.has(starters[pos])) pruned[pos] = starters[pos];
    }
    return pruned;
};

// Deterministic CPU free agency. Runs after contracts expire, before the user
// gets their turn. Two passes:
//   1. Necessity — any CPU team below the roster minimum signs (ignoring the
//      cap, like a real minimum-salary signing) until it's legal again.
//   2. Fill — weakest teams first, each CPU team under CPU_TARGET_ROSTER that
//      can fit a signing under the cap grabs its best-value option, repeating
//      until nobody signs in a full round.
// Weaker teams (higher powerRank) pick first for a bit of competitive balance.
// The user's team is skipped entirely — they sign for themselves in the UI.
export const runCpuFreeAgency = (
    teams: Team[],
    players: PlayerMap,
    userTeamId: string
): { teams: Team[]; players: PlayerMap; events: Event[] } => {
    const updatedPlayers: PlayerMap = {};
    for (const id in players) updatedPlayers[id] = { ...players[id] };

    const workTeams = teams.map(t => ({ ...t, roster: [...t.roster] }));
    const byId = new Map(workTeams.map(t => [t.id, t]));
    const events: Event[] = [];

    // Live free-agent pool, kept value-sorted; ids removed as they're signed.
    let pool = getFreeAgents(workTeams, updatedPlayers);
    const removeFromPool = (id: string) => { pool = pool.filter(p => p.id !== id); };

    const sign = (team: { id: string; name: string; roster: string[]; starters?: Team['starters'] }, player: Player) => {
        updatedPlayers[player.id] = { ...updatedPlayers[player.id], contractYears: newContractYears(player) };
        team.roster = sortRosterByOvr([...team.roster, player.id], updatedPlayers);
        removeFromPool(player.id);
        events.push({ message: `✍️ ${team.name} assinou ${player.name} (${player.ovr} OVR) na agência livre.`, type: 'trade' });
    };

    const cpuTeams = workTeams
        .filter(t => t.id !== userTeamId)
        .sort((a, b) => b.powerRank - a.powerRank);

    // Pass 1: necessity signings (cap-exempt) to reach a legal roster.
    cpuTeams.forEach(team => {
        while (team.roster.length < MIN_ROSTER_SIZE && pool.length > 0) {
            const pick = pickBestForTeam(team as Team, pool, updatedPlayers);
            if (!pick) break;
            sign(team, pick);
        }
    });

    // Pass 2: discretionary fill, cap-respecting, rounds until steady state.
    // Players now have agency — a team only lands a free agent who actually
    // wants to sign there (winning + role), so a bottom team can't just hoard
    // stars. The necessity pass above stays exempt so nobody gets soft-locked
    // below a legal roster.
    let signedThisRound = true;
    while (signedThisRound && pool.length > 0) {
        signedThisRound = false;
        for (const team of cpuTeams) {
            if (team.roster.length >= CPU_TARGET_ROSTER || team.roster.length >= MAX_ROSTER_SIZE) continue;
            const affordable = pool.filter(
                p => getTeamSalary(team as Team, updatedPlayers) + p.salary <= SALARY_CAP
                    && evaluateSigningInterest(p, team as Team, workTeams, updatedPlayers).willing
            );
            if (affordable.length === 0) continue;
            const pick = pickBestForTeam(team as Team, affordable, updatedPlayers);
            if (!pick) continue;
            sign(team, pick);
            signedThisRound = true;
        }
    }

    // Merge signed rosters back onto the original team objects (preserving every
    // other field the caller set on them).
    const merged = teams.map(t => {
        const w = byId.get(t.id);
        return w ? { ...t, roster: w.roster } : t;
    });

    return { teams: merged, players: updatedPlayers, events };
};
