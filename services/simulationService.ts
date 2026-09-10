
import { playersData, getPlayerPositions, getPlayerAttributes, LINEUP_POSITIONS } from '../constants';
import type { Team, Player, Coach, Event, PlayoffState, PlayoffSeries, PlayoffConference, PlayInBracket, AllStarResult, CupState, ScheduleGame, LiveGameState, LiveTactic, WatchPlay, PendingDeciderRef } from '../types';
import { TRADE_DEADLINE_GAME } from './tradeService';
import { sortStandings, compareStandings } from './scheduleService';
import { coachOffenseMod, coachDefenseMod } from './coachService';

type CoachMap = { [key: string]: Coach };

// A starting five is one player per real position. The data carries genuine
// PG/SG/SF/PF/C (see pipeline/positions.py), so a slot's id and its eligibility
// bucket are now the same thing — `slot` keys `Team.starters` and the court
// layout (StartersCourt.tsx), `bucket` is tested against getPlayerPositions.
// They're kept as separate fields because they were distinct back when
// positions were coarse G/F/C and two slots shared one bucket.
const STARTING_SLOTS: { slot: string; bucket: Player['pos'] }[] =
    LINEUP_POSITIONS.map(pos => ({ slot: pos, bucket: pos }));

// A player's OVR adjusted for a temporary hot/slump status effect, used to
// decide whether a bench player has actually overtaken a starter right now.
const effectiveOvr = (team: Team, pId: string, players: { [key: string]: Player }): number => {
    const effect = team.playerStatusEffects?.[pId];
    return players[pId].ovr + (effect ? effect.ovrChange : 0);
};

export interface LineupSlot {
    pos: string; // slot id, e.g. 'PG' — unique, used to key Team.starters / court layout
    bucket: string; // eligibility position, e.g. 'PG' — used for display + candidate filtering
    playerId: string | null;
    designatedId?: string;
    isSubstitute: boolean;
}

// A slumping starter only gets benched once a same-position player is
// clearly better, not on a coin-flip, so the lineup doesn't flip-flop over a
// single point of random fluctuation.
const SLUMP_OVERRIDE_MARGIN = 3;

// Resolves who actually plays each starting slot right now. `team.starters`
// is the GM's fixed pick per position and the sim RESPECTS IT: a designated
// starter always plays their assigned slot when available. Two things —
// and only two — can bench them: (1) they're injured/suspended/traded away,
// or (2) they're in a real slump (an active negative status effect) AND a
// same-position bench player's effective OVR has clearly overtaken them.
//
// Crucially, designated starters are RESERVED to their slot up front (pass 1)
// before any slot is filled, so a higher-OVR multi-position player the GM
// pinned elsewhere (e.g. Luka at SF) can't be sucked into an earlier slot
// (PG) just because he's eligible and better there. Without this reservation,
// the position loop would greedily grab him at the first slot he qualifies
// for and leave his real assigned slot to someone else — the exact reason the
// GM's lineup used to not "stick".
//
// Recomputed fresh every call (nothing is mutated), so a slump/injury sub
// reverts automatically once the starter is healthy/hot again. A position with
// no eligible player at all (thin roster) resolves to `playerId: null` and is
// simply skipped upstream.
// --- TANKING ---
// How many players a tanking team sits. Two is deliberately small: the point is
// to remove the players who actually win games, not to forfeit. A bad team's
// third-best player is already replacement level, so sitting more would flatten
// every tanking team onto the same floor instead of leaving the bottom of the
// league ordered by how much talent each one still has.
const TANK_SHUTDOWN_COUNT = 2;

/**
 * The players a tanking team has shut down for the rest of the season — its
 * best ones, by definition. Real tanking is not "try less"; it is resting the
 * veterans who win you games you would rather lose, and handing their minutes
 * to whoever is behind them.
 *
 * Nothing else has to change for that to have a real payoff: minutes are what
 * `runPlayerProgression` reads as development opportunity, so the young players
 * absorbing these minutes genuinely improve over the offseason. Tanking costs
 * wins and buys both draft position and development, the way it should.
 *
 * Returns an empty set for any team that is not tanking, so every caller can
 * ask unconditionally.
 */
const shutDownIds = (team: Team, players: { [key: string]: Player }): Set<string> => {
    if (!team.tanking) return new Set();
    const healthy = team.roster.filter(pId => !team.playerAbsences?.[pId] && !!players[pId]);
    // Never shut down so many that the rotation cannot be filled — a tanking
    // team still has to put five players on the floor.
    const budget = Math.min(TANK_SHUTDOWN_COUNT, Math.max(0, healthy.length - ROTATION_MIN));
    if (budget <= 0) return new Set();
    return new Set(
        [...healthy]
            .sort((a, b) => (players[b]?.ovr ?? 0) - (players[a]?.ovr ?? 0))
            .slice(0, budget),
    );
};

/**
 * Conference position at which a CPU team stops trying, evaluated once at the
 * trade deadline. 13th of 15 leaves the three teams per conference that are
 * genuinely out of it — the play-in already reaches down to 10th, so 11th and
 * 12th still have something to play for and keep playing for it.
 */
const TANK_RANK_CUTOFF = 13;

/**
 * Decide, once, which CPU teams are playing for draft position. Called at the
 * trade deadline (see seasonRunner) — the same moment a real front office
 * either buys or sells, and late enough that the standings mean something.
 *
 * This exists because the league's bottom would not sink on its own. Measured
 * over 30 seasons, the sim produced 0.3 teams a year under 20 wins against a
 * real NBA figure of 1-3, and the worst record averaged 22 where real tankers
 * reach 14. That gap was never a variance problem — it was a missing decision.
 * Real teams are that bad because they CHOOSE to be, and nothing in the engine
 * chose anything.
 *
 * Mutates in place: sortStandings returns the same team objects in a new array,
 * and the caller has already deep-cloned the league for this tick.
 */
export const decideTanking = (teams: Team[], schedule: ScheduleGame[], userTeamId: string): void => {
    (['East', 'West'] as const).forEach(conf => {
        const ranked = sortStandings(teams.filter(t => t.conference === conf), schedule);
        ranked.forEach((team, i) => {
            // Never the user's team. Tanking is a GM decision and the user is
            // the GM — deciding it for them would be taking the one call the
            // whole game is about. (Offering it TO them is a UI feature, not
            // an engine one; see PLANO-V2.md.)
            team.tanking = team.id !== userTeamId && i + 1 >= TANK_RANK_CUTOFF;
        });
    });
};

const getLineup = (team: Team, players: { [key: string]: Player }): { slots: LineupSlot[]; usedIds: Set<string> } => {
    const resting = shutDownIds(team, players);
    const available = team.roster.filter(pId => !team.playerAbsences?.[pId] && !!players[pId] && !resting.has(pId));
    const availableSet = new Set(available);

    // Pass 1: reserve each available designated starter to its own slot so the
    // fill logic below can never steal a GM-pinned player into another slot.
    const reservedByPos = new Map<string, string>();
    const reservedIds = new Set<string>();
    STARTING_SLOTS.forEach(({ slot: pos, bucket }) => {
        const designatedId = team.starters?.[pos];
        if (
            designatedId &&
            availableSet.has(designatedId) &&
            !reservedIds.has(designatedId) &&
            getPlayerPositions(players[designatedId]).includes(bucket)
        ) {
            reservedByPos.set(pos, designatedId);
            reservedIds.add(designatedId);
        }
    });

    // Bench pool for filling non-reserved slots — excludes every reserved
    // starter so they stay locked to their assigned position.
    const remaining = new Set(available.filter(pId => !reservedIds.has(pId)));
    const resolved = new Map<string, LineupSlot>();

    // Pass 2 fills the remaining slots SCARCEST FIRST, re-measured after every
    // assignment, rather than in court order. With real positions a roster can
    // have exactly one player eligible somewhere — Boston's only PF-eligible
    // player is Tatum, who is PF/SF — and filling in court order would spend
    // him at SF and leave PF empty, i.e. a four-man starting five. Taking the
    // most-constrained slot first hands him to PF and lets a deeper position
    // absorb the loss. Verified across all 30 rosters: court order leaves one
    // hole, scarcest-first leaves none. Reserved slots are resolved first since
    // they're already decided and shrink nobody's candidate pool.
    const eligibleFor = (bucket: string) =>
        [...remaining].filter(pId => getPlayerPositions(players[pId]).includes(bucket));

    const pending = [...STARTING_SLOTS];
    while (pending.length) {
        const next = pending.reduce((scarcest, candidate) => {
            const rank = ({ slot, bucket }: typeof candidate) =>
                reservedByPos.has(slot) ? -1 : eligibleFor(bucket).length;
            return rank(candidate) < rank(scarcest) ? candidate : scarcest;
        });
        pending.splice(pending.indexOf(next), 1);
        const { slot: pos, bucket } = next;

        const designatedId = team.starters?.[pos];
        const reservedId = reservedByPos.get(pos);

        const eligible = eligibleFor(bucket);
        const bestEligible = eligible.length
            ? eligible.reduce((best, pId) =>
                  effectiveOvr(team, pId, players) > effectiveOvr(team, best, players) ? pId : best)
            : null;

        if (reservedId) {
            // GM's pick is here and available. Keep them unless they're in a
            // real slump (active negative status effect) and a same-position
            // bench player has clearly overtaken their effective OVR.
            const effect = team.playerStatusEffects?.[reservedId];
            const isSlumping = !!effect && effect.ovrChange < 0;
            if (
                isSlumping &&
                bestEligible &&
                effectiveOvr(team, bestEligible, players) - effectiveOvr(team, reservedId, players) >= SLUMP_OVERRIDE_MARGIN
            ) {
                resolved.set(pos, { pos, bucket, playerId: bestEligible, designatedId, isSubstitute: true });
                remaining.delete(bestEligible); // reservedId falls to the bench (via usedIds in getTeamRotation)
            } else {
                resolved.set(pos, { pos, bucket, playerId: reservedId, designatedId, isSubstitute: false });
            }
            continue;
        }

        // No available GM pick for this slot: either none was set, or the
        // designated starter is injured/suspended/traded/off-position. Fill by
        // best available; flag as a substitute only if the GM did pick someone.
        if (!bestEligible) {
            resolved.set(pos, { pos, bucket, playerId: null, designatedId, isSubstitute: false });
            continue;
        }
        resolved.set(pos, { pos, bucket, playerId: bestEligible, designatedId, isSubstitute: !!designatedId });
        remaining.delete(bestEligible);
    }

    // Emitted in court order regardless of the fill order above, since the
    // court layout and the rotation both read this array positionally.
    const slots = STARTING_SLOTS.map(({ slot }) => resolved.get(slot)!).filter(Boolean);
    const usedIds = new Set(slots.map(s => s.playerId).filter((id): id is string => !!id));
    return { slots, usedIds };
};

// Picks the rotation (default 8) a team actually plays: the resolved
// starting five (see getLineup) plus the best remaining players by OVR
// regardless of position filling any bench spots left.
const getTeamRotation = (team: Team, players: { [key: string]: Player }, size: number = DEFAULT_ROTATION_SIZE): string[] => {
    const { slots, usedIds } = getLineup(team, players);
    const starters = slots.map(s => s.playerId).filter((id): id is string => !!id);

    // The shut-down filter has to be repeated here: getLineup excluded them from
    // the STARTERS, which leaves them out of usedIds, so without this they would
    // walk straight back in as the first names off the bench.
    const resting = shutDownIds(team, players);
    const bench = team.roster
        .filter(pId => !team.playerAbsences?.[pId] && !!players[pId] && !usedIds.has(pId) && !resting.has(pId))
        .sort((a, b) => effectiveOvr(team, b, players) - effectiveOvr(team, a, players));

    return [...starters, ...bench].slice(0, size);
};

// How deep a team's real rotation runs — user-tunable via Team.rotationSize
// (a single stepper in MyTeamHub, not a per-player minutes slider — mobile
// scope, same call as the draft-pick protection toggle in Fase C). Bounded so
// it never drops below the 8 that keep a bench functional or climbs past what
// the minutes curve below can sensibly spread across.
export const ROTATION_MIN = 8;
export const ROTATION_MAX = 12;
export const DEFAULT_ROTATION_SIZE = 10;
const rotationSize = (team: Team): number =>
    Math.round(clampMod(team.rotationSize ?? DEFAULT_ROTATION_SIZE, ROTATION_MIN, ROTATION_MAX));

// Minutes weighting by rotation slot: starters play the most, bench tapers
// off. Shared by getGameRatings (a team's rating should reflect who actually
// plays the most, not a flat average across the rotation) and recordGameStats
// (box-score minutes) — both read the same weights so "who plays" and "who
// the sim thinks is good" never disagree.
//
// The numbers ARE a real NBA minutes distribution, divided by 6:
// 36/34/32/30/28 for the starters, then 24/20/16/12/8 off the bench. That
// matters because TEAM_MINUTES (240) is split proportionally to them — the
// old curve was steep enough that an 8-man rotation handed its best player
// 43.8 mpg, which nobody in the modern NBA plays (measured; see
// scripts/diagnose_season.ts). A 10-man rotation on this curve lands the
// leader at ~36.
const ROTATION_WEIGHTS = [6.0, 5.67, 5.33, 5.0, 4.67, 4.0, 3.33, 2.67, 2.0, 1.33, 0.9, 0.6];

// A player flagged for load management (Team.loadManagedIds) gets a lighter
// share of his slot's minutes — that's the whole point of flagging him — and
// since injury risk and load buildup below both read off actual minutes
// weight, the reduced exposure and slower fatigue accrual fall out for free.
const LOAD_MANAGED_FACTOR = 0.6;

export const getRotationWeights = (team: Team, players: { [key: string]: Player }): { ids: string[]; weights: number[] } => {
    const ids = getTeamRotation(team, players, rotationSize(team));
    const weights = ids.map((pId, i) => {
        const base = ROTATION_WEIGHTS[i] ?? 0.5;
        return team.loadManagedIds?.includes(pId) ? base * LOAD_MANAGED_FACTOR : base;
    });
    return { ids, weights };
};

const getGameRatings = (team: Team, players: { [key: string]: Player }) => {
    const { ids, weights } = getRotationWeights(team, players);
    let offense = 0;
    let defense = 0;
    let totalWeight = 0;

    ids.forEach((pId, i) => {
        const player = players[pId];
        if (!player) return;
        const w = weights[i];

        let tempOff = player.off;
        let tempDef = player.def;

        if (team.playerStatusEffects && team.playerStatusEffects[pId]) {
            const effect = team.playerStatusEffects[pId];
            const ovrChange = effect.ovrChange;
            // Apply the change proportionally to off and def
            tempOff += Math.round(ovrChange * (player.off / player.ovr));
            tempDef += Math.round(ovrChange * (player.def / player.ovr));
        }

        // Rolled twice, not once: a player can have a hot shooting night while
        // still getting cooked defensively. Sharing one draw made every good
        // night a two-way night, which is not how a basketball game reads.
        offense += (tempOff + (Math.random() * 6 - 3)) * w;
        defense += (tempDef + (Math.random() * 6 - 3)) * w;
        totalWeight += w;
    });

    if (totalWeight === 0) return { offense: 70, defense: 70 };

    return {
        offense: offense / totalWeight,
        defense: defense / totalWeight,
    };
};

// Aggregate attribute signals for a team's actual rotation, used to layer
// realistic team-construction effects on top of the raw off/def averages:
// spacing (avg shooting), on-ball creation (the single best playmaker — a
// team with no real creator generates less), rim protection (the best interior
// defender suppresses opponent scoring), and rebounding (a possession edge).
interface TeamProfile {
    shooting: number;
    playmaking: number; // best creator on the floor
    interiorD: number;  // best rim protector on the floor
    rebounding: number;
}

const getTeamProfile = (team: Team, players: { [key: string]: Player }): TeamProfile => {
    const rotation = getTeamRotation(team, players, rotationSize(team)).map(pId => players[pId]).filter(Boolean);
    if (rotation.length === 0) return { shooting: 72, playmaking: 72, interiorD: 72, rebounding: 72 };

    let shootingSum = 0;
    let reboundingSum = 0;
    let bestPlaymaking = 0;
    let bestInteriorD = 0;
    rotation.forEach(p => {
        const a = getPlayerAttributes(p);
        shootingSum += a.shooting;
        reboundingSum += a.rebounding;
        if (a.playmaking > bestPlaymaking) bestPlaymaking = a.playmaking;
        if (a.interiorD > bestInteriorD) bestInteriorD = a.interiorD;
    });

    return {
        shooting: shootingSum / rotation.length,
        playmaking: bestPlaymaking,
        interiorD: bestInteriorD,
        rebounding: reboundingSum / rotation.length,
    };
};

const clampMod = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

/**
 * A standard normal draw (mean 0, sd 1), by the Irwin-Hall route: three
 * uniforms sum to a distribution with sd 0.5, so doubling it lands on 1.
 *
 * Cheaper than Box-Muller and, unlike a true normal, naturally bounded at ±3sd
 * — which is what we want for a basketball score. Every score in the sim is
 * shaped by this rather than by `Math.random()` directly: a uniform gives a
 * flat-topped distribution where a 30-point night is exactly as likely as an
 * average one, right up to a hard edge where it becomes impossible.
 */
const gauss = (): number => (Math.random() + Math.random() + Math.random() - 1.5) * 2;

// --- MORALE / CHEMISTRY ---
// A content player sits at 70; morale is undefined until the sim first touches
// it (older data / fresh signees), so read it through this default.
const DEFAULT_MORALE = 70;
const getMorale = (p: Player): number => p.morale ?? DEFAULT_MORALE;

// A fresh player sits at 0 (no accumulated fatigue); load is undefined until
// recordGameStats first touches it.
const getLoad = (p: Player): number => p.load ?? 0;

// Injury risk rises with age, minutes load (roster is OVR-sorted, so a low
// index is a rotation regular logging heavy minutes → more exposure — the
// thresholds scale with the team's own rotationSize so a tighter rotation
// correctly reads its 6th man as a bigger workload than a 10-deep one would),
// and now also with *accumulated* fatigue (up to +60% at max load) — this is
// what makes load management a real lever: keeping a player's load down
// measurably lowers his odds of getting hurt, not just his minutes. Used to
// weight which player gets hurt, so it's usually a key piece or an aging vet —
// that's what gives an injury real narrative weight instead of hitting a random
// end-of-bench name.
const injuryRisk = (p: Player, idx: number, rotSize: number): number => {
    const ageFactor = 1 + Math.max(0, p.age - 28) * 0.12;
    const loadFactor = idx < 5 ? 1.5 : idx < rotSize ? 1.2 : idx < rotSize + 2 ? 0.8 : 0.4;
    const fatigueFactor = 1 + (clampMod(getLoad(p), 0, 100) / 100) * 0.6;
    return ageFactor * loadFactor * fatigueFactor;
};

// Severity tier for a new injury: most are minor, a rare few are season-altering,
// and older players skew slightly more severe. Returns games missed + a label.
// Odds that a given team picks up a new injury on a given night. Tuned against
// scripts/diagnose_season.ts so rotation players land near the real NBA's ~68
// games played, which is the number that makes depth, load management and
// "who's healthy in May" mean anything.
const INJURY_CHANCE_PER_TEAM = 0.15;

const rollInjury = (age: number): { duration: number; label: string } => {
    const r = Math.random() - Math.max(0, age - 30) * 0.015;
    if (r < 0.55) return { duration: 2 + Math.floor(Math.random() * 4), label: 'uma lesão leve' };          // 2-5
    if (r < 0.88) return { duration: 6 + Math.floor(Math.random() * 9), label: 'um estiramento muscular' }; // 6-14
    return { duration: 18 + Math.floor(Math.random() * 18), label: 'uma lesão grave' };                     // 18-35
};

// Weighted random index into a weights array (higher weight = likelier).
const weightedIndex = (weights: number[]): number => {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return Math.floor(Math.random() * weights.length);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
    return weights.length - 1;
};

// Team chemistry = average morale of the available top-8 rotation. Drives a
// small game modifier (a happy locker room overperforms its raw talent a little,
// a fractured one underperforms), on the same modest scale as momentum.
const teamChemistry = (team: Team, players: { [key: string]: Player }): number => {
    const rotation = team.roster
        .filter(id => !team.playerAbsences?.[id] && players[id])
        .slice(0, rotationSize(team));
    if (rotation.length === 0) return DEFAULT_MORALE;
    return rotation.reduce((s, id) => s + getMorale(players[id]), 0) / rotation.length;
};

// Nudge every player's morale a step toward the target their situation implies,
// once per simulated day. Targets are set by: team record, role (starters happy,
// buried players unhappy — roster is OVR-sorted so the index is a rotation
// proxy), a penalty for a good player benched or a star stuck on a losing team,
// and the current hot/slump mood. Returns trade-request events, but only for the
// user's rotation-caliber players crossing into real discontent (so it's a rare,
// meaningful moment, not spam). Mutates `players` in place.
const updateMorale = (
    teams: Team[],
    players: { [key: string]: Player },
    userTeamId: string
): { message: string; type: string }[] => {
    const events: { message: string; type: string }[] = [];
    teams.forEach(team => {
        const gp = (team.wins || 0) + (team.losses || 0);
        const winPct = gp ? (team.wins || 0) / gp : 0.5;
        const size = rotationSize(team);
        team.roster.forEach((id, idx) => {
            const p = players[id];
            if (!p) return;
            let target = 50 + (winPct - 0.5) * 60; // ~20 (winless) .. ~80 (undefeated)
            if (idx < 5) target += 8;             // starter
            else if (idx < size) target += 3;     // rotation
            else if (idx >= size + 2) target -= 15; // deep bench / out of the rotation
            if (p.ovr >= 80 && idx >= size) target -= 12; // a good player buried
            if (p.ovr >= 82 && winPct < 0.4) target -= 10; // a star wasting his prime
            const eff = team.playerStatusEffects?.[id];
            if (eff?.type === 'hot') target += 6;
            if (eff?.type === 'slump') target -= 6;
            target = clampMod(target, 5, 98);

            const cur = getMorale(p);
            const next = clampMod(Math.round(cur + (target - cur) * 0.15), 0, 100);
            const wasContent = cur >= 25;
            p.morale = next;

            if (team.id === userTeamId && p.ovr >= 78 && idx <= size && next < 25 && wasContent) {
                events.push({ message: `😤 ${p.name} está insatisfeito com sua situação e pediu para ser trocado.`, type: 'injury' });
            }
        });
    });
    return events;
};

// `homeTeamId` lets a caller with a real schedule (App.tsx's simulateDay)
// pin down which side gets home-court deterministically instead of a coin
// flip — playoff series/play-in/cup callers omit it and keep the coinflip,
// since those contexts don't have a fixed schedule to consult.
// Everything simulateGame needs to know BEFORE a possession is played: ratings,
// construction/chemistry/coach modifiers, style-driven base pace, home court
// and momentum, folded into one expected-points figure per side. Factored out
// of simulateGame so the live-game quarter engine (simulateQuarter below) can
// compute the same full-game expectation once and split it across quarters,
// instead of re-deriving a second, drifting copy of this formula.
export const computeExpectedPoints = (
    teamA: Team, teamB: Team, players: { [key: string]: Player }, coaches: CoachMap, isAHome: boolean,
): { expectedPointsA: number; expectedPointsB: number } => {
    const ratingsA = getGameRatings(teamA, players);
    const ratingsB = getGameRatings(teamB, players);
    const profileA = getTeamProfile(teamA, players);
    const profileB = getTeamProfile(teamB, players);

    // Coach effect: each side's own offense coaching lifts its scoring, and the
    // opponent's defense coaching cuts into it — same "attacker minus defender"
    // shape as the raw offense/defense ratings above, just on a much smaller,
    // fit-scaled scale (see coachOffenseMod/coachDefenseMod).
    const coachA = teamA.coachId ? coaches[teamA.coachId] : undefined;
    const coachB = teamB.coachId ? coaches[teamB.coachId] : undefined;
    const coachOffA = coachOffenseMod(coachA, teamA);
    const coachDefA = coachDefenseMod(coachA, teamA);
    const coachOffB = coachOffenseMod(coachB, teamB);
    const coachDefB = coachDefenseMod(coachB, teamB);

    // Team-construction modifiers (in points), bounded so they add texture
    // without overriding raw talent. offenseMod(X, defenderProfile) rewards X's
    // spacing/creation and is suppressed by the defender's rim protection; a
    // rebounding edge is a small possession bonus.
    const offenseMod = (attacker: TeamProfile, defender: TeamProfile): number => {
        const spacing = clampMod((attacker.shooting - 76) * 0.15, -3, 3);
        const creation = clampMod((attacker.playmaking - 82) * 0.20, -4, 2);
        const rimProtection = clampMod((defender.interiorD - 78) * 0.15, -2, 4);
        const reboundEdge = clampMod((attacker.rebounding - defender.rebounding) * 0.10, -2, 2);
        return spacing + creation - rimProtection + reboundEdge;
    };
    const attrModA = offenseMod(profileA, profileB);
    const attrModB = offenseMod(profileB, profileA);

    // Locker-room chemistry: a happy rotation gets a small lift, a disgruntled
    // one a small drag — bounded to ±3 points, the same texture-not-talent
    // scale as the construction modifiers above.
    const chemModA = clampMod((teamChemistry(teamA, players) - 65) * 0.12, -3, 3);
    const chemModB = clampMod((teamChemistry(teamB, players) - 65) * 0.12, -3, 3);

    // 1. Determine base score from team styles
    // 115 puts the league's average team night at ~113 once the modifiers below
    // net out, which is where the modern NBA actually scores. It used to be 98
    // — a 1998 number that made a 118-112 final literally unreachable (the
    // highest score in 14,760 measured games was 120).
    let baseScore = 115;
    const styles = [teamA.style, teamB.style];
    if (styles.includes('Run and Gun') || styles.includes('Pace and Space')) {
        baseScore += 7;
    }
    if (styles.includes('Grit and Grind') || styles.includes('Defense First')) {
        baseScore -= 7;
    }

    // 2. Calculate expected points for each team
    const homeAdvantage = 2.5; // Point advantage
    const momentumFactor = 0.75; // Points per momentum point
    // How much of the offense-minus-defense gap converts to points. Raised
    // from 0.6 alongside the variance fix: with realistic noise AND a
    // 10-man rotation flattening every team's rating toward the league mean,
    // 0.6 left the standings almost talent-blind (best record 58, league win
    // sd 8.7, talent-to-wins correlation 0.66). This is the signal side of the
    // signal-to-noise ratio the whole standings shape rests on.
    const matchupStrength = 1.15;

    const expectedPointsA = baseScore
        + (ratingsA.offense - ratingsB.defense) * matchupStrength
        + attrModA
        + chemModA
        + coachOffA - coachDefB
        + (isAHome ? homeAdvantage : 0)
        + (teamA.momentum || 0) * momentumFactor;

    const expectedPointsB = baseScore
        + (ratingsB.offense - ratingsA.defense) * matchupStrength
        + attrModB
        + chemModB
        + coachOffB - coachDefA
        + (!isAHome ? homeAdvantage : 0)
        + (teamB.momentum || 0) * momentumFactor;

    return { expectedPointsA, expectedPointsB };
};

const simulateGame = (teamA: Team, teamB: Team, players: { [key: string]: Player }, homeTeamId?: string, coaches: CoachMap = {}) => {
    const isAHome = homeTeamId ? homeTeamId === teamA.id : Math.random() > 0.5;
    const { expectedPointsA, expectedPointsB } = computeExpectedPoints(teamA, teamB, players, coaches, isAHome);

    // 3. Add unpredictability.
    //
    // This used to be a single uniform ±7.5 per side — a standard deviation of
    // 4.3 points, against the ~12.5 a real NBA team's score carries. The
    // consequences were not cosmetic: with only 4 points of noise a 6-point
    // talent edge always cashes, so the league produced 73-win champions and
    // four 60-win teams a year, 45% of games were decided by five or less, and
    // 2.4% were blowouts (the real figures are ~25% and ~22%).
    //
    // The noise is now split in two, which is also what the real distribution
    // looks like: a PACE swing both teams share (a track meet lifts both
    // scores, a rock fight sinks both) plus each side's own shooting night.
    // Sharing part of the variance is what keeps the margin's spread (~13.8)
    // below sqrt(2)x the score's — sampling the two sides independently would
    // put it at 17.7 and manufacture blowouts.
    const pace = gauss() * 7.8;
    let scoreA = Math.round(expectedPointsA + pace + gauss() * 9.0);
    let scoreB = Math.round(expectedPointsB + pace + gauss() * 9.0);

    // A floor low enough that it effectively never binds — the old one sat at
    // 80 and, against a distribution squeezed around 96, fired on 0.79% of
    // scores, stacking them on a visible plateau at exactly 80.
    scoreA = Math.max(50, scoreA);
    scoreB = Math.max(50, scoreB);

    // 4. Handle overtime and determine winner
    if (scoreA === scoreB) {
        // Simple OT simulation: add a small random number
        const otPointsA = Math.floor(Math.random() * 8) + 5;
        const otPointsB = Math.floor(Math.random() * 8) + 5;
        scoreA += otPointsA;
        scoreB += otPointsB;
        if (scoreA === scoreB) scoreA += 1; // Final tie-breaker
    }

    return scoreA > scoreB
        ? { winner: teamA, loser: teamB, scoreWinner: scoreA, scoreLoser: scoreB }
        : { winner: teamB, loser: teamA, scoreWinner: scoreB, scoreLoser: scoreA };
};

// --- SCORING ATTRIBUTION (3D "Assistir ao Jogo") ---
// Breaks a point total into individual made baskets attributed to players, so
// the 3D court screen can show WHO scores rather than just a rising number.
// The total it's handed is never re-rolled here: whatever the caller resolved
// is exactly what comes back out, split up.

export interface GameEvent {
    team: 'A' | 'B';
    playerId: string;
    playerName: string;
    points: 1 | 2 | 3;
    clockSeconds: number; // filled in by the caller — this module only attributes, it doesn't schedule
}

// How often a given player's baskets are threes. This used to be a flat 32%
// for everybody, which was invisible while the 3D court only animated a ball
// arc — but once a real body walks out to the spot the shot came from, a
// center launching a third of his baskets from the arc is glaring. Driven by
// the shooting attribute and damped hard for bigs.
export const threeRate = (player: Player | undefined): number => {
    if (!player) return 0.3;
    const shooting = player.attributes?.shooting ?? 70;
    const bigDamp = player.pos === 'C' ? 0.4 : player.pos === 'PF' ? 0.8 : 1;
    return Math.max(0.04, Math.min(0.52, ((shooting - 50) / 85) * bigDamp));
};

// Breaks one team's final point total into a sequence of made baskets
// (1s/2s/3s) attributed to players, using the SAME scoring-weight formula
// recordGameStats uses to split points across the rotation (pow(off-58,1.9)
// weighted by rotation minutes) — the player who leads the real box score is
// the player who visibly scores the most on screen, not an independent RNG.
//
// `pool` narrows who is eligible to score. The watch screen passes the five
// actually standing on the court (substitutions aren't implemented yet — see
// ROADMAP.md), because a basket has to come out of a body the user can see.
// Omitted, it falls back to the full rotation, which is what the box score
// itself is split across.
export const generateScoringPlays = (
    team: Team, players: { [key: string]: Player }, points: number, side: 'A' | 'B',
    pool?: { ids: string[]; weights: number[] },
): GameEvent[] => {
    const { ids, weights } = pool ?? getRotationWeights(team, players);
    if (ids.length === 0 || points <= 0) return [];

    const pow = (v: number, e: number) => Math.pow(Math.max(0, v), e);
    const ptsW = ids.map((pId, i) => pow(players[pId].off - 58, 1.9) * weights[i]);
    const totalW = ptsW.reduce((a, b) => a + b, 0) || 1;
    const target = ptsW.map((w) => (w / totalW) * points);
    const earned = ids.map(() => 0);

    const events: GameEvent[] = [];
    let remaining = points;
    while (remaining > 0) {
        // Whoever is furthest below their target share scores next — spreads
        // baskets across the rotation instead of one player running the whole
        // sequence, while still converging on the real weighted split.
        let idx = 0;
        let bestDeficit = -Infinity;
        ids.forEach((_, i) => {
            const deficit = target[i] - earned[i];
            if (deficit > bestDeficit) { bestDeficit = deficit; idx = i; }
        });
        const basketPts: 1 | 2 | 3 = remaining === 1 ? 1 : remaining === 2 ? 2
            : (Math.random() < threeRate(players[ids[idx]]) ? 3 : 2);
        remaining -= basketPts;
        earned[idx] += basketPts;
        events.push({ team: side, playerId: ids[idx], playerName: players[ids[idx]].name, points: basketPts, clockSeconds: 0 });
    }
    return events;
};

// --- LIVE DECISIVE GAME (Fase F) ---
// A Game 7 (or Finals-clincher) involving the user is played out quarter by
// quarter instead of resolved in one simulateGame call, with two levers the
// user can pull between quarters: a limited timeout and a re-pickable tactical
// emphasis. Both are small, bounded point deltas on the SAME expected-points
// figure simulateGame already uses (via computeExpectedPoints) split four
// ways — texture on top of the real sim, not a separate toy model.

// label -> {selfDelta, oppDelta} added to that quarter's expected points (own
// team, opponent). Re-picked every quarter; nothing persists automatically.
export const TACTIC_META: Record<LiveTactic, { label: string; blurb: string; selfDelta: number; oppDelta: number }> = {
    ritmo: { label: 'Acelerar o Ritmo', blurb: 'Mais posses pros dois lados — favorece quem ataca melhor.', selfDelta: 3, oppDelta: 2 },
    defesa: { label: 'Intensificar a Defesa', blurb: 'Sufoca o ataque adversário, custando um pouco de fluidez no seu.', selfDelta: -1, oppDelta: -3 },
    isolar: { label: 'Isolar a Estrela', blurb: 'Todas as posses decisivas pro seu melhor pontuador.', selfDelta: 4, oppDelta: 0 },
};

// --- WATCH-GAME PLAYS (3D "Assistir ao Jogo") ---
// Deliberately a SEPARATE table from TACTIC_META above, not an extension of
// it. Both are bounded point deltas on the same computeExpectedPoints figure,
// but these four are half-court SETS: each one also owns a choreography (who
// screens, who cuts, who shoots) that the 3D court plays out — see
// PLAY_CHOREO in services/watchDirector.ts. TACTIC_META's three emphases have
// no bodies to move, and the Game 7 screen keeps using it untouched.
//
// `variance` widens or narrows that quarter's random swing: a night living off
// pindown threes is streakier than one feeding the post, whatever the average
// says. Applied on top of LIVE_QUARTER_VARIANCE.
export const WATCH_PLAY_META: Record<WatchPlay, {
    label: string; short: string; blurb: string;
    selfDelta: number; oppDelta: number; variance: number;
}> = {
    pick_roll: {
        label: 'Pick & Roll', short: 'P&R',
        blurb: 'O pivô sobe pro bloqueio e rola pra cesta. Equilibrado, funciona contra quase tudo.',
        selfDelta: 2, oppDelta: 0, variance: 0,
    },
    pindown: {
        label: 'Pindown 3PT', short: '3PT',
        blurb: 'Bloqueio na linha de fundo pra liberar o ala-armador atrás do arco. Noite de altos e baixos.',
        selfDelta: 3, oppDelta: 1, variance: 5,
    },
    post_up: {
        label: 'Post-Up', short: 'POSTE',
        blurb: 'Bola no garrafão, de costas pra cesta. Poucos pontos a mais, mas quase sem risco.',
        selfDelta: 1, oppDelta: -2, variance: -3,
    },
    iso: {
        label: 'Isolar a Estrela', short: 'ISO',
        blurb: 'Todo mundo abre e o seu melhor pontuador resolve sozinho.',
        selfDelta: 4, oppDelta: 1, variance: 2,
    },
};

// Timeout bonus is a flat, one-time bump to the user's own next quarter —
// "stopping the bleeding," not a tactical choice, so it stacks with a tactic
// if both are queued for the same quarter.
export const TIMEOUT_BONUS = 3;
export const STARTING_TIMEOUTS = 4;
// Uniform width (not a standard deviation) of a single period's swing, shared
// by advanceLiveQuarter and the watched-game director. 22 wide is sd ~6.3,
// which is the full game's ~13 spread divided across four independent
// quarters. It used to be 9 — sd 2.6 — which quietly made the one game the
// user actually plays out, a Game 7, five times more deterministic than every
// game the sim resolves in the background.
export const LIVE_QUARTER_VARIANCE = 22;
// No quarter realistically scores below this. Real NBA quarters bottom out
// around 10; 16 was set against a league that averaged 24 a period and now
// averages ~29, where it would bind on any genuinely cold quarter.
export const QUARTER_FLOOR = 10;

export const startLiveGame = (ref: PendingDeciderRef, teamA: Team, teamB: Team, userTeamId: string): LiveGameState => ({
    ref,
    teamAId: teamA.id,
    teamBId: teamB.id,
    userIsTeamA: teamA.id === userTeamId,
    quarter: 1,
    scoreA: 0,
    scoreB: 0,
    quarterScores: [],
    timeoutsLeft: STARTING_TIMEOUTS,
    pendingTimeout: false,
    pendingTactic: null,
    log: [],
    complete: false,
});

const advanceLiveQuarter = (
    game: LiveGameState, teamA: Team, teamB: Team,
    players: { [key: string]: Player }, coaches: CoachMap,
): LiveGameState => {
    if (game.complete) return game;

    // teamA (the bracket's m[0]) hosts the decisive game — consistent home
    // court for the whole game, not re-rolled every quarter.
    const { expectedPointsA, expectedPointsB } = computeExpectedPoints(teamA, teamB, players, coaches, true);

    let selfDelta = 0;
    let oppDelta = 0;
    if (game.pendingTimeout) selfDelta += TIMEOUT_BONUS;
    if (game.pendingTactic) {
        const t = TACTIC_META[game.pendingTactic];
        selfDelta += t.selfDelta;
        oppDelta += t.oppDelta;
    }
    // Only the user's side ever queues a timeout/tactic — the CPU opponent
    // plays it straight, same simplification as CPU teams not scouting.
    const userDeltaA = game.userIsTeamA ? selfDelta : oppDelta;
    const userDeltaB = game.userIsTeamA ? oppDelta : selfDelta;

    const baseA = expectedPointsA / 4 + userDeltaA;
    const baseB = expectedPointsB / 4 + userDeltaB;
    const a = Math.max(QUARTER_FLOOR, Math.round(baseA + (Math.random() * LIVE_QUARTER_VARIANCE - LIVE_QUARTER_VARIANCE / 2)));
    const b = Math.max(QUARTER_FLOOR, Math.round(baseB + (Math.random() * LIVE_QUARTER_VARIANCE - LIVE_QUARTER_VARIANCE / 2)));

    const scoreA = game.scoreA + a;
    const scoreB = game.scoreB + b;
    const label = game.quarter <= 4 ? `${game.quarter}º Quarto` : `Prorrogação ${game.quarter - 4}`;
    const quarterScores = [...game.quarterScores, { a, b, label }];

    // Safety valve: past 4 OT periods (extraordinarily unlikely), just settle
    // it on whoever's ahead so this can never loop forever — if it's STILL
    // tied at that point, nudge the home team by 1 rather than leaving a tie.
    const forceEnd = game.quarter >= 8;
    const tied = scoreA === scoreB;
    const complete = (game.quarter >= 4 && !tied) || forceEnd;
    const finalA = forceEnd && tied ? scoreA + 1 : scoreA;

    const line = `${label}: ${teamA.name} ${a} - ${b} ${teamB.name} (${finalA}-${scoreB})`;

    return {
        ...game,
        quarter: game.quarter + 1,
        scoreA: finalA,
        scoreB,
        quarterScores,
        timeoutsLeft: game.timeoutsLeft - (game.pendingTimeout ? 1 : 0),
        pendingTimeout: false,
        pendingTactic: null,
        log: [line, ...game.log].slice(0, 30),
        complete,
        winnerId: complete ? (finalA > scoreB ? teamA.id : teamB.id) : undefined,
    };
};

// Writes a resolved live-game winner back into the exact bracket slot
// PlayoffState.pendingDecider pointed at, then clears it — the NEXT
// "SIMULAR RODADA" click picks the round up exactly where it left off, since
// every other check in advancePlayoffRound only cares whether series.w is set.
const applyDeciderResult = (playoffState: PlayoffState, teamA: Team, teamB: Team, winnerId: string): PlayoffState => {
    const ref = playoffState.pendingDecider;
    if (!ref) return playoffState;
    const newState: PlayoffState = JSON.parse(JSON.stringify(playoffState));
    const winner = winnerId === teamA.id ? teamA : teamB;
    const series: PlayoffSeries = { m: [teamA, teamB], w: winner, s: winnerId === teamA.id ? '4-3' : '3-4' };

    if (ref.scope === 'finals') {
        newState.finals = series;
        newState.champion = winner;
    } else {
        // NOTE the two `winner` fields: PlayoffBracketData declares one and so
        // does PlayoffConference, but only the CONFERENCE one builds the Finals
        // (see advancePlayoffRound's `newState.east.winner &&
        // newState.west.winner`). Writing to the bracket's instead type-checks
        // fine and silently soft-locks the save — the conference never reports
        // a champion, the Finals are never created, and "Simular rodada"
        // no-ops forever. Reachable only by winning a live Game 7 in the
        // conference finals. The conf-finals MVP is left to the catch-up block
        // in advancePlayoffRound, which has `players` in scope and also repairs
        // saves already stuck from before this was fixed.
        const conference = newState[ref.conf];
        conference.bracket[ref.round][ref.index] = series;
        if (ref.round === 'round3') conference.winner = winner;
    }
    newState.pendingDecider = undefined;
    return newState;
};

// `stopAtDeciderFor` (a userTeamId) makes the series pause right BEFORE
// simulating a game that would decide it (winsNeeded-1 apiece) when the user
// is one of the two teams, instead of resolving it — the caller (
// advancePlayoffRound) routes that one game to the live quarter-by-quarter
// screen and resumes the series afterward via applyDeciderResult. A series
// the user isn't in always resolves normally in one shot, same as before.
const simulateSeries = (
    teamA: Team, teamB: Team, players: { [key: string]: Player }, bestOf: number = 7, coaches: CoachMap = {},
    stopAtDeciderFor?: string,
): { pendingDecider: true; winsA: number; winsB: number } | { pendingDecider: false; winner: Team; score: string; winsA: number; winsB: number } => {
    let winsA = 0, winsB = 0;
    const winsNeeded = Math.ceil(bestOf / 2);
    const involvesUser = stopAtDeciderFor === teamA.id || stopAtDeciderFor === teamB.id;

    while (winsA < winsNeeded && winsB < winsNeeded) {
        if (involvesUser && winsA === winsNeeded - 1 && winsB === winsNeeded - 1) {
            return { pendingDecider: true, winsA, winsB };
        }
        const game = simulateGame(teamA, teamB, players, undefined, coaches);
        if (game.winner.id === teamA.id) winsA++; else winsB++;
    }
    const winner = winsA > winsB ? teamA : teamB;
    const score = `${winsA}-${winsB}`;

    return { pendingDecider: false, winner, score, winsA, winsB };
};

// Total minutes a team distributes across a game (5 on the floor × 48 min).
const TEAM_MINUTES = 240;

// Splits a team total across the rotation proportionally to `weights`, with
// mild per-player game-to-game noise so box scores aren't identical every
// night. Returns an array aligned to the weights (summing ~= total).
const splitTotal = (total: number, weights: number[]): number[] => {
    const noisy = weights.map(w => Math.max(0, w) * (0.7 + Math.random() * 0.6));
    const sum = noisy.reduce((a, b) => a + b, 0) || 1;
    return noisy.map(w => (total * w) / sum);
};

// Records a game's box score: updates the team's per-game averages AND
// distributes the game into each rotation player's season stats, so the app
// has real individual production (leaders, awards) instead of ratings-only
// stand-ins. A player only accrues a game when they're actually in the
// rotation — deep-bench/injured players log DNPs (their gp doesn't move).
const recordGameStats = (team: Team, pointsScored: number, pointsAllowed: number, players: { [key: string]: Player }) => {
    if (!team.stats) {
        team.stats = { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 };
    }

    const gamesPlayed = (team.wins || 0) + (team.losses || 0);
    const prevGames = gamesPlayed - 1;
    const ratings = getGameRatings(team, players);

    // Team box-score totals — same rating-based model as before, now also the
    // pool that gets split among players so team and player stats stay coherent.
    const teamRebounds = Math.floor(38 + (ratings.defense / 20) + (Math.random() * 10));
    // 0.19, not 0.22: the coefficient is a share of points scored, so raising
    // the league's scoring to a modern 113 dragged team assists to ~30 a night.
    // The real NBA sits at ~26.5.
    const teamAssists = Math.floor((pointsScored * 0.19) + (ratings.offense / 30) + (Math.random() * 5));
    const teamSteals = Math.floor(5 + (ratings.defense / 25) + (Math.random() * 4));
    const teamBlocks = Math.floor(3 + (ratings.defense / 30) + (Math.random() * 4));
    const teamTurnovers = Math.floor(16 - (ratings.offense / 25) + (Math.random() * 5));

    const updateStat = (currentAvg: number, newVal: number) => {
        if (prevGames <= 0) return newVal;
        return ((currentAvg * prevGames) + newVal) / gamesPlayed;
    };
    team.stats.ppg = updateStat(team.stats.ppg, pointsScored);
    team.stats.oppg = updateStat(team.stats.oppg, pointsAllowed);
    team.stats.rpg = updateStat(team.stats.rpg, teamRebounds);
    team.stats.apg = updateStat(team.stats.apg, teamAssists);
    team.stats.spg = updateStat(team.stats.spg, teamSteals);
    team.stats.bpg = updateStat(team.stats.bpg, teamBlocks);
    team.stats.tpg = updateStat(team.stats.tpg, teamTurnovers);

    // --- distribute the team box score across the rotation ---
    // Same weights getGameRatings used to rate this team (rotationSize +
    // load-management factored in), so who plays and who the sim thinks is
    // good never disagree.
    const { ids: rotation, weights: minuteWeights } = getRotationWeights(team, players);
    if (rotation.length === 0) return;

    const minutes = splitTotal(TEAM_MINUTES, minuteWeights);

    // Per-stat weights: rating for the relevant skill × minutes played, so a
    // high-usage star both rates and plays into a bigger line. A floor of 58 is
    // subtracted so the 60-99 band spreads sensibly; exponents concentrate
    // volume onto the primary contributors (scorers, creators, rim protectors).
    const pow = (v: number, e: number) => Math.pow(Math.max(0, v), e);
    const ptsW: number[] = [];
    const rebW: number[] = [];
    const astW: number[] = [];
    const stlW: number[] = [];
    const blkW: number[] = [];
    const tovW: number[] = [];
    rotation.forEach((pId, i) => {
        const p = players[pId];
        const a = getPlayerAttributes(p);
        const m = minutes[i];
        // Exponents tune how concentrated each stat is on a team's primary
        // option. Scoring is highly concentrated (a true #1 scorer leads the
        // league ~30), but rebounds and assists spread more across the lineup —
        // calibrated so leaders land near real ranges (~13-14 reb, ~11 ast)
        // rather than one player hoarding half a team's total.
        ptsW.push(pow(p.off - 58, 1.9) * m);
        rebW.push(pow(a.rebounding - 58, 1.0) * m);
        astW.push(pow(a.playmaking - 58, 1.3) * m);
        stlW.push(pow(a.perimeterD - 58, 1.1) * m);
        blkW.push(pow(a.interiorD - 58, 1.5) * m);
        tovW.push((pow(p.off - 58, 1.2) + pow(a.playmaking - 58, 1.0)) * m);
    });

    const pts = splitTotal(pointsScored, ptsW);
    const reb = splitTotal(teamRebounds, rebW);
    const ast = splitTotal(teamAssists, astW);
    const stl = splitTotal(teamSteals, stlW);
    const blk = splitTotal(teamBlocks, blkW);
    const tov = splitTotal(teamTurnovers, tovW);

    rotation.forEach((pId, i) => {
        const p = players[pId];
        const prev = p.seasonStats ?? { gp: 0, mpg: 0, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 };
        const gp = prev.gp + 1;
        const avg = (cur: number, val: number) => prev.gp <= 0 ? val : ((cur * prev.gp) + val) / gp;
        p.seasonStats = {
            gp,
            mpg: avg(prev.mpg, minutes[i]),
            ppg: avg(prev.ppg, pts[i]),
            rpg: avg(prev.rpg, reb[i]),
            apg: avg(prev.apg, ast[i]),
            spg: avg(prev.spg, stl[i]),
            bpg: avg(prev.bpg, blk[i]),
            tpg: avg(prev.tpg, tov[i]),
        };
    });

    // Load ("carga"): tracks toward a target implied by TONIGHT's minutes
    // (0 for anyone outside the rotation) rather than accumulating without
    // bound — a starter who always logs ~34min settles at a stable elevated
    // equilibrium instead of pinning at 100 by midseason, and cutting his
    // minutes (load management, or a deeper rotation diluting everyone's
    // share) pulls the target — and so, over a few games, the load itself —
    // back down. This is what makes load management a real lever on injury
    // risk (see injuryRisk) rather than just fewer box-score minutes.
    const minutesOf = new Map(rotation.map((pId, i) => [pId, minutes[i]]));
    team.roster.forEach(pId => {
        const p = players[pId];
        if (!p) return;
        const target = clampMod(((minutesOf.get(pId) ?? 0) - 18) * 2.6, 0, 100);
        p.load = clampMod(getLoad(p) + (target - getLoad(p)) * 0.25, 0, 100);
    });
};

const handleRandomEvents = (currentTeams: Team[], players: { [key: string]: Player }, gamesPlayed: number, userTeamId?: string) => {
    let newTeams: Team[] = JSON.parse(JSON.stringify(currentTeams));
    let event: { message: string, type: string } | null = null;

    // Tick every active injury/suspension/hot-streak/slump down by one game,
    // dropping it once it hits zero. Without this, an absence or status
    // effect created below would apply for the rest of the season no matter
    // what duration its event message promised.
    newTeams.forEach(team => {
        if (team.playerAbsences) {
            Object.keys(team.playerAbsences).forEach(pId => {
                team.playerAbsences![pId].duration -= 1;
                if (team.playerAbsences![pId].duration <= 0) delete team.playerAbsences![pId];
            });
        }
        if (team.playerStatusEffects) {
            Object.keys(team.playerStatusEffects).forEach(pId => {
                team.playerStatusEffects![pId].duration -= 1;
                if (team.playerStatusEffects![pId].duration <= 0) delete team.playerStatusEffects![pId];
            });
        }
    });

    // Momentum decay
    newTeams.forEach(team => {
        if (team.momentum && Math.random() < 0.25) {
            team.momentum += team.momentum > 0 ? -1 : 1;
        }
    });

    const isTradeDeadlineWindow = gamesPlayed > 40 && gamesPlayed < TRADE_DEADLINE_GAME;
    const tradeChance = gamesPlayed >= TRADE_DEADLINE_GAME ? 0 : (isTradeDeadlineWindow ? 0.35 : 0.02);

    if (Math.random() < tradeChance) {
        const teamsToTrade = newTeams.filter(t => t.roster.length > 8 && ((t.wins || 0) / ((t.wins || 0) + (t.losses || 0) || 1)) < 0.6);
        if (teamsToTrade.length >= 2) {
            let team1Index = Math.floor(Math.random() * teamsToTrade.length);
            let team2Index = Math.floor(Math.random() * teamsToTrade.length);
            
            if (team1Index !== team2Index) {
                let team1 = teamsToTrade[team1Index];
                let team2 = teamsToTrade[team2Index];
                let p1Id = team1.roster[Math.floor(Math.random() * team1.roster.length)];
                let p2Id = team2.roster[Math.floor(Math.random() * team2.roster.length)];
                
                if (players[p1Id] && players[p2Id] && Math.abs(players[p1Id].ovr - players[p2Id].ovr) <= 8) {
                    // Re-sort by OVR after the swap, not a plain append — roster
                    // order is the rotation order getGameRatings reads from
                    // (top 8), so an unsorted append can bury the incoming
                    // player outside the rotation entirely.
                    const sortByOvr = (roster: string[]) =>
                        [...roster].sort((a, b) => (players[b]?.ovr || 0) - (players[a]?.ovr || 0));
                    team1.roster = sortByOvr(team1.roster.filter(p => p !== p1Id).concat(p2Id));
                    team2.roster = sortByOvr(team2.roster.filter(p => p !== p2Id).concat(p1Id));

                    newTeams[newTeams.findIndex(t => t.id === team1.id)] = team1;
                    newTeams[newTeams.findIndex(t => t.id === team2.id)] = team2;

                    // Deliberately no early return here — a trade and the
                    // injury/suspension/hot-streak/slump/chemistry roll below
                    // are independent systems on independent RNG rolls, not a
                    // single "one event per day" lottery. An early return used
                    // to skip that whole roll on any day a trade fired,
                    // silently suppressing those events during the trade
                    // window (up to 35% of days). If both happen to fire the
                    // same day, both state changes apply; the later one wins
                    // the displayed message.
                    event = { message: `TRADE DEADLINE! ${team1.name} envia ${players[p1Id].name} ao ${team2.name} e recebe ${players[p2Id].name} em troca.`, type: 'trade' };
                }
            }
        }
    }
    
    // INJURY. Rolled for EVERY team, every night.
    //
    // This used to sample one random team per day and roll 2% on it — about
    // 1.6 injuries per season for the entire league, which is why the measured
    // average was 81.0 of 82 games played (real NBA rotation players average
    // ~68). Nothing downstream could mean anything: load management lowered a
    // risk that never materialized, roster depth never got tested, and a
    // championship never turned on who was healthy in May.
    //
    // Who gets hurt inside a team is still weighted by age + minutes load +
    // accumulated fatigue (injuryRisk), so it lands on someone who matters.
    // Severity runs from a minor tweak to a season-altering blow.
    let worstInjury: { message: string; duration: number } | null = null;
    newTeams.forEach(t => {
        if (Math.random() >= INJURY_CHANCE_PER_TEAM) return;
        const eligible = t.roster
            .map((pId, idx) => ({ pId, idx }))
            .filter(({ pId }) => !t.playerAbsences?.[pId] && players[pId]);
        if (eligible.length === 0) return;
        const rotSize = rotationSize(t);
        const chosen = eligible[weightedIndex(eligible.map(({ pId, idx }) => injuryRisk(players[pId], idx, rotSize)))];
        const player = players[chosen.pId];
        const { duration, label } = rollInjury(player.age);
        if (!t.playerAbsences) t.playerAbsences = {};
        t.playerAbsences[chosen.pId] = { reason: 'injury', duration };
        // Which injuries are NEWS. Every one of them applies to the roster;
        // only some earn the day's single message slot.
        //
        // A realistic injury rate is ~5 a night across 30 teams, so "announce
        // the worst one" meant the feed carried nothing but injuries — the
        // trade, hot-streak, slump and chemistry events below were still
        // firing and still being overwritten, every day, forever. The feed is
        // a 60-slot buffer the season screen renders six of; it cannot be a
        // transaction log. So it gets the two kinds a GM would actually be
        // told about: anything on YOUR OWN roster, and a star lost for the
        // season anywhere in the league. Everything else is on the roster
        // screens, where it belongs.
        const mine = t.id === userTeamId;
        const leagueNews = duration >= 18 && player.ovr >= 85;
        if (!mine && !leagueNews) return;
        if (!worstInjury || duration > worstInjury.duration) {
            const severe = duration >= 18 ? ' Lesão séria — pode comprometer a temporada.' : '';
            worstInjury = {
                duration,
                message: `❤️‍🩹 LESÃO! ${player.name} (${t.name}) sofreu ${label} e perderá ${duration} jogos.${severe}`,
            };
        }
    });
    if (worstInjury) event = { message: (worstInjury as { message: string }).message, type: 'injury' };

    const eventRoll = Math.random();
    const teamIndex = Math.floor(Math.random() * newTeams.length);
    const team = newTeams[teamIndex];

    // SUSPENSION (0.5% chance)
    if (eventRoll < 0.005) {
        const eligiblePlayers = team.roster.filter(pId => !team.playerAbsences?.[pId]);
        if (eligiblePlayers.length > 0) {
            const pId = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
            const player = players[pId];
            const duration = Math.floor(Math.random() * 4) + 1; // 1-4 games
            if (!team.playerAbsences) team.playerAbsences = {};
            team.playerAbsences[pId] = { reason: 'suspension', duration };
            event = { message: `SUSPENSÃO! ${player.name} (${team.name}) foi suspenso por ${duration} jogos.`, type: 'injury' }; // 'injury' for red color
        }
    }
    // HOT STREAK (1.5% chance)
    else if (eventRoll < 0.020) {
        const eligiblePlayers = team.roster.filter(pId => !team.playerStatusEffects?.[pId]);
        if (eligiblePlayers.length > 0) {
            const pId = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
            const player = players[pId];
            const duration = Math.floor(Math.random() * 5) + 3; // 3-7 games
            const ovrChange = Math.floor(Math.random() * 3) + 2; // +2 to +4 OVR boost
            if (!team.playerStatusEffects) team.playerStatusEffects = {};
            team.playerStatusEffects[pId] = { type: 'hot', duration, ovrChange };
            event = { message: `EM CHAMAS! ${player.name} (${team.name}) está numa sequência incrível e recebeu um bônus temporário (+${ovrChange} OVR).`, type: 'info' };
        }
    }
    // SLUMP (1.5% chance)
    else if (eventRoll < 0.035) {
        const eligiblePlayers = team.roster.filter(pId => !team.playerStatusEffects?.[pId]);
        if (eligiblePlayers.length > 0) {
            const pId = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
            const player = players[pId];
            const duration = Math.floor(Math.random() * 5) + 3; // 3-7 games
            const ovrChange = -1 * (Math.floor(Math.random() * 3) + 2); // -2 to -4 OVR penalty
            if (!team.playerStatusEffects) team.playerStatusEffects = {};
            team.playerStatusEffects[pId] = { type: 'slump', duration, ovrChange };
            event = { message: `MÁ FASE! ${player.name} (${team.name}) não está bem e recebeu uma penalidade temporária (${ovrChange} OVR).`, type: 'injury' }; // 'injury' for red color
        }
    }
    // TEAM CHEMISTRY (5% chance)
    else if (eventRoll < 0.085) {
        const isGoodEvent = Math.random() > 0.5;
        if (isGoodEvent) {
            if (!team.momentum || team.momentum < 3) {
                team.momentum = (team.momentum || 0) + 1;
                event = { message: `QUÍMICA EM ALTA! O ${team.name} parece estar em grande sintonia, recebendo um impulso de moral.`, type: 'info' };
            }
        } else {
            if (!team.momentum || team.momentum > -3) {
                team.momentum = (team.momentum || 0) - 1;
                 event = { message: `PROBLEMAS NO VESTIÁRIO! Rumores indicam que a moral está baixa no ${team.name}.`, type: 'info' };
            }
        }
    }

    if (event) {
        newTeams[newTeams.findIndex(t => t.id === team.id)] = team;
    }

    return { teams: newTeams, event };
};

// `devBonus` is a per-player multiplier from the team's development coach
// (see coachService.buildDevelopmentBonusMap) — 1.0 with no coach data, up to
// ~1.3 under an elite developmental coach at full scheme fit, down to ~0.75
// under a poor one. Only scales the *opportunity* young/prime players already
// have from their minutes; it can't create growth out of nothing, and it
// never touches the post-prime/veteran decline branches — a good coach speeds
// development, he doesn't reverse aging.
const runPlayerProgression = (
    players: { [key: string]: Player },
    devBonus: { [playerId: string]: number } = {},
): { updatedPlayers: { [key: string]: Player }, progressionEvents: Event[] } => {
    const updatedPlayers = JSON.parse(JSON.stringify(players));
    const progressionEvents: Event[] = [];
    const potentialMap: { [key: string]: number } = { 'A': 4, 'B': 3, 'C': 2, 'D': 1 };

    for (const pId in updatedPlayers) {
        const player = updatedPlayers[pId];
        const oldOvr = player.ovr;

        player.age += 1;

        const potential = potentialMap[player.potential] || 1;
        let change = 0;

        // Opportunity from last season's minutes: young players develop by
        // *playing*, not by sitting. A starter's workload (~30+ mpg) unlocks
        // full growth; a benchwarmer (or a DNP player with no seasonStats)
        // stagnates. Capped slightly above 1 so heavy-minute youngsters can
        // over-perform their base development odds. Only really matters for
        // developing ages — a vet's decline isn't minutes-driven.
        const mpg = player.seasonStats?.mpg ?? 0;
        const opportunity = clampMod((0.25 + (mpg / 28) * 0.9) * (devBonus[pId] ?? 1), 0.2, 1.6);

        if (player.age < 24) { // Peak development — gated hard on opportunity
            if (Math.random() < (0.6 + potential * 0.08) * opportunity) {
                change = Math.floor(Math.random() * (potential / 2 + 1) * opportunity) + 1;
            }
        } else if (player.age < 29) { // Prime — a heavy role can still spark a jump
            if (Math.random() < (0.25 + potential * 0.05) * opportunity) {
                 change = Math.random() > 0.4 ? 1 : -1;
            }
        } else if (player.age < 34) { // Post-prime
            if (Math.random() < 0.4 + (player.age - 29) * 0.05) {
                change = -1 * (Math.floor(Math.random() * 2) + 1); // -1 or -2
            }
        } else { // Veteran decline
             if (Math.random() < 0.6 + (player.age - 34) * 0.08) {
                change = -1 * (Math.floor(Math.random() * 3) + 1); // -1 to -3
            }
        }

        if (change !== 0) {
            player.ovr = Math.min(99, Math.max(60, player.ovr + change));
            const ratio = (player.off + player.def) > 0 ? player.off / (player.off + player.def) : 0.5;
            player.off += Math.round(change * ratio * 1.5);
            player.def += Math.round(change * (1 - ratio) * 1.5);
            player.off = Math.min(99, Math.max(60, player.off));
            player.def = Math.min(99, Math.max(60, player.def));

            // Evolve the attribute breakdown too, so it doesn't drift out of
            // sync with off/def over multiple seasons. Offensive attributes
            // track the offensive swing, defensive ones the defensive swing,
            // athleticism follows overall (and always fades with age).
            if (player.attributes) {
                const offDelta = Math.round(change * ratio * 1.5);
                const defDelta = Math.round(change * (1 - ratio) * 1.5);
                const clampAttr = (v: number) => Math.min(99, Math.max(60, v));
                player.attributes.shooting = clampAttr(player.attributes.shooting + offDelta);
                player.attributes.finishing = clampAttr(player.attributes.finishing + offDelta);
                player.attributes.playmaking = clampAttr(player.attributes.playmaking + offDelta);
                player.attributes.perimeterD = clampAttr(player.attributes.perimeterD + defDelta);
                player.attributes.interiorD = clampAttr(player.attributes.interiorD + defDelta);
                player.attributes.rebounding = clampAttr(player.attributes.rebounding + defDelta);
                player.attributes.athleticism = clampAttr(
                    player.attributes.athleticism + change - (player.age > 30 ? 1 : 0)
                );
            }
        }

        if (player.ovr > oldOvr) {
            progressionEvents.push({ message: `${player.name} (${player.age}) evoluiu! OVR: ${oldOvr} -> ${player.ovr} (+${player.ovr - oldOvr})`, type: 'info'});
        } else if (player.ovr < oldOvr) {
            progressionEvents.push({ message: `${player.name} (${player.age}) regrediu. OVR: ${oldOvr} -> ${player.ovr} (${player.ovr - oldOvr})`, type: 'injury'});
        }
    }

    progressionEvents.sort((a,b) => {
        const changeA = parseInt(a.message.split('(').pop()?.replace(')', '') || '0');
        const changeB = parseInt(b.message.split('(').pop()?.replace(')', '') || '0');
        return Math.abs(changeB) - Math.abs(changeA);
    });

    return { updatedPlayers, progressionEvents };
};

// --- PLAYOFF LOGIC ---

const emptySeries = (count: number): PlayoffSeries[] => Array(count).fill({ m: [null, null], s: '' });

// PlayoffSeries.s is always read positionally as "m[0]score-m[1]score" (see
// Matchup in PlayoffBracket.tsx), not "winnerScore-loserScore" — simulateGame
// only labels by winner/loser, so this reorders it to match m[0]/m[1].
const gameScoreString = (teamA: Team, result: { winner: Team; scoreWinner: number; scoreLoser: number }): string =>
    result.winner.id === teamA.id ? `${result.scoreWinner}-${result.scoreLoser}` : `${result.scoreLoser}-${result.scoreWinner}`;

// Seeds 1-8 into a standard bracket (1v8, 4v5, 3v6, 2v7 — 1v8/4v5 meet in
// round 2, 3v6/2v7 meet in round 2). Shared by the direct top-6 seeds plus
// whichever two teams win the play-in for seeds 7-8.
const seedRound1 = (seededTeams: Team[]): PlayoffSeries[] => {
    if (seededTeams.length < 8) return [];
    return [
        { m: [seededTeams[0], seededTeams[7]], s: '0-0' }, // 1 vs 8
        { m: [seededTeams[3], seededTeams[4]], s: '0-0' }, // 4 vs 5
        { m: [seededTeams[2], seededTeams[5]], s: '0-0' }, // 3 vs 6
        { m: [seededTeams[1], seededTeams[6]], s: '0-0' }, // 2 vs 7
    ];
};

// Seeds 1-6 in each conference go straight to Round 1. Seeds 7-10 play in
// for the last two spots: 7v8 (winner claims the 7 seed), 9v10 (loser is
// eliminated), then the 7v8 loser vs the 9v10 winner for the 8 seed — the
// real NBA Play-In format, resolved with single games via simulateGame, not
// best-of-7 series.
const initializePlayIn = (teams: Team[], schedule: ScheduleGame[]): PlayoffState => {
    // Seeded with the real tiebreak chain (win% → head-to-head → conference
    // record → point differential), not a flat win-count sort — matters most
    // right around the play-in cutoff, where teams are often tied on wins.
    const eastTen = sortStandings(teams.filter(t => t.conference === 'East'), schedule).slice(0, 10);
    const westTen = sortStandings(teams.filter(t => t.conference === 'West'), schedule).slice(0, 10);

    const buildPlayIn = (tenSeeds: Team[]): PlayInBracket => ({
        sevenEight: { m: [tenSeeds[6] ?? null, tenSeeds[7] ?? null], s: '0-0' },
        nineTen: { m: [tenSeeds[8] ?? null, tenSeeds[9] ?? null], s: '0-0' },
        finalSeed: { m: [null, null], s: '0-0' },
        complete: false,
    });

    const emptyBracket = { round1: [], round2: emptySeries(2), round3: emptySeries(1), winner: null };

    return {
        east: { initialSeeds: eastTen, seeds: eastTen, playIn: buildPlayIn(eastTen), bracket: emptyBracket },
        west: { initialSeeds: westTen, seeds: westTen, playIn: buildPlayIn(westTen), bracket: emptyBracket },
        finals: null,
        champion: null,
        awards: {}
    };
};

// Series MVP is approximated as the highest-OVR player in the winning team's
// rotation, since individual game box scores aren't tracked through a series.
const pickSeriesMVP = (team: Team, players: { [key: string]: Player }): string | undefined => {
    return getTeamRotation(team, players, 8)
        .sort((a, b) => players[b].ovr - players[a].ovr)[0];
};

const advancePlayoffRound = (
    playoffState: PlayoffState, players: { [key: string]: Player }, coaches: CoachMap = {}, userTeamId?: string,
): { updatedPlayoff: PlayoffState, stageComplete: boolean, newChampion?: Team } => {
    const newState = JSON.parse(JSON.stringify(playoffState));
    if (!newState.awards) newState.awards = {};
    let somethingSimulated = false;
    let newChampion: Team | undefined = undefined;

    const simulateRound = (bracket: any, conferenceKey: 'east' | 'west') => {
        // Play-In (seeds 7-10) — resolves before Round 1 even exists. Takes
        // two "SIMULAR RODADA" clicks: the first resolves 7v8 and 9v10
        // together (independent games), the second resolves the loser-of-7v8
        // vs winner-of-9v10 game for the final 8 seed and immediately seeds
        // Round 1 from the resulting top 8.
        if (bracket.playIn && !bracket.playIn.complete) {
            const playIn = bracket.playIn;
            if (!playIn.sevenEight.w || !playIn.nineTen.w) {
                if (!playIn.sevenEight.w && playIn.sevenEight.m[0] && playIn.sevenEight.m[1]) {
                    const result = simulateGame(playIn.sevenEight.m[0]!, playIn.sevenEight.m[1]!, players, undefined, coaches);
                    playIn.sevenEight.w = result.winner;
                    playIn.sevenEight.s = gameScoreString(playIn.sevenEight.m[0]!, result);
                    somethingSimulated = true;
                }
                if (!playIn.nineTen.w && playIn.nineTen.m[0] && playIn.nineTen.m[1]) {
                    const result = simulateGame(playIn.nineTen.m[0]!, playIn.nineTen.m[1]!, players, undefined, coaches);
                    playIn.nineTen.w = result.winner;
                    playIn.nineTen.s = gameScoreString(playIn.nineTen.m[0]!, result);
                    somethingSimulated = true;
                }
                if (playIn.sevenEight.w && playIn.nineTen.w) {
                    const sevenEightLoser = playIn.sevenEight.m[0]!.id === playIn.sevenEight.w.id ? playIn.sevenEight.m[1] : playIn.sevenEight.m[0];
                    playIn.finalSeed.m = [sevenEightLoser, playIn.nineTen.w];
                }
                return;
            }

            if (!playIn.finalSeed.w && playIn.finalSeed.m[0] && playIn.finalSeed.m[1]) {
                const result = simulateGame(playIn.finalSeed.m[0]!, playIn.finalSeed.m[1]!, players, undefined, coaches);
                playIn.finalSeed.w = result.winner;
                playIn.finalSeed.s = gameScoreString(playIn.finalSeed.m[0]!, result);
                somethingSimulated = true;
                playIn.complete = true;

                const topSix = bracket.initialSeeds.slice(0, 6);
                const finalEight = [...topSix, playIn.sevenEight.w, playIn.finalSeed.w];
                bracket.bracket.round1 = seedRound1(finalEight);
            }
            return;
        }

        // Catch-up seeding: a live Game 7 decider (applyDeciderResult) writes
        // its series winner directly into the bracket, bypassing the forEach
        // + "seed next round" logic below entirely. Without this check, the
        // very next "SIMULAR RODADA" click after a live decider resolves the
        // last series of Round 1 or Round 2 would see that round already
        // fully decided and silently no-op forever, since the next round
        // never gets seeded and so has nothing to simulate.
        if (bracket.bracket.round1.every((s: PlayoffSeries) => s.w) && !bracket.bracket.round2[0].m[0]) {
            bracket.bracket.round2[0] = { m: [bracket.bracket.round1[0].w, bracket.bracket.round1[1].w], s: '0-0' };
            bracket.bracket.round2[1] = { m: [bracket.bracket.round1[3].w, bracket.bracket.round1[2].w], s: '0-0' };
            somethingSimulated = true;
        }
        if (bracket.bracket.round2.every((s: PlayoffSeries) => s.w) && !bracket.bracket.round3[0].m[0]) {
            bracket.bracket.round3[0] = { m: [bracket.bracket.round2[0].w, bracket.bracket.round2[1].w], s: '0-0' };
            somethingSimulated = true;
        }
        // Same catch-up, one round further on: a conference final decided by a
        // live Game 7 leaves the series resolved but the conference champion
        // unannounced, and the Finals are seeded from THAT. Without this the
        // bracket dead-ends after the conf finals. Written to be idempotent and
        // to run on load, so a save already stuck in that state repairs itself
        // on the next "Simular rodada" rather than staying bricked.
        if (bracket.bracket.round3.every((s: PlayoffSeries) => s.w) && !bracket.winner) {
            const confChampion = bracket.bracket.round3[0].w!;
            bracket.winner = confChampion;
            const mvpKey = conferenceKey === 'east' ? 'eastConfFinalsMVP' : 'westConfFinalsMVP';
            if (!newState.awards[mvpKey]) newState.awards[mvpKey] = pickSeriesMVP(confChampion, players);
            somethingSimulated = true;
        }

        // Round 1
        if (bracket.bracket.round1.some((s: PlayoffSeries) => !s.w)) {
            bracket.bracket.round1.forEach((series: PlayoffSeries, idx: number) => {
                if (!series.w && series.m[0] && series.m[1]) {
                    const result = simulateSeries(series.m[0]!, series.m[1]!, players, 7, coaches, userTeamId);
                    if (result.pendingDecider) {
                        newState.pendingDecider = { scope: 'conference', conf: conferenceKey, round: 'round1', index: idx };
                        return;
                    }
                    series.w = result.winner;
                    series.s = result.score;
                    somethingSimulated = true;
                }
            });
            // If Round 1 just finished, setup Round 2
            if (bracket.bracket.round1.every((s: PlayoffSeries) => s.w)) {
                // Winners of 0 & 1 meet. Winners of 2 & 3 meet.
                bracket.bracket.round2[0] = { m: [bracket.bracket.round1[0].w, bracket.bracket.round1[1].w], s: '0-0' };
                bracket.bracket.round2[1] = { m: [bracket.bracket.round1[3].w, bracket.bracket.round1[2].w], s: '0-0' }; // Corrected visual mapping
            }
            return;
        }

        // Round 2 (Conf Semis)
        if (bracket.bracket.round2.some((s: PlayoffSeries) => !s.w)) {
             bracket.bracket.round2.forEach((series: PlayoffSeries, idx: number) => {
                if (!series.w && series.m[0] && series.m[1]) {
                    const result = simulateSeries(series.m[0]!, series.m[1]!, players, 7, coaches, userTeamId);
                    if (result.pendingDecider) {
                        newState.pendingDecider = { scope: 'conference', conf: conferenceKey, round: 'round2', index: idx };
                        return;
                    }
                    series.w = result.winner;
                    series.s = result.score;
                    somethingSimulated = true;
                }
            });
             if (bracket.bracket.round2.every((s: PlayoffSeries) => s.w)) {
                bracket.bracket.round3[0] = { m: [bracket.bracket.round2[0].w, bracket.bracket.round2[1].w], s: '0-0' };
            }
            return;
        }

        // Round 3 (Conf Finals)
        if (bracket.bracket.round3.some((s: PlayoffSeries) => !s.w)) {
             bracket.bracket.round3.forEach((series: PlayoffSeries, idx: number) => {
                if (!series.w && series.m[0] && series.m[1]) {
                    const result = simulateSeries(series.m[0]!, series.m[1]!, players, 7, coaches, userTeamId);
                    if (result.pendingDecider) {
                        newState.pendingDecider = { scope: 'conference', conf: conferenceKey, round: 'round3', index: idx };
                        return;
                    }
                    series.w = result.winner;
                    series.s = result.score;
                    bracket.winner = result.winner; // Conf Champion
                    somethingSimulated = true;

                    const mvpId = pickSeriesMVP(result.winner, players);
                    if (conferenceKey === 'east') newState.awards.eastConfFinalsMVP = mvpId;
                    else newState.awards.westConfFinalsMVP = mvpId;
                }
            });
            return;
        }
    };

    // Simulate East and West concurrently
    simulateRound(newState.east, 'east');
    simulateRound(newState.west, 'west');

    // If both conferences finished, handle Finals
    if (newState.east.winner && newState.west.winner) {
        if (!newState.finals) {
            newState.finals = { m: [newState.west.winner, newState.east.winner], s: '0-0' };
        } else if (!newState.finals.w) {
            const result = simulateSeries(newState.finals.m[0]!, newState.finals.m[1]!, players, 7, coaches, userTeamId);
            if (result.pendingDecider) {
                newState.pendingDecider = { scope: 'finals' };
            } else {
                newState.finals.w = result.winner;
                newState.finals.s = result.score;
                newState.champion = result.winner;
                newChampion = result.winner;
                newState.awards.finalsMVP = pickSeriesMVP(result.winner, players);
                somethingSimulated = true;
            }
        }
    }

    return { updatedPlayoff: newState, stageComplete: somethingSimulated, newChampion };
};

// Weighted-random pick among the top N candidates by score, instead of
// always crowning the single highest score. Real award races are close and
// vary year to year even among a stable pool of elite players — a hard sort
// made the same handful of real-world stars win every single simulated
// season, since ratings barely move game to game. Higher score still means
// a proportionally better shot at winning, just not a guarantee.
const weightedRandomPick = (candidates: { id: string; score: number }[], topN: number): string => {
    const pool = candidates
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
    if (pool.length === 0) return candidates[0]?.id;

    const total = pool.reduce((sum, c) => sum + c.score, 0);
    let roll = Math.random() * total;
    for (const c of pool) {
        roll -= c.score;
        if (roll <= 0) return c.id;
    }
    return pool[0].id;
};

// Minimum games played to qualify for the major individual awards — roughly a
// half season, so a player who missed most of the year (injury) can't win on
// gaudy per-game rates in a tiny sample.
const AWARD_MIN_GP = 41;
const ROOKIE_MIN_GP = 20;
const SIXTH_MAN_MIN_GP = 30;

// Awards are now decided by real simulated production (seasonStats), not by
// ratings — the leaderboards and the trophies finally agree. A weighted-random
// roll among the top candidates keeps races varied year to year (ratings-only
// awards crowned the same handful of stars every season). teamOf + a games
// filter also close the old "a non-rostered / barely-played player wins"
// loophole. Falls back to ratings only if literally nobody has logged stats
// (e.g. an award requested before any game was simulated).
const generateAwards = (teams: Team[], players: { [key: string]: Player }) => {
    const allPlayers = Object.values(players);
    const teamOf = (p: Player) => teams.find(t => t.roster.includes(p.id));
    const played = (p: Player, min: number) => !!p.seasonStats && p.seasonStats.gp >= min;

    // MVP: per-game production (scoring + playmaking + rebounding + defense,
    // penalized for turnovers) plus a team-success bonus — a great player on a
    // winning team, judged on the court. Requires a roster spot and a real
    // sample.
    const mvpPool = allPlayers.filter(p => played(p, AWARD_MIN_GP) && teamOf(p)).map(p => {
        const s = p.seasonStats!;
        const team = teamOf(p)!;
        const production = s.ppg + 1.4 * s.apg + 1.1 * s.rpg + 0.7 * s.spg + 0.7 * s.bpg - 1.0 * s.tpg;
        return { id: p.id, score: production + (team.wins || 0) * 0.35 };
    });
    const mvp = weightedRandomPick(mvpPool, 6) || allPlayers[0].id;

    // DPOY: defensive box production — steals (guards/wings) and blocks + boards
    // (bigs) — blended with the perimeter/interior defense ratings, so an elite
    // perimeter defender is a real candidate, not only rim-protecting centers
    // (the old def-rollup-only score always crowned a center).
    const dpoyPool = allPlayers.filter(p => played(p, AWARD_MIN_GP) && teamOf(p)).map(p => {
        const s = p.seasonStats!;
        const a = getPlayerAttributes(p);
        return { id: p.id, score: 2.4 * s.spg + 2.6 * s.bpg + 0.5 * s.rpg + 0.12 * (a.perimeterD + a.interiorD) };
    });
    const dpoy = weightedRandomPick(dpoyPool, 8) || allPlayers[0].id;

    // Rookie of the Year: best rookie production. age<=21 is still the rookie
    // proxy (the pipeline doesn't flag true rookie status), but it's judged on
    // court output now, not raw rating.
    const royPool = allPlayers.filter(p => p.age <= 21 && played(p, ROOKIE_MIN_GP)).map(p => {
        const s = p.seasonStats!;
        return { id: p.id, score: s.ppg + 1.2 * s.apg + 1.0 * s.rpg };
    });
    const roy = weightedRandomPick(royPool, 6) || allPlayers[0].id;

    // Sixth Man: best production among non-starters (not in the team's top-5
    // position-aware rotation), judged on scoring/creation off the bench.
    const startersByTeam = new Map<string, Set<string>>();
    teams.forEach(t => startersByTeam.set(t.id, new Set(getTeamRotation(t, players, 5))));
    const smoyPool = allPlayers.filter(p => {
        const team = teamOf(p);
        return !!team && played(p, SIXTH_MAN_MIN_GP) && !startersByTeam.get(team.id)!.has(p.id);
    }).map(p => {
        const s = p.seasonStats!;
        return { id: p.id, score: s.ppg + 0.8 * s.apg + 0.6 * s.rpg };
    });
    const smoy = weightedRandomPick(smoyPool, 8) || allPlayers[0].id;

    // Most Improved Player: biggest OVR jump from last season (ovrLastSeason,
    // snapshotted before the offseason progression) among players who logged a
    // real season. Undefined in season 1 / for fresh rookies, who have no prior
    // OVR to measure against.
    const mipPool = allPlayers
        .filter(p => typeof p.ovrLastSeason === 'number' && p.ovr - p.ovrLastSeason! >= 1 && played(p, SIXTH_MAN_MIN_GP) && teamOf(p))
        .map(p => {
            const s = p.seasonStats!;
            const growth = p.ovr - p.ovrLastSeason!;
            return { id: p.id, score: growth * 3 + s.ppg * 0.4 + s.apg * 0.3 };
        });
    const mip = mipPool.length ? weightedRandomPick(mipPool, 6) : undefined;

    // All-NBA: the 15 best regular-season performers by the same production +
    // team-success measure as MVP, split into 1st/2nd/3rd teams of five. Real
    // All-NBA has been positionless since 2023-24, so a straight top-15 is
    // faithful, not a shortcut.
    const allNbaRanked = [...mvpPool].sort((a, b) => b.score - a.score).map(x => x.id);
    const allNba = [allNbaRanked.slice(0, 5), allNbaRanked.slice(5, 10), allNbaRanked.slice(10, 15)]
        .filter(team => team.length > 0);

    return { mvp, dpoy, roy, smoy, mip, allNba };
};

// --- ALL-STAR WEEKEND ---

// Top 12 OVR per conference — matches the real 24-man All-Star roster size.
const selectAllStars = (teams: Team[], players: { [key: string]: Player }): { eastRoster: string[]; westRoster: string[] } => {
    const conferenceOf = new Map<string, 'East' | 'West'>();
    teams.forEach(t => t.roster.forEach(pId => conferenceOf.set(pId, t.conference)));

    const topByConference = (conf: 'East' | 'West') =>
        Object.values(players)
            .filter(p => conferenceOf.get(p.id) === conf)
            .sort((a, b) => b.ovr - a.ovr)
            .slice(0, 12)
            .map(p => p.id);

    return { eastRoster: topByConference('East'), westRoster: topByConference('West') };
};

// Lightweight scoring model for the exhibition game — doesn't need full Team
// semantics (style/momentum/real roster) like simulateGame, since these
// squads don't exist as real Teams and the result has no bearing on
// standings. High-scoring by design, matching a real All-Star Game.
const simulateAllStarGame = (eastRoster: string[], westRoster: string[], players: { [key: string]: Player }) => {
    const avgOff = (roster: string[]) => roster.reduce((sum, id) => sum + (players[id]?.off || 70), 0) / roster.length;
    const eastScore = Math.round(150 + (avgOff(eastRoster) - 85) * 1.5 + (Math.random() * 24 - 12));
    const westScore = Math.round(150 + (avgOff(westRoster) - 85) * 1.5 + (Math.random() * 24 - 12));
    const winner: 'east' | 'west' = eastScore >= westScore ? 'east' : 'west';
    const winningRoster = winner === 'east' ? eastRoster : westRoster;
    const mvpId = [...winningRoster].sort((a, b) => players[b].ovr - players[a].ovr)[0];
    return { winner, mvpId };
};

// Dunk Contest: weighted toward younger players — age is the closest proxy
// available since no athleticism attribute exists in the data.
const pickDunkContestWinner = (roster: string[], players: { [key: string]: Player }): string =>
    weightedRandomPick(roster.map(id => ({ id, score: Math.max(1, 30 - players[id].age) })), 8);

// Three-Point Contest: weighted by OVR — no dedicated shooting attribute
// exists, so this is a simple ratings-based roll among the selected stars.
const pickThreePointWinner = (roster: string[], players: { [key: string]: Player }): string =>
    weightedRandomPick(roster.map(id => ({ id, score: players[id].ovr })), 8);

const simulateAllStarWeekend = (teams: Team[], players: { [key: string]: Player }, gamesPlayed: number): AllStarResult => {
    const { eastRoster, westRoster } = selectAllStars(teams, players);
    const game = simulateAllStarGame(eastRoster, westRoster, players);
    const combinedRoster = [...eastRoster, ...westRoster];

    return {
        eastRoster,
        westRoster,
        winner: game.winner,
        mvpId: game.mvpId,
        dunkWinnerId: pickDunkContestWinner(combinedRoster, players),
        threePointWinnerId: pickThreePointWinner(combinedRoster, players),
        gamesPlayed,
    };
};

// --- NBA CUP ---
const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

// The real NBA Cup runs group play within a fixed 6-group draw (3 per
// conference) that we don't have real data for, so we invent our own via a
// pot-based random draw — the same mechanism real tournaments use. Each
// conference is split into strength tiers ("pots") of 3 by powerRank, then one
// team from each pot is drawn at random into each group. This keeps every
// group balanced (one of the top 3, one of the next 3, ...) while producing a
// *different* draw every season, instead of the old deterministic snake seed
// that always generated the identical groups. Group "results" are just each
// team's actual regular-season record over the group-stage window (no extra
// games simulated); only the knockout bracket plays out separately.
const initCupGroups = (teams: Team[]): CupState => {
    const buildGroups = (confTeams: Team[], prefix: string): { [groupId: string]: string[] } => {
        const sorted = [...confTeams].sort((a, b) => a.powerRank - b.powerRank);
        const groupIds = [`${prefix} A`, `${prefix} B`, `${prefix} C`];
        const groups: { [groupId: string]: string[] } = { [groupIds[0]]: [], [groupIds[1]]: [], [groupIds[2]]: [] };
        const numGroups = groupIds.length;
        for (let pot = 0; pot < Math.ceil(sorted.length / numGroups); pot++) {
            const potTeams = shuffle(sorted.slice(pot * numGroups, pot * numGroups + numGroups));
            potTeams.forEach((team, idx) => {
                groups[groupIds[idx]].push(team.id);
            });
        }
        return groups;
    };

    return {
        groups: {
            ...buildGroups(teams.filter(t => t.conference === 'East'), 'Leste'),
            ...buildGroups(teams.filter(t => t.conference === 'West'), 'Oeste'),
        },
    };
};

// Reads each team's actual record at the group-stage checkpoint (no extra
// games simulated for "group play" itself), picks the 3 group winners per
// conference + 1 wildcard per conference (6 + 2 = 8 qualifiers), then
// resolves the whole knockout bracket (quarterfinals → semis → final) in one
// pass with single games via simulateGame — real NBA Cup knockout rounds
// don't use best-of-7 series either.
const resolveCupGroupStage = (cup: CupState, teams: Team[], players: { [key: string]: Player }, schedule: ScheduleGame[], coaches: CoachMap = {}): CupState => {
    const teamsById = new Map(teams.map(t => [t.id, t]));
    const standings: { [teamId: string]: { w: number; l: number } } = {};
    Object.values(cup.groups).flat().forEach(teamId => {
        const t = teamsById.get(teamId);
        standings[teamId] = { w: t?.wins || 0, l: t?.losses || 0 };
    });

    // Same real tiebreak chain as the standings/play-in (head-to-head →
    // conference record → point differential), not a flat win% sort — group
    // "results" are just each team's actual season record at the checkpoint,
    // so ties here are common.
    const byStanding = (id: string) => teamsById.get(id)!;
    const sortIds = (ids: string[]) => [...ids].sort((a, b) => compareStandings(byStanding(a), byStanding(b), schedule, teams));

    const groupEntries = Object.entries(cup.groups);
    const winners = groupEntries.map(([, ids]) => sortIds(ids)[0]);
    const remaining = groupEntries.flatMap(([, ids]) => ids.filter(id => !winners.includes(id)));
    const wildcardFor = (conf: 'East' | 'West') =>
        sortIds(remaining.filter(id => teamsById.get(id)?.conference === conf))[0];

    const qualifiers = sortIds([...winners, wildcardFor('East'), wildcardFor('West')].filter(Boolean))
        .map(id => teamsById.get(id)!);

    const playSingleGame = (m0: Team, m1: Team): PlayoffSeries => {
        const result = simulateGame(m0, m1, players, undefined, coaches);
        return { m: [m0, m1], w: result.winner, s: gameScoreString(m0, result) };
    };

    const qf = seedRound1(qualifiers).map(series => playSingleGame(series.m[0]!, series.m[1]!));
    const sf = [
        playSingleGame(qf[0].w!, qf[1].w!),
        playSingleGame(qf[3].w!, qf[2].w!),
    ];
    const final = playSingleGame(sf[0].w!, sf[1].w!);

    return { ...cup, standings, bracket: { qf, sf, final }, championId: final.w!.id };
};

export const simulationEngine = {
    simulateGame,
    decideTanking,
    simulateSeries,
    handleRandomEvents,
    runPlayerProgression,
    initializePlayIn,
    advancePlayoffRound,
    recordGameStats,
    generateAwards,
    getTeamRotation,
    getLineup,
    simulateAllStarWeekend,
    initCupGroups,
    resolveCupGroupStage,
    updateMorale,
    teamChemistry,
    getMorale,
    startLiveGame,
    advanceLiveQuarter,
    applyDeciderResult,
};
