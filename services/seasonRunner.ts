// Pure, React-free season simulation runner.
//
// This is the heavy per-day simulation logic that used to live inline in
// App.tsx's `simulateDay`. Extracting it here (with NO React / DOM access) lets
// the exact same code run inside a Web Worker (see `workers/simWorker.ts`) so a
// multi-game simulation no longer blocks the UI thread. Anything that used to
// call `addNotification` / `setView` now returns a serializable **effect** that
// the main thread replays after applying the new state.
//
// Keep this file free of any import that touches `window`/`document`/React —
// it must be safe to import in a worker context.

import { Team, Player, SeasonState } from '../types';
import { simulationEngine } from './simulationService';
import { TRADE_DEADLINE_GAME, generateCpuTradeOffer } from './tradeService';
import { projectConfidence, confidenceZone, shouldFireMidSeason } from './ownerService';
import { generateDecisions } from './decisionService';

// Calendar checkpoints (moved out of App.tsx so the runner is self-contained).
// Roughly where the real All-Star break falls on the 82-game calendar, a few
// games after the trade deadline.
export const ALL_STAR_GAME = 58;
// Group-stage window for the NBA Cup — knockout resolves at the same checkpoint.
export const CUP_GROUP_END = 16;

// Side effects the pure runner can't perform itself (they touch React state on
// the main thread). The runner collects these in order; the caller replays them.
export type SimEffect =
    | { kind: 'notification'; message: string; type: string }
    | { kind: 'view'; view: 'allstar' | 'awards' };

// A game result already resolved by the 3D "Assistir ao Jogo" screen — the sum
// of the baskets that went in on court, quarter by quarter (see
// services/watchDirector.ts) — so the day's simulation doesn't re-roll
// simulateGame for that one fixture and risk disagreeing with what the user
// just watched.
export interface PinnedGameResult {
    homeTeamId: string;
    awayTeamId: string;
    scoreHome: number;
    scoreAway: number;
}

/**
 * Simulate a single "day" (all of the day's scheduled games) plus the calendar/
 * event/owner bookkeeping that follows. Pure: takes a season, returns the next
 * season, the effects to replay, and whether the GM was fired this tick.
 *
 * `pinnedResult`, when given, must match one of today's fixtures by
 * home/away team id — that game's score comes from it instead of a fresh
 * simulateGame() call.
 */
export function simulateOneDay(season: SeasonState, pinnedResult?: PinnedGameResult): { season: SeasonState; effects: SimEffect[]; fired: boolean } {
    const effects: SimEffect[] = [];
    const notify = (message: string, type: string) => effects.push({ kind: 'notification', message, type });

    // Deep clone, not a shallow array copy — the loop below mutates team objects
    // in place (wins/losses/stats), and a shallow copy would mutate the same
    // objects still referenced by the current `season` state.
    const newTeams: Team[] = JSON.parse(JSON.stringify(season.teams));
    // Players are cloned too: recordGameStats mutates each player's seasonStats.
    const newPlayers: { [key: string]: Player } = JSON.parse(JSON.stringify(season.players));
    const newEvents = [...season.events];
    const newSchedule = [...season.schedule];

    // Today's real fixtures from the pre-generated schedule (scheduleService.ts).
    const dayIndex = season.gamesPlayed + 1;
    const todaysGames = season.schedule.filter(g => g.day === dayIndex);

    todaysGames.forEach(game => {
        const homeTeam = newTeams.find(t => t.id === game.homeTeamId);
        const awayTeam = newTeams.find(t => t.id === game.awayTeamId);
        if (!homeTeam || !awayTeam) return;

        const pinned = pinnedResult && pinnedResult.homeTeamId === game.homeTeamId && pinnedResult.awayTeamId === game.awayTeamId
            ? pinnedResult
            : undefined;
        const result = pinned
            ? (pinned.scoreHome >= pinned.scoreAway
                ? { winner: homeTeam, loser: awayTeam, scoreWinner: pinned.scoreHome, scoreLoser: pinned.scoreAway }
                : { winner: awayTeam, loser: homeTeam, scoreWinner: pinned.scoreAway, scoreLoser: pinned.scoreHome })
            : simulationEngine.simulateGame(homeTeam, awayTeam, newPlayers, game.homeTeamId, season.coaches);

        const winnerIdx = newTeams.findIndex(t => t.id === result.winner.id);
        const loserIdx = newTeams.findIndex(t => t.id === result.loser.id);

        newTeams[winnerIdx].wins = (newTeams[winnerIdx].wins || 0) + 1;
        newTeams[loserIdx].losses = (newTeams[loserIdx].losses || 0) + 1;

        simulationEngine.recordGameStats(newTeams[winnerIdx], result.scoreWinner, result.scoreLoser, newPlayers);
        simulationEngine.recordGameStats(newTeams[loserIdx], result.scoreLoser, result.scoreWinner, newPlayers);

        const totalGames = (newTeams[winnerIdx].wins || 0) + (newTeams[winnerIdx].losses || 0);
        if (totalGames % 5 === 0) {
            newTeams[winnerIdx].performanceHistory?.push({ gamesPlayed: totalGames, wins: newTeams[winnerIdx].wins || 0 });
            newTeams[loserIdx].performanceHistory?.push({ gamesPlayed: totalGames, wins: newTeams[loserIdx].wins || 0 });
        }

        // Record the result on the schedule entry so head-to-head/conference
        // tiebreakers have real fixture history to read later.
        const schedIdx = newSchedule.findIndex(g => g.day === game.day && g.homeTeamId === game.homeTeamId && g.awayTeamId === game.awayTeamId);
        if (schedIdx >= 0) {
            const homeScore = result.winner.id === homeTeam.id ? result.scoreWinner : result.scoreLoser;
            const awayScore = result.winner.id === awayTeam.id ? result.scoreWinner : result.scoreLoser;
            newSchedule[schedIdx] = { ...newSchedule[schedIdx], played: true, homeScore, awayScore };
        }
    });

    const { teams: teamsAfterEvents, event } = simulationEngine.handleRandomEvents(newTeams, newPlayers, season.gamesPlayed + 1, season.userTeamId);
    if (event) {
        newEvents.unshift(event);
        notify(event.message, event.type);
    }

    // Update player morale from each team's situation (record, role, being
    // buried). Mutates newPlayers; surfaces trade requests from the user's
    // unhappy rotation players as events.
    // Mutates newPlayers. It used to also return a "player demands a trade"
    // event for the feed; that demand is a decision now (decisionService), so
    // there is nothing left here to announce.
    simulationEngine.updateMorale(teamsAfterEvents, newPlayers, season.userTeamId);

    const nextGamesPlayed = season.gamesPlayed + 1;
    let nextStatus = season.status;
    let nextPlayoff = season.playoff;
    let nextAwards = season.awards;
    let nextAllStar = season.allStar;
    let nextCup = season.cup;
    let nextTradeOffers = season.tradeOffers || [];

    if (nextGamesPlayed === TRADE_DEADLINE_GAME) {
        notify('🔒 PRAZO DE TROCAS! Nenhuma troca mais até a próxima temporada.', 'trade');
        nextTradeOffers = []; // pending offers expire at the deadline
        // Same moment a real front office decides whether it is buying or
        // selling: the teams out of the race shut their best players down and
        // play for lottery position from here to game 82.
        simulationEngine.decideTanking(teamsAfterEvents, newSchedule, season.userTeamId);
    }

    // Occasionally a CPU GM proactively pitches the user a trade (never past the
    // deadline; capped so the inbox doesn't pile up).
    if (nextGamesPlayed < TRADE_DEADLINE_GAME && nextTradeOffers.length < 2 && Math.random() < 0.07) {
        const userTeamObj = teamsAfterEvents.find(t => t.id === season.userTeamId);
        if (userTeamObj) {
            const offer = generateCpuTradeOffer(userTeamObj, teamsAfterEvents, newPlayers, nextGamesPlayed, season.awardHistory.length + 1);
            if (offer) {
                nextTradeOffers = [offer, ...nextTradeOffers];
                const fromName = teamsAfterEvents.find(t => t.id === offer.fromTeamId)?.name;
                notify(`📩 O ${fromName} enviou uma proposta de troca! Confira no Trade Center.`, 'trade');
            }
        }
    }

    if (nextGamesPlayed === CUP_GROUP_END && season.cup) {
        nextCup = simulationEngine.resolveCupGroupStage(season.cup, teamsAfterEvents, newPlayers, newSchedule, season.coaches);
        const championName = teamsAfterEvents.find(t => t.id === nextCup!.championId)?.name;
        notify(`🏆 NBA CUP! O ${championName} venceu o torneio!`, 'info');
    }

    if (nextGamesPlayed === ALL_STAR_GAME) {
        nextAllStar = simulationEngine.simulateAllStarWeekend(teamsAfterEvents, newPlayers, nextGamesPlayed);
        notify('🌟 Bem-vindo ao All-Star Weekend! Confira as escalações.', 'info');
        effects.push({ kind: 'view', view: 'allstar' });
    }

    if (nextGamesPlayed >= 82) {
        nextStatus = 'playoffs_idle';
        nextPlayoff = simulationEngine.initializePlayIn(teamsAfterEvents, newSchedule);
        nextAwards = simulationEngine.generateAwards(teamsAfterEvents, newPlayers);
        notify('Temporada Regular encerrada! Confira os prêmios antes dos Playoffs.', 'info');
        effects.push({ kind: 'view', view: 'awards' });
    }

    // Owner job security: recompute confidence from the user team's pace vs the
    // owner's target, warn when the seat gets hotter, and fire the GM on a total
    // mid-season collapse.
    let nextOwner = season.owner;
    const userTeamNow = teamsAfterEvents.find(t => t.id === season.userTeamId);
    let firedThisTick = false;
    if (userTeamNow && !season.owner.fired) {
        const newConfidence = projectConfidence(season.owner, userTeamNow);
        const prevZone = confidenceZone(season.owner.confidence);
        const newZone = confidenceZone(newConfidence);
        nextOwner = { ...season.owner, confidence: newConfidence };
        if (newZone !== prevZone && (newZone === 'warm' || newZone === 'hot')) {
            notify(
                newZone === 'hot'
                    ? '🔥 O dono perdeu a paciência — sua cadeira está pegando fogo.'
                    : '⚠️ A diretoria está de olho: os resultados estão abaixo do esperado.',
                'error'
            );
        }
        if (shouldFireMidSeason(nextOwner, nextGamesPlayed)) {
            nextOwner = {
                ...nextOwner,
                fired: true,
                note: `Com um retrospecto de ${userTeamNow.wins}-${userTeamNow.losses}, o dono do ${userTeamNow.name} decidiu buscar um novo GM no meio da temporada.`,
            };
            firedThisTick = true;
            notify('Você foi demitido pela diretoria.', 'error');
        }
    }

    const nextSeason: SeasonState = {
        ...season,
        gamesPlayed: nextGamesPlayed,
        teams: teamsAfterEvents,
        players: newPlayers,
        schedule: newSchedule,
        events: newEvents.slice(0, 50),
        status: nextStatus,
        playoff: nextPlayoff,
        allStar: nextAllStar,
        cup: nextCup,
        awards: nextAwards,
        owner: nextOwner,
        tradeOffers: nextTradeOffers,
    };

    // Raise any decisions tonight warrants. Done last, and against BOTH sides of
    // the tick, because "a starter just got hurt" is a difference rather than a
    // state — the absence map alone cannot say whether it happened tonight.
    // The caller stops advancing while the queue is non-empty.
    const raised = generateDecisions(season, nextSeason);
    if (raised.length) {
        nextSeason.decisions = [...(season.decisions ?? []), ...raised];
        // Remember who has now made his demand. Done here rather than inside
        // generateDecisions so the write is visible at the place that owns the
        // next season object, and so the generator stays a pure read.
        const asked = raised
            .filter(d => d.kind === 'trade_request' && d.subjectId)
            .map(d => d.subjectId as string);
        if (asked.length) {
            nextSeason.teams = nextSeason.teams.map(t => t.id !== season.userTeamId ? t : {
                ...t,
                tradeRequestedIds: [...(t.tradeRequestedIds ?? []), ...asked],
            });
        }
    }

    return { season: nextSeason, effects, fired: firedThisTick };
}
