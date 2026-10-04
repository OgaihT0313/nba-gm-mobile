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

import type { Decision, DecisionOption, Player, SeasonState, Team, TradeOffer } from '../types';
import { getPlayerPositions, getTeamSalary, LUXURY_TAX } from '../constants';
import { simulationEngine, ROTATION_MIN, DEFAULT_ROTATION_SIZE, TRADE_REQUEST_MORALE } from './simulationService';
import { getFreeAgents, signFreeAgentLegality, evaluateSigningInterest, signPlayer, askingSalary, newContractYears, willingToReSign } from './freeAgencyService';
import { luxuryTaxConfidenceHit } from './ownerService';
import { playerValue, MAX_PENDING_OFFERS } from './tradeService';
import { generateCpuTradeOffer, TRADE_DEADLINE_GAME } from './tradeService';
import { sortStandings } from './scheduleService';
import { personalityOf, rushLoadCost } from './personalityService';

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

/** Below this a player is not good enough for his unhappiness to be your problem. */
const TRADE_REQUEST_MIN_OVR = 78;

/**
 * When the buy-or-sell question lands. Three games before the deadline itself,
 * so the answer still has time to matter — asking on the day would be theatre.
 */
const DEADLINE_STANCE_GAME = TRADE_DEADLINE_GAME - 3;

/**
 * What tearing the season down costs you with the owner, by what he asked for.
 * Selling under a title mandate is insubordination; under a rebuild it is
 * exactly what he wanted. Stated in the option's own copy before it is chosen —
 * no option in this queue charges a price it did not name.
 */
const SELL_CONFIDENCE: Record<string, number> = {
    championship: -22, contender: -14, playoffs: -6, develop: +4, rebuild: +8,
};

/**
 * When the extension talks happen: a quarter into the season, so the record
 * means something (it is half of whether he wants to stay) and there is still a
 * whole month before the deadline to trade him if he will not.
 */
const EXTENSION_GAME = 20;

/** Only players who matter: the rotation, or anyone this good. */
const EXTENSION_MIN_OVR = 76;

/**
 * At most this many extension talks a season, best players first. The queue's
 * 4-8 budget is shared with every other kind; a roster with five expiring deals
 * would otherwise spend a quarter of the season's stops in one evening. The
 * rest reach free agency with the Bird right, which is still a choice.
 */
const EXTENSION_MAX_PER_SEASON = 2;

/** The Líder takes less to stay. Named in the decision, so it is a reason to keep him. */
const LEADER_DISCOUNT = 0.9;

const money = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;

/**
 * What he asks to extend: his market price at NEXT season's age, when the new
 * deal starts -- the same askingSalary every other contract uses, so extending
 * now is a bet on the player rather than a different price list. Waiting is
 * the other side of that bet: if he declines he will ask less in July, if he
 * breaks out he will ask more, and someone else may pay it first.
 */
export const extensionTerms = (p: Player): { salary: number; years: number } => {
    const next = { ...p, age: p.age + 1 };
    const base = askingSalary(next);
    const salary = personalityOf(p).id === 'lider' ? Math.round(base * LEADER_DISCOUNT / 10_000) * 10_000 : base;
    return { salary, years: newContractYears(next) };
};

/** Next season's payroll: everyone still under contract then, plus `extra`. */
const nextSeasonPayroll = (team: Team, players: { [k: string]: Player }, extra = 0): number =>
    team.roster.reduce((sum, id) => {
        const p = players[id];
        if (!p || p.contractYears <= 1) return sum;
        return sum + (p.nextSalary ?? p.salary);
    }, 0) + extra;

const winPctOf = (team: Team): number => {
    const g = (team.wins ?? 0) + (team.losses ?? 0);
    return g ? (team.wins ?? 0) / g : 0.5;
};

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
        // The price is his, not a constant: a workhorse shrugs it off, the
        // volatile one takes it worst. Named here so the difference is
        // something the player reads BEFORE choosing, not a surprise after.
        consequence: personalityOf(hurt).id === 'guerreiro'
            ? 'Ele aguenta \u2014 carga bem menor que o normal'
            : personalityOf(hurt).id === 'imprevisivel'
                ? 'Carga pesada demais para ele \u2014 risco alto de recair'
                : 'Carga alta e risco real de recair',
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
 * A good player has just stopped putting up with his situation.
 *
 * The morale system that produces this has existed the whole time and never
 * once fired (see updateMorale). It is the most dramatic thing a GM deals with,
 * so it gets its own stop rather than a line in a feed that renders six items.
 */
const buildTradeRequest = (season: SeasonState, team: Team, p: Player): Decision => {
    const slot = getPlayerPositions(p)[0];
    // The star is unhappy about the RECORD, not the role, which is what makes
    // minutes the wrong answer for him and the right one for everyone else.
    // Stated in the option's own copy: the player should be able to tell the
    // difference before choosing, not discover it afterwards.
    const isStar = personalityOf(p).id === 'estrela';
    return {
        id: `trade_request:${p.id}:${season.gamesPlayed}`,
        kind: 'trade_request',
        day: season.gamesPlayed,
        subjectId: p.id,
        headline: `${p.name} pediu para sair`,
        body: isStar
            ? `${p.name} (${p.ovr} OVR) cansou de perder no ${team.name} e pediu para ser trocado. `
                + `${team.wins}-${team.losses} não é o que ele veio fazer aqui. O que você faz?`
            : `${p.name} (${p.ovr} OVR) está infeliz com o papel dele no ${team.name} e pediu para ser trocado. `
                + `O que você faz com ele?`,
        options: [
            {
                id: `minutes:${p.id}`,
                label: 'Prometer mais minutos',
                detail: isStar
                    ? `Crava ${p.name} como titular de ${slot} — mas o problema dele é a campanha, não o papel.`
                    : `Crava ${p.name} como titular de ${slot}. O ânimo dele volta.`,
                consequence: isStar
                    ? 'Acalma pouco: ele quer ganhar, não jogar mais'
                    : 'Quem perde a vaga fica insatisfeito no lugar dele',
            },
            {
                id: `shop:${p.id}`,
                label: 'Colocar no mercado',
                detail: 'Avisa a liga que você ouve propostas por ele.',
                consequence: 'Você negocia de posição fraca — todos sabem que ele quer sair',
            },
            {
                id: 'ignore',
                label: 'Ignorar o pedido',
                detail: 'Ele que resolva. Você manda no elenco.',
                consequence: 'O ânimo segue caindo e arrasta a química do time',
            },
        ],
    };
};

/**
 * Buy, hold, or tear it down. The one decision that hands the user the lever the
 * CPU has had since teams started tanking for the lottery — the engine
 * deliberately never pulls it for them, which left the mechanic asymmetric.
 */
const buildDeadlineStance = (season: SeasonState, team: Team): Decision => {
    const conf = sortStandings(season.teams.filter(t => t.conference === team.conference), season.schedule);
    const rank = conf.findIndex(t => t.id === team.id) + 1;
    const inPlayIn = rank <= 10;
    const hit = SELL_CONFIDENCE[season.owner.mandate] ?? -10;

    return {
        id: `deadline_stance:${season.gamesPlayed}`,
        kind: 'deadline_stance',
        day: season.gamesPlayed,
        headline: 'O prazo de trocas está chegando',
        body: `${team.name} é o ${rank}º do ${team.conference === 'East' ? 'Leste' : 'Oeste'} com ${team.wins}-${team.losses}`
            + `${inPlayIn ? ', dentro da zona de play-in' : ', fora da zona de play-in'}. `
            + `Faltam três jogos para o prazo. Você compra, segura ou vende?`,
        options: [
            {
                id: 'buy',
                label: 'Comprar',
                detail: 'Avisa a liga que você quer reforço agora. Os vendedores ligam.',
                consequence: 'Propostas chegam na Central de Trocas',
            },
            {
                id: 'hold',
                label: 'Segurar o elenco',
                detail: 'Nada muda. Você aposta em quem já está aqui.',
            },
            {
                id: 'sell',
                label: 'Vender e jogar pela loteria',
                detail: 'Seus dois melhores sentam pelo resto da temporada. Os minutos vão para os jovens.',
                consequence: hit < 0
                    ? `Você perde ${Math.abs(hit)} pontos de confiança do dono`
                    : `O dono aprova (+${hit} de confiança)`,
            },
        ],
    };
};

/**
 * A player entering the last year of his deal. The decision the roadmap called
 * the centre of the job: pay him now at today's price, or let him reach free
 * agency and find out. If he will not stay -- unhappy, or a star on a losing
 * team -- the question turns into whether you get anything for him first.
 */
const buildContractExtension = (season: SeasonState, team: Team, p: Player): Decision => {
    const terms = extensionTerms(p);
    const willing = willingToReSign(p, winPctOf(team));
    const payrollAfter = nextSeasonPayroll(team, season.players, terms.salary);
    const tax = luxuryTaxConfidenceHit(payrollAfter);
    const isLeader = personalityOf(p).id === 'lider';
    const why = personalityOf(p).id === 'estrela' && winPctOf(team) < 0.45
        ? `quer jogar num time que vence, e ${team.wins}-${team.losses} não é isso`
        : 'anda insatisfeito no time';

    const shop: DecisionOption = {
        id: `shop:${p.id}`,
        label: 'Negociar agora',
        detail: 'Ouve propostas antes do prazo de trocas, enquanto ele ainda vale alguma coisa.',
        consequence: willing ? 'Você abre mão de um jogador que queria ficar' : 'A liga sabe que ele vai sair: você negocia de posição fraca',
    };

    if (!willing) {
        return {
            id: `contract_extension:${p.id}:${season.gamesPlayed}`,
            kind: 'contract_extension',
            day: season.gamesPlayed,
            subjectId: p.id,
            headline: `${p.name} não vai renovar`,
            body: `${p.name} (${p.ovr} OVR, ${p.age} anos) está no último ano de contrato e avisou que ${why}. `
                + `No fim da temporada ele vai para a agência livre, e você fica sem nada em troca.`,
            options: [
                {
                    id: `extend:${p.id}`,
                    label: 'Oferecer extensão',
                    detail: `${money(terms.salary)}/ano por ${terms.years} anos.`,
                    disabled: true,
                    disabledReason: `Ele não aceita: ${why}.`,
                },
                shop,
                {
                    id: 'keep',
                    label: 'Ficar com ele até o fim',
                    detail: 'Ele joga a temporada por você e vai embora no verão.',
                    consequence: 'Sai de graça na agência livre',
                },
            ],
        };
    }

    return {
        id: `contract_extension:${p.id}:${season.gamesPlayed}`,
        kind: 'contract_extension',
        day: season.gamesPlayed,
        subjectId: p.id,
        headline: `${p.name} entra no último ano de contrato`,
        body: `${p.name} (${p.ovr} OVR, ${p.age} anos) ganha ${money(p.salary)} e o contrato acaba nesta temporada. `
            + `O agente dele pede ${money(terms.salary)}/ano por ${terms.years} anos para estender agora`
            + `${isLeader ? ' — um desconto, porque ele quer ficar' : ''}.`,
        options: [
            {
                id: `extend:${p.id}`,
                label: `Estender: ${money(terms.salary)} × ${terms.years} anos`,
                detail: `Fecha agora. O novo salário começa na próxima temporada. Folha projetada: ${money(payrollAfter)}.`,
                consequence: tax > 0
                    ? `Passa da linha de imposto (${money(LUXURY_TAX)}): -${tax} de confiança do dono por temporada`
                    : 'Fica abaixo da linha de imposto',
            },
            {
                id: 'wait',
                label: 'Deixar chegar à agência livre',
                detail: 'Ele quer ficar: no verão você tem a preferência, pelo que ele valer depois da evolução.',
                consequence: 'Se ele melhorar, fica mais caro; se o ânimo cair até lá, ele sai sem te dar a preferência',
            },
            shop,
        ],
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

    // A good player crossing the give-up line. Detected as a CROSSING rather
    // than a state, the same way the injury is: morale hovering below the
    // threshold must ask once, not every night for the rest of the season.
    const alreadyAsked = new Set(teamAfter.tradeRequestedIds ?? []);
    teamAfter.roster.forEach(pId => {
        const now = after.players[pId];
        const was = before.players[pId];
        if (!now || !was) return;
        if (now.ovr < TRADE_REQUEST_MIN_OVR) return;
        if (alreadyAsked.has(pId)) return;   // he asked already; once a season
        // The leader endures. That is the whole of what the archetype is for:
        // the player you build around is the one who does not walk when it goes
        // badly, and it costs the roster something real -- he is one of five
        // slots that could have held a star instead.
        if (personalityOf(now).id === 'lider') return;
        const moraleBefore = was.morale ?? 70;
        const moraleAfter = now.morale ?? 70;
        if (moraleBefore < TRADE_REQUEST_MORALE || moraleAfter >= TRADE_REQUEST_MORALE) return;
        out.push(buildTradeRequest(after, teamAfter, now));
    });

    // Contract talks, once, a quarter into the season.
    if (after.gamesPlayed === EXTENSION_GAME && after.status === 'active') {
        const rotation = new Set(simulationEngine.getTeamRotation(
            teamAfter, after.players, teamAfter.rotationSize ?? DEFAULT_ROTATION_SIZE));
        teamAfter.roster
            .map(id => after.players[id])
            .filter(p => p && p.contractYears === 1 && p.nextSalary === undefined
                && (rotation.has(p.id) || p.ovr >= EXTENSION_MIN_OVR))
            .sort((a, b) => playerValue(b) - playerValue(a))
            .slice(0, EXTENSION_MAX_PER_SEASON)
            .forEach(p => out.push(buildContractExtension(after, teamAfter, p)));
    }

    // Buy or sell, once, three games out from the deadline.
    if (after.gamesPlayed === DEADLINE_STANCE_GAME && after.status === 'active') {
        out.push(buildDeadlineStance(after, teamAfter));
    }

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
        const signed = signPlayer(team, player, season.players);
        return {
            ...season,
            decisions: rest,
            players: { ...season.players, [targetId]: signed.player },
            teams: season.teams.map(t => (t.id === team.id ? signed.team : t)),
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
            [hurt.id]: { ...hurt, load: Math.min(100, (hurt.load ?? 0) + rushLoadCost(hurt)) },
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

    if (action === 'minutes' && targetId) {
        const player = season.players[targetId];
        if (!player || !team.roster.includes(targetId)) return { ...season, decisions: rest };
        const slot = getPlayerPositions(player)[0];
        return {
            ...season,
            decisions: rest,
            // Lifted clear of the give-up line rather than to contentment: you
            // made a promise, you did not fix his career. Where it settles from
            // here is up to whether the minutes are real, which the sim decides.
            players: {
                ...season.players,
                [targetId]: {
                    ...player,
                    // Barely anything for a star: minutes were never what he
                    // was asking for.
                    morale: TRADE_REQUEST_MORALE + (personalityOf(player).id === 'estrela' ? 7 : 20),
                },
            },
            teams: season.teams.map(t =>
                t.id === team.id ? { ...t, starters: { ...(t.starters ?? {}), [slot]: targetId } } : t),
        };
    }

    if (action === 'shop' && targetId) {
        // Word gets out, and the calls are about HIM. If nothing legal
        // assembles tonight the decision is still answered — the league simply
        // has no offer worth making yet.
        const offer = generateCpuTradeOffer(
            team, season.teams, season.players, season.gamesPlayed,
            season.awardHistory.length + 1, targetId,
        );
        return {
            ...season,
            decisions: rest,
            // Newest first and capped: the call you just asked for always
            // lands, the oldest pending one makes room.
            tradeOffers: offer ? [offer, ...(season.tradeOffers ?? [])].slice(0, MAX_PENDING_OFFERS) : (season.tradeOffers ?? []),
        };
    }

    if (action === 'extend' && targetId) {
        const player = season.players[targetId];
        if (!player || !team.roster.includes(targetId) || player.contractYears !== 1) return { ...season, decisions: rest };
        // Priced again at the moment of signing, from the same function the
        // decision quoted -- nothing about him can have changed in between,
        // since the season does not advance while the decision is open.
        const terms = extensionTerms(player);
        const after: SeasonState = {
            ...season,
            players: {
                ...season.players,
                [targetId]: { ...player, contractYears: 1 + terms.years, nextSalary: terms.salary },
            },
        };
        // Talks raised the same night were priced against a payroll without
        // this deal. Rebuilt here so the next one quotes the real bill -- seen
        // live: the second card read $187M, under the tax, right after the
        // first had taken it to $219M.
        return {
            ...after,
            decisions: rest.map(d => {
                const subject = d.kind === 'contract_extension' && d.subjectId ? after.players[d.subjectId] : undefined;
                return subject ? { ...buildContractExtension(after, team, subject), id: d.id, day: d.day } : d;
            }),
        };
    }

    if (action === 'buy') {
        // Two calls, from whoever is willing. Same generator the season uses on
        // its own; this just makes it happen because you asked.
        const offers: TradeOffer[] = [];
        for (let i = 0; i < 2; i++) {
            const o = generateCpuTradeOffer(
                team, season.teams, season.players, season.gamesPlayed, season.awardHistory.length + 1);
            if (o && !offers.some(x => x.fromTeamId === o.fromTeamId)) offers.push(o);
        }
        return { ...season, decisions: rest, tradeOffers: [...offers, ...(season.tradeOffers ?? [])].slice(0, MAX_PENDING_OFFERS) };
    }

    if (action === 'sell') {
        const delta = SELL_CONFIDENCE[season.owner.mandate] ?? -10;
        return {
            ...season,
            decisions: rest,
            // The user's own tanking flag. decideTanking skips this team
            // entirely, so what is set here survives the deadline.
            teams: season.teams.map(t => (t.id === team.id ? { ...t, tanking: true } : t)),
            owner: {
                ...season.owner,
                confidence: Math.max(0, Math.min(100, season.owner.confidence + delta)),
                // Without this the price was gone by the next game day:
                // projectConfidence rebuilds confidence from the record alone.
                adjustment: (season.owner.adjustment ?? 0) + delta,
                note: delta < 0
                    ? `O dono soube que voc\u00ea desmontou o elenco no prazo. Ele n\u00e3o pediu isso.`
                    : `O dono aprovou a decis\u00e3o de olhar para o futuro.`,
            },
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
