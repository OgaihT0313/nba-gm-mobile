// Type-only so this module can also be exercised directly by node
// (--experimental-strip-types) in a harness — see the pattern note in
// careerService.ts / draftService.ts.
import type { Team, Coach, Event } from '../types';

// A head coach's three attributes sit on the same 60-99 scale as player
// ratings. offense/defense feed small bounded scoring modifiers (see
// coachOffenseMod/coachDefenseMod, wired into simulateGame); development
// speeds up how fast young players on the roster progress (see
// buildDevelopmentBonusMap, wired into runPlayerProgression). None of the
// three ever touch a player's own rating directly.

const COACH_STYLES: NonNullable<Team['style']>[] = [
    'Pace and Space', 'Grit and Grind', 'Balanced', 'Run and Gun', 'Defense First',
];

const FIRST_NAMES = [
    'Mike', 'Steve', 'Doc', 'Erik', 'Nick', 'Tyronn', 'Quin', 'Chauncey',
    'Ime', 'Jason', 'Will', 'Taylor', 'Charles', 'Joe', 'Frank', 'Billy',
    'Monty', 'Wes', 'J.B.', 'Darvin', 'Kenny', 'Mark', 'Chris', 'Adrian',
];
const LAST_NAMES = [
    'Malone', 'Kerr', 'Rivers', 'Spoelstra', 'Nurse', 'Lue', 'Snyder', 'Billups',
    'Udoka', 'Kidd', 'Hardy', 'Jenkins', 'Lee', 'Mazzulla', 'Vogel', 'Donovan',
    'Williams', 'Unseld', 'Bickerstaff', 'Ham', 'Atkinson', 'Daigneault', 'Finch', 'Griffin',
];

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Ids are name-derived off a small first x last space, exactly like prospect
// ids in draftService.ts — collisions are near-certain over a long save, so
// `usedIds` MUST be seeded with every coach id already in play (initCoaches /
// the offseason replacement path both do this) or a repeat would silently
// overwrite the map entry for a currently-employed coach.
const makeCoachId = (name: string, usedIds: Set<string>): string => {
    let id = '';
    for (let attempt = 0; ; attempt++) {
        const base = 'coach_' + name.toLowerCase().replace(/[^a-z]+/g, '_');
        id = attempt < 12 ? base : `${base}_${attempt}`;
        if (!usedIds.has(id)) break;
    }
    usedIds.add(id);
    return id;
};

// `quality` is 0 (replacement-level) to 1 (elite) and controls where the three
// attributes land, each rolled independently so a coach can be, say, a strong
// offensive mind on a mediocre defensive staff. Age skews younger for lower
// quality (up-and-comers) and older for elite (established names).
export const generateCoach = (usedIds: Set<string>, quality: number, name?: string): Coach => {
    const q = clamp(quality, 0, 1);
    const coachName = name ?? `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const rollAttr = () => clamp(Math.round(62 + q * 30 + rand(-6, 6)), 55, 99);
    return {
        id: makeCoachId(coachName, usedIds),
        name: coachName,
        age: randInt(38, 45) + Math.round(q * 15),
        offense: rollAttr(),
        defense: rollAttr(),
        development: rollAttr(),
        style: pick(COACH_STYLES),
    };
};

// Overall read used for sorting/gating — no single number drives the sim
// (offense/defense/development are read independently), this is purely a
// "how good is this guy" summary for UI and candidate selection.
export const reputation = (coach: Coach): number =>
    Math.round((coach.offense + coach.defense + coach.development) / 3);

// A stable, roster-independent read of how good a job this is, the same role
// `powerRank` already plays elsewhere in the sim (draft order, Cup pots, trade
// thresholds) despite not being recomputed mid-season — reused here rather
// than inventing a second strength metric. 1 = best job in the league.
const jobQuality = (team: Team): number => clamp((30 - team.powerRank) / 29, 0, 1);

// Builds the league's starting coaching staffs from the flavor names already
// in data/teams.json (team.coach), rolling attributes correlated to how good
// the job is — a contender tends to have hired a proven coach, a lottery team
// often hasn't. Sets Team.coachId; the raw `coach` string on Team is no longer
// read anywhere once this has run (see coachOf in constants.ts).
export const initCoaches = (teams: Team[]): { coaches: { [key: string]: Coach }; teams: Team[] } => {
    const coaches: { [key: string]: Coach } = {};
    const usedIds = new Set<string>();
    const newTeams = teams.map((team) => {
        const quality = clamp(jobQuality(team) + rand(-0.2, 0.2), 0.05, 0.98);
        const coach = generateCoach(usedIds, quality, team.coach);
        coaches[coach.id] = coach;
        return { ...team, coachId: coach.id };
    });
    return { coaches, teams: newTeams };
};

// How well a coach's scheme matches the team he's actually running. 1 = perfect
// match, down to 0.35 for a philosophical mismatch (a Defense First guy forced
// to run Run and Gun). Scales every coaching effect below — a great coach stuck
// in the wrong system underperforms his own numbers, which is the whole point
// of tracking `style` on both Coach and Team instead of just a single rating.
const STYLE_GROUP: Record<NonNullable<Team['style']>, 'uptempo' | 'defensive' | 'balanced'> = {
    'Pace and Space': 'uptempo',
    'Run and Gun': 'uptempo',
    'Grit and Grind': 'defensive',
    'Defense First': 'defensive',
    'Balanced': 'balanced',
};

export const coachFit = (coach: Coach, team: Team): number => {
    const teamStyle = team.style ?? 'Balanced';
    if (coach.style === teamStyle) return 1;
    const a = STYLE_GROUP[coach.style];
    const b = STYLE_GROUP[teamStyle];
    if (a === 'balanced' || b === 'balanced') return 0.75;
    return a === b ? 0.6 : 0.35;
};

const clampMod = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

// Bounded team-level scoring nudges (points), on the same modest scale as the
// construction/chemistry modifiers in simulationService.ts — texture, not a
// talent override. A coach rated 75 (roughly league-average) contributes ~0.
export const coachOffenseMod = (coach: Coach | undefined, team: Team): number => {
    if (!coach) return 0;
    return clampMod((coach.offense - 75) * 0.08 * coachFit(coach, team), -3, 3);
};
export const coachDefenseMod = (coach: Coach | undefined, team: Team): number => {
    if (!coach) return 0;
    return clampMod((coach.defense - 75) * 0.08 * coachFit(coach, team), -3, 3);
};

// Multiplier applied to a young player's development opportunity in
// runPlayerProgression. 75 development (average) is neutral (1.0); a 99 dev
// coach at full fit tops out around 1.29, a 55 at full fit bottoms around
// 0.84 — meaningful over a career, never enough to make a bad prospect a star
// on its own.
export const developmentMultiplier = (coach: Coach | undefined, team: Team): number => {
    if (!coach) return 1;
    return clamp(1 + ((coach.development - 75) / 100) * coachFit(coach, team), 0.75, 1.3);
};

// One multiplier per rostered player, precomputed once per offseason so
// runPlayerProgression (which only knows about players, not teams/coaches)
// can stay a pure function of `players` + this map.
export const buildDevelopmentBonusMap = (
    teams: Team[],
    coaches: { [key: string]: Coach },
): { [playerId: string]: number } => {
    const map: { [playerId: string]: number } = {};
    teams.forEach((team) => {
        const coach = team.coachId ? coaches[team.coachId] : undefined;
        const mult = developmentMultiplier(coach, team);
        team.roster.forEach((pId) => { map[pId] = mult; });
    });
    return map;
};

// Candidate pool for hiring — regenerated fresh every time the user opens the
// hire screen (not persisted in SeasonState, same "compute on open" pattern as
// MyTeamHub's rival picker). Skews toward the team's own job quality but keeps
// real variance, so a rebuild can occasionally lure a name coach and a
// contender can get stuck choosing among retreads.
export const generateCandidates = (
    team: Team,
    coaches: { [key: string]: Coach },
    count = 4,
): Coach[] => {
    const usedIds = new Set(Object.keys(coaches));
    const base = jobQuality(team);
    const list: Coach[] = [];
    for (let i = 0; i < count; i++) {
        const quality = clamp(base + rand(-0.35, 0.35), 0.05, 0.98);
        list.push(generateCoach(usedIds, quality));
    }
    return list;
};

export const fireCoach = (coaches: { [key: string]: Coach }, team: Team): { [key: string]: Coach } => {
    if (!team.coachId || !coaches[team.coachId]) return coaches;
    const next = { ...coaches };
    delete next[team.coachId];
    return next;
};

export const hireCoach = (coaches: { [key: string]: Coach }, coach: Coach): { [key: string]: Coach } => ({
    ...coaches,
    [coach.id]: coach,
});

// Offseason pass: every coach ages a year; past 60 there's a rising chance he
// retires, forcing an automatic replacement — an informational event, never
// blocking (the user can always fire the replacement immediately from the
// coaching panel if unhappy). Players have no retirement system at all; this
// is coach-only. Coaches have no persisted history either (nothing else
// references one by id once he's off a roster), so a retirement is just a
// removal + a fresh hire, no career bookkeeping needed.
export const ageCoachesAndRetire = (
    teams: Team[],
    coaches: { [key: string]: Coach },
): { coaches: { [key: string]: Coach }; teams: Team[]; events: Event[] } => {
    const next: { [key: string]: Coach } = { ...coaches };
    const usedIds = new Set(Object.keys(coaches));
    const events: Event[] = [];

    const newTeams = teams.map((team) => {
        if (!team.coachId || !next[team.coachId]) return team;
        const coach = { ...next[team.coachId], age: next[team.coachId].age + 1 };
        next[coach.id] = coach;

        const retireChance =
            coach.age < 60 ? 0 :
            coach.age < 65 ? 0.06 :
            coach.age < 70 ? 0.18 :
            coach.age < 75 ? 0.4 : 1;

        if (Math.random() < retireChance) {
            delete next[coach.id];
            const replacement = generateCoach(usedIds, clamp(jobQuality(team) + rand(-0.2, 0.2), 0.05, 0.95));
            next[replacement.id] = replacement;
            events.push({
                message: `🎓 ${coach.name} (${coach.age}) se aposentou do comando do ${team.name}. ${replacement.name} assume o time.`,
                type: 'info',
            });
            return { ...team, coachId: replacement.id };
        }
        return team;
    });

    return { coaches: next, teams: newTeams, events };
};
