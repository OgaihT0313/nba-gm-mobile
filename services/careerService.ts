import type { Player, Team, Awards, PlayerCareer, SeasonAwardRecord } from '../types';

type PlayerMap = { [key: string]: Player };

// League lifecycle: career accumulation, run once per offseason from
// handleStartNewSeason in App.tsx, before runPlayerProgression and
// processOffseasonContracts. Must be folded in before handleStartSeason wipes
// seasonStats.
//
// Retirement is its own step, right after aging (retirementService); a
// retired player keeps his career here for the records and the Hall of Fame.

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
    add(c.dpoy, 'Defensor do Ano');
    add(c.allStar, 'All-Star');
    add(c.allNba, 'All-NBA');
    add(c.roy, 'Calouro do Ano');
    add(c.smoy, 'Sexto Homem');
    add(c.mip, 'Maior Evolução');
    return parts.join(' · ');
};

/**
 * Ids on the championship roster of the season that just ended, used to credit
 * career titles. Reads the champion's roster as it stood at the final buzzer.
 */
export const championRosterOf = (teams: Team[], record: SeasonAwardRecord | undefined): string[] => {
    if (!record?.championId) return [];
    return teams.find(t => t.id === record.championId)?.roster || [];
};
