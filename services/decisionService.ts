// The decision queue: the moments the season stops and asks the GM something.
//
// Measured before this existed, an 82-game season asked the user for a decision
// about twice — two trade offers, and nothing else. The simulation underneath
// was already producing plenty worth deciding about (a starter out for a month,
// a rotation falling apart, a deadline arriving with you out of the race); none
// of it ever reached the player as a choice. This module is the surface that
// turns simulated state into gameplay.
//
// Pure and React-free, like seasonRunner — that is what lets the whole thing be
// exercised headlessly (see scripts/check_decisions.ts), which is how the
// frequency budget below is enforced rather than guessed at.

import type { Decision, DecisionOption, Player, SeasonState, Team } from '../types';
import { getPlayerPositions, getTeamSalary } from '../constants';
import { simulationEngine, ROTATION_MIN, DEFAULT_ROTATION_SIZE } from './simulationService';
import { getFreeAgents, signFreeAgentLegality, evaluateSigningInterest, newContractYears } from './freeAgencyService';

/**
 * How long a starter has to be out before covering the hole is a real decision.
 *
 * Six is rollInjury's own tier boundary ("estiramento" or worse) and the same
 * line the events feed draws for what counts as a real absence, so the two
 * agree on what is worth telling you about.
 *
 * It started at ten, restricted to the starting five, and measured 2.1
 * decisions a season -- half the 4-8 budget the whole design rests on. That
 * budget is the constraint that matters: a queue interrupting twenty times a
 * year is worse than one that never interrupts, and one that interrupts twice
 * is the game we already had. scripts/check_decisions.ts gates on it.
 */
const INJURY_COVER_MIN_GAMES = 6;

/** A young player worth handing a starting job to. */
const PROSPECT_MAX_AGE = 24;

const money = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;

const teamOf = (season: SeasonState, id: string): Team | undefined =>
    season.teams.find(t => t.id === id);

/**
 * Build the "cover the absence" decision for a rotation player who just went
 * down. Every option leans on a system that already exists and none of them is
 * free: rushing him back costs load (and therefore the odds he breaks again),
 * promoting a kid costs strength now, shortening the rotation spreads that load
 * onto everyone left, and signing costs cap room.
 */
const buildInjuryCover = (
    season: SeasonState, team: Team, hurt: Player, games: number, wasStarter: boolean,
): Decision => {
    const options: DecisionOption[] = [];
    const positions = getPlayerPositions(hurt);

    // --- 1. rush him back -----------------------------------------------------
    // Always available, and the sharpest trade-off of the four: half the games
    // missed, paid for in load. `load` is what injuryRisk reads, so pushing it
    // up genuinely raises the odds he breaks down again -- the sim does the
    // punishing, this option just takes the gamble.
    options.push({
        id: 'rush',
        label: 'Apressar o retorno',
        detail: `Tratamento agressivo: volta em ~${Math.ceil(games / 2)} jogos em vez de ${games}.`,
        consequence: 'Carga alta e risco real de recair',
    });

    // --- 2. sign a free agent -------------------------------------------------
    // Added ONLY when somebody is genuinely signable, never as a dead button.
    // In-season that is usually nobody: every player in data/players.json starts
    // on a roster and the median roster is 18, which is MAX_ROSTER_SIZE, so the
    // market is empty until waivers or an undrafted class fills it. The option
    // exists for the saves where it is not.
    const fa = getFreeAgents(season.teams, season.players)
        .filter(p => getPlayerPositions(p).some(pos => positions.includes(pos)))
        .find(p =>
            signFreeAgentLegality(team, p, season.players).legal
            && evaluateSigningInterest(p, team, season.teams, season.players).willing);
    if (fa) {
        options.push({
            id: `sign:${fa.id}`,
            label: `Assinar ${fa.name}`,
            detail: `${fa.pos} · ${fa.ovr} OVR · ${fa.age} anos. Tapa o buraco hoje.`,
            consequence: `+${money(fa.salary)} na folha`,
        });
    }

    // --- 3. hand the job to a young player ------------------------------------
    const youngster = team.roster
        .map(id => season.players[id])
        .filter(p => p && p.id !== hurt.id && p.age <= PROSPECT_MAX_AGE && !team.playerAbsences?.[p.id])
        .filter(p => getPlayerPositions(p).some(pos => positions.includes(pos)))
        .sort((a, b) => (b.potential.charCodeAt(0) < a.potential.charCodeAt(0) ? 1 : -1) || b.ovr - a.ovr)[0];
    if (!youngster) {
        options.push({
            id: 'promote:none', label: 'Promover um jovem', detail: 'Nenhum jovem da posição no elenco.',
            disabled: true, disabledReason: 'Ninguém com até 24 anos joga essa posição no seu elenco.',
        });
    } else {
        options.push({
            id: `promote:${youngster.id}`,
            label: `Promover ${youngster.name}`,
            detail: `${youngster.age} anos · ${youngster.ovr} OVR · potencial ${youngster.potential}. Os minutos desenvolvem.`,
            consequence: 'Time mais fraco agora, jogador melhor depois',
        });
    }

    // --- 4. shorten the rotation ----------------------------------------------
    const size = team.rotationSize ?? DEFAULT_ROTATION_SIZE;
    options.push({
        id: 'shorten',
        label: 'Encurtar a rotação',
        detail: `${size} → ${size - 1} jogadores. Os titulares restantes absorvem os minutos.`,
        consequence: 'Mais carga e mais risco de lesão em quem sobrou',
        disabled: size <= ROTATION_MIN,
        disabledReason: `A rotação já está no mínimo de ${ROTATION_MIN}.`,
    });

    // --- 5. the always-available no-op ------------------------------------------
    // Every decision needs one enabled option or the queue deadlocks and the
    // season can never advance again.
    options.push({
        id: 'ride',
        label: 'Seguir como está',
        detail: 'O banco cobre. Aguenta até ele voltar.',
    });

    return {
        id: `injury_cover:${hurt.id}:${season.gamesPlayed}`,
        kind: 'injury_cover',
        day: season.gamesPlayed,
        subjectId: hurt.id,
        headline: `${hurt.name} fora por ${games} jogos`,
        body: `${hurt.name} (${hurt.ovr} OVR) ${wasStarter ? 'era titular' : 'era peça da rotação'} e desfalca o ${team.name} por ${games} jogos. `
            + `A folha está em ${money(getTeamSalary(team, season.players))}. Como você cobre?`,
        options,
    };
};

/**
 * Look at what just happened and raise any decisions it warrants.
 *
 * Takes both sides of the tick because "a starter just got hurt" is a
 * DIFFERENCE, not a state: the absence map alone cannot say whether the injury
 * happened tonight or three weeks ago, and the lineup read has to come from
 * BEFORE the injury (afterwards he is already filtered out of it).
 */
export const generateDecisions = (before: SeasonState, after: SeasonState): Decision[] => {
    const out: Decision[] = [];
    const teamBefore = teamOf(before, before.userTeamId);
    const teamAfter = teamOf(after, after.userTeamId);
    if (!teamBefore || !teamAfter) return out;

    const wasOut = new Set(Object.keys(teamBefore.playerAbsences ?? {}));
    const startingFive = new Set(
        simulationEngine.getLineup(teamBefore, before.players).slots
            .map(s => s.playerId)
            .filter((id): id is string => !!id),
    );
    // The whole rotation, not just the five: losing your seventh man for a month
    // is still minutes somebody has to absorb, and restricting this to starters
    // left the queue at half its budget.
    const rotation = new Set(
        simulationEngine.getTeamRotation(
            teamBefore, before.players, teamBefore.rotationSize ?? DEFAULT_ROTATION_SIZE),
    );

    Object.entries(teamAfter.playerAbsences ?? {}).forEach(([pId, absence]) => {
        if (wasOut.has(pId)) return;                       // not new tonight
        if (absence.reason !== 'injury') return;
        if (absence.duration < INJURY_COVER_MIN_GAMES) return;
        if (!rotation.has(pId)) return;                    // deep bench: nobody notices
        const hurt = after.players[pId];
        if (!hurt) return;
        out.push(buildInjuryCover(after, teamAfter, hurt, absence.duration, startingFive.has(pId)));
    });

    return out;
};

/**
 * Apply the chosen option and drop the decision from the queue.
 *
 * The option id carries its own target (`sign:<playerId>`, `promote:<playerId>`)
 * rather than an index, because decisions live in the save: an index would rot
 * the moment anything about the roster changed between raising and answering.
 *
 * Returns the season unchanged if the decision or option is gone, so a double
 * tap or a stale id can never corrupt a save.
 */
export const resolveDecision = (season: SeasonState, decisionId: string, optionId: string): SeasonState => {
    const decision = (season.decisions ?? []).find(d => d.id === decisionId);
    if (!decision) return season;
    const option = decision.options.find(o => o.id === optionId);
    if (!option || option.disabled) return season;

    const rest = (season.decisions ?? []).filter(d => d.id !== decisionId);
    const team = teamOf(season, season.userTeamId);
    if (!team) return { ...season, decisions: rest };

    const sortByOvr = (roster: string[], players: { [k: string]: Player }) =>
        [...roster].sort((a, b) => (players[b]?.ovr || 0) - (players[a]?.ovr || 0));

    const [action, targetId] = optionId.split(':');

    if (action === 'sign' && targetId) {
        const player = season.players[targetId];
        // Re-checked at resolution, not trusted from generation time: the
        // player may have signed elsewhere while the decision sat in the queue.
        if (!player || team.roster.includes(targetId)) return { ...season, decisions: rest };
        if (!signFreeAgentLegality(team, player, season.players).legal) return { ...season, decisions: rest };
        if (!evaluateSigningInterest(player, team, season.teams, season.players).willing) return { ...season, decisions: rest };
        const players = { ...season.players, [targetId]: { ...player, contractYears: newContractYears(player) } };
        return {
            ...season,
            decisions: rest,
            players,
            teams: season.teams.map(t =>
                t.id === team.id ? { ...t, roster: sortByOvr([...t.roster, targetId], players) } : t),
        };
    }

    if (action === 'promote' && targetId) {
        const player = season.players[targetId];
        if (!player || !team.roster.includes(targetId)) return { ...season, decisions: rest };
        // Pin him to the slot the injured player vacated, which is what makes
        // this different from just letting the sim pick a replacement: the job
        // is his until the GM says otherwise, so the minutes (and therefore the
        // development) actually land on him.
        const hurt = decision.subjectId ? season.players[decision.subjectId] : undefined;
        const slot = hurt
            ? getPlayerPositions(hurt).find(pos => getPlayerPositions(player).includes(pos))
            : getPlayerPositions(player)[0];
        if (!slot) return { ...season, decisions: rest };
        return {
            ...season,
            decisions: rest,
            teams: season.teams.map(t =>
                t.id === team.id ? { ...t, starters: { ...(t.starters ?? {}), [slot]: targetId } } : t),
        };
    }

    if (action === 'rush') {
        const absence = team.playerAbsences?.[decision.subjectId ?? ''];
        const hurt = decision.subjectId ? season.players[decision.subjectId] : undefined;
        if (!absence || !hurt) return { ...season, decisions: rest };
        const players = {
            ...season.players,
            // Bounded at 100 by the same clamp the sim uses; injuryRisk scales
            // with it, so this is the bill for coming back early.
            [hurt.id]: { ...hurt, load: Math.min(100, (hurt.load ?? 0) + 25) },
        };
        return {
            ...season,
            decisions: rest,
            players,
            teams: season.teams.map(t => t.id !== team.id ? t : {
                ...t,
                playerAbsences: {
                    ...(t.playerAbsences ?? {}),
                    [hurt.id]: { ...absence, duration: Math.max(1, Math.ceil(absence.duration / 2)) },
                },
            }),
        };
    }

    if (action === 'shorten') {
        const size = team.rotationSize ?? DEFAULT_ROTATION_SIZE;
        return {
            ...season,
            decisions: rest,
            teams: season.teams.map(t =>
                t.id === team.id ? { ...t, rotationSize: Math.max(ROTATION_MIN, size - 1) } : t),
        };
    }

    // 'ride' and anything unrecognised: the decision is answered, nothing changes.
    return { ...season, decisions: rest };
};
