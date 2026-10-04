// Press conferences: the first piece of the "press and storylines" layer.
//
// The roadmap's test for this layer is the one personality already passed: it
// is not flavour text. A press conference here is a DECISION (it rides the same
// queue, stops the season the same way) and every answer moves a number the
// simulation already reads -- the rotation's morale (which is team chemistry),
// team momentum (points per game in computeExpectedPoints), or the owner's
// confidence through `adjustment`. And who you single out matters: the
// archetype decides how a player takes being called out or passed over.
//
// The one thing a microphone adds that nothing else in the game had is a
// PROMISE: say "we make the playoffs" and the owner holds you to it at the end
// of the season, for better or worse (settlePromise, read by
// evaluateSeasonOutcome).
//
// Nothing here is announced through `season.events`: the buffer holds 50,
// renders 6, and an offseason pushes hundreds through it. The conference is the
// decision card; the promise is shown on the season screen's owner panel.

import type { Decision, DecisionOption, Player, PressPromise, SeasonState, Team } from '../types';
import { simulationEngine, DEFAULT_ROTATION_SIZE } from './simulationService';
import { personalityOf } from './personalityService';
import { currentStreak } from './formService';

/** Losses in a row that fill the press room. */
export const SLUMP_STREAK = 6;
/** Wins in a row that get the "are you contenders?" question. */
export const HOT_STREAK = 7;
/**
 * At most this many conferences a season, at least this far apart. The queue's
 * 4-8 budget is shared with every other kind, and a press room that summons you
 * after every five-game run stops being a moment.
 */
export const MAX_PRESS_PER_SEASON = 2;
export const PRESS_MIN_GAP = 15;
/**
 * The press conference is the only stop that is not forced by something
 * happening to the roster, so it is the one that gives way. Once a season has
 * already stopped this many times -- usually a pile-up of injuries -- the
 * press room is not called. Without it the busiest seasons reached 13-15
 * stops against an 11 ceiling (check_decisions, p95).
 */
export const PRESS_QUEUE_CEILING = 7;
/** None in the first ten games (a 0-5 start is news, but not a story yet) or the last two. */
const PRESS_FIRST_GAME = 10;
const PRESS_LAST_GAME = 80;

/** What a kept / broken promise does to the owner's final verdict. */
export const PROMISE_KEPT = 5;
export const PROMISE_BROKEN = -12;
/** What saying it out loud buys you with the owner today. */
const PROMISE_NOW = 3;

/** The owner wanted someone held accountable; backing everyone costs this. */
const BACK_OWNER = -3;
/** Calling a player out reads as accountability upstairs. */
const CALLOUT_OWNER = 3;

/** A player this good is a headline already, not the unsung hero of a run. */
const PRAISE_MAX_OVR = 84;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const PROMISE_LABEL: Record<PressPromise['kind'], string> = {
    playoffs: 'chegar aos playoffs',
    conf_finals: 'chegar à final de conferência',
};

const rotationOf = (team: Team, players: { [k: string]: Player }): string[] =>
    simulationEngine.getTeamRotation(team, players, team.rotationSize ?? DEFAULT_ROTATION_SIZE);

const startersOf = (team: Team, players: { [k: string]: Player }): Player[] =>
    simulationEngine.getLineup(team, players).slots
        .map(s => (s.playerId ? players[s.playerId] : undefined))
        .filter((p): p is Player => !!p);

/**
 * How a player takes being called out in public. Same idea as rushLoadCost: the
 * price is his, and it is written into the option before you choose it.
 *   · the leader takes it and answers on the floor -- the slide stops;
 *   · the star sulks;
 *   · the volatile one explodes, and may well cross the trade-request line.
 */
export const calloutResponse = (p: Player): { morale: number; momentum: number; line: string } => {
    switch (personalityOf(p).id) {
        case 'lider':
            return { morale: -4, momentum: 2, line: 'Ele é líder: aguenta a cobrança e o time reage' };
        case 'estrela':
            return { morale: -18, momentum: 0, line: 'Estrela não gosta de ser exposta: o ânimo dele cai bastante' };
        case 'imprevisivel':
            return { morale: -28, momentum: 0, line: 'Imprevisível: ele pode explodir e pedir para sair' };
        default:
            return { morale: -12, momentum: 0, line: 'O ânimo dele cai' };
    }
};

/**
 * Who the room wants named after a slump: the best-paid starter, because that
 * is who the columns are already about. The choice is whether to give them him.
 */
const calloutTarget = (team: Team, players: { [k: string]: Player }): Player | undefined =>
    [...startersOf(team, players)].sort((a, b) => b.salary - a.salary)[0];

/**
 * Who deserves the credit for a winning run: the best rotation player who is
 * NOT one of the two names the headlines already belong to. Praising a role
 * player is the interesting answer -- and the one a star in the room resents.
 */
const praiseTarget = (team: Team, players: { [k: string]: Player }): Player | undefined => {
    const rot = rotationOf(team, players).map(id => players[id]).filter(Boolean);
    const byOvr = [...rot].sort((a, b) => b.ovr - a.ovr);
    // Below star level, or "the role player" can be LeBron James on a deep
    // team -- seen live on the Lakers, where the third-best was a 4x MVP.
    return byOvr.slice(2).find(p => p.ovr < PRAISE_MAX_OVR) ?? byOvr[byOvr.length - 1];
};

/** A star in the rotation who is not `except`: the one who wanted the spotlight. */
const jealousStar = (team: Team, players: { [k: string]: Player }, exceptId?: string): Player | undefined =>
    rotationOf(team, players)
        .map(id => players[id])
        .find(p => p && p.id !== exceptId && personalityOf(p).id === 'estrela');

const promiseOption = (season: SeasonState, kind: PressPromise['kind'], label: string, detail: string): DecisionOption => {
    const standing = season.owner.press?.promise;
    return {
        id: `press_promise:${kind}`,
        label,
        detail,
        consequence: `Promessa pública: cumprida, +${PROMISE_KEPT} no fim da temporada; quebrada, ${PROMISE_BROKEN}`,
        disabled: !!standing,
        disabledReason: standing
            ? `Você já prometeu ${PROMISE_LABEL[standing.kind]} nesta temporada. A imprensa não esqueceu.`
            : undefined,
    };
};

const buildSlumpConference = (season: SeasonState, team: Team): Decision => {
    const target = calloutTarget(team, season.players);
    const options: DecisionOption[] = [
        {
            id: 'press_back',
            label: 'Bancar o elenco',
            detail: 'Diz que confia em todo mundo do vestiário e que a fase vai passar.',
            consequence: `O ânimo da rotação sobe; o dono queria ouvir cobrança (${BACK_OWNER} de confiança)`,
        },
    ];
    if (target) {
        const r = calloutResponse(target);
        options.push({
            id: `press_callout:${target.id}`,
            label: `Cobrar ${target.name}`,
            detail: `Diz em público que o jogador mais bem pago do quinteto precisa jogar mais.`,
            consequence: `${r.line}. O dono gosta da cobrança (+${CALLOUT_OWNER})`,
        });
    }
    options.push(promiseOption(season, 'playoffs', 'Garantir os playoffs',
        'Promete na frente das câmeras que o time vai estar nos playoffs.'));

    return {
        id: `press_conference:slump:${season.gamesPlayed}`,
        kind: 'press_conference',
        day: season.gamesPlayed,
        headline: `${SLUMP_STREAK} derrotas seguidas`,
        body: `A sala de imprensa está cheia. O ${team.name} perdeu os últimos ${SLUMP_STREAK} e está ${team.wins}-${team.losses}. `
            + `A primeira pergunta é se o problema está no elenco. O que você responde?`,
        options,
    };
};

const buildHotConference = (season: SeasonState, team: Team): Decision => {
    const target = praiseTarget(team, season.players);
    const star = target ? jealousStar(team, season.players, target.id) : undefined;
    const options: DecisionOption[] = [
        {
            id: 'press_humble',
            label: 'Um jogo de cada vez',
            detail: 'Desconversa. Ninguém se empolga, ninguém cobra depois.',
        },
        promiseOption(season, 'conf_finals', 'Dizer que é candidato',
            'Assume em público: este time vai brigar pelo título.'),
    ];
    if (target) {
        options.push({
            id: `press_praise:${target.id}`,
            label: `Dar o crédito a ${target.name}`,
            detail: `Tira os holofotes das estrelas e elogia o trabalho de ${target.name}.`,
            consequence: star
                ? `O ânimo dele sobe muito; ${star.name} queria os holofotes e fica incomodado`
                : 'O ânimo dele sobe muito',
        });
    }
    return {
        id: `press_conference:hot:${season.gamesPlayed}`,
        kind: 'press_conference',
        day: season.gamesPlayed,
        headline: `${HOT_STREAK} vitórias seguidas`,
        body: `O ${team.name} venceu os últimos ${HOT_STREAK} e está ${team.wins}-${team.losses}. `
            + `A pergunta é inevitável: o time é candidato ao título?`,
        options,
    };
};

/**
 * The conference tonight's result calls for, if any. A streak is detected at
 * the exact game it reaches the threshold, so a run that keeps going asks once.
 */
export const pressConferenceFor = (after: SeasonState): Decision | undefined => {
    if (after.status !== 'active') return undefined;
    const gp = after.gamesPlayed;
    if (gp < PRESS_FIRST_GAME || gp > PRESS_LAST_GAME) return undefined;
    const held = after.owner.press?.days ?? [];
    if (held.length >= MAX_PRESS_PER_SEASON) return undefined;
    if (held.length && gp - held[held.length - 1] < PRESS_MIN_GAP) return undefined;
    if ((after.owner.decisionsRaised ?? 0) >= PRESS_QUEUE_CEILING) return undefined;
    const team = after.teams.find(t => t.id === after.userTeamId);
    if (!team) return undefined;

    const streak = currentStreak(after.schedule, team.id);
    if (streak === -SLUMP_STREAK) return buildSlumpConference(after, team);
    if (streak === HOT_STREAK) return buildHotConference(after, team);
    return undefined;
};

/** Record that a conference happened. Called where the season object is built. */
export const notePressHeld = (season: SeasonState, day: number): SeasonState => ({
    ...season,
    owner: {
        ...season.owner,
        press: { ...(season.owner.press ?? { days: [] }), days: [...(season.owner.press?.days ?? []), day] },
    },
});

const bumpMorale = (players: { [k: string]: Player }, ids: string[], delta: number) => {
    const next = { ...players };
    ids.forEach(id => {
        const p = next[id];
        if (p) next[id] = { ...p, morale: clamp(Math.round((p.morale ?? 70) + delta), 0, 100) };
    });
    return next;
};

const withOwner = (season: SeasonState, delta: number, extra: Partial<SeasonState['owner']> = {}): SeasonState['owner'] => ({
    ...season.owner,
    ...extra,
    confidence: clamp(season.owner.confidence + delta, 0, 100),
    // projectConfidence rebuilds confidence from the record every day; the
    // offset is what makes the price stick.
    adjustment: (season.owner.adjustment ?? 0) + delta,
});

/**
 * Apply a press answer. `rest` is the queue without this decision. Returns
 * undefined for an action this module does not own.
 */
export const resolvePress = (season: SeasonState, rest: Decision[], optionId: string): SeasonState | undefined => {
    const [action, arg] = optionId.split(':');
    const team = season.teams.find(t => t.id === season.userTeamId);
    if (!team || !action.startsWith('press_')) return undefined;
    const rotation = rotationOf(team, season.players);

    if (action === 'press_back') {
        return {
            ...season, decisions: rest,
            players: bumpMorale(season.players, rotation, 8),
            owner: withOwner(season, BACK_OWNER),
        };
    }

    if (action === 'press_callout' && arg) {
        const p = season.players[arg];
        if (!p || !team.roster.includes(arg)) return { ...season, decisions: rest };
        const r = calloutResponse(p);
        return {
            ...season, decisions: rest,
            players: bumpMorale(season.players, [arg], r.morale),
            // The leader answering on the floor: the slide stops and turns.
            // Everyone else's slump carries on -- the sim decides from here.
            teams: r.momentum
                ? season.teams.map(t => (t.id === team.id ? { ...t, momentum: Math.max(t.momentum ?? 0, 0) + r.momentum } : t))
                : season.teams,
            owner: withOwner(season, CALLOUT_OWNER),
        };
    }

    if (action === 'press_promise' && (arg === 'playoffs' || arg === 'conf_finals')) {
        if (season.owner.press?.promise) return { ...season, decisions: rest };
        // Saying it lifts the room, the star most of all on the big promise:
        // it is the thing he has been asking for.
        let players = bumpMorale(season.players, rotation, arg === 'conf_finals' ? 5 : 4);
        if (arg === 'conf_finals') {
            players = bumpMorale(players, rotation.filter(id => personalityOf(players[id]).id === 'estrela'), 5);
        }
        return {
            ...season, decisions: rest, players,
            owner: withOwner(season, PROMISE_NOW, {
                press: { days: season.owner.press?.days ?? [], promise: { kind: arg, day: season.gamesPlayed } },
            }),
        };
    }

    if (action === 'press_praise' && arg) {
        const p = season.players[arg];
        if (!p || !team.roster.includes(arg)) return { ...season, decisions: rest };
        const star = jealousStar(team, season.players, arg);
        let players = bumpMorale(season.players, [arg], 15);
        if (star) players = bumpMorale(players, [star.id], -8);
        return { ...season, decisions: rest, players };
    }

    // press_humble: answered, nothing changes.
    return { ...season, decisions: rest };
};

/**
 * Settle the season's promise at the end-of-season judgment. Kept or broken,
 * the press remembers, and so does the owner.
 */
export const settlePromise = (
    promise: PressPromise | undefined, madePlayoffs: boolean, reachedConfFinals: boolean,
): { delta: number; line: string } | undefined => {
    if (!promise) return undefined;
    const kept = promise.kind === 'playoffs' ? madePlayoffs : reachedConfFinals;
    return kept
        ? { delta: PROMISE_KEPT, line: `Você prometeu ${PROMISE_LABEL[promise.kind]} na coletiva e cumpriu.` }
        : { delta: PROMISE_BROKEN, line: `Você prometeu ${PROMISE_LABEL[promise.kind]} na coletiva e não cumpriu. O dono lembra.` };
};
