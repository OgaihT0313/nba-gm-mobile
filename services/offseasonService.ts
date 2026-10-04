// The offseason, as three pure steps: crown-to-draft, draft-to-free-agency,
// free-agency-to-opening-night. Lifted out of App.tsx unchanged so a whole
// multi-year career can run headlessly (scripts/check_contracts.ts) -- the
// contract cycle only exists ACROSS seasons, and nothing that lived inside a
// setState callback could be measured there.

import type { Team, Player, SeasonState, DraftState, Event, OffseasonMove } from '../types';
import { offseasonMoves, getTeamSalary, LUXURY_TAX } from '../constants';
import { ERAS, currentEra } from '../data/eras';
import { simulationEngine } from './simulationService';
import { buildSeasonOwner, luxuryTaxConfidenceHit } from './ownerService';
import { generateSchedule } from './scheduleService';
import { MIN_ROSTER_SIZE, MAX_ROSTER_SIZE } from './tradeService';
import {
    buildDraftBoard, grantNextWindowPick, PICK_WINDOW,
    generateDraftClass, generateRealDraftClass, generateUndraftedClass, advanceDraftToUser, SCOUT_BUDGET,
} from './draftService';
import { processOffseasonContracts, runCpuFreeAgency, trimCpuRosters } from './freeAgencyService';
import { accumulateCareers, championRosterOf } from './careerService';
import { ageCoachesAndRetire, buildDevelopmentBonusMap } from './coachService';
import { retirePlayers } from './retirementService';
import { rivalriesAfterSeason } from './rivalryService';

// Champion crowned -> progression, real NBA offseason moves replayed, contracts
// tick down, then the rookie draft (BEFORE free agency, matching the real
// calendar). CPU free agency waits until the draft finishes.
export const startOffseason = (prev: SeasonState): SeasonState => {
  // The draft board is built from the just-finished records (lottery for the
  // top four), so it must read prev.teams BEFORE wins reset. It also settles
  // who OWNS each slot and consumes the picks spent on this draft, so its
  // updated teams are what the rest of the offseason has to build on.
  const draftNumber = prev.awardHistory.length;
  const board = buildDraftBoard(prev.teams, draftNumber);

  // League lifecycle, in a strict order (see services/careerService.ts):
  // credit the season just played to career totals FIRST, at the age it was
  // actually played and before handleStartSeason wipes seasonStats...
  const lastRecord = prev.awardHistory[prev.awardHistory.length - 1];
  const withCareers = accumulateCareers(
    prev.players,
    championRosterOf(prev.teams, lastRecord),
    prev.awards,
    prev.playoff?.awards.finalsMVP ?? lastRecord?.finalsMvp,
    [...(prev.allStar?.eastRoster || []), ...(prev.allStar?.westRoster || [])],
  );

  // Development credit uses the coach who actually ran the season just
  // played (prev.teams/prev.coaches), captured before anyone below ages or
  // retires — see coachService.buildDevelopmentBonusMap.
  const devBonus = buildDevelopmentBonusMap(prev.teams, prev.coaches);
  const { updatedPlayers, progressionEvents } = simulationEngine.runPlayerProgression(withCareers, devBonus);
  // Snapshot last season's OVR so next season's MIP can measure real growth.
  for (const id in updatedPlayers) {
    updatedPlayers[id].ovrLastSeason = prev.players[id]?.ovr ?? updatedPlayers[id].ovr;
  }

  // Every coach ages a year; past 60 there's a rising chance he retires and
  // is auto-replaced (see ageCoachesAndRetire) — independent of the roster
  // work above, run on board.teams so the result flows into newTeams below
  // along with everything else buildDraftBoard already carried forward.
  const coaching = ageCoachesAndRetire(board.teams, prev.coaches);

  // Annotated so the inferred literal type doesn't make wins/losses non-optional.
  const newTeams: Team[] = coaching.teams.map((t) => ({
    ...t,
    wins: 0,
    losses: 0,
    momentum: 0,
    stats: { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
    performanceHistory: [{ gamesPlayed: 0, wins: 0 }],
    playerAbsences: undefined,
    playerStatusEffects: undefined,
    // Last season's give-up is not this season's: every team starts the
    // year trying, and decideTanking re-decides at the next deadline.
    tanking: undefined,
    // A demand made last season is settled. Everyone gets to ask again.
    tradeRequestedIds: undefined,
    // A new summer, a new mid-level exception.
    midLevelUsed: undefined,
  }));

  // Retirement comes right after aging, before real moves and contracts: a
  // player who hangs it up must not be re-signed or replayed into a trade.
  const retiring = retirePlayers(newTeams, updatedPlayers);
  newTeams.splice(0, newTeams.length, ...retiring.teams);
  const rosterPlayers = retiring.players;

  // Replay real NBA offseason moves (skips any player the user already
  // moved elsewhere — see the roster.includes guard below). A LIVE save
  // only ever has one real transition available (today's season into
  // next), applied once via offseasonMovesApplied. An ERA save instead
  // walks the chain in ERAS one entry per offseason (eraChainIndex) —
  // each entry is that era's own real season -> the next chronological
  // era's, generated by pipeline/sync_era_moves.py — so a 2010-11 save
  // keeps replaying real trades/signings every year instead of being a
  // single disconnected snapshot. Reading past the last chained era (or a
  // move that no longer matches current save state) resolves to an empty
  // list, so the chain quietly and permanently goes procedural once real
  // data runs out — no separate "chain exhausted" state needed.
  const moveEvents: Event[] = [];
  const eraEvents: Event[] = [];
  // The moves that actually land, for the season screen's offseason recap
  // (SeasonState.lastOffseasonMoves). Collected here rather than read back
  // from data/eras because the guard below skips any move the save has
  // already diverged from.
  const appliedMoves: { playerName: string; fromTeamId: string; toTeamId: string }[] = [];
  const sortByOvr = (roster: string[]) => [...roster].sort((a, b) => (rosterPlayers[b]?.ovr || 0) - (rosterPlayers[a]?.ovr || 0));
  const applyMoves = (moves: OffseasonMove[]) => {
    moves.forEach((move) => {
      const fromIdx = newTeams.findIndex((t) => t.id === move.fromTeamId);
      const toIdx = newTeams.findIndex((t) => t.id === move.toTeamId);
      if (fromIdx === -1 || toIdx === -1 || !newTeams[fromIdx].roster.includes(move.playerId)) return;
      const fromName = newTeams[fromIdx].name;
      const toName = newTeams[toIdx].name;
      newTeams[fromIdx] = { ...newTeams[fromIdx], roster: newTeams[fromIdx].roster.filter((id) => id !== move.playerId) };
      newTeams[toIdx] = { ...newTeams[toIdx], roster: sortByOvr([...newTeams[toIdx].roster, move.playerId]) };
      moveEvents.push({ message: `🏀 OFFSEASON: ${move.playerName} deixou o ${fromName} e agora joga pelo ${toName}.`, type: 'trade' });
      appliedMoves.push({ playerName: move.playerName, fromTeamId: move.fromTeamId, toTeamId: move.toTeamId });
    });
  };
  let nextEraChainIndex = prev.eraChainIndex;
  if (prev.era) {
    applyMoves(prev.eraChainIndex !== undefined ? (ERAS[prev.eraChainIndex]?.offseasonMoves.moves ?? []) : []);
    nextEraChainIndex = prev.eraChainIndex !== undefined ? prev.eraChainIndex + 1 : undefined;
    // Crossing an era boundary is the one moment the save's identity
    // changes on its own, so it gets announced like any other league news.
    // Compared by group id, not index, so it fires once per era — not once
    // per season — and fires exactly once more when real history runs out
    // and the chain goes procedural (see currentEra in data/eras).
    const fromEra = currentEra(prev.eraChainIndex);
    const toEra = currentEra(nextEraChainIndex);
    if (fromEra && toEra && fromEra.groupId !== toEra.groupId) {
      eraEvents.push({
        message: toEra.seasonLabel
          ? `✨ NOVA ERA: começa a ${toEra.label} — sua carreira atravessa para ${toEra.seasonLabel}.`
          : `✨ NOVA ERA: a história real acaba aqui. Daqui pra frente é a ${toEra.label}, e a liga segue só pelo que você fizer dela.`,
        type: 'era',
      });
    }
  } else if (!prev.offseasonMovesApplied) {
    applyMoves(offseasonMoves.moves);
  }

  // Last season's record decides who wants to stay -- read from prev.teams,
  // since newTeams already reset the standings.
  const winPct = Object.fromEntries(prev.teams.map((t) => {
    const g = (t.wins ?? 0) + (t.losses ?? 0);
    return [t.id, g ? (t.wins ?? 0) / g : 0.5];
  }));
  const contracts = processOffseasonContracts(newTeams, rosterPlayers, prev.userTeamId, winPct);
  // Both generators are seeded with the ids already in the league: prospect
  // ids are name-derived from a small name space, and these maps are merged
  // OVER the existing players, so an unseeded collision would silently
  // overwrite a real rostered player.
  //
  // A chained era save draws the REAL draft class for this transition
  // (ERAS[eraChainIndex].realDraftClass — see its own comment in
  // data/eras/index.ts): who enters the league is real, WHICH team lands
  // them still comes entirely from this save's own board above. Real
  // rookie ratings live on the NEXT chronological era's player pool (the
  // same season that class's rookie year was fetched into), so that's the
  // source read here. Falls back to the fully-procedural class exactly
  // like before once the chain has no realDraftClass at this index (a
  // live save, or an era save that's walked past the last chained draft).
  const chainEra = prev.era && prev.eraChainIndex !== undefined ? ERAS[prev.eraChainIndex] : undefined;
  const { prospects, reports, ids } = chainEra?.realDraftClass
    ? generateRealDraftClass(
        chainEra.realDraftClass.picks,
        ERAS[prev.eraChainIndex! + 1]?.players ?? {},
        Object.keys(contracts.players),
      )
    : generateDraftClass(30, Object.keys(contracts.players));
  // Undrafted/international fringe talent enters the market alongside the draft.
  const undrafted = generateUndraftedClass(10, [...Object.keys(contracts.players), ...ids]);
  const playersWithProspects = { ...contracts.players, ...prospects, ...undrafted.players };
  // `reports` is the fog of war: prospects carry their real rating in
  // `players` (the sim needs it the instant they're drafted), and this is the
  // only rating the draft screen and the CPU are allowed to read.
  const initialDraft: DraftState = {
    order: board.order, picks: [], available: ids, complete: false,
    reports, scoutBudget: SCOUT_BUDGET,
  };
  // The window slides forward: everyone gets their own pick for the draft
  // that just entered the horizon (picks they traded away stay gone).
  const teamsWithPicks = grantNextWindowPick(contracts.teams, draftNumber + PICK_WINDOW);
  const advanced = advanceDraftToUser(initialDraft, teamsWithPicks, playersWithProspects, prev.userTeamId);

  return {
    ...prev,
    status: 'draft',
    playoffStage: 'none',
    gamesPlayed: 0,
    teams: advanced.teams,
    // Not playersWithProspects: the CPU picks made above already lifted the
    // fog on those prospects (applyPick returns an updated map).
    players: advanced.players,
    draft: advanced.draft,
    coaches: coaching.coaches,
    // One offseason generates several HUNDRED events against a 60-slot
    // buffer, so this array is a budget, not a list. It used to be plain
    // concatenation, which meant the two biggest batches (draft picks and
    // expiring contracts) filled all 60 between them and silently erased
    // everything after — including the "🏀 OFFSEASON: X deixou o Y"
    // replays that are the entire point of chaining real NBA history, so
    // those had never actually reached a player.
    //
    // Each category now gets a slice of the buffer instead, ordered
    // most-narrative first: an era change (at most one, and the rarest
    // thing that can happen to a save) leads, then real history, then the
    // routine bulk. Nothing is monopolised and nothing is wiped out.
    events: [
      ...eraEvents,
      ...moveEvents.slice(0, 18),
      ...advanced.events.slice(0, 12),
      ...contracts.events.slice(0, 6),
      ...board.events,
      ...coaching.events.slice(0, 4),
      ...progressionEvents.slice(0, 8),
      ...prev.events,
    ].slice(0, 60),
    playoff: null,
    awards: null,
    offseasonMovesApplied: true,
    eraChainIndex: nextEraChainIndex,
    lastOffseasonMoves: appliedMoves,
    lastRetirements: retiring.retired,
    // Last spring's series feed the rivalries; everything cools a notch.
    rivalries: rivalriesAfterSeason(prev.rivalries, prev.playoff, prev.userTeamId, `temporada ${prev.gmLegacy.seasons}`),
    allStar: undefined,
    cup: undefined,
    schedule: [],
    tradeOffers: [],
  };
};

// Draft over -> CPUs fill holes via free agency (now that rookies landed), then
// the market opens for the user.
export const finishDraft = (prev: SeasonState): SeasonState => {
  const trimmed = trimCpuRosters(prev.teams, prev.players, prev.userTeamId);
  const cpuFa = runCpuFreeAgency(trimmed.teams, trimmed.players, prev.userTeamId);
  return {
    ...prev,
    status: 'free_agency',
    teams: cpuFa.teams,
    players: cpuFa.players,
    // Budgeted for the same reason the offseason batch above is: the CPU
    // signs across all 29 teams at once, which on its own overruns the
    // 60-slot buffer and wipes every earlier offseason headline out of
    // the save. Capped, the buffer keeps a mix instead of one stage's
    // worth of routine signings.
    events: [...cpuFa.events.slice(0, 15), ...prev.events].slice(0, 60),
    draft: undefined,
    };
};

// Opening night. Returns the season unchanged while the user roster is below
// the legal minimum.
export const startSeason = (prev: SeasonState): SeasonState => {
  const uTeam0 = prev.teams.find((t) => t.id === prev.userTeamId);
  if (uTeam0 && (uTeam0.roster.length < MIN_ROSTER_SIZE || uTeam0.roster.length > MAX_ROSTER_SIZE)) return prev;
  // The user passed on his own free agents: the Bird right lapses and the
  // market gets one last look at everyone still unsigned, so nobody good sits
  // out a whole season because the user said no.
  const released: { [k: string]: Player } = { ...prev.players };
  for (const id in released) {
    if (released[id].birdTeamId === prev.userTeamId) released[id] = { ...released[id], birdTeamId: undefined };
  }
  const lastCall = runCpuFreeAgency(prev.teams, released, prev.userTeamId);
  prev = { ...prev, teams: lastCall.teams, players: lastCall.players, events: [...lastCall.events.slice(0, 6), ...prev.events].slice(0, 60) };
  const uTeam = prev.teams.find((t) => t.id === prev.userTeamId);
  // Wipe last season's box scores so leaders/awards start clean.
  const freshPlayers: { [key: string]: Player } = {};
  for (const id in prev.players) freshPlayers[id] = { ...prev.players[id], seasonStats: undefined };
  // Re-derive the owner mandate now that rosters are final, carrying
  // confidence forward from last season's judgment.
  let owner = uTeam ? buildSeasonOwner(uTeam, prev.teams, freshPlayers, prev.owner) : prev.owner;
  // The luxury tax bill lands on opening night, on rosters that are now final.
  const payroll = uTeam ? getTeamSalary(uTeam, freshPlayers) : 0;
  const taxHit = luxuryTaxConfidenceHit(payroll);
  if (taxHit > 0) {
    owner = {
      ...owner,
      confidence: Math.max(0, owner.confidence - taxHit),
      adjustment: -taxHit,
      note: `A folha de $${(payroll / 1_000_000).toFixed(1)}M passa da linha de imposto ($${(LUXURY_TAX / 1_000_000).toFixed(1)}M). `
        + `O dono paga a conta e cobra: -${taxHit} de confiança nesta temporada.`,
    };
  }
  return {
    ...prev,
    status: 'active',
    gamesPlayed: 0,
    players: freshPlayers,
    owner,
    cup: simulationEngine.initCupGroups(prev.teams),
    schedule: generateSchedule(prev.teams),
  };
};
