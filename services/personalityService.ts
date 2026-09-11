// Locker-room personality.
//
// The point of this file is that personality is NOT flavour text. Every
// archetype below changes a number the simulation already reads — morale
// targets, fatigue-driven injury risk, development from minutes — and changes
// how the player answers the decision queue. A label that only appeared on a
// card would be the "personality + press" idea this project already rejected
// twice as out of scope; what makes it worth building now is that there is
// finally a decision surface for it to bite on.
//
// Assignment is DERIVED, never stored. A stable hash of the player id, bucketed
// by his (immutable) potential grade, means:
//   · no migration and no init step — era saves, draft prospects and today's
//     roster all get one for free;
//   · it never drifts, so the leader you built around is still the leader in
//     season six;
//   · the harness can reason about it without simulating anything.
//
// Age is deliberately NOT an input, precisely because it changes every year and
// a personality that reshuffled each offseason would be noise. Where age
// matters it is applied at the point of EFFECT (see developmentFactor).

import type { Player } from '../types';

export type PersonalityId = 'lider' | 'estrela' | 'guerreiro' | 'imprevisivel' | 'prodigio';

export interface Personality {
    id: PersonalityId;
    label: string;
    /** One line, the way a scout would put it. */
    blurb: string;
    /** Accent used wherever the badge is drawn. */
    tone: 'good' | 'warn' | 'info' | 'bad' | 'neutral';
}

export const PERSONALITIES: Record<PersonalityId, Personality> = {
    lider: {
        id: 'lider', label: 'Líder', tone: 'good',
        blurb: 'Puxa o vestiário. Nunca pede para sair.',
    },
    estrela: {
        id: 'estrela', label: 'Estrela', tone: 'warn',
        blurb: 'Quer ganhar. Minutos não compram a paciência dele.',
    },
    guerreiro: {
        id: 'guerreiro', label: 'Guerreiro', tone: 'info',
        blurb: 'Aguenta carga. Joga machucado sem cobrar caro.',
    },
    imprevisivel: {
        id: 'imprevisivel', label: 'Imprevisível', tone: 'bad',
        blurb: 'Oscila. O humor dele vira duas vezes mais rápido.',
    },
    prodigio: {
        id: 'prodigio', label: 'Prodígio', tone: 'good',
        blurb: 'Aprende jogando. Cada minuto vale mais nele.',
    },
};

/** Stable 32-bit hash of a string. Same id, same number, forever. */
const hash = (s: string): number => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
};

// Only genuinely high-ceiling players can be prodigies, so the archetype means
// something when it shows up. Everyone else draws from the other four.
const HIGH_CEILING: PersonalityId[] = ['prodigio', 'lider', 'estrela', 'guerreiro', 'imprevisivel'];
const ORDINARY: PersonalityId[] = ['lider', 'estrela', 'guerreiro', 'imprevisivel'];

/**
 * The archetype this player has. Pure, deterministic, and cheap enough to call
 * anywhere — there is no cache because there is nothing to cache.
 */
export const personalityOf = (p: Player | undefined): Personality => {
    if (!p) return PERSONALITIES.guerreiro;
    const pool = (p.potential === 'A' || p.potential === 'B') ? HIGH_CEILING : ORDINARY;
    return PERSONALITIES[pool[hash(p.id) % pool.length]];
};

/* -------------------------------------------------------------------------- */
/* The effects. Each one is read by exactly one place in the engine.           */
/* -------------------------------------------------------------------------- */

/**
 * Added to a player's OWN morale target. The star is the only one who moves it,
 * and only when the team is losing: he is not unhappy about his role, he is
 * unhappy about the record, which is what makes "more minutes" the wrong answer
 * for him and the right one for everybody else.
 */
export const moraleTargetShift = (p: Player, winPct: number): number =>
    personalityOf(p).id === 'estrela' && winPct < 0.45 ? -9 : 0;

/**
 * Added to every TEAMMATE's morale target for ONE healthy leader in the
 * rotation — counted once, not per captain.
 *
 * Small, and deliberately smaller than it started. At +4 per leader with two
 * counted, the lift reached ~78% of the league while the star's penalty
 * reached ~9%, so league-average morale rose, team chemistry rose with it, and
 * the whole league quietly scored more: the measured scoring leader drifted
 * from ~35.8 to 36.4. Personality is supposed to differentiate players, not
 * inflate the sport.
 */
export const LEADER_LIFT = 3;

/**
 * How fast morale travels toward its target. The volatile player swings twice
 * as hard in both directions: quicker to sour, quicker to come back.
 */
export const moraleSpeed = (p: Player): number =>
    personalityOf(p).id === 'imprevisivel' ? 0.30 : 0.15;

/**
 * Multiplier on the fatigue component of injury risk. The workhorse is the one
 * archetype that touches availability, which is the scarcest resource in the
 * game now that injuries are real.
 */
export const fatigueFactor = (p: Player): number =>
    personalityOf(p).id === 'guerreiro' ? 0.6 : 1;

/**
 * Multiplier on development opportunity (which the engine reads off minutes).
 * Gated on age at the point of effect rather than at assignment: a prodigy is a
 * prodigy for the years it means something, and stops being one without his
 * label changing under him.
 */
export const developmentFactor = (p: Player): number =>
    personalityOf(p).id === 'prodigio' && p.age <= 25 ? 1.3 : 1;

/**
 * What a rushed return costs him in load. The workhorse plays hurt and shrugs;
 * the volatile one takes it worst.
 */
export const rushLoadCost = (p: Player): number => {
    const id = personalityOf(p).id;
    if (id === 'guerreiro') return 12;
    if (id === 'imprevisivel') return 34;
    return 25;
};
