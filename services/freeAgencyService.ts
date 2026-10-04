import type { Player, Team, Event } from '../types';
import { SALARY_CAP, LUXURY_TAX, MID_LEVEL_EXCEPTION, getTeamSalary, getPlayerPositions, LINEUP_POSITIONS, releaseWithDeadMoney } from '../constants';
import { MIN_ROSTER_SIZE, MAX_ROSTER_SIZE, playerValue, expectedSalary } from './tradeService';
import { personalityOf } from './personalityService';

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

// What a player asks for on a NEW contract: what he is worth today, by the same
// curve the pipeline used to generate every salary in data/ (and that
// contractFactor already reads to call a deal good or bad). Every signing,
// re-signing and extension goes through this -- before it, a new contract kept
// the old salary forever, so a breakout star stayed cheap and a declining
// veteran stayed expensive, and a $40M free agent asked $40M until he retired.
export const askingSalary = (p: Player): number =>
    Math.round(expectedSalary(p.ovr, p.age) / 10_000) * 10_000;

// Free agents are simply every player not on any roster — the league is a
// closed pool, so there's no separate "free agent" list to keep in sync; a
// player is on the market exactly when no team holds their id. Sorted by the
// same value metric trades use (OVR × age factor) so the best available are
// first, which both the UI and the CPU rely on.
export const getFreeAgents = (teams: Team[], players: PlayerMap): Player[] => {
    const rostered = new Set<string>();
    teams.forEach(t => t.roster.forEach(id => rostered.add(id)));
    // Undrafted prospects are off every roster but are not signable: they're in
    // the draft pool, and their true rating is still fogged, so they must never
    // surface in a list sorted by real value (see Player.prospect).
    return Object.values(players)
        .filter(p => !rostered.has(p.id) && !p.prospect && !p.retired)
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
/**
 * Ceiling for a "veteran minimum" deal. A team over the cap can always add a
 * minimum-salary player -- that is a real NBA rule, and without it this project's
 * free agent market is decorative: the salary model runs hot enough that 29 of
 * the 30 teams open ABOVE the cap (median payroll ~$198M against a $154.6M cap),
 * so every in-season signing was illegal for almost everybody. $3M sits at
 * roughly the bottom fifth of the salaries in data/players.json, which is where
 * the real minimum sits relative to its own league too.
 */
export const MINIMUM_CONTRACT = 3_000_000;

/** How a signing fits under the rules -- the first route that applies wins. */
export type SigningRoute = 'cap_room' | 'bird' | 'minimum' | 'mid_level' | 'emergency';

export const signingRoute = (team: Team, player: Player, players: PlayerMap): SigningRoute | null => {
    if (player.birdTeamId === team.id) return 'bird';
    if (getTeamSalary(team, players) + player.salary <= SALARY_CAP) return 'cap_room';
    if (player.salary <= MINIMUM_CONTRACT) return 'minimum';
    if (player.salary <= MID_LEVEL_EXCEPTION && !team.midLevelUsed) return 'mid_level';
    if (team.roster.length < MIN_ROSTER_SIZE) return 'emergency';
    return null;
};

export const signFreeAgentLegality = (team: Team, player: Player, players: PlayerMap): SignLegalityResult => {
    if (team.roster.length >= MAX_ROSTER_SIZE) {
        return { legal: false, reason: `Elenco cheio (${MAX_ROSTER_SIZE} jogadores). Dispense ou troque alguém antes.` };
    }
    if (signingRoute(team, player, players)) return { legal: true };
    const salaryAfter = getTeamSalary(team, players) + player.salary;
    return {
        legal: false,
        reason: team.midLevelUsed
            ? `Acima do teto ($${(salaryAfter / 1_000_000).toFixed(1)}M) e a exceção de nível médio deste verão já foi usada. Só contratos mínimos.`
            : `Acima do teto ($${(salaryAfter / 1_000_000).toFixed(1)}M) e ele pede mais que a exceção de nível médio ($${(MID_LEVEL_EXCEPTION / 1_000_000).toFixed(1)}M).`,
    };
};

/**
 * Sign `player` to `team`. The single place a free agent becomes rostered, so
 * the bookkeeping cannot drift between the user's screen, the decision queue
 * and the CPU: a fresh contract length, the Bird right consumed, and the
 * mid-level marked spent when that is the route that made it legal. The salary
 * is whatever he is asking at this moment (his `salary` while unsigned).
 * Assumes legality was already checked.
 */
export const signPlayer = (
    team: Team, player: Player, players: PlayerMap, years = newContractYears(player),
): { team: Team; player: Player } => {
    const route = signingRoute(team, player, players);
    const signed: Player = { ...player, contractYears: years, birdTeamId: undefined };
    const roster = sortRosterByOvr([...team.roster, player.id], { ...players, [player.id]: signed });
    return {
        team: { ...team, roster, midLevelUsed: team.midLevelUsed || route === 'mid_level' },
        player: signed,
    };
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
    // His own team still holds his Bird right only because he was willing to
    // stay (see processOffseasonContracts) -- that question is already answered.
    if (player.birdTeamId === team.id) return { willing: true };
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

/** How many of a team's most valuable players a CPU front office fights to keep. */
const CPU_CORE_SIZE = 9;
/** A star the CPU will pay into the tax for, up to the second apron. */
const CPU_TAX_STAR_OVR = 85;
const CPU_STAR_PAYROLL_LIMIT = 207_824_000;
/** Below this morale a player wants to see what else is out there. */
const RESIGN_MIN_MORALE = 40;

/**
 * Whether a player whose contract just ran out is willing to re-sign where he
 * is. Morale is the main read -- an unhappy player tests the market. The Estrela
 * is the one who leaves a LOSING team even when he likes his role, which is what
 * makes him the player who changes the league every summer.
 */
export const willingToReSign = (p: Player, teamWinPct: number): boolean => {
    if ((p.morale ?? 70) < RESIGN_MIN_MORALE) return false;
    if (personalityOf(p).id === 'estrela' && teamWinPct < 0.45) return false;
    return true;
};

// A player who would rather leave goes to the market with no Bird right: his
// old team has no inside track on a player who wants out.
const putOnMarket = (p: Player, birdTeamId: string | undefined) => {
    p.contractYears = 0;
    p.salary = askingSalary(p);
    p.birdTeamId = birdTeamId;
};

// Advances every rostered player's contract by one year. Anyone who hits zero
// either re-signs on the spot -- CPU teams, by Bird rights, at today's price --
// or goes to the market asking what he is worth, with his old team keeping the
// right to bring him back over the cap. The user's own expiring players always
// go to the market: that choice is the user's to make (the extension decision
// during the season, or the Bird right in free agency).
//
// The CPU keeps its core (the CPU_CORE_SIZE most valuable players), provided
// the player wants to stay and the bill stays under the luxury tax -- a star
// can take it to the second apron. Before this, nobody ever re-signed: every
// expiring contract became a free agent nobody over the cap could sign back,
// and 22 players rated 80+ spent the first measured season without a team.
//
// `winPct` is last season's record by team id, read BEFORE the offseason reset
// the standings.
export const processOffseasonContracts = (
    teams: Team[],
    players: PlayerMap,
    userTeamId?: string,
    winPct: { [teamId: string]: number } = {},
): { teams: Team[]; players: PlayerMap; events: Event[] } => {
    const updatedPlayers: PlayerMap = {};
    for (const id in players) updatedPlayers[id] = { ...players[id] };

    const events: Event[] = [];
    const leaves = (p: Player, team: Team, wouldStay: boolean) => {
        putOnMarket(p, wouldStay ? team.id : undefined);
        events.push({
            message: wouldStay
                ? `📄 ${p.name} chegou ao fim do contrato com o ${team.name} e virou agente livre.`
                : `📄 ${p.name} não quis renovar com o ${team.name} e vai testar o mercado.`,
            type: 'trade',
        });
    };
    const newTeams = teams.map(team => {
        const kept: string[] = [];
        const expiring: Player[] = [];
        team.roster.forEach(id => {
            const p = updatedPlayers[id];
            if (!p) return;
            p.contractYears = Math.max(0, p.contractYears - 1);
            // An extension signed last season starts now.
            if (p.nextSalary !== undefined) {
                p.salary = p.nextSalary;
                p.nextSalary = undefined;
            }
            if (p.contractYears <= 0) expiring.push(p);
            else kept.push(id);
        });

        if (team.id === userTeamId) {
            expiring.forEach(p => leaves(p, team, willingToReSign(p, winPct[team.id] ?? 0.5)));
        } else {
            const core = new Set(
                [...team.roster].sort((a, b) => playerValue(updatedPlayers[b]) - playerValue(updatedPlayers[a]))
                    .slice(0, CPU_CORE_SIZE),
            );
            let payroll = kept.reduce((sum, id) => sum + (updatedPlayers[id]?.salary || 0), 0);
            [...expiring].sort((a, b) => playerValue(b) - playerValue(a)).forEach(p => {
                const ask = askingSalary(p);
                const limit = p.ovr >= CPU_TAX_STAR_OVR ? CPU_STAR_PAYROLL_LIMIT : LUXURY_TAX;
                const wouldStay = willingToReSign(p, winPct[team.id] ?? 0.5);
                if (core.has(p.id) && wouldStay && payroll + ask <= limit) {
                    p.salary = ask;
                    p.contractYears = newContractYears(p);
                    payroll += ask;
                    kept.push(p.id);
                    events.push({ message: `🖊️ ${team.name} renovou com ${p.name} por $${(ask / 1_000_000).toFixed(1)}M/ano.`, type: 'trade' });
                } else {
                    leaves(p, team, wouldStay);
                }
            });
        }
        // A year of dead money comes off with every other contract year.
        const deadMoney = (team.deadMoney ?? [])
            .map(d => ({ ...d, years: d.years - 1 }))
            .filter(d => d.years > 0);
        return {
            ...team, roster: sortRosterByOvr(kept, updatedPlayers), starters: pruneStarters(team.starters, kept),
            deadMoney: deadMoney.length ? deadMoney : undefined,
        };
    });

    return { teams: newTeams, players: updatedPlayers, events };
};

/**
 * Bring every CPU roster down to MAX_ROSTER_SIZE by releasing its least
 * valuable players to the market. The draft adds rookies with no regard for
 * the limit (a team can hold several picks), and now that teams keep their own
 * players a summer can end with 20+ under contract. The user's team is left
 * alone: the user decides who goes, and startSeason will not open the season
 * until he has.
 */
export const trimCpuRosters = (
    teams: Team[],
    players: PlayerMap,
    userTeamId: string,
): { teams: Team[]; players: PlayerMap; events: Event[] } => {
    const updatedPlayers: PlayerMap = { ...players };
    const events: Event[] = [];
    const newTeams = teams.map(team => {
        if (team.id === userTeamId || team.roster.length <= MAX_ROSTER_SIZE) return team;
        const byValue = [...team.roster].sort((a, b) => playerValue(updatedPlayers[b]) - playerValue(updatedPlayers[a]));
        const cut = byValue.slice(MAX_ROSTER_SIZE);
        let deadMoney = team.deadMoney;
        cut.forEach(id => { deadMoney = releaseWithDeadMoney({ ...team, deadMoney }, updatedPlayers[id]); });
        cut.forEach(id => {
            const p = updatedPlayers[id];
            updatedPlayers[id] = { ...p, contractYears: 0, salary: askingSalary(p), birdTeamId: undefined, nextSalary: undefined };
            events.push({ message: `✂️ ${team.name} dispensou ${p.name} para abrir vaga no elenco.`, type: 'trade' });
        });
        const kept = team.roster.filter(id => !cut.includes(id));
        return { ...team, roster: kept, starters: pruneStarters(team.starters, kept), deadMoney };
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

// Deterministic CPU free agency. Runs after contracts expire and the draft,
// before the user gets their turn.
//   1. Necessity -- a CPU team below the roster minimum signs the cheapest
//      useful players until it is legal (the emergency route, at their ask).
//   2. The market, in three stages. At each one every CPU team under
//      CPU_TARGET_ROSTER signs whoever is legal for it AND wants to come
//      (evaluateSigningInterest), weakest teams first, until a full round
//      passes with nobody signing. Between stages the market cools: whoever
//      nobody could pay drops his ask --
//        stage 0: what he is worth (cap room, Bird rights, the mid-level);
//        stage 1: down to the mid-level, so any team with it unspent can bid;
//        stage 2: down to the minimum, on a one-year prove-it deal -- and a
//                 team with a full rotation may still take him if he would
//                 crack its top nine.
//      Without the cooling, a $40M free agent asked $40M forever and only a
//      team with $40M of room could ever sign him -- in a league where 29 of
//      30 teams sit over the cap, that was nobody.
// The user's team is skipped entirely -- they sign for themselves in the UI,
// from whatever is left (at its cooled price).
export const runCpuFreeAgency = (
    teams: Team[],
    players: PlayerMap,
    userTeamId: string
): { teams: Team[]; players: PlayerMap; events: Event[] } => {
    const updatedPlayers: PlayerMap = {};
    for (const id in players) updatedPlayers[id] = { ...players[id] };

    const workTeams: Team[] = teams.map(t => ({ ...t, roster: [...t.roster] }));
    const events: Event[] = [];

    // Live free-agent pool, kept value-sorted; ids removed as they're signed.
    // The user's own free agents who want to stay are held back (first refusal).
    let pool = getFreeAgents(workTeams, updatedPlayers).filter(p => p.birdTeamId !== userTeamId);

    const sign = (idx: number, player: Player, years?: number) => {
        const res = signPlayer(workTeams[idx], player, updatedPlayers, years);
        workTeams[idx] = res.team;
        updatedPlayers[player.id] = res.player;
        pool = pool.filter(p => p.id !== player.id);
        events.push({ message: `✍️ ${res.team.name} assinou ${player.name} (${player.ovr} OVR) por $${(player.salary / 1_000_000).toFixed(1)}M.`, type: 'trade' });
    };

    // Weaker teams (higher powerRank) pick first, for a bit of competitive balance.
    const cpuIdx = workTeams
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => t.id !== userTeamId)
        .sort((a, b) => b.t.powerRank - a.t.powerRank)
        .map(({ i }) => i);

    // Pass 1: necessity.
    cpuIdx.forEach(i => {
        while (workTeams[i].roster.length < MIN_ROSTER_SIZE && pool.length > 0) {
            const cheap = pool.filter(p => p.salary <= MINIMUM_CONTRACT);
            const pick = pickBestForTeam(workTeams[i], cheap.length ? cheap : [...pool].sort((a, b) => a.salary - b.salary), updatedPlayers);
            if (!pick) break;
            sign(i, pick);
        }
    });

    const top9Floor = (team: Team) => {
        const ovrs = team.roster.map(id => updatedPlayers[id]?.ovr || 0).sort((a, b) => b - a);
        return ovrs[8] ?? 0;
    };

    // Pass 2: the market.
    for (let stage = 0; stage < 3; stage++) {
        const ceiling = stage === 1 ? MID_LEVEL_EXCEPTION : stage === 2 ? MINIMUM_CONTRACT : Infinity;
        pool.forEach(p => {
            updatedPlayers[p.id] = { ...updatedPlayers[p.id], salary: Math.min(p.salary, ceiling) };
        });
        // First refusal: a player who wants to stay with the user (he still
        // carries the user's Bird right) waits for the user's offer and is not
        // on this market at all. Measured without it, the CPU signed nearly
        // every one of them before the user's turn came -- even a GM who
        // extended everyone he could could not keep a core together.
        // startSeason drops the right and releases whoever the user passes on.
        pool = pool.filter(p => p.birdTeamId !== userTeamId).map(p => updatedPlayers[p.id]);

        let signedThisRound = true;
        while (signedThisRound && pool.length > 0) {
            signedThisRound = false;
            for (const i of cpuIdx) {
                const team = workTeams[i];
                if (team.roster.length >= MAX_ROSTER_SIZE) continue;
                const open = team.roster.length < CPU_TARGET_ROSTER;
                const candidates = pool.filter(p =>
                    (open || (stage === 2 && p.ovr > top9Floor(team)))
                    && signFreeAgentLegality(team, p, updatedPlayers).legal
                    && evaluateSigningInterest(p, team, workTeams, updatedPlayers).willing);
                if (candidates.length === 0) continue;
                const pick = pickBestForTeam(team, candidates, updatedPlayers);
                if (!pick) continue;
                sign(i, pick, stage === 2 ? 1 : stage === 1 ? Math.min(2, newContractYears(pick)) : undefined);
                signedThisRound = true;
            }
        }
    }

    // Merge back onto the original team objects (preserving every other field
    // the caller set on them).
    const merged = teams.map((t, i) => ({ ...t, roster: workTeams[i].roster, midLevelUsed: workTeams[i].midLevelUsed }));

    return { teams: merged, players: updatedPlayers, events };
};
