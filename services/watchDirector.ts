import type { Team, Player, Coach, WatchPlay, LiveTactic } from '../types';
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
    TACTIC_META,
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
//    game on the calendar — sliced per quarter, and attributed to players by
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

// Where each spot shoots from. Threes are all beyond the arc (23.75 ft, 22 in
// the corners); twos at the rim are inside RIM_RANGE so they finish as layups
// or dunks; the rest of the twos are a step inside -- an elbow or short-corner
// jumper.
const THREE_SPOT: Spot[] = [
    { ax: 18, az: -6 },   // PG, pull-up from the slot
    { ax: 26, az: -21 },  // SG, strong wing
    { ax: 25.5, az: 20 }, // SF, weak wing
    { ax: 22, az: 15 },   // PF, popping to the weak slot
    { ax: 17.5, az: -3 }, // C, pick-and-pop up top
];
const CORNER: Spot[] = [{ ax: 40.5, az: -22.4 }, { ax: 40.5, az: 22.4 }];
const RIM_SPOT: Spot[] = [
    { ax: 37, az: -3.5 },
    { ax: 38, az: -5 },
    { ax: 38, az: 5 },
    { ax: 37.5, az: 4 },
    { ax: 38.5, az: -3 },
];
const MID_SPOT: Spot[] = [
    { ax: 28, az: -9 },
    { ax: 33, az: -14 },
    { ax: 33, az: 14 },
    { ax: 29, az: 9 },
    { ax: 34, az: -9 },
];

/* ------------------------------------------------------------------ */
/* Defense.                                                            */
/* ------------------------------------------------------------------ */
// Each defender takes his own man, index for index. The man with the ball is
// pressured close; everyone else sits between his man and the rim and sags
// toward the ball the farther from it he is -- the help a real defense shows,
// and what makes a drive or a skip pass read as one. (It was one fixed 3.8 ft
// gap for all five: ten bodies in pairs, nobody helping.)
const ON_BALL_GAP = 3.2;
const OFF_BALL_GAP = 4.6;
const guard = (off: Spot[], ballIdx: number): Spot[] => {
    const ball = off[ballIdx];
    const helpAx = ball.ax + (HOOP_AX - ball.ax) * 0.55;
    const helpAz = ball.az * 0.45;
    return off.map((man, i) => {
        const dx = HOOP_AX - man.ax;
        const dz = -man.az;
        const len = Math.hypot(dx, dz) || 1;
        const onBall = i === ballIdx;
        // Never past the rim: a man on the block is guarded from the side.
        const gap = Math.min(len * 0.6, onBall ? ON_BALL_GAP : OFF_BALL_GAP);
        let ax = man.ax + (dx / len) * gap;
        let az = man.az + (dz / len) * gap;
        if (!onBall) {
            const sag = Math.max(0, Math.min(0.38, (Math.hypot(man.ax - ball.ax, man.az - ball.az) - 12) / 40));
            ax += (helpAx - ax) * sag;
            az += (helpAz - az) * sag;
        }
        return { ax: Math.min(45.5, ax), az };
    });
};

/** The shooter's man closing out: a step and a half off him, toward the rim. */
const closeout = (shooter: Spot): Spot => {
    const dx = HOOP_AX - shooter.ax;
    const dz = -shooter.az;
    const len = Math.hypot(dx, dz) || 1;
    const gap = Math.min(len * 0.5, 2.4);
    return { ax: shooter.ax + (dx / len) * gap, az: shooter.az + (dz / len) * gap };
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
    /** Index into `off` of who has the ball at this beat; null while it's loose
     * (a shot, the carom, through the net). */
    handler: number | null;
    arc: number; // extra height added over the segment that STARTS at this beat
    /** The segment starting here is a pass from `handler` to the next beat's handler. */
    pass?: boolean;
    /** Offensive index setting a screen over the segment starting here. */
    screener?: number;
    /** This beat is the release: the ball leaves the shooter's hands. */
    release?: boolean;
    /** Defensive index going up for the rebound over the segment starting here. */
    rebounder?: number;
    /** Real seconds the segment starting here should last on screen: a ball in
     * the air flies at its own speed, whatever the playback is doing. */
    real?: number;
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
    /** Who made the last pass to the shooter, if anyone did. */
    passer: number | null;
    scorerName: string;
    assistName: string | null;
    shotAt: number; // absolute second the ball reaches the rim
    beats: Beat[];
    /** How the shooter finishes: a jumper (threes, free throws, anything
     * outside ~8 ft), a layup, or a dunk. Absent on plans from before this
     * field existed -- read as 'shot'. */
    finish?: Finish;
    /** A trip that is a free throw: nobody contests it. */
    freeThrow?: boolean;
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

export type Finish = 'shot' | 'layup' | 'dunk';

/** Closer than this to the rim, a two is finished at the rim, not as a jumper. */
const RIM_RANGE = 8;

// The release beat's ball height and arc for each finish. A jumper leaves the
// hand over the head at the top of the jump and arcs high; a layup is laid up
// off the glass from ~9 ft; a dunk is carried to the rim and barely leaves the
// hand.
//
// A jumper's arc grows with the distance (PLANO-3D Etapa 6). Launched at ~50
// degrees, the apex sits about 0.3 x the distance above the line from hand to
// rim: ~8 ft over it from the corner three, ~5 on a free throw, ~4 from 10 ft.
const jumperArc = (distance: number) => 1 + 0.3 * distance;
const RELEASE: Record<Finish, { y: number; arc: (distance: number) => number }> = {
    shot: { y: 8.4, arc: jumperArc },
    layup: { y: 9.2, arc: () => 1.6 },
    dunk: { y: 10.6, arc: () => 0.3 },
};

// How long the ball is really in the air, in seconds of screen time. Before,
// the flight played at the beat's rate like everything else: a three reached
// the rim in a third of a second. A real one hangs about a second.
const flightReal = (finish: Finish, distance: number) =>
    (finish === 'dunk' ? 0.28 : finish === 'layup' ? 0.45 : 0.5 + 0.024 * distance);
/** The gather before the release, real seconds. A free throw takes its time. */
const gatherReal = (finish: Finish, freeThrow: boolean) => (freeThrow ? 0.7 : finish === 'shot' ? 0.34 : 0.3);
/** A pass: ~42 ft/s, plus the windup. */
const passReal = (distance: number) => 0.15 + distance / 42;

/**
 * The chance a made shot at the rim is a dunk, from the shooter's athleticism
 * and size: a springy big dunks most of his makes inside, a guard rarely.
 */
export const dunkChance = (p: Player | undefined): number => {
    if (!p) return 0.1;
    const athletic = ((p.attributes?.athleticism ?? 70) - 70) / 28;
    const big = getPlayerPositions(p).some((s) => s === 'C' || s === 'PF') ? 0.25 : 0;
    return Math.max(0.05, Math.min(0.75, 0.12 + athletic * 0.45 + big));
};

/* ------------------------------------------------------------------ */
/* Plays, step by step.                                                */
/* ------------------------------------------------------------------ */
// A play is a few steps between the half-court set and the shot. Each step is
// where the five stand and who has the ball; a step can hand the ball on (a
// pass), set a screen, or leave a defender caught on one. The defense is
// worked out from the offense (guard), so every play gets help defense and
// closeouts for free.
interface Step {
    f: number; // fraction of the possession
    off: Spot[];
    handler: number;
    /** Passes the ball, arriving with the next step's handler. */
    pass?: boolean;
    lob?: boolean;
    screener?: number;
    /** Defenders caught on a screen over the leg INTO this step. */
    screened?: number[];
    /** Fixed defense (the free-throw line-up), instead of guard(). */
    def?: Spot[];
}

const place = (spots: Spot[], changes: { [i: number]: Spot }): Spot[] => spots.map((s, i) => changes[i] ?? s);
const nudge = (s: Spot, r: number): Spot => ({ ax: s.ax + (Math.random() * 2 - 1) * r, az: s.az + (Math.random() * 2 - 1) * r });

/** Where this shot goes up from, for this shooter in this play. */
const shotSpotFor = (play: WatchPlay, shooter: number, kind: 1 | 2 | 3): Spot => {
    if (kind === 1) return FT_SPOT;
    if (play === 'iso') {
        // The star works one side: a step-back, a pull-up, or all the way in.
        const m = isoSide(shooter);
        if (kind === 3) return nudge({ ax: 19.5, az: 14 * m }, 0.8);
        return Math.random() < 0.7 ? nudge({ ax: 37, az: 4.5 * m }, 0.6) : nudge({ ax: 29, az: 10 * m }, 1);
    }
    if (kind === 3) {
        // Wings take a share of their threes from the corner.
        if ((shooter === 1 || shooter === 2) && Math.random() < 0.3) return CORNER[shooter - 1];
        return nudge(THREE_SPOT[shooter], 0.8);
    }
    return Math.random() < 0.7 ? nudge(RIM_SPOT[shooter], 0.5) : nudge(MID_SPOT[shooter], 1);
};

/**
 * The steps of `play` after the half-court set, up to (not including) the
 * gather, plus whether a pass into the shooter counts for an assist.
 */
const playSteps = (play: WatchPlay, shooter: number, kind: 1 | 2 | 3): { steps: Step[]; assistable: boolean } => {
    if (kind === 1) {
        // A free throw: the shooter on the line, two of his on the second
        // lane spaces, two back behind the arc; the defense on the blocks and
        // the third spaces, his own man up top.
        const others = [0, 1, 2, 3, 4].filter((i) => i !== shooter);
        const offSpots: { [i: number]: Spot } = { [shooter]: FT_SPOT };
        const defSpots: Spot[] = [];
        const lane: Spot[] = [{ ax: 36.3, az: 8.9 }, { ax: 36.3, az: -8.9 }, { ax: 21, az: 14 }, { ax: 21, az: -14 }];
        const laneDef: Spot[] = [{ ax: 39.5, az: 8.9 }, { ax: 39.5, az: -8.9 }, { ax: 33.2, az: 8.9 }, { ax: 33.2, az: -8.9 }];
        others.forEach((i, k) => { offSpots[i] = lane[k]; defSpots[i] = laneDef[k]; });
        defSpots[shooter] = { ax: 17.5, az: 0 };
        return { steps: [{ f: 0.5, off: place(BASE_SET, offSpots), handler: shooter, def: defSpots }], assistable: false };
    }
    switch (play) {
        case 'pick_roll': {
            // The big comes up and sets it on the guard's man; the guard comes
            // off it going downhill while the big rolls (or pops, when he's the
            // one shooting the three) and the guard's man is left behind.
            const s2 = place(BASE_SET, { 0: { ax: 17, az: 1.5 }, 3: { ax: 29, az: 15 }, 4: { ax: 20.6, az: -3.2 } });
            const pullUp = shooter === 0 && kind === 3;
            const pop = shooter === 4 && kind === 3;
            const s3 = place(s2, {
                0: pullUp ? { ax: 19.5, az: -6 } : { ax: 24, az: -7 },
                4: pop ? { ax: 19, az: -2.5 } : { ax: 31, az: -2 },
            });
            return {
                steps: [
                    { f: 0.48, off: s2, handler: 0, screener: 4 },
                    { f: 0.62, off: s3, handler: 0, screened: [0] },
                ],
                assistable: true,
            };
        }
        case 'pindown': {
            // The shooting guard goes down to the block, the four sets a
            // pin-down on his man, and he curls up off it to the wing.
            const s2 = place(BASE_SET, { 0: { ax: 20, az: 2 }, 1: { ax: 38.5, az: -12 }, 3: { ax: 34.5, az: -15 }, 4: { ax: 36, az: 7 } });
            const s3 = place(s2, { 1: { ax: 30, az: -18.5 }, 3: { ax: 35.5, az: -14.5 } });
            return {
                steps: [
                    { f: 0.46, off: s2, handler: 0, screener: 3 },
                    { f: 0.6, off: s3, handler: 0, screened: [1] },
                ],
                assistable: true,
            };
        }
        case 'post_up': {
            // The big seals on the block, the guard feeds him from the wing,
            // and he backs his man down toward the rim.
            const s2 = place(BASE_SET, { 0: { ax: 26, az: -15 }, 1: CORNER[0], 3: { ax: 24, az: 9 }, 4: { ax: 37.5, az: -7 } });
            const s3 = place(s2, { 4: { ax: 37.5, az: -6.5 } });
            const s4 = place(s3, { 4: { ax: 39, az: -4.5 } });
            return {
                steps: [
                    { f: 0.46, off: s2, handler: 0, pass: true },
                    { f: 0.58, off: s3, handler: 4 },
                    { f: 0.7, off: s4, handler: 4 },
                ],
                assistable: true,
            };
        }
        case 'iso': {
            // Clear-out: the ball goes to the star on his own wing, the other
            // four empty that side (each to the nearest open spot), and he
            // sizes his man up before going.
            const star = shooter;
            const m = isoSide(star);
            const wing: Spot = { ax: 25, az: 14 * m };
            const weak: Spot[] = [{ ax: 19, az: -12 * m }, { ax: 35, az: -21.5 * m }, { ax: 40.5, az: -22.4 * m }, { ax: 36, az: -11 * m }];
            const clear: { [i: number]: Spot } = { [star]: wing };
            const left = [0, 1, 2, 3, 4].filter((i) => i !== star);
            // The guard who makes the entry pass hangs on to it until then.
            const entry = star !== 0;
            // The pairing with the least running (squared, so nobody gets the
            // cross-court trip): four men, four spots, 24 ways to pair them.
            const entrySpot: Spot = { ax: 19.5, az: -3 * m };
            const startOf = (i: number) => (entry && i === 0 ? entrySpot : BASE_SET[i]);
            let best: number[] = left;
            let bestCost = Infinity;
            const permute = (rest: number[], picked: number[]) => {
                if (rest.length === 0) {
                    const cost = picked.reduce((c, i, k) => c + (startOf(i).ax - weak[k].ax) ** 2 + (startOf(i).az - weak[k].az) ** 2, 0);
                    if (cost < bestCost) { bestCost = cost; best = picked; }
                    return;
                }
                rest.forEach((i) => permute(rest.filter((x) => x !== i), [...picked, i]));
            };
            permute(left, []);
            best.forEach((i, k) => { clear[i] = weak[k]; });
            const s2 = place(BASE_SET, entry ? { ...clear, 0: entrySpot } : clear);
            const s3 = place(BASE_SET, clear);
            const s4 = place(s3, { [star]: { ax: 25, az: 10 * m } });
            return {
                steps: [
                    { f: 0.48, off: s2, handler: 0, pass: entry },
                    { f: 0.58, off: s3, handler: star },
                    { f: 0.67, off: s4, handler: star },
                ],
                assistable: false,
            };
        }
    }
};

/** The side of the floor a star isolates on: his own (+1 = the +z side). */
const isoSide = (star: number) => (BASE_SET[star].az > 0 ? 1 : -1);

/** The farthest a shooter goes from the play's last step to his spot, ft. */
const MAX_CUT = 14;

/** Real-feet position of a spot in the world for the side attacking. */
const toWorld = (side: CourtSide, s: Spot): Vec2 => ({ x: dirOf(side) * s.ax, z: dirOf(side) * s.az });

interface BuildArgs {
    side: CourtSide;
    play: WatchPlay;
    start: number;
    duration: number;
    made: boolean;
    points: number;
    shotKind: 1 | 2 | 3;
    shooter: number;
    scorerName: string;
    /** A made finish at the rim is a dunk (dunkChance, rolled by the caller). */
    dunk: boolean;
}

const buildPossession = (args: BuildArgs): Possession & { assistable: boolean } => {
    const { side, play, start, duration, made, points, shotKind, shooter, scorerName } = args;
    const freeThrow = shotKind === 1;
    const w = (s: Spot) => toWorld(side, s);
    const at = (frac: number) => start + duration * frac;

    // --- the steps: bring it up, set up, run the play, get to the spot ---
    const { steps, assistable } = playSteps(play, shooter, shotKind);
    let spot = shotSpotFor(play, shooter, shotKind);
    // From where the play left him. A shooter already spotted up behind the
    // arc shoots from there; one who'd have to cross the floor to his spot
    // gets as far as a hard cut takes him (and settles for that shot).
    const from = steps[steps.length - 1].off[shooter];
    const fromRim = Math.hypot(HOOP_AX - from.ax, from.az);
    const travel = Math.hypot(spot.ax - from.ax, spot.az - from.az);
    if (shotKind === 3 && (fromRim >= 23.9 || (Math.abs(from.az) >= 22.2 && from.ax >= 33))) spot = from;
    else if (shotKind !== 1 && travel > MAX_CUT) {
        spot = { ax: from.ax + ((spot.ax - from.ax) * MAX_CUT) / travel, az: from.az + ((spot.az - from.az) * MAX_CUT) / travel };
    }
    const rimDist = Math.hypot(HOOP_AX - spot.ax, spot.az);
    let finish: Finish = shotKind === 2 && rimDist < RIM_RANGE ? 'layup' : 'shot';
    if (finish === 'layup' && made && args.dunk) finish = 'dunk';

    steps.unshift(
        { f: 0, off: TRANSITION_SET, handler: 0 },
        // The half-court set. This leg is generous (a third of the trip)
        // because it also carries everyone back from the other end after a
        // change of possession -- squeeze it and the full-court run comes out
        // at a sprint no human runs.
        { f: 0.34, off: BASE_SET, handler: 0 },
    );
    const last = steps[steps.length - 1];
    let passer: number | null = null;
    if (last.handler !== shooter) {
        // Whoever has it hits the shooter on his spot.
        last.pass = true;
        passer = last.handler;
    } else {
        for (let k = steps.length - 2; k >= 0; k--) {
            if (steps[k].pass && steps[k + 1].handler === shooter) { passer = steps[k].handler; break; }
        }
    }
    steps.push({ f: 0.78, off: place(last.off, { [shooter]: spot }), handler: shooter, def: last.def });

    // --- the beats: the steps with their defense ---
    const beats: Beat[] = [];
    let prevDef: Spot[] | null = null;
    steps.forEach((st, k) => {
        let def = st.def ?? guard(st.off, st.handler);
        if (st.screened && prevDef) {
            // Caught on the screen: a quarter of the way to where he wants to be.
            const pd = prevDef;
            def = def.map((d, i) => (st.screened!.includes(i)
                ? { ax: pd[i].ax + (d.ax - pd[i].ax) * 0.25, az: pd[i].az + (d.az - pd[i].az) * 0.25 }
                : d));
        }
        const isGather = k === steps.length - 1;
        if (isGather && !freeThrow) def = place(def, { [shooter]: closeout(spot) });
        prevDef = def;
        const holder = w(st.off[st.handler]);
        const next = steps[k + 1];
        const passDist = st.pass && next ? Math.hypot(next.off[next.handler].ax - st.off[st.handler].ax, next.off[next.handler].az - st.off[st.handler].az) : 0;
        beats.push({
            t: at(st.f),
            off: st.off.map(w),
            def: def.map(w),
            ball: { x: holder.x, y: CARRY_Y, z: holder.z },
            handler: st.handler,
            arc: st.pass ? (st.lob ? 3 : 1.2) : 0,
            pass: st.pass,
            screener: st.screener,
            real: st.pass ? passReal(passDist) : isGather ? gatherReal(finish, freeThrow) : undefined,
        });
    });

    // --- the shot ---
    const gather = beats[beats.length - 1];
    const hoop: Vec3 = { x: dirOf(side) * HOOP_AX, y: RIM_Y, z: 0 };
    const shooterAt = gather.off[shooter];
    const flightDist = Math.hypot(hoop.x - shooterAt.x, hoop.z - shooterAt.z);
    beats.push({
        t: at(0.86),
        off: gather.off,
        def: gather.def,
        ball: { x: shooterAt.x, y: RELEASE[finish].y, z: shooterAt.z },
        handler: null,
        arc: RELEASE[finish].arc(flightDist),
        release: true,
        real: flightReal(finish, flightDist),
    });

    // A layup or a dunk carries the shooter in under the rim with the ball.
    let rimOff = gather.off;
    if (finish !== 'shot') {
        const dx = HOOP_AX - spot.ax;
        const dz = -spot.az;
        const len = Math.hypot(dx, dz) || 1;
        const under = Math.max(0, len - 2.2);
        const glide = w({ ax: spot.ax + (dx / len) * under, az: spot.az + (dz / len) * under });
        rimOff = gather.off.map((p, i) => (i === shooter ? glide : p));
    }
    // A miss hits the iron: the front of the rim (short) or the back (long).
    let rimBall: Vec3 = hoop;
    if (!made) {
        const dx = shooterAt.x - hoop.x;
        const dz = shooterAt.z - hoop.z;
        const len = Math.hypot(dx, dz) || 1;
        const front = Math.random() < 0.55 ? 0.62 : -0.62;
        rimBall = { x: hoop.x + (dx / len) * front, y: RIM_Y + 0.25, z: hoop.z + (dz / len) * front + (Math.random() - 0.5) * 0.5 };
    }
    const shotAt = at(0.95);

    if (made) {
        beats.push({ t: shotAt, off: rimOff, def: gather.def, ball: hoop, handler: null, arc: 0 });
        // The aftermath. Bodies stay where the shot left them -- getting back
        // down the floor is the next trip's opening beat (see stitch). The ball
        // through the net is worked out in courtStateAt (madeDrop); this is
        // where it ends up.
        const endBall = madeDrop(side, (duration * 0.05) / NET_RATE);
        beats.push({ t: start + duration, off: rimOff, def: gather.def, ball: endBall, handler: null, arc: 0 });
    } else {
        // The carom: off the rim and out, five to eleven feet, and a defender
        // goes up and takes it -- the big most often -- while the offense's
        // big crashes. Before, the ball just rolled to a spot and the next trip
        // started with nobody having touched it.
        const rebounder = freeThrow
            ? (Math.random() < 0.5 ? [0, 1, 2, 3, 4].filter((i) => i !== shooter)[0] : [0, 1, 2, 3, 4].filter((i) => i !== shooter)[1])
            : (() => { const r = Math.random(); return r < 0.5 ? 4 : r < 0.8 ? 3 : Math.floor(Math.random() * 3); })();
        const angle = (Math.random() - 0.5) * 2.2;
        const out = 4.5 + Math.random() * 6;
        const carom: Spot = { ax: HOOP_AX - Math.cos(angle) * out, az: Math.sin(angle) * out };
        const defW = gather.def.map((p) => p);
        const boxOut = (p: Vec2, frac: number): Vec2 => {
            const c = w(carom);
            return { x: p.x + (c.x - p.x) * frac, z: p.z + (c.z - p.z) * frac };
        };
        const defRim = defW.map((p, i) => (i === rebounder ? boxOut(p, 0.6) : p));
        const defEnd = defW.map((p, i) => (i === rebounder ? w(carom) : p));
        const crasher = shooter === 4 ? 3 : 4;
        const crashSpot = w({ ax: carom.ax + 2, az: carom.az + (carom.az >= 0 ? -2 : 2) });
        // He crashes most of the way; the defender has the position.
        const crash = (p: Vec2, frac: number): Vec2 => ({ x: p.x + (crashSpot.x - p.x) * frac, z: p.z + (crashSpot.z - p.z) * frac });
        const offRim = rimOff.map((p, i) => (i === crasher ? crash(p, 0.5) : p));
        const offEnd = rimOff.map((p, i) => (i === crasher ? crash(p, 0.75) : p));
        beats.push({ t: shotAt, off: offRim, def: defRim, ball: rimBall, handler: null, arc: 2.8, rebounder });
        const c = w(carom);
        beats.push({ t: start + duration, off: offEnd, def: defEnd, ball: { x: c.x, y: 8.6, z: c.z }, handler: null, arc: 0 });
    }

    return {
        side, play, start, end: start + duration, made, points,
        shooter, passer, scorerName, assistName: null, shotAt, beats, finish,
        freeThrow: freeThrow || undefined,
        assistable: assistable && passer !== null && passer !== shooter,
    };
};

const GRAVITY = 32; // ft/s^2
const BALL_REST = 0.39;

/**
 * The ball after it drops through: caught by the net for an instant, then
 * free fall to the floor and a couple of bounces, drifting back out toward
 * the court. `real` is screen seconds since it reached the rim.
 */
const madeDrop = (side: CourtSide, real: number): Vec3 => {
    const d = dirOf(side);
    const x = d * (HOOP_AX - Math.min(2.4, real * 1.4));
    // The net holds it for its first ~0.15 s.
    const NET = 0.15;
    if (real < NET) return { x, y: RIM_Y - (real / NET) * 1.3, z: 0 };
    let y = RIM_Y - 1.3;
    let v = -7;
    let t = real - NET;
    for (let bounce = 0; bounce < 4; bounce++) {
        // Time to the floor from y at speed v (negative is down).
        const hit = (v + Math.sqrt(v * v + 2 * GRAVITY * (y - BALL_REST))) / GRAVITY;
        if (t < hit) return { x, y: y + v * t - 0.5 * GRAVITY * t * t, z: 0 };
        t -= hit;
        const impact = v - GRAVITY * hit;
        y = BALL_REST;
        v = -impact * 0.55;
    }
    return { x, y: BALL_REST, z: 0 };
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
     * the CPU plays it straight. */
    userSide: CourtSide;
    play: WatchPlay;
    /** Spends the timeout bonus on the user's side for this span. */
    timeout: boolean;
    /** Game 7 only: the user's emphasis for this quarter (TACTIC_META). */
    tactic?: LiveTactic | null;
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

    // The whole-game expectation split by period, nudged by what the user
    // called, floored so no quarter collapses.
    const { expectedPointsA, expectedPointsB } = computeExpectedPoints(home, away, players, coaches, true);
    const periodShare = quarter <= REGULATION_QUARTERS
        ? 1 / REGULATION_QUARTERS
        : OVERTIME_SECONDS / (REGULATION_SECONDS * REGULATION_QUARTERS);

    let selfDelta = meta.selfDelta;
    let oppDelta = meta.oppDelta;
    let tacticVariance = 0;
    if (timeout) selfDelta += TIMEOUT_BONUS;
    if (args.tactic) {
        const t = TACTIC_META[args.tactic];
        selfDelta += t.selfDelta;
        oppDelta += t.oppDelta;
        tacticVariance = t.variance;
    }

    const edge = (lineupEdge(home, 'fiveHome') - lineupEdge(away, 'fiveAway')) * MATCHUP_STRENGTH * periodShare;
    const deltaHome = (userSide === 'home' ? selfDelta : oppDelta) + edge;
    const deltaAway = (userSide === 'home' ? oppDelta : selfDelta) - edge;
    const variance = Math.max(4, LIVE_QUARTER_VARIANCE + meta.variance + tacticVariance);
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
            // Who passes to whom is the play's own (playSteps): the guard
            // hitting the roll man, the curl off the pin-down, the kick-out
            // from the post. A pass into the shooter is an assist most of the
            // time; an iso is his alone, and a free throw is never assisted.
            const { assistable, ...poss } = buildPossession({
                side: s, play: sidePlay, start: slot.start, duration: slot.duration, made,
                points: basket ? basket.points : 0, shotKind, shooter,
                scorerName: basket?.playerName ?? five.players[shooter]?.name ?? '',
                // A make at the rim is a dunk as often as the shooter's legs allow.
                dunk: made && Math.random() < dunkChance(players[five.players[shooter]?.playerId]),
            });
            if (made && assistable && poss.passer !== null && Math.random() < 0.62) {
                poss.assistName = five.players[poss.passer]?.name ?? null;
            }
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
/** What a body is doing this instant -- the 3D picks the animation from it. */
export type PlayerAction = 'dribble' | 'pass' | 'shot' | 'layup' | 'dunk' | 'contest' | 'screen' | 'rebound' | 'idle';

export interface PlayerState {
    playerId: string;
    name: string;
    slot: string;
    side: CourtSide;
    x: number;
    z: number;
    rotY: number;
    hasBall: boolean;
    /** Optional (PLANO-3D Etapa 4): the action, and how far into it (0-1). */
    action?: PlayerAction;
    actionT?: number;
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
    /** Bumped every time playback cuts past a stretch of the game (see
     * advanceClock). Bodies jump on a cut, so the camera snaps to the new spot
     * and the rigs don't read the jump as a sprint. Absent = never cuts. */
    cut?: number;
}

/* ------------------------------------------------------------------ */
/* Paths between beats.                                                */
/* ------------------------------------------------------------------ */
// Players used to ease in and out of every beat (smoothstep), so all ten
// stopped dead at each one and started again together: a formation changing
// shape, not people moving. Now each path is a curve through the beats with
// its speed carried across them (cubic Hermite, Catmull-Rom tangents), and a
// player only stops where he really stops: at either end of the trip, where a
// leg barely moves, or where he cuts back sharply (a plant, then go).
const segmentAt = (beats: Beat[], seconds: number) => {
    let i = 0;
    while (i < beats.length - 2 && beats[i + 1].t <= seconds) i++;
    return i;
};

type Pick = (b: Beat) => Vec2;
const ZERO: Vec2 = { x: 0, z: 0 };

/** Velocity through beat i, ft per game-second. */
const tangentAt = (beats: Beat[], i: number, pick: Pick): Vec2 => {
    if (i <= 0 || i >= beats.length - 1) return ZERO;
    const p0 = pick(beats[i - 1]);
    const p1 = pick(beats[i]);
    const p2 = pick(beats[i + 1]);
    const h0 = beats[i].t - beats[i - 1].t;
    const h1 = beats[i + 1].t - beats[i].t;
    if (h0 <= 1e-6 || h1 <= 1e-6) return ZERO;
    const d0x = (p1.x - p0.x) / h0;
    const d0z = (p1.z - p0.z) / h0;
    const d1x = (p2.x - p1.x) / h1;
    const d1z = (p2.z - p1.z) / h1;
    const s0 = Math.hypot(d0x, d0z);
    const s1 = Math.hypot(d1x, d1z);
    if (s0 < 0.4 || s1 < 0.4) return ZERO;
    // A cut of more than ~70 degrees is a plant: he stops and goes.
    if ((d0x * d1x + d0z * d1z) / (s0 * s1) < 0.35) return ZERO;
    let mx = (d0x + d1x) / 2;
    let mz = (d0z + d1z) / 2;
    // Never faster through the beat than the slower leg (no overshoot).
    const lim = Math.min(s0, s1);
    const m = Math.hypot(mx, mz);
    if (m > lim) { mx *= lim / m; mz *= lim / m; }
    return { x: mx, z: mz };
};

const pathAt = (beats: Beat[], i: number, u: number, pick: Pick): Vec2 => {
    const a = beats[i];
    const b = beats[Math.min(i + 1, beats.length - 1)];
    const pa = pick(a);
    const pb = pick(b);
    const h = b.t - a.t;
    if (h <= 1e-6) return pb;
    const ma = tangentAt(beats, i, pick);
    const mb = tangentAt(beats, i + 1, pick);
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    return {
        x: h00 * pa.x + h10 * h * ma.x + h01 * pb.x + h11 * h * mb.x,
        z: h00 * pa.z + h10 * h * ma.z + h01 * pb.z + h11 * h * mb.z,
    };
};

const offPick = (k: number): Pick => (b) => b.off[k];
const defPick = (k: number): Pick => (b) => b.def[k];

/* ------------------------------------------------------------------ */
/* Screen pacing -- the TV "compacto".                                 */
/* ------------------------------------------------------------------ */
// Played back at one fixed rate (9.6 game-seconds per real second), a trip up
// the floor -- 80 ft in ~5 game-seconds, a realistic ~26 ft/s sprint -- came
// out at ~250 ft/s on screen: ten bodies teleporting and a camera filming an
// empty floor (measured on the phone, 2026-10-07). No rate makes the WHOLE
// game both watchable and short: real speed is 48 minutes a game.
//
// So playback edits it like a broadcast package. Each trip is picked up as
// the offense arrives and is settling into its set (the tail of the run, at a
// plausible speed), plays at a readable rate through the shot, and holds a
// beat on the ball through the net. The run up the floor before that is a CUT.
// The opponent's trips are picked up later, as their play starts: the user's
// own offense is what he called and wants to see. Score, clock and results
// are untouched -- this only decides how fast the plan's own seconds go by.
//
// The rate is set per beat, not fixed: a beat where the shooter sprints 40 ft
// to his spot plays slower than one where the set just shifts, so no body ever
// moves faster on screen than SCREEN_SPRINT, and the quiet beats go by quickly.
// A ball in the air plays at its own real speed (Beat.real).
/** Top on-screen speed of any player, ft per real second (a real sprint is
 * ~25-30; a broadcast package tolerates a little more). */
export const SCREEN_SPRINT = 34;
/** Game-seconds per real second when little is moving -- the ceiling. */
const SHOW_RATE_MAX = 3.6;
/** Fraction of a trip where the screen picks it up: the user's offense... */
const SHOW_FROM_OWN = 0.3;
/** ...and the opponent's, as their play starts (the first screen or entry). */
const SHOW_FROM_THEIRS = 0.42;
/** After a make, the ball dropping through the net: ~1 real second. */
const NET_RATE = 0.75;
/** After a miss, the carom and the rebound: ~half a real second. */
const MISS_RATE = 1.5;

// Fastest any of the ten moves over a leg, in game ft/s, sampled along the
// curves.
const SAMPLES = 10;
const beatPeakSpeed = (beats: Beat[], i: number): number => {
    const a = beats[i];
    const b = beats[i + 1];
    const span = b.t - a.t;
    if (span <= 0) return 0;
    let peak = 0;
    for (let k = 0; k < a.off.length; k++) {
        for (const pick of [offPick(k), defPick(k)]) {
            let prev = pathAt(beats, i, 0, pick);
            for (let s = 1; s <= SAMPLES; s++) {
                const cur = pathAt(beats, i, s / SAMPLES, pick);
                peak = Math.max(peak, Math.hypot(cur.x - prev.x, cur.z - prev.z));
                prev = cur;
            }
        }
    }
    return (peak * SAMPLES * 1.04) / span;
};

// Game-seconds per real second for the stretch of `p` containing `t`, and
// where that stretch ends.
const showRate = (p: Possession, t: number): [number, number] => {
    const beats = p.beats;
    const i = segmentAt(beats, t);
    if (t >= p.shotAt) {
        // The carom: the rebounder still can't outrun the sprint limit.
        const peak = beatPeakSpeed(beats, i);
        const base = p.made ? NET_RATE : MISS_RATE;
        return [peak > 0 ? Math.min(base, SCREEN_SPRINT / peak) : base, p.end];
    }
    const a = beats[i];
    const b = beats[i + 1];
    const until = Math.min(b.t, p.shotAt);
    const peak = beatPeakSpeed(beats, i);
    let rate = peak > 0 ? Math.min(SHOW_RATE_MAX, SCREEN_SPRINT / peak) : SHOW_RATE_MAX;
    if (a.real) rate = Math.min(rate, (b.t - a.t) / a.real);
    return [rate, until > t ? until : p.shotAt];
};

/**
 * The playback rate (game-seconds per real second) at `t` -- what a replay
 * slows down from.
 */
export const playbackRate = (plan: QuarterPlan, t: number): number => {
    const p = possessionAt(plan, t);
    if (!p || t >= p.end) return SHOW_RATE_MAX;
    return showRate(p, t)[0];
};

/**
 * The stretch of a trip worth replaying: from partway into the leg before
 * the gather (the pass or the drive that set it up) to the ball through the
 * net. Seconds into the quarter.
 */
export const replayWindow = (p: Possession): { from: number; to: number } => {
    const ri = p.beats.findIndex((b) => b.release);
    const gather = p.beats[Math.max(0, ri - 1)];
    const before = p.beats[Math.max(0, ri - 2)];
    return {
        from: Math.max(p.start, gather.t - (gather.t - before.t) * 0.6),
        to: p.shotAt + (p.end - p.shotAt) * 0.8,
    };
};

export interface ClockStep {
    seconds: number;
    /** True when this step jumped over part of the game. */
    cut: boolean;
}

export const advanceClock = (
    plan: QuarterPlan, seconds: number, realDt: number,
    opts: { speed: number; userSide: CourtSide },
): ClockStep => {
    let t = seconds;
    let budget = realDt;
    let cut = false;
    // A frame can cross a boundary (shot, end of trip, a cut) -- a handful of
    // passes covers any frame time the screen allows (dt is capped at 0.1 s).
    for (let pass = 0; pass < 8 && budget > 1e-9; pass++) {
        const p = possessionAt(plan, t);
        if (!p || t >= p.end) {
            // Past the last planned trip (the quarter's tail): plain playback.
            return { seconds: t + budget * SHOW_RATE_MAX * opts.speed, cut };
        }
        const from = p.start + (p.end - p.start) * (p.side === opts.userSide ? SHOW_FROM_OWN : SHOW_FROM_THEIRS);
        if (t < from) {
            t = from;
            cut = true;
            continue;
        }
        const [rate, until] = showRate(p, t);
        const r = rate * opts.speed;
        const need = (until - t) / r;
        if (need > budget) {
            t += budget * r;
            budget = 0;
        } else {
            t = until;
            budget -= need;
        }
    }
    return { seconds: t, cut };
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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
    const i = segmentAt(beats, seconds);
    const a = beats[i];
    const b = beats[Math.min(i + 1, beats.length - 1)];
    const raw = b.t > a.t ? (seconds - a.t) / (b.t - a.t) : 1;
    const u = Math.max(0, Math.min(1, raw));

    const offPos = a.off.map((_, k) => pathAt(beats, i, u, offPick(k)));
    const defPos = a.def.map((_, k) => pathAt(beats, i, u, defPick(k)));

    // Who has it right now: nobody while a pass or a shot is in the air.
    const holder = a.pass ? null : a.handler;
    let ball: BallState;
    if (holder !== null) {
        // In his hands -- the 3D puts it in the dribbling hand (Court3D).
        ball = { x: offPos[holder].x, y: CARRY_Y, z: offPos[holder].z, inFlight: false };
    } else if (poss.made && seconds >= poss.shotAt) {
        ball = { ...madeDrop(poss.side, (seconds - poss.shotAt) / NET_RATE), inFlight: true };
    } else {
        ball = {
            x: lerp(a.ball.x, b.ball.x, u),
            y: lerp(a.ball.y, b.ball.y, u) + Math.sin(Math.PI * u) * a.arc,
            z: lerp(a.ball.z, b.ball.z, u),
            inFlight: true,
        };
    }

    // The trip's own fives when the plan recorded them (it always does now);
    // the caller's are the fallback for a plan built before substitutions.
    const fh = poss.fiveHome ?? fiveHome;
    const fa = poss.fiveAway ?? fiveAway;
    const offFive = poss.side === 'home' ? fh : fa;
    const defFive = poss.side === 'home' ? fa : fh;

    // Actions, read off the beat in progress:
    //  - the shot spans the gather (the beat before release) and the flight:
    //    0-0.4 gathering and rising, 0.4 the release, 0.4-1 the ball to the rim;
    //  - the man guarding the shooter contests over the same window (not on a
    //    free throw);
    //  - a pass, a screen and the rebound are the legs that carry them.
    const releaseIdx = beats.findIndex((bt) => bt.release);
    const shotT = i === releaseIdx - 1 ? 0.4 * u : i === releaseIdx ? 0.4 + 0.6 * u : -1;
    const finish: Finish = poss.finish ?? 'shot';
    const actionOf = (idx: number, isOffense: boolean, hasBall: boolean): [PlayerAction, number] => {
        if (shotT >= 0 && idx === poss.shooter) {
            if (isOffense) return [finish, shotT];
            if (!poss.freeThrow) return ['contest', shotT];
        }
        if (isOffense && a.pass && idx === a.handler) return ['pass', u];
        if (isOffense && a.screener === idx) return ['screen', u];
        if (!isOffense && a.rebounder === idx) return ['rebound', u];
        if (isOffense && hasBall) return ['dribble', u];
        return ['idle', 0];
    };

    const hoopX = dirOf(poss.side) * HOOP_AX;
    const build = (five: FiveOnCourt, pos: Vec2[], isOffense: boolean): PlayerState[] =>
        five.players.map((p, idx) => {
            const { x, z } = pos[idx];
            const hasBall = isOffense && holder === idx;
            // The ball handler squares up to the rim he's attacking; everyone
            // else -- teammates and defenders alike -- turns to the ball.
            const face = hasBall ? { x: hoopX, z: 0 } : { x: ball.x, z: ball.z };
            const [action, actionT] = actionOf(idx, isOffense, hasBall);
            return {
                playerId: p.playerId,
                name: p.name,
                slot: p.slot,
                side: five.side,
                x,
                z,
                rotY: Math.atan2(face.x - x, face.z - z),
                hasBall,
                action,
                actionT,
            };
        });

    const offense = build(offFive, offPos, true);
    const defense = build(defFive, defPos, false);

    return {
        players: poss.side === 'home' ? [...offense, ...defense] : [...defense, ...offense],
        ball,
        possession: poss.side,
        handlerName: holder !== null ? offFive.players[holder]?.name ?? null : null,
        play: poss.play,
    };
};
