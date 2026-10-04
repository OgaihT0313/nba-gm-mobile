// Career milestones: the third piece of the press/storyline layer.
//
// Same test as everything else in it -- a story is only worth telling if it
// changes something the simulation reads:
//
//   · the night he gets there, the player's morale jumps (MILESTONE_MORALE);
//   · a veteran CHASING one -- within a season of his next big number -- puts
//     off retirement (retirementService reads chasingMilestone). The way Vince
//     Carter played until 43: the record keeps him in the league, and on your
//     roster.
//
// Counted off REAL careers: pipeline/sync_careers.py seeds every player's
// actual totals (`career.seeded`), so LeBron's next mark is 45,000 points.
// A career with no seed -- an era save, where totals start at zero -- would
// produce fake milestones, so only seeded careers and players drafted inside
// the save (whose whole career is in it) count.
//
// Nothing goes through `season.events`. Milestones reached are kept on
// `season.milestones` and read by the headlines (headlineService.ts).

import type { Player, SeasonState } from '../types';

export type MilestoneStat = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'gp';

/** The marks, per stat. The `big` ones are worth playing another year for. */
export const MILESTONES: Record<MilestoneStat, { marks: number[]; big: number; label: string; per: (s: NonNullable<Player['seasonStats']>) => number }> = {
    pts: { marks: [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000], big: 20000, label: 'pontos', per: s => s.ppg },
    reb: { marks: [5000, 7500, 10000, 12500, 15000], big: 10000, label: 'rebotes', per: s => s.rpg },
    ast: { marks: [3000, 5000, 7500, 10000, 12500], big: 7500, label: 'assistências', per: s => s.apg },
    stl: { marks: [1000, 1500, 2000, 2500], big: 1500, label: 'roubos de bola', per: s => s.spg },
    blk: { marks: [1000, 1500, 2000, 2500], big: 1500, label: 'tocos', per: s => s.bpg },
    gp: { marks: [1000, 1250, 1500], big: 1250, label: 'jogos', per: () => 1 },
};
const STATS = Object.keys(MILESTONES) as MilestoneStat[];

/** Morale lift on the night he gets there. */
export const MILESTONE_MORALE = 10;

/** Games of his current pace that still count as "within reach" for a veteran. */
const CHASE_GAMES = 70;
/** How much a chase cuts his retirement odds. */
export const CHASE_RETIREMENT_FACTOR = 0.35;

/** Does this player's career count for milestones? */
export const countsMilestones = (p: Player): boolean => !!p.career?.seeded || !!p.draftInfo;

/**
 * Career total right now: banked seasons plus the one in progress. `banked`
 * when the season has already been folded into `career` (the offseason, from
 * accumulateCareers until opening night wipes seasonStats) -- counting it
 * again there would double the year.
 */
export const liveTotal = (p: Player, stat: MilestoneStat, banked = false): number => {
    const career = p.career?.[stat] ?? 0;
    const s = p.seasonStats;
    if (banked || !s || !s.gp) return career;
    const bankedTotal = career;
    return bankedTotal + (stat === 'gp' ? s.gp : Math.round(MILESTONES[stat].per(s) * s.gp));
};

/** The next mark he has not reached, if any. */
export const nextMark = (p: Player, stat: MilestoneStat, banked = false): number | undefined =>
    MILESTONES[stat].marks.find(m => m > liveTotal(p, stat, banked));

export const formatMark = (stat: MilestoneStat, value: number): string =>
    `${value.toLocaleString('pt-BR')} ${MILESTONES[stat].label}`;

export type Milestone = NonNullable<SeasonState['milestones']>[number];

/**
 * Marks crossed between two states of the league. Takes both sides because
 * reaching one is a DIFFERENCE, like an injury in decisionService.
 */
export const milestonesCrossed = (
    before: { [k: string]: Player }, after: { [k: string]: Player }, teamOf: Map<string, string>, day: number,
): Milestone[] => {
    const out: Milestone[] = [];
    for (const id in after) {
        const p = after[id];
        const was = before[id];
        if (!was || !p.seasonStats || p.retired || !countsMilestones(p)) continue;
        STATS.forEach(stat => {
            const from = liveTotal(was, stat);
            const to = liveTotal(p, stat);
            const mark = MILESTONES[stat].marks.find(m => from < m && to >= m);
            if (mark) out.push({ playerId: id, name: p.name, teamId: teamOf.get(id), stat, value: mark, day });
        });
    }
    return out;
};

/**
 * The big mark a veteran is within a season of, judged at the pace of the
 * season he just played -- the reason he is not retiring yet. Read in the
 * offseason, after that season is banked into `career`.
 */
export const chasingMilestone = (p: Player): { stat: MilestoneStat; mark: number; gap: number } | undefined => {
    if (!countsMilestones(p) || !p.seasonStats?.gp) return undefined;
    for (const stat of STATS) {
        const mark = nextMark(p, stat, true);
        if (!mark || mark < MILESTONES[stat].big) continue;
        const gap = mark - liveTotal(p, stat, true);
        if (gap <= MILESTONES[stat].per(p.seasonStats) * CHASE_GAMES) return { stat, mark, gap };
    }
    return undefined;
};

/**
 * A milestone he is about to reach this season, at his current pace: within
 * `games` games. For the headlines.
 */
export const approaching = (p: Player, games: number): { stat: MilestoneStat; mark: number; gap: number } | undefined => {
    if (!countsMilestones(p) || !p.seasonStats?.gp || p.retired) return undefined;
    let best: { stat: MilestoneStat; mark: number; gap: number; games: number } | undefined;
    for (const stat of STATS) {
        const mark = nextMark(p, stat);
        const pace = MILESTONES[stat].per(p.seasonStats);
        if (!mark || pace <= 0) continue;
        const gap = mark - liveTotal(p, stat);
        const g = gap / pace;
        if (g <= games && (!best || mark / MILESTONES[stat].big > best.mark / MILESTONES[best.stat].big)) best = { stat, mark, gap, games: g };
    }
    return best && { stat: best.stat, mark: best.mark, gap: best.gap };
};

/**
 * The mark he will reach soonest, at this season's pace (or his career
 * average before he has played). For the player card.
 */
export const nextMilestone = (p: Player): { stat: MilestoneStat; mark: number; gap: number; games: number } | undefined => {
    if (!countsMilestones(p) || p.retired) return undefined;
    const c = p.career;
    let best: { stat: MilestoneStat; mark: number; gap: number; games: number } | undefined;
    for (const stat of STATS) {
        const mark = nextMark(p, stat);
        if (!mark) continue;
        const pace = p.seasonStats?.gp
            ? MILESTONES[stat].per(p.seasonStats)
            : stat === 'gp' ? 1 : (c && c.gp ? (c[stat] as number) / c.gp : 0);
        if (pace <= 0) continue;
        const gap = mark - liveTotal(p, stat);
        const games = Math.ceil(gap / pace);
        if (!best || games < best.games) best = { stat, mark, gap, games };
    }
    return best;
};
