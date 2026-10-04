import type { Team, Player, Coach, WatchPlay } from '../types';
import { getPlayerPositions } from '../constants';
import { fatigueFactor } from './personalityService';
import {
    computeExpectedPoints,
    generateScoringPlays,
    getRotationWeights,
    simulationEngine,
    WATCH_PLAY_META,
    LIVE_QUARTER_VARIANCE,
    QUARTER_FLOOR,
    TIMEOUT_BONUS,
    threeRate,
    type GameEvent,
} from './simulationService';

// The director for the 3D "Assistir ao Jogo" screen. Pure TypeScript — it
// never imports three.js and never touches React. It answers exactly one
// question: at second T of this quarter, where is every player and where is
// the ball. Court3D just draws whatever comes back.
//
// Two things it is NOT:
//
// 1. A second basketball engine. Every point it produces comes from
//    computeExpectedPoints — the same figure simulateGame uses for every other
//    game on the calendar — sliced per quarter exactly the way
//    advanceLiveQuarter already slices a Game 7, and attributed to players by
//    generateScoringPlays. The choreography is a *reading* of that result, not
//    a competing simulation of it.
//
// 2. Pre-resolved. Unlike the old simulateGameEvents (removed with this
//    change), the final score does not exist when the screen opens. A quarter
//    is resolved when it starts, with the play the user called folded in, so
//    calling a play actually moves the scoreboard instead of decorating a
//    result that was already decided.

type CoachMap = { [key: string]: Coach };

export type CourtSide = 'home' | 'away';

/* ------------------------------------------------------------------ */
/* Court geometry — feet, matching Court3D's own constants.            */
/* ------------------------------------------------------------------ */
const HOOP_AX = 41.75; // a hoop's distance from center, along the length
const RIM_Y = 10;
const CARRY_Y = 3.4; // ball height while a player is holding/dribbling it

export const REGULATION_QUARTERS = 4;
const REGULATION_SECONDS = 12 * 60;
const OVERTIME_SECONDS = 5 * 60;
// Mirrors the `Math.max(80, ...)` clamp simulateGame applies to every other
// game in the season.
// Mirrors simulateGame's own score floor — a watched game is the same game,
// so it gets the same guarantee. Both were 80 back when the league averaged
// 96 a night; at a modern ~114 that floor sat close enough to the mean to
// stack scores on a visible plateau.
const MIN_GAME_SCORE = 50;

export const quarterSeconds = (quarter: number) =>
    (quarter <= REGULATION_QUARTERS ? REGULATION_SECONDS : OVERTIME_SECONDS);

// A possession runs 13-18 game-seconds. At the screen's default playback that
// is under two real seconds, which is why a called play gets slowed down —
// see SLOW_MO_SCALE in WatchGameScreen.
const POSSESSION_MIN = 13;
const POSSESSION_MAX = 18;

interface Spot { ax: number; az: number } // "attack frame": ax grows toward the hoop being attacked
interface Vec2 { x: number; z: number }
interface Vec3 { x: number; y: number; z: number }

// Home attacks +X, away attacks -X (same convention Court3D always used). The
// away frame is the home frame rotated 180 degrees rather than mirrored, so a
// play's strong side stays the strong side for both teams instead of flipping
// handedness.
const dirOf = (side: CourtSide) => (side === 'home' ? 1 : -1);

/* ------------------------------------------------------------------ */
/* Formations. Indices are always 0=PG 1=SG 2=SF 3=PF 4=C — the same   */
/* court order getLineup emits and StartersCourt's SLOT_LAYOUT draws.  */
/* ------------------------------------------------------------------ */
const TRANSITION_SET: Spot[] = [
    { ax: -8, az: 0 },
    { ax: 4, az: -20 },
    { ax: 4, az: 20 },
    { ax: 13, az: 9 },
    { ax: 15, az: -6 },
];

const BASE_SET: Spot[] = [
    { ax: 17, az: 0 },    // PG at the top of the key
    { ax: 25, az: -18 },  // SG on the strong-side wing
    { ax: 25, az: 18 },   // SF on the weak-side wing
    { ax: 33, az: 10 },   // PF at the weak-side elbow
    { ax: 35, az: -6 },   // C on the strong-side block
];

const FT_SPOT: Spot = { ax: 28, az: 0 };

// Where the five stand at the moment the play actually breaks — this is the
// shape the user is paying to see, so each one is visibly different from the
// base set above.
const PLAY_ACTION: Record<WatchPlay, Spot[]> = {
    // Big climbs out to screen for the handler, everyone else spaces off.
    pick_roll: [
        { ax: 22, az: -3 },
        { ax: 27, az: -21 },
        { ax: 26, az: 20 },
        { ax: 30, az: 15 },
        { ax: 24, az: -7 },
    ],
    // Four flatten out; the SG runs the baseline off the PF's pin-down.
    pindown: [
        { ax: 20, az: 4 },
        { ax: 26, az: -21 },
        { ax: 24, az: 20 },
        { ax: 35, az: -17 },
        { ax: 36, az: 8 },
    ],
    // Entry angle: handler up top, big sealing on the block, shooters spaced.
    post_up: [
        { ax: 22, az: -9 },
        { ax: 26, az: -22 },
        { ax: 25, az: 21 },
        { ax: 30, az: 17 },
        { ax: 37, az: -5 },
    ],
    // Full clear-out — everybody to the weak side, star alone on an island.
    iso: [
        { ax: 24, az: -14 },
        { ax: 20, az: 21 },
        { ax: 33, az: 21 },
        { ax: 38, az: 15 },
        { ax: 38, az: -20 },
    ],
};

// Where the shot goes up from, per play. `rim` covers 2s, `three` covers 3s,
// and a free throw is always the line.
const SHOT_SPOT: Record<WatchPlay, { rim: Spot; three: Spot }> = {
    pick_roll: { rim: { ax: 37, az: -3 }, three: { ax: 20, az: -7 } },
    pindown: { rim: { ax: 34, az: -15 }, three: { ax: 23, az: -21 } },
    post_up: { rim: { ax: 38, az: -4 }, three: { ax: 23, az: 13 } },
    iso: { rim: { ax: 36, az: -9 }, three: { ax: 25, az: -16 } },
};

// A defender sits between their man and the rim.
const DEF_GAP = 3.8;
const defendSpot = (s: Spot): Spot => {
    const dx = HOOP_AX - s.ax;
    const dz = -s.az;
    const len = Math.hypot(dx, dz) || 1;
    return { ax: s.ax + (dx / len) * DEF_GAP, az: s.az + (dz / len) * DEF_GAP };
};

/* ------------------------------------------------------------------ */
/* Who is on the floor.                                                */
/* ------------------------------------------------------------------ */
export interface CourtPlayer {
    playerId: string;
    name: string;
    slot: string; // 'PG' | 'SG' | 'SF' | 'PF' | 'C'
}

export interface FiveOnCourt {
    side: CourtSide;
    teamId: string;
    players: CourtPlayer[]; // exactly 5, in PG..C court order
}

// The starting five, with any unfilled lineup slot backfilled from the top of
// the rotation so the court is never short a body. Who replaces them as the
// game goes on is the rotation's job (see "Energy and the bench" below).
export const buildFive = (team: Team, players: { [key: string]: Player }, side: CourtSide): FiveOnCourt => {
    const { slots } = simulationEngine.getLineup(team, players);
    const rotation = getRotationWeights(team, players).ids;
    const taken = new Set(slots.map((s) => s.playerId).filter((id): id is string => !!id));

    const five: CourtPlayer[] = slots.slice(0, 5).map((slot) => {
        let pId = slot.playerId;
        if (!pId) {
            pId = rotation.find((id) => !taken.has(id)) ?? null;
            if (pId) taken.add(pId);
        }
        const player = pId ? players[pId] : undefined;
        return {
            playerId: pId ?? `${team.id}-empty-${slot.pos}`,
            name: player?.name ?? '—',
            slot: slot.pos,
        };
    });

    return { side, teamId: team.id, players: five };
};

/* ------------------------------------------------------------------ */
/* Energy and the bench.                                               */
/* ------------------------------------------------------------------ */
// Before this the five starters played all 48 minutes on screen. Now every
// player carries energy (0-100) that drains on the floor and comes back on the
// bench, and the coach rotates on it. Tuned so the automatic rotation lands
// starters in the mid-30s in minutes -- what the season's box score already
// gives them -- which keeps a watched game the same game as an unwatched one.
// See PLANO-BANCO.md.

export type Energy = { [playerId: string]: number };

/** Per game-second on the floor. A fresh starter hits the sub line ~8 minutes in. */
const DRAIN_PER_SECOND = 0.1;
/** Per game-second on the bench. ~4 minutes brings a tired player back. */
const REST_PER_SECOND = 0.15;
/** Below this the coach takes him out. */
const SUB_OUT = 52;
/** A reserve has to be at least this fresh to go in. */
const SUB_IN = 75;
/** A higher-priority player this rested takes his spot back from a reserve. */
const SUB_BACK = 90;
/**
 * At most this many changes per side at one dead ball. Five starters drain at
 * the same rate, so without a cap they all hit SUB_OUT together and the coach
 * changed the whole five at once -- seen live, a hockey line change with
 * guards at PF and C. Staggered, the starters' energies spread apart and stay
 * apart, which is how a real rotation looks.
 */
const MAX_SUBS_PER_STOP = 2;
/** Only this spent is a player pulled for someone who doesn't play his spot. */
const OUT_OF_POSITION_FLOOR = 35;
/** Where tiredness starts to cost him on the floor. */
const FATIGUE_FREE = 60;
/** OVR lost per point of energy under FATIGUE_FREE (at 20 energy, -8 OVR). */
const FATIGUE_COST = 0.2;
/**
 * How much of a rating gap becomes points per game. computeExpectedPoints'
 * own `matchupStrength`, mirrored so the lineup adjustment speaks the same
 * currency as the rest of the score.
 */
const MATCHUP_STRENGTH = 1.15;

/** Energy a player brings into the game: the season's fatigue comes with him. */
export const initialEnergy = (teams: Team[], players: { [key: string]: Player }): Energy => {
    const e: Energy = {};
    teams.forEach((t) => t.roster.forEach((id) => {
        const p = players[id];
        if (p) e[id] = Math.max(40, 100 - (p.load ?? 0) * 0.3);
    }));
    return e;
};

/** Between periods everyone gets a breather; halftime is a real one. */
export const breakRecovery = (energy: Energy, endedQuarter: number): Energy => {
    const gain = endedQuarter === 2 ? 25 : 10;
    const out: Energy = {};
    for (const id in energy) out[id] = Math.min(100, energy[id] + gain);
    return out;
};

const effectiveOvr = (p: Player | undefined, energy: number): number =>
    (p?.ovr ?? 60) - Math.max(0, FATIGUE_FREE - energy) * FATIGUE_COST;

/** The rating the season engine plays this team at: its rotation, minutes-weighted. */
const rotationOvr = (team: Team, players: { [key: string]: Player }): number => {
    const { ids, weights } = getRotationWeights(team, players);
    let sum = 0;
    let w = 0;
    ids.forEach((id, i) => {
        if (!players[id]) return;
        sum += players[id].ovr * weights[i];
        w += weights[i];
    });
    return w > 0 ? sum / w : 70;
};

const playsSlot = (p: Player | undefined, slot: string) => !!p && getPlayerPositions(p).includes(slot);

/**
 * The coach's call at a dead ball: anyone under SUB_OUT comes out for the
 * freshest-ranked reserve who plays the spot, and a rested regular takes his
 * minutes back from a reserve. Priority is the rotation order (starters
 * first), so rotationSize decides who is even eligible -- the same setting
 * that shapes the season's minutes.
 */
export const autoSubstitute = (
    five: FiveOnCourt, team: Team, players: { [key: string]: Player }, energy: Energy,
    /** Who the coach treats as his starters, in order. Defaults to the
     * rotation; the screen passes the GM's own five first once he has picked
     * one, so the coach rests them and brings THEM back instead of undoing
     * the change at the next dead ball. */
    priorityOverride?: string[],
): FiveOnCourt => {
    const priority = priorityOverride ?? getRotationWeights(team, players).ids;
    const rank = (id: string) => {
        const i = priority.indexOf(id);
        return i >= 0 ? i : 99;
    };
    const lineup = five.players.map((p) => ({ ...p }));
    const onCourt = () => new Set(lineup.map((p) => p.playerId));

    let changes = 0;
    // The most tired come out first, so the cap spends itself where it matters.
    const order = lineup.map((_, i) => i).sort((a, b) => (energy[lineup[a].playerId] ?? 100) - (energy[lineup[b].playerId] ?? 100));
    order.forEach((i) => {
        if (changes >= MAX_SUBS_PER_STOP) return;
        const slot = lineup[i];
        const occupant = slot.playerId;
        const e = energy[occupant] ?? 100;
        const taken = onCourt();
        const pick = (minEnergy: number, betterThan: number) => {
            const ok = (id: string) => !taken.has(id) && !!players[id] && (energy[id] ?? 100) >= minEnergy && rank(id) < betterThan;
            return priority.find((id) => ok(id) && playsSlot(players[id], slot.slot))
                ?? (minEnergy === SUB_IN && e < OUT_OF_POSITION_FLOOR ? priority.find(ok) : undefined);
        };
        let incoming: string | undefined;
        if (e < SUB_OUT) incoming = pick(SUB_IN, 99);
        else if (rank(occupant) >= 5) incoming = pick(SUB_BACK, rank(occupant));
        if (incoming) {
            lineup[i] = { playerId: incoming, name: players[incoming].name, slot: slot.slot };
            changes++;
        }
    });
    return { ...five, players: lineup };
};

const drainAndRest = (
    energy: Energy, seconds: number, onCourt: Set<string>, players: { [key: string]: Player },
): Energy => {
    const out: Energy = {};
    for (const id in energy) {
        if (onCourt.has(id)) {
            // The workhorse burns slower -- the same archetype that already
            // shrugs off load in the season sim, at a gentler ratio here.
            const rate = DRAIN_PER_SECOND * (0.5 + 0.5 * fatigueFactor(players[id] ?? ({} as Player)));
            out[id] = Math.max(0, energy[id] - rate * seconds);
        } else {
            out[id] = Math.min(100, energy[id] + REST_PER_SECOND * seconds);
        }
    }
    return out;
};

/* ------------------------------------------------------------------ */
/* Scoring attribution, biased by the play that's being run.           */
/* ------------------------------------------------------------------ */
// Each play tilts WHO scores, not just where from — that's what makes calling
// one feel different rather than reskinning the same possession. The tilt is a
// weight multiplier fed into generateScoringPlays' existing off-rating
// formula, so a bad shooter running pindowns still doesn't suddenly lead the
// game.
const playBias = (play: WatchPlay, five: CourtPlayer[], players: { [key: string]: Player }): number[] => {
    const at = (i: number) => players[five[i].playerId];
    switch (play) {
        case 'pick_roll':
            return five.map((_, i) => (i === 0 ? 1.6 : i === 4 ? 1.4 : 0.7));
        case 'pindown':
            return five.map((_, i) => {
                const shooting = at(i)?.attributes?.shooting ?? 70;
                return (i === 1 ? 1.45 : 0.95) * (1 + (shooting - 72) / 90);
            });
        case 'post_up':
            return five.map((_, i) => (i === 4 ? 2.2 : i === 3 ? 1.3 : 0.6));
        case 'iso': {
            let star = 0;
            five.forEach((_, i) => { if ((at(i)?.off ?? 0) > (at(star)?.off ?? 0)) star = i; });
            // Calibrated, not maxed: at 1.9-to-0.8 the star takes roughly a
            // third of the team's points, which over a full game is a big
            // night (high 30s) rather than an 70-point fantasy. Running a set
            // for someone doesn't hand them every possession.
            return five.map((_, i) => (i === star ? 1.9 : 0.8));
        }
    }
};

// Who gets the side's baskets this span: everyone who was on the floor for its
// offensive trips, weighted by how long, by the rotation taper, and by what
// the called play asks of his spot (read off the five he spent most of the
// span in).
const scoringPool = (
    team: Team, players: { [key: string]: Player }, fives: FiveOnCourt[], durations: number[], play: WatchPlay,
): { ids: string[]; weights: number[] } => {
    const rotation = getRotationWeights(team, players);
    const seconds = new Map<string, number>();
    const biasOf = new Map<string, number>();
    fives.forEach((five, k) => {
        const bias = playBias(play, five.players, players);
        five.players.forEach((p, i) => {
            if (!players[p.playerId]) return; // backfilled empty slot — nobody there to score
            seconds.set(p.playerId, (seconds.get(p.playerId) ?? 0) + durations[k]);
            if (!biasOf.has(p.playerId) || durations[k] > 0) biasOf.set(p.playerId, bias[i]);
        });
    });
    const total = [...seconds.values()].reduce((a, b) => a + b, 0) || 1;
    const ids: string[] = [];
    const weights: number[] = [];
    seconds.forEach((secs, id) => {
        const rotIdx = rotation.ids.indexOf(id);
        // Rotation weights taper starters 1st -> 5th; keep that taper so a
        // span played by the starters still spreads the way the box score does.
        const base = rotIdx >= 0 ? rotation.weights[rotIdx] : 0.6;
        ids.push(id);
        weights.push(base * (biasOf.get(id) ?? 1) * (secs / total) * 5);
    });
    return { ids, weights };
};

/* ------------------------------------------------------------------ */
/* Possessions and beats.                                              */
/* ------------------------------------------------------------------ */
interface Beat {
    t: number; // absolute seconds into the quarter
    off: Vec2[]; // the five in possession
    def: Vec2[]; // the five defending
    ball: Vec3;
    handler: number | null; // index into `off`; null while the ball is in the air
    arc: number; // extra height added over the segment that STARTS at this beat
}

export interface Possession {
    side: CourtSide;
    start: number;
    end: number;
    play: WatchPlay;
    made: boolean;
    /** Usually 0-3. Can exceed 3 when a lopsided quarter produces more baskets
     * than possessions and two land on the same trip — the screen reads it as
     * an and-1 rather than quietly dropping the points. */
    points: number;
    shooter: number; // index into the five in possession
    passer: number | null;
    scorerName: string;
    assistName: string | null;
    shotAt: number; // absolute second the ball reaches the rim
    beats: Beat[];
    /** Who was on the floor for this trip, both sides, and how fresh. */
    fiveHome?: FiveOnCourt;
    fiveAway?: FiveOnCourt;
    energy?: Energy;
}

export interface QuarterPlan {
    quarter: number;
    from: number; // second of the quarter this plan starts covering
    pointsHome: number; // points scored WITHIN this plan's span, not the running total
    pointsAway: number;
    possessions: Possession[];
    /** Where the rotation stands at the buzzer -- the next period starts here. */
    endFiveHome: FiveOnCourt;
    endFiveAway: FiveOnCourt;
    endEnergy: Energy;
}

const withShooter = (spots: Spot[], idx: number, spot: Spot): Spot[] =>
    spots.map((s, i) => (i === idx ? spot : s));

const buildPossession = (
    side: CourtSide, play: WatchPlay, start: number, duration: number,
    made: boolean, points: number, shotKind: 1 | 2 | 3,
    shooter: number, passer: number | null, scorerName: string, assistName: string | null,
): Possession => {
    const d = dirOf(side);
    const w = (s: Spot): Vec2 => ({ x: d * s.ax, z: d * s.az });
    const offOf = (spots: Spot[]) => spots.map(w);
    const defOf = (spots: Spot[]) => spots.map((s) => w(defendSpot(s)));
    const held = (spots: Spot[], idx: number): Vec3 => {
        const p = w(spots[idx]);
        return { x: p.x, y: CARRY_Y, z: p.z };
    };

    const action = PLAY_ACTION[play];
    const shotSpot = shotKind === 1 ? FT_SPOT : shotKind === 3 ? SHOT_SPOT[play].three : SHOT_SPOT[play].rim;
    const shotSet = withShooter(action, shooter, shotSpot);
    const hoop: Vec3 = { x: d * HOOP_AX, y: RIM_Y, z: 0 };

    const at = (frac: number) => start + duration * frac;
    const beats: Beat[] = [];

    // Bring it up.
    beats.push({
        t: at(0), off: offOf(TRANSITION_SET), def: defOf(TRANSITION_SET),
        ball: held(TRANSITION_SET, 0), handler: 0, arc: 0,
    });
    // Set the half-court. This leg is generous (a third of the possession)
    // because it is also the leg that carries everyone back from the other
    // end after a change of possession — squeeze it and the full-court trip
    // comes out at a sprint no human runs.
    beats.push({
        t: at(0.36), off: offOf(BASE_SET), def: defOf(BASE_SET),
        ball: held(BASE_SET, 0), handler: 0, arc: 0,
    });
    // The play breaks.
    const entryHandler = passer ?? 0;
    const passes = passer !== null && passer !== shooter;
    beats.push({
        t: at(0.52), off: offOf(action), def: defOf(action),
        ball: held(action, entryHandler), handler: entryHandler,
        arc: passes ? 2.2 : 0,
    });

    if (passes) {
        // Ball in the air, then caught at the shot spot.
        beats.push({
            t: at(0.68), off: offOf(shotSet), def: defOf(shotSet),
            ball: held(shotSet, shooter), handler: null, arc: 0,
        });
        beats.push({
            t: at(0.76), off: offOf(shotSet), def: defOf(shotSet),
            ball: held(shotSet, shooter), handler: shooter, arc: 0,
        });
    } else {
        // The handler creates their own — drive or rise up, no pass.
        beats.push({
            t: at(0.72), off: offOf(shotSet), def: defOf(shotSet),
            ball: held(shotSet, shooter), handler: shooter, arc: 0,
        });
    }

    // Release: the ball leaves the hand and arcs to the rim.
    const release = held(shotSet, shooter);
    beats.push({
        t: at(0.86), off: offOf(shotSet), def: defOf(shotSet),
        ball: { x: release.x, y: 7.2, z: release.z }, handler: null,
        arc: shotKind === 3 ? 9 : shotKind === 1 ? 7 : 5,
    });

    const shotAt = at(0.95);
    beats.push({ t: shotAt, off: offOf(shotSet), def: defOf(shotSet), ball: hoop, handler: null, arc: 0 });

    // The aftermath. Bodies stay where the shot left them — they do NOT snap
    // back to a transition set here. Getting back down the floor is the next
    // possession's opening beat, which starts from exactly these positions
    // (see stitch) and has four or five game-seconds to cover the ground.
    // Resetting here instead compressed a full-court sprint into the 0.8s tail
    // of the possession, which read as players moving at ~50 ft/s.
    const endBall: Vec3 = made
        ? { x: d * HOOP_AX, y: 1.2, z: 0 } // through the net
        : { x: d * 36, y: 2.4, z: d * 6 }; // caroms toward the weak-side block
    beats.push({
        t: start + duration, off: offOf(shotSet), def: defOf(shotSet),
        ball: endBall, handler: null, arc: made ? 0 : 3.5,
    });

    return {
        side, play, start, end: start + duration, made, points,
        shooter, passer, scorerName, assistName, shotAt, beats,
    };
};

/* ------------------------------------------------------------------ */
/* Planning a quarter (or the remainder of one, after a timeout).      */
/* ------------------------------------------------------------------ */
export interface PlanQuarterArgs {
    home: Team;
    away: Team;
    players: { [key: string]: Player };
    coaches: CoachMap;
    fiveHome: FiveOnCourt;
    fiveAway: FiveOnCourt;
    /** Which side the user coaches — only that side's play affects the score,
     * the same simplification advanceLiveQuarter makes (the CPU plays it
     * straight). */
    userSide: CourtSide;
    play: WatchPlay;
    /** Spends the timeout bonus on the user's side for this span. */
    timeout: boolean;
    quarter: number;
    /** Second of the quarter to start planning from — 0 for a fresh quarter,
     * or wherever the clock was when a timeout re-opened the remainder. */
    from: number;
    /** Everyone's energy at `from`. Omitted: both rosters fresh from the season. */
    energy?: Energy;
    /** Whether the coach rotates each side on his own. The user can switch his
     * off and run the bench by hand. Omitted: both on. */
    autoSubs?: { home: boolean; away: boolean };
    /** The user's own pecking order once he has edited his five (see
     * autoSubstitute). Applies to his side only. */
    userPriority?: string[];
}

// The CPU opponent picks a set too, so its possessions don't all look the
// same. It has no scoreboard effect (see userSide above) — purely what the
// user watches the other team run.
const CPU_PLAYS: WatchPlay[] = ['pick_roll', 'pindown', 'post_up', 'iso'];
const cpuPlay = (): WatchPlay => CPU_PLAYS[Math.floor(Math.random() * CPU_PLAYS.length)];

export const planQuarter = (args: PlanQuarterArgs): QuarterPlan => {
    const { home, away, players, coaches, userSide, play, timeout, quarter, from } = args;
    const autoSubs = args.autoSubs ?? { home: true, away: true };

    const total = quarterSeconds(quarter);
    const span = Math.max(0, total - from) / total;
    const meta = WATCH_PLAY_META[play];

    // Lay possessions end to end across the span, alternating sides. The tail
    // is absorbed by the last possession rather than left as a stub: a
    // four-second trip has to fit a full-court sprint plus a whole set into
    // its beats, and the players end up moving at impossible speeds.
    const slots: { side: CourtSide; start: number; duration: number }[] = [];
    let t = from;
    let side: CourtSide = Math.random() < 0.5 ? 'home' : 'away';
    while (total - t >= POSSESSION_MIN) {
        const duration = POSSESSION_MIN + Math.random() * (POSSESSION_MAX - POSSESSION_MIN);
        slots.push({ side, start: t, duration });
        t += duration;
        side = side === 'home' ? 'away' : 'home';
    }
    if (slots.length === 0) {
        // A timeout called with only a few seconds left still needs one trip.
        if (total - from > 1) slots.push({ side, start: from, duration: total - from });
    } else {
        slots[slots.length - 1].duration = total - slots[slots.length - 1].start;
    }

    // Walk the span once to settle who is on the floor for every trip. It
    // depends only on the clock, never on the score, so it can be decided
    // before a single point is.
    let energy: Energy = args.energy ?? initialEnergy([home, away], players);
    let fh = args.fiveHome;
    let fa = args.fiveAway;
    const lineups: { fiveHome: FiveOnCourt; fiveAway: FiveOnCourt; energy: Energy }[] = [];
    for (const slot of slots) {
        if (autoSubs.home) fh = autoSubstitute(fh, home, players, energy, userSide === 'home' ? args.userPriority : undefined);
        if (autoSubs.away) fa = autoSubstitute(fa, away, players, energy, userSide === 'away' ? args.userPriority : undefined);
        lineups.push({ fiveHome: fh, fiveAway: fa, energy });
        const onCourt = new Set([...fh.players, ...fa.players].map((p) => p.playerId));
        energy = drainAndRest(energy, slot.duration, onCourt, players);
    }

    // Who was out there, against who the season engine assumes plays these
    // minutes. Both ends: a better five scores more AND gives up less.
    const lineupEdge = (team: Team, which: 'fiveHome' | 'fiveAway'): number => {
        if (slots.length === 0) return 0;
        let sum = 0;
        let secs = 0;
        slots.forEach((slot, k) => {
            const five = lineups[k][which];
            const avg = five.players.reduce((acc, p) => acc + effectiveOvr(players[p.playerId], lineups[k].energy[p.playerId] ?? 100), 0) / 5;
            sum += avg * slot.duration;
            secs += slot.duration;
        });
        return sum / secs - rotationOvr(team, players);
    };

    // Same shape as advanceLiveQuarter: the whole-game expectation split by
    // period, nudged by what the user called, floored so no quarter collapses.
    const { expectedPointsA, expectedPointsB } = computeExpectedPoints(home, away, players, coaches, true);
    const periodShare = quarter <= REGULATION_QUARTERS
        ? 1 / REGULATION_QUARTERS
        : OVERTIME_SECONDS / (REGULATION_SECONDS * REGULATION_QUARTERS);

    let selfDelta = meta.selfDelta;
    const oppDelta = meta.oppDelta;
    if (timeout) selfDelta += TIMEOUT_BONUS;

    const edge = (lineupEdge(home, 'fiveHome') - lineupEdge(away, 'fiveAway')) * MATCHUP_STRENGTH * periodShare;
    const deltaHome = (userSide === 'home' ? selfDelta : oppDelta) + edge;
    const deltaAway = (userSide === 'home' ? oppDelta : selfDelta) - edge;
    const variance = Math.max(4, LIVE_QUARTER_VARIANCE + meta.variance);
    const swing = () => Math.random() * variance - variance / 2;

    // simulateGame clamps every other game on the calendar to at least 80
    // points a side. A watched game is the same game, so it gets the same
    // guarantee, spread over the four regulation periods — otherwise the one
    // game the user actually sits through is the only one that can end 73-91.
    // An overtime period keeps the narrower Game 7 floor, scaled to length.
    const floorPerPeriod = quarter <= REGULATION_QUARTERS
        ? Math.max(QUARTER_FLOOR, MIN_GAME_SCORE / REGULATION_QUARTERS)
        : QUARTER_FLOOR * (OVERTIME_SECONDS / REGULATION_SECONDS);
    const floor = Math.round(floorPerPeriod * span);
    const pointsHome = Math.max(floor, Math.round((expectedPointsA * periodShare + deltaHome + swing()) * span));
    const pointsAway = Math.max(floor, Math.round((expectedPointsB * periodShare + deltaAway + swing()) * span));

    // Split each side's points into real baskets attributed to whoever was on
    // the floor for its trips, then drop each basket onto a trip its scorer
    // actually played. Everything left over is a miss — which is what makes it
    // read as a basketball game and not a highlight reel.
    const possessions: Possession[] = [];
    for (const s of (['home', 'away'] as CourtSide[])) {
        const team = s === 'home' ? home : away;
        const which = s === 'home' ? 'fiveHome' : 'fiveAway';
        const sidePlay = s === userSide ? play : cpuPlay();
        const points = s === 'home' ? pointsHome : pointsAway;
        const mine = slots.map((slot, k) => ({ slot, k })).filter(({ slot }) => slot.side === s);
        if (mine.length === 0) continue;

        const baskets: GameEvent[] = generateScoringPlays(
            team, players, points, s === 'home' ? 'A' : 'B',
            scoringPool(team, players, mine.map(({ k }) => lineups[k][which]), mine.map(({ slot }) => slot.duration), sidePlay),
        );

        // A blowout quarter can produce more baskets than possessions; the
        // extras pile onto a trip that is already scoring rather than being
        // dropped, so the points that go up on the board are always exactly
        // the points that were attributed.
        interface Scored { points: number; shotKind: 1 | 2 | 3; playerId: string; playerName: string }
        const scoring = new Map<number, Scored>();
        baskets.forEach((b) => {
            const played = mine.map((_, i) => i).filter((i) => lineups[mine[i].k][which].players.some((p) => p.playerId === b.playerId));
            const pool = played.length ? played : mine.map((_, i) => i);
            const free = pool.filter((i) => !scoring.has(i));
            const idx = (free.length ? free : pool)[Math.floor(Math.random() * (free.length ? free.length : pool.length))];
            const existing = scoring.get(idx);
            if (existing) existing.points += b.points;
            else scoring.set(idx, { points: b.points, shotKind: b.points, playerId: b.playerId, playerName: b.playerName });
        });

        mine.forEach(({ slot, k }, i) => {
            const five = lineups[k][which];
            const basket = scoring.get(i);
            const made = !!basket;
            const found = basket ? five.players.findIndex((p) => p.playerId === basket.playerId) : -1;
            const shooter = found >= 0 ? found : Math.floor(Math.random() * 5);
            // A missed shot picks its spot the same way a made one does, so
            // the bigs aren't the only players who never brick from the arc.
            const shotKind: 1 | 2 | 3 = basket
                ? basket.shotKind
                : (Math.random() < threeRate(players[five.players[shooter]?.playerId]) ? 3 : 2);
            // Free throws are never assisted; otherwise the point guard sets
            // it up, or the big does when the guard is the one shooting.
            const passer = shotKind === 1 ? null : shooter === 0 ? 4 : 0;
            const assisted = made && passer !== null && passer !== shooter && Math.random() < 0.62;
            const poss = buildPossession(
                s, sidePlay, slot.start, slot.duration, made,
                basket ? basket.points : 0, shotKind,
                shooter, passer,
                basket?.playerName ?? five.players[shooter]?.name ?? '',
                assisted && passer !== null ? five.players[passer]?.name ?? null : null,
            );
            poss.fiveHome = lineups[k].fiveHome;
            poss.fiveAway = lineups[k].fiveAway;
            poss.energy = lineups[k].energy;
            possessions.push(poss);
        });
    }

    possessions.sort((a, b) => a.start - b.start);
    stitch(possessions);
    return {
        quarter, from, pointsHome, pointsAway, possessions,
        endFiveHome: fh, endFiveAway: fa, endEnergy: energy,
    };
};

/**
 * The rotation as it stood at `seconds` into a plan -- what a timeout reopens
 * the quarter from. Read off the trip in progress (its fives and the energy
 * they started it with).
 */
export const rotationAt = (
    plan: QuarterPlan, seconds: number,
): { fiveHome: FiveOnCourt; fiveAway: FiveOnCourt; energy: Energy } | null => {
    const poss = possessionAt(plan, seconds);
    if (!poss || !poss.fiveHome || !poss.fiveAway || !poss.energy) return null;
    return { fiveHome: poss.fiveHome, fiveAway: poss.fiveAway, energy: poss.energy };
};

// Each possession is authored independently, in its own attacking frame, so
// its opening beat starts from a canned transition set. Played back as-is that
// means all ten players snap to new spots at every change of possession —
// forty-odd teleports a quarter. So the opening beat of each possession is
// rewritten to be exactly where the previous one left everybody, and the
// interpolation carries them from there into the new set.
//
// When possession changes hands the two arrays swap: the team that was
// defending is now the offense. Index order survives the swap (a five's player
// i is always at off[i] when attacking and def[i] when guarding), so PG stays
// PG through the handoff.
const stitch = (possessions: Possession[]) => {
    for (let i = 1; i < possessions.length; i++) {
        const prev = possessions[i - 1];
        const cur = possessions[i];
        const last = prev.beats[prev.beats.length - 1];
        const first = cur.beats[0];
        if (prev.side === cur.side) {
            first.off = last.off;
            first.def = last.def;
        } else {
            first.off = last.def;
            first.def = last.off;
        }
        // The ball travels from wherever the last trip ended — out of the net,
        // or off the rim — into the new handler's hands over the first beat,
        // which is what an outlet actually looks like.
        first.ball = last.ball;
    }
};

/* ------------------------------------------------------------------ */
/* Reading the plan at a point in time.                                */
/* ------------------------------------------------------------------ */
export interface PlayerState {
    playerId: string;
    name: string;
    slot: string;
    side: CourtSide;
    x: number;
    z: number;
    rotY: number;
    hasBall: boolean;
}

export interface BallState {
    x: number;
    y: number;
    z: number;
    inFlight: boolean;
}

export interface CourtState {
    /** Always 10, ALWAYS home's five first then away's five — the order never
     * changes with possession, so Court3D can hold one doll per index for the
     * life of the game instead of re-binding bodies to teams every trip up the
     * floor. */
    players: PlayerState[];
    ball: BallState;
    possession: CourtSide;
    handlerName: string | null;
    play: WatchPlay;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// Ease in and out so players settle into a spot instead of sliding at constant
// speed between beats — the single cheapest thing that makes it read as people
// playing rather than markers interpolating.
const smooth = (t: number) => t * t * (3 - 2 * t);

// What the court looks like before anyone has planned a quarter: the two
// centers squared up at the circle, everyone else ringed around it, ball in
// the air. Without this the screen would open with ten bodies stacked on the
// center spot while the user is still in the huddle picking a play.
const TIP_OFF_SET: Spot[] = [
    { ax: 14, az: -11 },
    { ax: 15, az: 11 },
    { ax: 9, az: 19 },
    { ax: 10, az: -19 },
    { ax: 3.2, az: -1 }, // the center, toeing the circle
];

export const tipOffState = (fiveHome: FiveOnCourt, fiveAway: FiveOnCourt): CourtState => {
    const build = (five: FiveOnCourt): PlayerState[] => {
        const d = dirOf(five.side);
        return five.players.map((p, i) => {
            const x = d * TIP_OFF_SET[i].ax;
            const z = d * TIP_OFF_SET[i].az;
            return {
                playerId: p.playerId,
                name: p.name,
                slot: p.slot,
                side: five.side,
                x,
                z,
                // Everyone turns in to watch the toss.
                rotY: Math.atan2(-x, -z),
                hasBall: false,
            };
        });
    };
    return {
        players: [...build(fiveHome), ...build(fiveAway)],
        ball: { x: 0, y: 14, z: 0, inFlight: true },
        possession: 'home',
        handlerName: null,
        play: 'pick_roll',
    };
};

export const possessionAt = (plan: QuarterPlan, seconds: number): Possession | null => {
    const list = plan.possessions;
    if (list.length === 0) return null;
    let lo = 0;
    let hi = list.length - 1;
    let found = list[0];
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].start <= seconds) { found = list[mid]; lo = mid + 1; } else { hi = mid - 1; }
    }
    return found;
};

export const courtStateAt = (
    plan: QuarterPlan, seconds: number, fiveHome: FiveOnCourt, fiveAway: FiveOnCourt,
): CourtState | null => {
    const poss = possessionAt(plan, seconds);
    if (!poss) return null;

    const beats = poss.beats;
    let i = 0;
    while (i < beats.length - 2 && beats[i + 1].t <= seconds) i++;
    const a = beats[i];
    const b = beats[Math.min(i + 1, beats.length - 1)];
    const raw = b.t > a.t ? (seconds - a.t) / (b.t - a.t) : 1;
    const u = Math.max(0, Math.min(1, raw));
    const e = smooth(u);

    const ball: BallState = {
        x: lerp(a.ball.x, b.ball.x, u),
        y: lerp(a.ball.y, b.ball.y, u) + Math.sin(Math.PI * u) * a.arc,
        z: lerp(a.ball.z, b.ball.z, u),
        inFlight: a.handler === null,
    };
    // A held ball bounces; an airborne one doesn't.
    if (a.handler !== null) ball.y += Math.abs(Math.sin(seconds * 7)) * 1.1 - 0.5;

    // The trip's own fives when the plan recorded them (it always does now);
    // the caller's are the fallback for a plan built before substitutions.
    const fh = poss.fiveHome ?? fiveHome;
    const fa = poss.fiveAway ?? fiveAway;
    const offFive = poss.side === 'home' ? fh : fa;
    const defFive = poss.side === 'home' ? fa : fh;
    const handler = a.handler;

    const build = (five: FiveOnCourt, from: Vec2[], to: Vec2[], isOffense: boolean): PlayerState[] =>
        five.players.map((p, idx) => {
            const x = lerp(from[idx].x, to[idx].x, e);
            const z = lerp(from[idx].z, to[idx].z, e);
            const hasBall = isOffense && handler === idx;
            // The ball handler squares up to the rim they're attacking;
            // everyone else — teammates and defenders alike — turns to the ball.
            const face = hasBall ? { x: dirOf(poss.side) * HOOP_AX, z: 0 } : { x: ball.x, z: ball.z };
            return {
                playerId: p.playerId,
                name: p.name,
                slot: p.slot,
                side: five.side,
                x,
                z,
                rotY: Math.atan2(face.x - x, face.z - z),
                hasBall,
            };
        });

    const offense = build(offFive, a.off, b.off, true);
    const defense = build(defFive, a.def, b.def, false);

    return {
        players: poss.side === 'home' ? [...offense, ...defense] : [...defense, ...offense],
        ball,
        possession: poss.side,
        handlerName: handler !== null ? offFive.players[handler]?.name ?? null : null,
        play: poss.play,
    };
};
