import type { Team, ScheduleGame } from '../types';

const GAMES_PER_SEASON = 82;
// Real NBA schedules weight conference play heavily (roughly 52 of 82 games
// are intra-conference, ~63%) — this is a soft target, not an exact fixture
// design (real schedules also fix "4 games vs 3 division rivals" etc., which
// would need a much heavier combinatorial scheduler for a payoff the user
// never sees directly). The greedy generator below chases these targets
// per-opponent, so most pairs land close to the real 3-4 (intra) / 2 (inter)
// range without solving the full constraint-satisfaction problem.
const INTRA_CONF_SHARE = 0.63;

const pairKey = (a: string, b: string) => (a < b ? `${a}::${b}` : `${b}::${a}`);

// Generates a full 82-game schedule for the given teams: every team plays
// exactly once per day (30 teams → 15 games/day × 82 days = 1230 games total),
// weighted so conference opponents are faced more often than the other
// conference, and home games are balanced close to 41/41 per team. This
// replaces the old "shuffle all 30 teams and pair randomly every day" approach
// — critically, it also means a fixture list exists ahead of time, so
// head-to-head and conference-record tiebreakers can be computed from real
// recorded results instead of not existing at all.
export const generateSchedule = (teams: Team[]): ScheduleGame[] => {
    const ids = teams.map(t => t.id);
    const confOf = new Map(teams.map(t => [t.id, t.conference]));
    const conferenceSize = new Map<string, number>();
    teams.forEach(t => conferenceSize.set(t.conference, (conferenceSize.get(t.conference) || 0) + 1));

    // Soft per-opponent game target: spread the intra/inter split evenly
    // across a team's conference-mates and non-conference opponents.
    const targetFor = (teamId: string, oppId: string): number => {
        const sameConf = confOf.get(teamId) === confOf.get(oppId);
        const confMates = (conferenceSize.get(confOf.get(teamId)!) || 15) - 1;
        const otherConfTeams = ids.length - 1 - confMates;
        return sameConf
            ? (GAMES_PER_SEASON * INTRA_CONF_SHARE) / Math.max(1, confMates)
            : (GAMES_PER_SEASON * (1 - INTRA_CONF_SHARE)) / Math.max(1, otherConfTeams);
    };

    const gamesPlayed = new Map<string, number>(); // pairKey -> count so far
    const homeCount = new Map<string, number>(ids.map(id => [id, 0]));
    const schedule: ScheduleGame[] = [];

    for (let day = 1; day <= GAMES_PER_SEASON; day++) {
        const available = new Set(ids);
        // Randomize processing order each day so the same team doesn't always
        // get first pick of opponent (which would bias who gets favorable
        // matchup timing).
        const order = [...ids].sort(() => Math.random() - 0.5);

        for (const teamId of order) {
            if (!available.has(teamId)) continue;
            available.delete(teamId);

            // Pick the available opponent with the highest remaining need
            // relative to their soft target (ties broken by a little
            // randomness so the schedule isn't perfectly deterministic).
            let bestOpp: string | null = null;
            let bestScore = -Infinity;
            for (const oppId of available) {
                const key = pairKey(teamId, oppId);
                const need = targetFor(teamId, oppId) - (gamesPlayed.get(key) || 0);
                const score = need + Math.random() * 0.75;
                if (score > bestScore) {
                    bestScore = score;
                    bestOpp = oppId;
                }
            }
            if (bestOpp === null) continue; // even team count guarantees this never happens
            available.delete(bestOpp);

            const key = pairKey(teamId, bestOpp);
            gamesPlayed.set(key, (gamesPlayed.get(key) || 0) + 1);

            // Home game goes to whoever has fewer home games banked so far,
            // nudging every team toward an even ~41/41 split by season end.
            const teamHome = homeCount.get(teamId)!;
            const oppHome = homeCount.get(bestOpp)!;
            const homeTeamId = teamHome <= oppHome ? teamId : bestOpp;
            const awayTeamId = homeTeamId === teamId ? bestOpp : teamId;
            homeCount.set(homeTeamId, homeCount.get(homeTeamId)! + 1);

            schedule.push({ day, homeTeamId, awayTeamId, played: false });
        }
    }

    return schedule;
};

// --- Tiebreaker helpers, derived from recorded schedule results ---

export const headToHead = (schedule: ScheduleGame[], teamA: string, teamB: string): { w: number; l: number } => {
    let w = 0, l = 0;
    for (const g of schedule) {
        if (!g.played) continue;
        if (g.homeTeamId === teamA && g.awayTeamId === teamB) {
            if ((g.homeScore || 0) > (g.awayScore || 0)) w++; else l++;
        } else if (g.awayTeamId === teamA && g.homeTeamId === teamB) {
            if ((g.awayScore || 0) > (g.homeScore || 0)) w++; else l++;
        }
    }
    return { w, l };
};

export const conferenceRecord = (schedule: ScheduleGame[], teamId: string, teams: Team[]): { w: number; l: number } => {
    const confOf = new Map(teams.map(t => [t.id, t.conference]));
    const myConf = confOf.get(teamId);
    let w = 0, l = 0;
    for (const g of schedule) {
        if (!g.played) continue;
        let opp: string | null = null;
        let won = false;
        if (g.homeTeamId === teamId) { opp = g.awayTeamId; won = (g.homeScore || 0) > (g.awayScore || 0); }
        else if (g.awayTeamId === teamId) { opp = g.homeTeamId; won = (g.awayScore || 0) > (g.homeScore || 0); }
        if (opp && confOf.get(opp) === myConf) { if (won) w++; else l++; }
    }
    return { w, l };
};

// Real NBA-style tiebreak chain, simplified to what this app's data supports:
// 1) win%, 2) head-to-head (only meaningful pairwise, which is exactly how
// Array.sort calls a comparator), 3) conference record, 4) point differential
// (ppg - oppg, already tracked in team.stats). Division record and the
// "games back in a group of 3+ tied teams" wrinkles from the real NBA rulebook
// don't apply cleanly here (no divisions in this data model) so are skipped.
// Returns negative when `a` should rank above `b`, matching Array.sort's
// comparator convention.
export const compareStandings = (a: Team, b: Team, schedule: ScheduleGame[], teams: Team[]): number => {
    const wpA = (a.wins || 0) / Math.max(1, (a.wins || 0) + (a.losses || 0));
    const wpB = (b.wins || 0) / Math.max(1, (b.wins || 0) + (b.losses || 0));
    if (Math.abs(wpA - wpB) > 1e-9) return wpB - wpA;

    const h2h = headToHead(schedule, a.id, b.id);
    if (h2h.w !== h2h.l) return h2h.l - h2h.w;

    const confA = conferenceRecord(schedule, a.id, teams);
    const confB = conferenceRecord(schedule, b.id, teams);
    const confWpA = confA.w + confA.l > 0 ? confA.w / (confA.w + confA.l) : 0;
    const confWpB = confB.w + confB.l > 0 ? confB.w / (confB.w + confB.l) : 0;
    if (Math.abs(confWpA - confWpB) > 1e-9) return confWpB - confWpA;

    const diffA = (a.stats?.ppg || 0) - (a.stats?.oppg || 0);
    const diffB = (b.stats?.ppg || 0) - (b.stats?.oppg || 0);
    return diffB - diffA;
};

export const sortStandings = (teams: Team[], schedule: ScheduleGame[]): Team[] =>
    [...teams].sort((a, b) => compareStandings(a, b, schedule, teams));
