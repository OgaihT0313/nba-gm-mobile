// Rivalries and revenge games: the second piece of the press/storyline layer.
//
// Same test as personality and the press conference: a story only earns its
// place if it changes a number the simulation reads. Here:
//
//   · REVENGE. A player who changed teams gets a hot night (+REVENGE_BOOST, the
//     same playerStatusEffects the engine already rolls for streaks) the first
//     time he faces his old team. It cuts both ways: the star you traded away
//     comes back to hurt you, the one you signed away from a rival goes off for
//     you. Who changed teams is DERIVED -- a roster snapshot compared each day
//     -- so every way a player can move (your trades, CPU deadline deals, free
//     agency, waivers, real offseason moves) is covered by one place.
//
//   · RIVALRIES, for the user's franchise. Heat builds from what actually
//     happened between two teams: a playoff elimination (in either direction)
//     and games decided by a basket. Past RIVAL_HEAT the games mean more:
//     beating a rival lifts the rotation's morale and momentum, losing to one
//     stings. Heat cools every offseason, so a rivalry has to be fed.
//
// Nothing is announced through `season.events` (50 slots, 6 rendered, hundreds
// pushed per offseason). The next-game card on the season screen says what is
// at stake before the game; TeamDetail says who your rivals are.

import type { Player, SeasonState, Team, ScheduleGame, PlayoffState } from '../types';

/** OVR added for one game when a player faces the team he left. */
export const REVENGE_BOOST = 4;
/** Below this, nobody writes the "returns to face his old team" story. */
export const REVENGE_MIN_OVR = 74;
/** A move this many seasons old is no longer a story. */
const REVENGE_WINDOW = 1;

/** Heat at which a team becomes a rival. */
export const RIVAL_HEAT = 3;
const MAX_HEAT = 10;
/** A game decided by this many points or fewer. */
const CLOSE_MARGIN = 5;
const HEAT_CLOSE_GAME = 1;
const HEAT_KNOCKED_OUT_BY = 3;
const HEAT_KNOCKED_OUT = 2;
/** Fraction of heat that survives an offseason. */
const HEAT_CARRY = 0.5;

/** What a rivalry game does to the user's rotation. */
export const RIVAL_WIN_MORALE = 4;
export const RIVAL_LOSS_MORALE = -3;

type Players = { [k: string]: Player };
export type Rivalries = NonNullable<SeasonState['rivalries']>;

const seasonNumber = (season: SeasonState) => season.awardHistory.length;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* -------------------------------------------------------------------------- */
/* Who moved                                                                   */
/* -------------------------------------------------------------------------- */

export const snapshotRosters = (teams: Team[]): Record<string, string> => {
    const snap: Record<string, string> = {};
    teams.forEach(t => t.roster.forEach(id => { snap[id] = t.id; }));
    return snap;
};

/**
 * Compare today's rosters with the last snapshot and stamp `formerTeam` on
 * everyone who changed teams since. Mutates `players` (the runner's own deep
 * clone) and returns the new snapshot. With no snapshot yet -- a fresh save --
 * nobody moved; the real offseason's moves come baked into players.json.
 */
export const trackMoves = (
    snapshot: Record<string, string> | undefined, teams: Team[], players: Players, seasonNo: number,
): Record<string, string> => {
    const now = snapshotRosters(teams);
    if (!snapshot) return now;
    for (const id in now) {
        const was = snapshot[id];
        if (was && was !== now[id] && players[id]) {
            players[id] = { ...players[id], formerTeam: { teamId: was, season: seasonNo } };
        }
    }
    return now;
};

/** Is `p`, today, a player with a score to settle against `opponentId`? */
export const hasRevengeAgainst = (p: Player | undefined, opponentId: string, seasonNo: number): boolean =>
    !!p && !!p.formerTeam && !p.formerTeam.faced
    && p.formerTeam.teamId === opponentId
    && p.ovr >= REVENGE_MIN_OVR
    && seasonNo - p.formerTeam.season <= REVENGE_WINDOW;

/** Everyone in this matchup who is facing his old team, best first. */
export const revengePlayers = (season: SeasonState, a: Team, b: Team): Player[] => {
    const n = seasonNumber(season);
    const of = (t: Team, other: Team) => t.roster
        .map(id => season.players[id])
        .filter(p => hasRevengeAgainst(p, other.id, n) && !t.playerAbsences?.[p.id]);
    return [...of(a, b), ...of(b, a)].sort((x, y) => y.ovr - x.ovr);
};

/**
 * Hand every revenge player in `games` his hot night. One game long: the
 * runner's daily tick removes it after the games are played. Applied the night
 * BEFORE (so the live game screen, which plays before the runner, sees it)
 * and again on the day itself for day one; a player already carrying a status
 * effect keeps his.
 */
export const applyRevengeNights = (games: ScheduleGame[], teams: Team[], players: Players, seasonNo: number) => {
    games.forEach(g => {
        const home = teams.find(t => t.id === g.homeTeamId);
        const away = teams.find(t => t.id === g.awayTeamId);
        if (!home || !away) return;
        [[home, away], [away, home]].forEach(([t, other]) => {
            t.roster.forEach(id => {
                if (!hasRevengeAgainst(players[id], other.id, seasonNo)) return;
                if (t.playerStatusEffects?.[id]) return;
                t.playerStatusEffects = { ...(t.playerStatusEffects ?? {}), [id]: { type: 'hot', duration: 1, ovrChange: REVENGE_BOOST } };
            });
        });
    });
};

/** After the game: the story is told once. */
export const markRevengeFaced = (game: ScheduleGame, teams: Team[], players: Players, seasonNo: number) => {
    const home = teams.find(t => t.id === game.homeTeamId);
    const away = teams.find(t => t.id === game.awayTeamId);
    if (!home || !away) return;
    [[home, away], [away, home]].forEach(([t, other]) => {
        t.roster.forEach(id => {
            const p = players[id];
            if (p?.formerTeam && p.formerTeam.teamId === other.id && !p.formerTeam.faced
                && seasonNo - p.formerTeam.season <= REVENGE_WINDOW) {
                players[id] = { ...p, formerTeam: { ...p.formerTeam, faced: true } };
            }
        });
    });
};

/* -------------------------------------------------------------------------- */
/* Rivalries                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * At most this many rivals at once: the hottest. A franchise with six rivals
 * has none -- seen in measurement before the cap, on a team that played a lot
 * of close games.
 */
export const MAX_RIVALS = 3;

export const isRival = (rivalries: Rivalries | undefined, teamId: string): boolean => {
    const mine = rivalries?.[teamId];
    if (!mine || mine.heat < RIVAL_HEAT) return false;
    // Hotter first; ties go to the one with a playoff story, then by id so
    // the answer never flickers between renders.
    const ahead = Object.entries(rivalries!).filter(([id, r]) => id !== teamId && (
        r.heat > mine.heat
        || (r.heat === mine.heat && !!r.why && !mine.why)
        || (r.heat === mine.heat && !!r.why === !!mine.why && id < teamId)
    )).length;
    return ahead < MAX_RIVALS;
};

/**
 * Why they are rivals, in one line: the playoff series if there was one,
 * otherwise this season's close games, otherwise history.
 */
export const rivalryReason = (r: Rivalries[string]): string =>
    r.why ?? (r.close ? `${r.close} ${r.close === 1 ? 'jogo decidido' : 'jogos decididos'} por ${CLOSE_MARGIN} pontos ou menos nesta temporada`
        : 'rivalidade de temporadas passadas');

const addHeat = (r: Rivalries, teamId: string, heat: number, why?: string): Rivalries => {
    const cur = r[teamId] ?? { heat: 0 };
    return { ...r, [teamId]: { ...cur, heat: clamp(cur.heat + heat, 0, MAX_HEAT), why: why ?? cur.why } };
};

/**
 * A user game just finished. Close games feed the rivalry; a game against a
 * rival moves the rotation's morale and the team's momentum. Mutates the
 * runner's clones and returns the new rivalry map.
 */
export const settleUserGame = (
    rivalries: Rivalries | undefined, userTeam: Team, opponentId: string, won: boolean, margin: number,
    players: Players, rotation: string[],
): Rivalries => {
    let r = rivalries ?? {};
    // Rival status is judged BEFORE tonight's heat: the game that makes them
    // rivals is the reason, the next one is the first that feels like it.
    if (isRival(r, opponentId)) {
        const delta = won ? RIVAL_WIN_MORALE : RIVAL_LOSS_MORALE;
        rotation.forEach(id => {
            const p = players[id];
            if (p) players[id] = { ...p, morale: clamp(Math.round((p.morale ?? 70) + delta), 0, 100) };
        });
        if (won) userTeam.momentum = Math.min(3, (userTeam.momentum ?? 0) + 1);
    }
    if (margin <= CLOSE_MARGIN) {
        const close = (r[opponentId]?.close ?? 0) + 1;
        r = addHeat(r, opponentId, HEAT_CLOSE_GAME);
        r = { ...r, [opponentId]: { ...r[opponentId], close } };
    }
    return r;
};

const ROUND_LABEL: Record<string, string> = {
    round1: 'na 1ª rodada', round2: 'na semifinal de conferência', round3: 'na final de conferência', finals: 'nas Finais',
};

/** Every playoff series the user played, with who won it. */
const userSeries = (playoff: PlayoffState | null | undefined, userId: string) => {
    if (!playoff) return [];
    const out: { round: string; opponentId: string; won: boolean }[] = [];
    (['east', 'west'] as const).forEach(conf => {
        (['round1', 'round2', 'round3'] as const).forEach(round => {
            playoff[conf].bracket[round].forEach(s => {
                const ids = s.m.map(t => t?.id);
                if (!s.w || !ids.includes(userId)) return;
                const opp = ids.find(id => id && id !== userId);
                if (opp) out.push({ round, opponentId: opp, won: s.w.id === userId });
            });
        });
    });
    const f = playoff.finals;
    if (f?.w && f.m.some(t => t?.id === userId)) {
        const opp = f.m.find(t => t && t.id !== userId);
        if (opp) out.push({ round: 'finals', opponentId: opp.id, won: f.w.id === userId });
    }
    return out;
};

/**
 * The offseason's rivalry update: last spring's playoff series add heat, then
 * everything cools. A team that knocked you out stays a rival into next
 * season (4 * 0.5 + whatever was there); one fed by nothing else fades.
 */
export const rivalriesAfterSeason = (
    rivalries: Rivalries | undefined, playoff: PlayoffState | null | undefined, userId: string, seasonLabel: string,
): Rivalries | undefined => {
    // Cool what the regular season built first, THEN add the playoffs: a
    // fresh elimination carries into next season at full strength, and the
    // close-game count starts over.
    let r: Rivalries = {};
    for (const id in rivalries ?? {}) {
        const heat = Math.floor(rivalries![id].heat * HEAT_CARRY);
        if (heat > 0) r[id] = { heat, why: rivalries![id].why };
    }
    userSeries(playoff, userId).forEach(s => {
        r = s.won
            ? addHeat(r, s.opponentId, HEAT_KNOCKED_OUT, `você eliminou eles ${ROUND_LABEL[s.round]} (${seasonLabel})`)
            : addHeat(r, s.opponentId, HEAT_KNOCKED_OUT_BY, `eliminou você ${ROUND_LABEL[s.round]} (${seasonLabel})`);
    });
    return Object.keys(r).length ? r : undefined;
};
