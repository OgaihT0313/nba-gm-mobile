import type { Player, Team, Event, Awards, PlayerCareer, SeasonAwardRecord } from '../types';

type PlayerMap = { [key: string]: Player };

// League lifecycle: career accumulation + retirement. Both run once per
// offseason, from handleStartNewSeason in App.tsx, in this order:
//
//   accumulateCareers  (credit the season just played, at the age it was played)
//   runPlayerProgression  (ages +1, OVR moves)
//   rollRetirements    (judged on the NEW age and the post-progression OVR)
//   processOffseasonContracts
//
// Careers must be folded in before handleStartSeason wipes seasonStats, and
// retirement must run after progression so the decline that triggers it is the
// one the player is actually carrying into next season.

const EMPTY_CAREER: PlayerCareer = {
    seasons: 0, gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, peakOvr: 0,
    titles: 0, mvp: 0, dpoy: 0, roy: 0, smoy: 0, mip: 0, allStar: 0, allNba: 0, finalsMvp: 0,
};

/**
 * Folds the just-finished season into every player's career totals. seasonStats
 * are per-game averages, so they're multiplied back out by games played to get
 * totals. Players who never logged a game are left untouched (no phantom
 * seasons for a DNP scrub or an undrafted prospect), but peakOvr still tracks.
 */
export const accumulateCareers = (
    players: PlayerMap,
    championRoster: string[],
    awards: Awards | null,
    finalsMvpId: string | undefined,
    allStarIds: string[],
): PlayerMap => {
    const champions = new Set(championRoster);
    const allStars = new Set(allStarIds);
    const allNbaIds = new Set((awards?.allNba || []).flat());

    const updated: PlayerMap = {};
    for (const id in players) {
        const p = players[id];
        const career: PlayerCareer = { ...EMPTY_CAREER, ...(p.career || {}) };
        career.peakOvr = Math.max(career.peakOvr, p.ovr);

        const s = p.seasonStats;
        if (s && s.gp > 0) {
            career.seasons += 1;
            career.gp += s.gp;
            career.pts += Math.round(s.ppg * s.gp);
            career.reb += Math.round(s.rpg * s.gp);
            career.ast += Math.round(s.apg * s.gp);
            career.stl += Math.round(s.spg * s.gp);
            career.blk += Math.round(s.bpg * s.gp);

            if (champions.has(id)) career.titles += 1;
            if (allStars.has(id)) career.allStar += 1;
            if (allNbaIds.has(id)) career.allNba += 1;
            if (finalsMvpId === id) career.finalsMvp += 1;
            if (awards?.mvp === id) career.mvp += 1;
            if (awards?.dpoy === id) career.dpoy += 1;
            if (awards?.roy === id) career.roy += 1;
            if (awards?.smoy === id) career.smoy += 1;
            if (awards?.mip === id) career.mip += 1;
        }

        updated[id] = { ...p, career };
    }
    return updated;
};

// --- RETIREMENT ---

// Age is the engine, but not the whole story: a star hangs on well past the age
// a fringe rotation player would, and anyone who didn't get off the bench is far
// likelier to walk away. Tuned so the league sheds roughly as many players per
// offseason as the 30-man draft class adds, keeping the pool stable across a
// long save instead of inflating every year.
const RETIREMENT_START_AGE = 32;

const ovrFactor = (ovr: number): number => {
    if (ovr >= 85) return 0.35; // MVP-caliber: plays until the body quits
    if (ovr >= 78) return 0.6;
    if (ovr >= 70) return 0.9;
    if (ovr >= 65) return 1.2;
    return 1.6;
};

// Exported so the curve can be exercised directly (balance is the whole game
// here: shed roughly a 30-man class per offseason, or the league pool drifts).
export const retirementChance = (p: Player): number => {
    const mpg = p.seasonStats?.mpg ?? 0;
    const playedLastSeason = (p.seasonStats?.gp ?? 0) > 0;

    // Fringe washout: a low-rated veteran who couldn't crack a rotation is out
    // of the league well before the age curve would catch him.
    if (p.age >= 28 && p.age < RETIREMENT_START_AGE && p.ovr <= 64 && mpg < 5) return 0.35;
    if (p.age < RETIREMENT_START_AGE) return 0;

    let chance = Math.pow(p.age - (RETIREMENT_START_AGE - 1), 1.8) * 0.028;
    chance *= ovrFactor(p.ovr);

    // Falling off a cliff rather than fading — accelerates the decision.
    const decline = (p.ovrLastSeason ?? p.ovr) - p.ovr;
    if (decline >= 4) chance *= 1.4;

    // No role left. Either buried, or nobody signed him at all last season.
    if (!playedLastSeason) chance *= 1.8;
    else if (mpg < 10) chance *= 1.3;

    if (p.age >= 43) return 1;
    if (p.age >= 41) chance = Math.max(chance, 0.75);
    return Math.min(0.95, chance);
};

// Per-game averages re-derived from career totals, for display.
export const careerAverages = (c: PlayerCareer) => {
    const per = (total: number) => (c.gp > 0 ? total / c.gp : 0);
    return { ppg: per(c.pts), rpg: per(c.reb), apg: per(c.ast), spg: per(c.stl), bpg: per(c.blk) };
};

// The honors line for a retirement headline / career panel, e.g.
// "2× campeão · 1× MVP · 8× All-Star". Empty when a player won nothing.
export const honorsSummary = (c: PlayerCareer): string => {
    const parts: string[] = [];
    const add = (n: number, label: string) => { if (n > 0) parts.push(`${n}× ${label}`); };
    add(c.titles, 'campeão');
    add(c.mvp, 'MVP');
    add(c.finalsMvp, 'MVP das Finais');
    add(c.dpoy, 'DPOY');
    add(c.allStar, 'All-Star');
    add(c.allNba, 'All-NBA');
    add(c.roy, 'Novato do Ano');
    add(c.smoy, '6º Homem');
    add(c.mip, 'MIP');
    return parts.join(' · ');
};

/**
 * Rolls retirement for every rostered player and every unsigned free agent.
 * Retirees are removed from rosters (and from any fixed-starter slot) but kept
 * in the players map — ids in award history and draft records must never dangle.
 */
export const rollRetirements = (
    players: PlayerMap,
    teams: Team[],
    seasonNumber: number,
): { players: PlayerMap; teams: Team[]; retiredIds: string[]; events: Event[] } => {
    const updated: PlayerMap = {};
    for (const id in players) updated[id] = players[id];

    const retiredIds: string[] = [];
    const events: Event[] = [];

    for (const id in players) {
        const p = players[id];
        if (p.retired) continue;
        if (Math.random() >= retirementChance(p)) continue;

        updated[id] = { ...p, retired: true, retiredSeason: seasonNumber, contractYears: 0 };
        retiredIds.push(id);

        const c = p.career;
        const seasons = c?.seasons ?? 0;
        if (c && seasons > 0) {
            const avg = careerAverages(c);
            const honors = honorsSummary(c);
            const line = `${avg.ppg.toFixed(1)} PPG, ${avg.rpg.toFixed(1)} RPG, ${avg.apg.toFixed(1)} APG em ${seasons} ${seasons === 1 ? 'temporada' : 'temporadas'}`;
            events.push({
                message: `🎬 APOSENTADORIA: ${p.name} (${p.age}) encerrou a carreira — ${line}${honors ? `. ${honors}` : ''}.`,
                type: 'retire',
            });
        } else {
            // Never logged a season — quietly out of the league, not a ceremony.
            events.push({ message: `${p.name} (${p.age}) deixou a NBA sem encontrar espaço na liga.`, type: 'info' });
        }
    }

    if (retiredIds.length === 0) return { players: updated, teams, retiredIds, events };

    const gone = new Set(retiredIds);
    const newTeams = teams.map(team => {
        if (!team.roster.some(id => gone.has(id))) return team;
        const roster = team.roster.filter(id => !gone.has(id));
        let starters = team.starters;
        if (starters) {
            const kept: { [pos: string]: string } = {};
            for (const pos in starters) {
                if (!gone.has(starters[pos])) kept[pos] = starters[pos];
            }
            starters = kept;
        }
        return { ...team, roster, starters };
    });

    // Headline first, so the offseason feed leads with the count.
    events.unshift({
        message: `📋 ${retiredIds.length} ${retiredIds.length === 1 ? 'jogador se aposentou' : 'jogadores se aposentaram'} nesta offseason.`,
        type: 'retire',
    });

    return { players: updated, teams: newTeams, retiredIds, events };
};

/**
 * Ids on the championship roster of the season that just ended, used to credit
 * career titles. Reads the champion's roster as it stood at the final buzzer.
 */
export const championRosterOf = (teams: Team[], record: SeasonAwardRecord | undefined): string[] => {
    if (!record?.championId) return [];
    return teams.find(t => t.id === record.championId)?.roster || [];
};
