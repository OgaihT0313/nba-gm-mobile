import './global.css';
import React, { useState, useEffect, useCallback } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Inter_900Black_Italic } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';

import { Team, Player, Coach, SeasonState, DraftState, Event, LiveTactic, Notification as NotificationType, OffseasonMove } from './types';
import { teamsData, playersData, offseasonMoves, picksOf } from './constants';
import { ERAS, eraById } from './data/eras';
import { simulationEngine, ROTATION_MIN, ROTATION_MAX } from './services/simulationService';
import { buildSeasonOwner, evaluateSeasonOutcome } from './services/ownerService';
import { generateSchedule } from './services/scheduleService';
import { simulateOneDay, SimEffect, ALL_STAR_GAME, PinnedGameResult } from './services/seasonRunner';
import { WatchableGame } from './services/simulationService';
import { MIN_ROSTER_SIZE } from './services/tradeService';
import {
  buildDraftBoard, initialPickAssets, grantNextWindowPick, PICK_WINDOW,
  generateDraftClass, generateRealDraftClass, generateUndraftedClass, advanceDraftToUser, makeUserPick,
  scoutProspect, consensusValue, SCOUT_BUDGET,
} from './services/draftService';
import { processOffseasonContracts, runCpuFreeAgency, signFreeAgentLegality, newContractYears, evaluateSigningInterest } from './services/freeAgencyService';
import { accumulateCareers, championRosterOf } from './services/careerService';
import { initCoaches, ageCoachesAndRetire, buildDevelopmentBonusMap, fireCoach, hireCoach } from './services/coachService';
import { generateAnalysis } from './services/geminiService';

import { ThemeProvider } from './src/theme/ThemeProvider';
import { COLORS } from './src/theme/tokens';
import BottomNav from './components/BottomNav';
import Home from './screens/Home';
import EraSelect from './screens/EraSelect';
import TeamSelect from './screens/TeamSelect';
import TeamConfirm from './screens/TeamConfirm';
import SimulationScreen from './screens/SimulationScreen';
import WatchGameScreen from './screens/WatchGameScreen';
import MyTeamHub from './screens/MyTeamHub';
import Scout from './screens/Scout';
import AwardsScreen from './screens/AwardsScreen';
import PlayoffsScreen from './screens/PlayoffsScreen';
import LiveGameScreen from './screens/LiveGameScreen';
import TradeCenter from './screens/TradeCenter';
import Draft from './screens/Draft';
import FreeAgency from './screens/FreeAgency';
import LeagueLeaders from './screens/LeagueLeaders';
import AllStarWeekend from './screens/AllStarWeekend';
import TeamsList from './screens/TeamsList';
import TeamDetail from './screens/TeamDetail';
import StandingsScreen from './screens/StandingsScreen';
import NotificationContainer from './components/NotificationContainer';
import FiredOverlay from './components/FiredOverlay';
import FadeInView from './components/FadeInView';
import Placeholder from './screens/Placeholder';
import { IconName } from './components/Icon';

type AppView =
  | 'era-select' | 'team-select' | 'team-confirm' | 'home' | 'teams' | 'team-detail' | 'scout' | 'my-team' | 'draft' | 'free-agency'
  | 'simulation' | 'standings' | 'leaders' | 'trade' | 'awards' | 'allstar' | 'playoffs' | 'live-game' | 'watch-game';

// How often (in simulated games) a fresh league-wide commentary is requested.
const COMMENTARY_INTERVAL = 10;

const buildLeagueCommentaryPrompt = (teams: Team[], players: { [key: string]: Player }, events: Event[], gamesPlayed: number) => {
  const ranked = [...teams].sort((a, b) => (b.wins || 0) - (a.wins || 0));
  const top3 = ranked.slice(0, 3).map((t) => `${t.name} (${t.wins || 0}-${t.losses || 0})`).join(', ');
  const bottom3 = ranked.slice(-3).map((t) => `${t.name} (${t.wins || 0}-${t.losses || 0})`).join(', ');
  const topPlayers = (Object.values(players) as Player[]).filter((p) => !p.prospect).sort((a, b) => b.ovr - a.ovr).slice(0, 5).map((p) => `${p.name} (${p.ovr})`).join(', ');
  const recentEvents = events.slice(0, 5).map((e) => e.message).join(' | ') || 'nada relevante';

  return `Você é um comentarista de basquete estilo ESPN cobrindo a NBA em tempo real. A temporada está em ${gamesPlayed} de 82 jogos.
Melhores campanhas: ${top3}.
Piores campanhas: ${bottom3}.
Jogadores mais bem avaliados da liga: ${topPlayers}.
Acontecimentos recentes: ${recentEvents}.
Escreva um comentário de 3 a 4 frases, em português, num tom de análise esportiva de TV, destacando storylines interessantes da liga (favoritos, zebras, times surpreendendo). Não invente placares ou estatísticas específicas de jogos — fale de forma qualitativa.`;
};

// Deterministic commentary used whenever the AI proxy is down/rate-limited (the
// free tier caps out at ~20 calls/day), so the panel always shows a sensible,
// standings-aware line instead of an error.
const buildLocalCommentary = (teams: Team[], gamesPlayed: number): string => {
  const ranked = [...teams].sort((a, b) => (b.wins || 0) - (a.wins || 0));
  const leader = ranked[0];
  const worst = ranked[ranked.length - 1];
  const east = [...teams].filter((t) => t.conference === 'East').sort((a, b) => (b.wins || 0) - (a.wins || 0))[0];
  const west = [...teams].filter((t) => t.conference === 'West').sort((a, b) => (b.wins || 0) - (a.wins || 0))[0];
  const record = (t?: Team) => (t ? `${t.wins || 0}-${t.losses || 0}` : '');
  const phase = gamesPlayed < 27 ? 'No início de temporada' : gamesPlayed < 55 ? 'Já passando da metade da temporada' : 'Na reta final da temporada regular';
  return `${phase}, o ${leader?.name} lidera a liga com campanha de ${record(leader)} e chega embalado. ` +
    `Na disputa por conferência, ${east?.name} (${record(east)}) manda no Leste enquanto ${west?.name} (${record(west)}) domina o Oeste. ` +
    `Do outro lado da tabela, o ${worst?.name} (${record(worst)}) segue penando e já pensa no futuro.`;
};

const PLACEHOLDERS: Record<string, { title: string; icon: IconName }> = {
  teams: { title: 'Franquias', icon: 'teams' },
  scout: { title: 'Scout', icon: 'scout' },
  'my-team': { title: 'Meu Time', icon: 'my-team' },
  draft: { title: 'Draft', icon: 'draft' },
  'free-agency': { title: 'Agência Livre', icon: 'free-agency' },
  standings: { title: 'Classificação', icon: 'standings' },
  leaders: { title: 'Líderes', icon: 'leaders' },
  trade: { title: 'Trocas', icon: 'trade' },
  awards: { title: 'Prêmios', icon: 'awards' },
  allstar: { title: 'All-Star', icon: 'all-star' },
  playoffs: { title: 'Playoffs', icon: 'playoffs' },
};

export default function App() {
  // Hero display face (Inter 900 italic) + the mono face used for stat/score
  // numbers. Keys must match the tailwind fontFamily tokens (font-display,
  // font-mono, font-mono-bold).
  const [fontsLoaded] = useFonts({
    Inter_900BlackItalic: Inter_900Black_Italic,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
  });

  const [view, setView] = useState<AppView>('home');
  const [season, setSeason] = useState<SeasonState | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [targetGames, setTargetGames] = useState(0);
  // The user's next fixture, pre-resolved for the 3D "Assistir ao Jogo"
  // screen. `home`/`away` are Team OBJECTS (not just ids) captured at the
  // moment the user tapped "assistir" — the screen needs them immediately
  // for team colors/names, and re-deriving them from season.teams later
  // risks drifting if state changes underneath (it doesn't here, but this
  // keeps the screen decoupled from season shape).
  const [watchGame, setWatchGame] = useState<{ home: Team; away: Team; game: WatchableGame } | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  // The franchise being previewed on the confirmation screen — chosen, but not
  // committed to yet, so it must not touch `season`.
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  // The era picked before the franchise — null = today's live snapshot (the
  // default). Same "chosen but not committed" lifecycle as pendingTeamId,
  // just one screen earlier; only becomes part of `season` inside initSeason.
  const [pendingEraId, setPendingEraId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [isCommentaryLoading, setIsCommentaryLoading] = useState(false);

  // Date.now() alone collides when several events fire in the same tick
  // (season end, offseason) → duplicate keys; the random suffix keeps ids unique.
  const addNotification = useCallback((message: string, type: string) => {
    const id = Date.now() + Math.random();
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 5000);
  }, []);

  // Replay the runner's effects on the main thread. Both view switches route for
  // real (AwardsScreen + AllStarWeekend are ported) and notifications surface as
  // toasts — full parity with the web now.
  const applyEffect = (effect: SimEffect) => {
    if (effect.kind === 'view') setView(effect.view);
    else if (effect.kind === 'notification') addNotification(effect.message, effect.type);
  };

  // Day-by-day simulation loop. RN has no Web Worker, so the ported seasonRunner
  // runs on the JS thread — but advancing ONE day per tick (setTimeout) keeps
  // the thread yielding and applies the new season each day, so the standings
  // and progress bar animate live. Same incremental pattern the web app used
  // before it moved the batch into a worker.
  useEffect(() => {
    if (!isSimulating) return;
    if (!season || season.status !== 'active' || season.gamesPlayed >= targetGames) {
      setIsSimulating(false);
      return;
    }
    const t = setTimeout(() => {
      const { season: next, effects, fired } = simulateOneDay(season);
      effects.forEach(applyEffect);
      setSeason(next);
      if (fired) setIsSimulating(false);
    }, 16);
    return () => clearTimeout(t);
  }, [season, isSimulating, targetGames]);

  // Refresh the league commentary once a sim settles and COMMENTARY_INTERVAL
  // games have passed since the last one. Comparing against the last
  // checkpoint (rather than an exact `gp % 10 === 0`) keeps it correct however
  // far a single batch jumps. Fire-and-forget — never blocks the sim.
  useEffect(() => {
    if (!season || season.status !== 'active' || isCommentaryLoading || isSimulating) return;
    const gp = season.gamesPlayed;
    const last = season.leagueCommentary?.gamesPlayed ?? 0;
    if (gp === 0 || gp - last < COMMENTARY_INTERVAL) return;

    setIsCommentaryLoading(true);
    const prompt = buildLeagueCommentaryPrompt(season.teams, season.players, season.events, gp);
    const local = buildLocalCommentary(season.teams, gp);
    generateAnalysis(prompt, local).then((text) => {
      setSeason((prev) => (prev ? { ...prev, leagueCommentary: { text: text.trim(), gamesPlayed: gp } } : null));
      setIsCommentaryLoading(false);
    });
  }, [season?.gamesPlayed, season?.status, isSimulating]);

  const runSimulation = (target: number) => {
    if (!season || season.status !== 'active' || isSimulating || season.gamesPlayed >= target) return;
    setTargetGames(target);
    setIsSimulating(true);
  };

  // --- WATCH GAME (3D) ---
  // Resolves the user's next fixture through the real engine RIGHT NOW
  // (simulateGameEvents calls simulateGame exactly once) and stashes the
  // result — the watch screen only plays it back, it never re-rolls it, so
  // whatever the user sees IS what finishWatchGame() commits to the season.
  const startWatchGame = (opponent: Team, atHome: boolean) => {
    if (!season || season.status !== 'active' || isSimulating) return;
    const userTeam = season.teams.find((t) => t.id === season.userTeamId);
    if (!userTeam) return;
    const home = atHome ? userTeam : opponent;
    const away = atHome ? opponent : userTeam;
    const game = simulationEngine.simulateGameEvents(home, away, season.players, home.id, season.coaches);
    setWatchGame({ home, away, game });
    setView('watch-game');
  };

  // The watched game's score is pinned into simulateOneDay so today's fixture
  // isn't simulated a second time with a different outcome — everything else
  // (records, box score, morale, injuries, trade offers, calendar checkpoints)
  // proceeds exactly like a normal day advance.
  const finishWatchGame = () => {
    if (!season || !watchGame) return;
    const pinned: PinnedGameResult = {
      homeTeamId: watchGame.home.id,
      awayTeamId: watchGame.away.id,
      scoreHome: watchGame.game.scoreA,
      scoreAway: watchGame.game.scoreB,
    };
    const { season: next, effects, fired } = simulateOneDay(season, pinned);
    effects.forEach(applyEffect);
    setSeason(next);
    setWatchGame(null);
    // A day that ends the season/hits All-Star already routes itself via a
    // 'view' effect above (awards/allstar) — only fall back to the normal
    // simulation screen when nothing else claimed the navigation.
    if (!fired && !effects.some((e) => e.kind === 'view')) setView('simulation');
  };

  // Advance one playoff round. Ported from the web: when a champion is crowned
  // the owner judges the season (fire/keep), the honors are archived into
  // awardHistory, and gmLegacy ticks up.
  // The two teams a PlayoffState.pendingDecider ref points at — pulled out of
  // whichever bracket slot it names, so advancePlayoffs and the live-game
  // resolution handler don't duplicate this lookup.
  const pendingDeciderTeams = (playoff: SeasonState['playoff']) => {
    const ref = playoff?.pendingDecider;
    if (!ref || !playoff) return null;
    const series = ref.scope === 'finals' ? playoff.finals : playoff[ref.conf].bracket[ref.round][ref.index];
    if (!series?.m[0] || !series?.m[1]) return null;
    return { teamA: series.m[0], teamB: series.m[1] };
  };

  // Shared by advancePlayoffs and handleResolveLiveGame (a Finals decider
  // resolves outside advancePlayoffRound's normal return path, but crowning a
  // champion needs the exact same owner-judgment/awardHistory/gmLegacy side
  // effects either way). Always clears liveGame — a resolved decisive game is
  // done being live either way.
  const applyPlayoffUpdate = (updatedPlayoff: NonNullable<SeasonState['playoff']>, newChampion?: Team) => {
    if (!season) return;
    let ownerAfter = season.owner;
    if (newChampion) {
      const uTeam = season.teams.find((t) => t.id === season.userTeamId);
      if (uTeam) {
        // "Made the playoffs" = reached the real 8-team bracket, not just the play-in.
        const inRound1 = (conf: typeof updatedPlayoff.east) =>
          conf.bracket.round1.some((s) => s.m.some((t) => t?.id === season.userTeamId));
        const madePlayoffs = inRound1(updatedPlayoff.east) || inRound1(updatedPlayoff.west);
        const wonTitle = newChampion.id === season.userTeamId;
        const outcome = evaluateSeasonOutcome(season.owner, uTeam, madePlayoffs, wonTitle);
        ownerAfter = { ...season.owner, confidence: outcome.confidence, fired: outcome.fired, note: outcome.message };
      }
    }

    setSeason((prev) => {
      if (!prev) return null;
      let awardHistory = prev.awardHistory;
      if (newChampion && prev.awards) {
        awardHistory = [
          ...prev.awardHistory,
          {
            season: prev.gmLegacy.seasons + 1,
            championId: newChampion.id,
            mvp: prev.awards.mvp,
            dpoy: prev.awards.dpoy,
            roy: prev.awards.roy,
            smoy: prev.awards.smoy,
            mip: prev.awards.mip,
            finalsMvp: updatedPlayoff.awards.finalsMVP,
          },
        ];
      }
      return {
        ...prev,
        playoff: updatedPlayoff,
        liveGame: undefined,
        status: newChampion ? 'offseason' : prev.status,
        owner: ownerAfter,
        awardHistory,
        gmLegacy: newChampion
          ? {
              seasons: prev.gmLegacy.seasons + 1,
              titles: prev.gmLegacy.titles + (newChampion.id === prev.userTeamId ? 1 : 0),
            }
          : prev.gmLegacy,
      };
    });
  };

  const advancePlayoffs = () => {
    if (!season || !season.playoff) return;
    if (season.liveGame) return; // a decisive game is already being played out
    const { updatedPlayoff, newChampion } = simulationEngine.advancePlayoffRound(season.playoff, season.players, season.coaches, season.userTeamId);

    if (updatedPlayoff.pendingDecider) {
      const teams = pendingDeciderTeams(updatedPlayoff);
      if (teams) {
        const liveGame = simulationEngine.startLiveGame(updatedPlayoff.pendingDecider, teams.teamA, teams.teamB, season.userTeamId);
        setSeason((prev) => (prev ? { ...prev, playoff: updatedPlayoff, liveGame } : prev));
        setView('live-game');
      }
      return;
    }

    applyPlayoffUpdate(updatedPlayoff, newChampion);
    if (newChampion) setView('awards');
  };

  // --- LIVE DECISIVE GAME (Fase F) ---
  const handleAdvanceLiveQuarter = () => {
    setSeason((prev) => {
      if (!prev || !prev.liveGame || !prev.playoff) return prev;
      const teams = pendingDeciderTeams(prev.playoff);
      if (!teams) return prev;
      const liveGame = simulationEngine.advanceLiveQuarter(prev.liveGame, teams.teamA, teams.teamB, prev.players, prev.coaches);
      return { ...prev, liveGame };
    });
  };

  const handleRequestLiveTimeout = () => {
    setSeason((prev) => {
      if (!prev || !prev.liveGame || prev.liveGame.timeoutsLeft <= 0 || prev.liveGame.pendingTimeout) return prev;
      return { ...prev, liveGame: { ...prev.liveGame, pendingTimeout: true } };
    });
  };

  const handleSetLiveTactic = (tactic: LiveTactic | null) => {
    setSeason((prev) => {
      if (!prev || !prev.liveGame) return prev;
      return { ...prev, liveGame: { ...prev.liveGame, pendingTactic: tactic } };
    });
  };

  // The live game is over — write its result back into the exact bracket slot
  // it came from and return to the normal playoff flow. A Finals decider
  // crowns a champion right here (applyPlayoffUpdate handles that uniformly);
  // any other round just needs one more "SIMULAR RODADA" click to continue.
  const handleResolveLiveGame = () => {
    if (!season || !season.liveGame || !season.liveGame.complete || !season.playoff) return;
    const teams = pendingDeciderTeams(season.playoff);
    if (!teams || !season.liveGame.winnerId) return;
    const updatedPlayoff = simulationEngine.applyDeciderResult(season.playoff, teams.teamA, teams.teamB, season.liveGame.winnerId);
    const newChampion = updatedPlayoff.champion ?? undefined;
    applyPlayoffUpdate(updatedPlayoff, newChampion);
    setView(newChampion ? 'awards' : 'playoffs');
  };

  // --- OFFSEASON (ported from the web) ---
  // Champion crowned → progression, real NBA offseason moves replayed, contracts
  // tick down, then the rookie draft (BEFORE free agency, matching the real
  // calendar). CPU free agency waits until the draft finishes.
  const handleStartNewSeason = () => {
    setSeason((prev) => {
      if (!prev) return prev;
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
      }));

      // No retirement system: rosters carry every player straight through from
      // progression into the offseason moves/contracts below.
      const rosterPlayers = updatedPlayers;

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
        });
      };
      let nextEraChainIndex = prev.eraChainIndex;
      if (prev.era) {
        applyMoves(prev.eraChainIndex !== undefined ? (ERAS[prev.eraChainIndex]?.offseasonMoves.moves ?? []) : []);
        nextEraChainIndex = prev.eraChainIndex !== undefined ? prev.eraChainIndex + 1 : undefined;
      } else if (!prev.offseasonMovesApplied) {
        applyMoves(offseasonMoves.moves);
      }

      const contracts = processOffseasonContracts(newTeams, rosterPlayers);
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
        events: [...advanced.events, ...contracts.events, ...board.events, ...moveEvents, ...coaching.events, ...progressionEvents, ...prev.events].slice(0, 60),
        playoff: null,
        awards: null,
        offseasonMovesApplied: true,
        eraChainIndex: nextEraChainIndex,
        allStar: undefined,
        leagueCommentary: undefined,
        cup: undefined,
        schedule: [],
        tradeOffers: [],
      };
    });
    setView('draft');
  };

  const handleDraftPick = (playerId: string) => {
    setSeason((prev) => {
      if (!prev || !prev.draft) return prev;
      const { draft, teams, players, events } = makeUserPick(prev.draft, prev.teams, prev.players, prev.userTeamId, playerId);
      return { ...prev, draft, teams, players, events: [...events, ...prev.events].slice(0, 60) };
    });
  };

  const handleAutoPick = () => {
    setSeason((prev) => {
      if (!prev || !prev.draft || prev.draft.available.length === 0) return prev;
      // Skipping hands the pick to the same board the CPU uses — the projected
      // rating, not the real one. "Let the staff decide" can bust too.
      const bestId = [...prev.draft.available].sort(
        (a, b) => consensusValue(prev.draft!.reports[b]) - consensusValue(prev.draft!.reports[a]),
      )[0];
      const { draft, teams, players, events } = makeUserPick(prev.draft, prev.teams, prev.players, prev.userTeamId, bestId);
      return { ...prev, draft, teams, players, events: [...events, ...prev.events].slice(0, 60) };
    });
  };

  // Spends one scouting report on a prospect: tightens his projected band and
  // reveals a note. No-op (returns prev untouched) when the budget is gone or
  // he's already fully scouted — scoutProspect decides, not the UI.
  const handleScoutProspect = (playerId: string) => {
    setSeason((prev) => {
      if (!prev || !prev.draft) return prev;
      const draft = scoutProspect(prev.draft, prev.players, playerId);
      return draft ? { ...prev, draft } : prev;
    });
  };

  // Draft over → CPUs fill holes via free agency (now that rookies landed), then
  // the market opens for the user.
  const handleFinishDraft = () => {
    setSeason((prev) => {
      if (!prev) return prev;
      const cpuFa = runCpuFreeAgency(prev.teams, prev.players, prev.userTeamId);
      return {
        ...prev,
        status: 'free_agency',
        teams: cpuFa.teams,
        players: cpuFa.players,
        events: [...cpuFa.events, ...prev.events].slice(0, 60),
        draft: undefined,
      };
    });
    setView('free-agency');
  };

  const handleSignFreeAgent = (playerId: string) => {
    setSeason((prev) => {
      if (!prev) return prev;
      const player = prev.players[playerId];
      const team = prev.teams.find((t) => t.id === prev.userTeamId);
      if (!player || !team) return prev;
      if (!signFreeAgentLegality(team, player, prev.players).legal) return prev;
      // Players have agency — a star won't ride the bench on a rebuild.
      if (!evaluateSigningInterest(player, team, prev.teams, prev.players).willing) return prev;
      const sortByOvr = (roster: string[]) => [...roster].sort((a, b) => (prev.players[b]?.ovr || 0) - (prev.players[a]?.ovr || 0));
      return {
        ...prev,
        players: { ...prev.players, [playerId]: { ...player, contractYears: newContractYears(player) } },
        teams: prev.teams.map((t) => (t.id === prev.userTeamId ? { ...t, roster: sortByOvr([...t.roster, playerId]) } : t)),
      };
    });
  };

  const handleStartSeason = () => {
    setSeason((prev) => {
      if (!prev) return prev;
      const uTeam = prev.teams.find((t) => t.id === prev.userTeamId);
      if (uTeam && uTeam.roster.length < MIN_ROSTER_SIZE) return prev;
      // Wipe last season's box scores so leaders/awards start clean.
      const freshPlayers: { [key: string]: Player } = {};
      for (const id in prev.players) freshPlayers[id] = { ...prev.players[id], seasonStats: undefined };
      // Re-derive the owner mandate now that rosters are final, carrying
      // confidence forward from last season's judgment.
      const owner = uTeam ? buildSeasonOwner(uTeam, prev.teams, freshPlayers, prev.owner) : prev.owner;
      return {
        ...prev,
        status: 'active',
        gamesPlayed: 0,
        players: freshPlayers,
        owner,
        cup: simulationEngine.initCupGroups(prev.teams),
        schedule: generateSchedule(prev.teams),
      };
    });
    setView('simulation');
  };

  // Execute a user-proposed trade. Rosters are "best player first" by
  // convention (the sim reads roster.slice(0,8) as the rotation), so incoming
  // players MUST be re-sorted by OVR, not appended — this was a real bug in the
  // web app where a newly-acquired star contributed nothing.
  const sortByOvrWith = (players: { [k: string]: Player }) => (roster: string[]) =>
    [...roster].sort((a, b) => (players[b]?.ovr || 0) - (players[a]?.ovr || 0));

  const handleTradeExecute = (
    uTeamId: string,
    partnerTeamId: string,
    userAssets: string[],
    partnerAssets: string[],
    userPickIds: string[] = [],
    partnerPickIds: string[] = [],
    // Protection the user attached to their OWN outgoing picks, by pick id. The
    // CPU already priced these in (pickAssetValue discounts a protected pick),
    // so the flag just has to survive onto the asset that changes hands.
    protections: { [pickId: string]: number } = {},
  ) => {
    setSeason((prev) => {
      if (!prev) return prev;
      const sortByOvr = sortByOvrWith(prev.players);
      const sender = prev.teams.find((t) => t.id === uTeamId);
      const partner = prev.teams.find((t) => t.id === partnerTeamId);
      if (!sender || !partner) return prev;
      // A team can only send picks it holds, so both lists are filtered against
      // the actual inventories rather than trusted from the caller.
      const toPartner = picksOf(sender).filter((p) => userPickIds.includes(p.id))
        .map((p) => (protections[p.id] ? { ...p, protection: protections[p.id] } : p));
      const toUser = picksOf(partner).filter((p) => partnerPickIds.includes(p.id));

      const newTeams = prev.teams.map((t) => {
        if (t.id === uTeamId) return {
          ...t,
          roster: sortByOvr(t.roster.filter((id) => !userAssets.includes(id)).concat(partnerAssets)),
          picks: [...picksOf(t).filter((p) => !userPickIds.includes(p.id)), ...toUser],
        };
        if (t.id === partnerTeamId) return {
          ...t,
          roster: sortByOvr(t.roster.filter((id) => !partnerAssets.includes(id)).concat(userAssets)),
          picks: [...picksOf(t).filter((p) => !partnerPickIds.includes(p.id)), ...toPartner],
        };
        return t;
      });
      return { ...prev, teams: newTeams };
    });
  };

  // Accept a CPU offer. Re-validates against the CURRENT rosters (the offer may
  // be stale) and drops the offer either way.
  const handleAcceptOffer = (offerId: string) => {
    setSeason((prev) => {
      if (!prev) return prev;
      const offer = prev.tradeOffers?.find((o) => o.id === offerId);
      if (!offer) return prev;
      const cpu = prev.teams.find((t) => t.id === offer.fromTeamId);
      const user = prev.teams.find((t) => t.id === prev.userTeamId);
      const remainingOffers = (prev.tradeOffers || []).filter((o) => o.id !== offerId);
      if (!cpu || !user) return { ...prev, tradeOffers: remainingOffers };

      const stillValid =
        offer.requestIds.every((id) => user.roster.includes(id)) &&
        offer.offerIds.every((id) => cpu.roster.includes(id));
      if (!stillValid) return { ...prev, tradeOffers: remainingOffers };

      const sortByOvr = sortByOvrWith(prev.players);
      // Picks the CPU threw in move with the players. Filtered against what the
      // CPU actually still holds, since the offer may have gone stale.
      const offeredPickIds = offer.offerPickIds ?? [];
      const incomingPicks = picksOf(cpu).filter((p) => offeredPickIds.includes(p.id));
      const newTeams = prev.teams.map((t) => {
        if (t.id === user.id) return {
          ...t,
          roster: sortByOvr(t.roster.filter((id) => !offer.requestIds.includes(id)).concat(offer.offerIds)),
          picks: [...picksOf(t), ...incomingPicks],
        };
        if (t.id === cpu.id) return {
          ...t,
          roster: sortByOvr(t.roster.filter((id) => !offer.offerIds.includes(id)).concat(offer.requestIds)),
          picks: picksOf(t).filter((p) => !offeredPickIds.includes(p.id)),
        };
        return t;
      });
      return { ...prev, teams: newTeams, tradeOffers: remainingOffers };
    });
  };

  const handleRejectOffer = (offerId: string) => {
    setSeason((prev) => (prev ? { ...prev, tradeOffers: (prev.tradeOffers || []).filter((o) => o.id !== offerId) } : prev));
  };

  // The GM pins a starter to a lineup slot; getLineup honors it unless the
  // player is injured/suspended/traded or in a real slump.
  const handleSetStarter = (pos: string, playerId: string) => {
    setSeason((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        teams: prev.teams.map((t) => (t.id === prev.userTeamId ? { ...t, starters: { ...t.starters, [pos]: playerId } } : t)),
      };
    });
  };

  // How many players share real minutes — clamped here (not just in the sim)
  // so the stored value itself is always valid, not merely read-clamped.
  const handleSetRotationSize = (size: number) => {
    const clamped = Math.max(ROTATION_MIN, Math.min(ROTATION_MAX, Math.round(size)));
    setSeason((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        teams: prev.teams.map((t) => (t.id === prev.userTeamId ? { ...t, rotationSize: clamped } : t)),
      };
    });
  };

  // Toggle load management for one of the user's players — a persistent flag
  // (not a single-game rest), reducing his minutes share until turned back off.
  const handleToggleLoadManagement = (playerId: string) => {
    setSeason((prev) => {
      if (!prev) return prev;
      const team = prev.teams.find((t) => t.id === prev.userTeamId);
      if (!team) return prev;
      const current = team.loadManagedIds ?? [];
      const next = current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId];
      return {
        ...prev,
        teams: prev.teams.map((t) => (t.id === team.id ? { ...t, loadManagedIds: next } : t)),
      };
    });
  };

  // Waive a player off the user roster → free-agent pool. Guarded so the roster
  // can't drop below the legal minimum.
  const handleWaivePlayer = (playerId: string) => {
    let error: string | null = null;
    let waivedName: string | null = null;
    setSeason((prev) => {
      if (!prev) return prev;
      const team = prev.teams.find((t) => t.id === prev.userTeamId);
      const player = prev.players[playerId];
      if (!team || !player || !team.roster.includes(playerId)) return prev;
      if (team.roster.length <= MIN_ROSTER_SIZE) {
        error = `Você não pode ficar com menos de ${MIN_ROSTER_SIZE} jogadores no elenco.`;
        return prev;
      }
      // Drop the fixed-starter pick if the cut player held one, so the sim
      // doesn't try to start a player the team no longer has.
      const newStarters = team.starters
        ? Object.fromEntries(Object.entries(team.starters).filter(([, id]) => id !== playerId))
        : team.starters;
      waivedName = player.name;
      return {
        ...prev,
        teams: prev.teams.map((t) =>
          t.id === team.id
            ? { ...t, roster: t.roster.filter((id) => id !== playerId), starters: newStarters }
            : t
        ),
        // Any pending CPU offer that wanted this now-gone player is void.
        tradeOffers: (prev.tradeOffers || []).filter((o) => !o.requestIds.includes(playerId)),
      };
    });
    if (error) addNotification(error, 'error');
    else if (waivedName) addNotification(`${waivedName} foi dispensado e virou agente livre.`, 'trade');
  };

  // Fire the user's current coach. The team is left without one (CoachPanel
  // then prompts a hire) rather than auto-assigning a replacement — unlike a
  // coach retiring mid-lifecycle, a voluntary firing is a deliberate choice
  // the user should immediately follow up on.
  const handleFireCoach = () => {
    setSeason((prev) => {
      if (!prev) return prev;
      const team = prev.teams.find((t) => t.id === prev.userTeamId);
      if (!team || !team.coachId) return prev;
      const firedName = prev.coaches[team.coachId]?.name;
      return {
        ...prev,
        coaches: fireCoach(prev.coaches, team),
        teams: prev.teams.map((t) => (t.id === team.id ? { ...t, coachId: undefined } : t)),
        events: firedName
          ? [{ message: `🎓 ${firedName} foi demitido do comando do ${team.name}.`, type: 'info' }, ...prev.events].slice(0, 60)
          : prev.events,
      };
    });
  };

  // Hiring while someone is already employed swaps directly — drop the
  // incumbent first so he doesn't linger as an orphaned, unreferenced entry in
  // `coaches` (a closed set with no history to preserve, unlike players).
  const handleHireCoach = (coach: Coach) => {
    setSeason((prev) => {
      if (!prev) return prev;
      const team = prev.teams.find((t) => t.id === prev.userTeamId);
      if (!team) return prev;
      const coaches = fireCoach(prev.coaches, team);
      return {
        ...prev,
        coaches: hireCoach(coaches, coach),
        teams: prev.teams.map((t) => (t.id === team.id ? { ...t, coachId: coach.id } : t)),
        events: [{ message: `🎓 ${coach.name} é o novo técnico do ${team.name}.`, type: 'info' }, ...prev.events].slice(0, 60),
      };
    });
  };

  // Ported verbatim from the web App.tsx — builds a fresh season with real
  // schedule, cup groups, and owner mandate from the pure ported services.
  // `pendingEraId` (set on the EraSelect screen, null = today's live
  // snapshot) picks which real roster/rating data seeds this save — the ONLY
  // place an era matters. Everything below this point (and every other
  // screen/service) is era-agnostic.
  const initSeason = (teamId: string) => {
    const era = pendingEraId ? eraById(pendingEraId) : undefined;
    const seedTeams = era ? era.teams : teamsData;
    const seedPlayers = era ? era.players : playersData;

    // Every team starts holding its own first-rounder for the next three drafts
    // (see PICK_WINDOW) — the inventory the trade market runs on.
    const initialTeams: Team[] = initialPickAssets(
      seedTeams.map((t) => ({
        ...t,
        wins: 0,
        losses: 0,
        momentum: 0,
        stats: { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
        performanceHistory: [{ gamesPlayed: 0, wins: 0 }],
      })),
      1,
    );
    const { coaches, teams: teamsWithCoaches } = initCoaches(initialTeams);
    const userTeam = teamsWithCoaches.find((t) => t.id === teamId)!;
    setSeason({
      status: 'active',
      playoffStage: 'none',
      gamesPlayed: 0,
      teams: teamsWithCoaches,
      players: { ...seedPlayers },
      events: [],
      playoff: null,
      awards: null,
      userTeamId: teamId,
      cup: simulationEngine.initCupGroups(teamsWithCoaches),
      gmLegacy: { seasons: 0, titles: 0 },
      awardHistory: [],
      owner: buildSeasonOwner(userTeam, teamsWithCoaches, seedPlayers),
      schedule: generateSchedule(teamsWithCoaches),
      coaches,
      era: era ? { id: era.id, label: era.label, seasonLabel: era.seasonLabel } : undefined,
      // Real-history replay starts at this era's own chain entry — see
      // eraChainIndex's comment in types.ts.
      eraChainIndex: era ? ERAS.findIndex((e) => e.id === era.id) : undefined,
    });
    setView('simulation');
  };

  const userTeam = season?.teams.find((t) => t.id === season.userTeamId) ?? null;

  // Which draft is next, on the same 1-indexed scale pick assets use: during
  // season 1 (no completed seasons yet) the upcoming draft is #1. handleStartNewSeason
  // holds draft #awardHistory.length, by which point the finished season is in.
  const currentDraft = (season?.awardHistory.length ?? 0) + 1;

  // The pending era's own roster/rating data, or today's live snapshot when
  // none is picked (pendingEraId null) — read by TeamConfirm/TeamSelect below
  // and by initSeason, so a chosen-but-not-yet-committed era is what the
  // franchise picker actually shows.
  const activeEra = pendingEraId ? eraById(pendingEraId) : undefined;
  const activeTeamsData = activeEra ? activeEra.teams : teamsData;
  const activePlayersData = activeEra ? activeEra.players : playersData;

  const renderScreen = () => {
    // Home must be checked before the `!season` catch-all below, or the hero
    // would never render — it's the pre-season entry point.
    if (view === 'home') {
      return <Home onStart={() => setView('era-select')} onContinue={season ? () => setView('simulation') : undefined} season={season} />;
    }
    // Era choice — before the franchise picker, same "no season yet" reasoning
    // as team-confirm below.
    if (view === 'era-select') {
      return (
        <EraSelect
          onSelect={(eraId) => { setPendingEraId(eraId); setView('team-select'); }}
        />
      );
    }
    // The confirmation step is the moment the app gains the franchise color —
    // it must be checked before the `!season` catch-all, since no season exists
    // yet at that point.
    if (view === 'team-confirm' && pendingTeamId) {
      const t = (activeTeamsData as Team[]).find((x) => x.id === pendingTeamId);
      if (t) {
        return (
          <TeamConfirm
            team={t}
            players={activePlayersData}
            teams={activeTeamsData as Team[]}
            onBack={() => setView('team-select')}
            onConfirm={() => initSeason(t.id)}
          />
        );
      }
    }
    if (!season || view === 'team-select') {
      return (
        <TeamSelect
          teams={activeTeamsData as Team[]}
          players={activePlayersData}
          onSelect={(id) => { setPendingTeamId(id); setView('team-confirm'); }}
        />
      );
    }
    if (view === 'simulation') {
      return (
        <SimulationScreen
          season={season}
          isSimulating={isSimulating}
          onAdvance={runSimulation}
          isCommentaryLoading={isCommentaryLoading}
          commentaryInterval={COMMENTARY_INTERVAL}
          onWatchGame={startWatchGame}
        />
      );
    }
    if (view === 'watch-game' && watchGame) {
      return (
        <WatchGameScreen
          home={watchGame.home}
          away={watchGame.away}
          game={watchGame.game}
          onFinish={finishWatchGame}
          eraId={season?.era?.id}
        />
      );
    }
    if (view === 'my-team' && userTeam) {
      return (
        <MyTeamHub
          team={userTeam}
          players={season.players}
          allTeams={season.teams}
          coaches={season.coaches}
          gmLegacy={season.gmLegacy}
          owner={season.owner}
          currentDraft={currentDraft}
          onWaive={handleWaivePlayer}
          onSetStarter={handleSetStarter}
          onFireCoach={handleFireCoach}
          onHireCoach={handleHireCoach}
          onSetRotationSize={handleSetRotationSize}
          onToggleLoadManagement={handleToggleLoadManagement}
        />
      );
    }
    if (view === 'scout') return <Scout players={season.players} teams={season.teams} userTeamId={season.userTeamId} />;
    if (view === 'standings') return <StandingsScreen season={season} />;
    if (view === 'leaders') return <LeagueLeaders players={season.players} teams={season.teams} />;
    if (view === 'allstar') return <AllStarWeekend allStar={season.allStar} players={season.players} teams={season.teams} allStarGame={ALL_STAR_GAME} />;
    if (view === 'teams') {
      return <TeamsList teams={season.teams} players={season.players} onSelect={(id) => { setSelectedTeamId(id); setView('team-detail'); }} />;
    }
    if (view === 'team-detail') {
      const t = season.teams.find((x) => x.id === selectedTeamId);
      if (t) return <TeamDetail team={t} players={season.players} teams={season.teams} coaches={season.coaches} currentDraft={currentDraft} onBack={() => setView('teams')} />;
    }
    if (view === 'trade') {
      return (
        <TradeCenter
          teams={season.teams}
          players={season.players}
          userTeamId={season.userTeamId}
          gamesPlayed={season.gamesPlayed}
          currentDraft={currentDraft}
          onTradeExecute={handleTradeExecute}
          offers={season.tradeOffers || []}
          onAcceptOffer={handleAcceptOffer}
          onRejectOffer={handleRejectOffer}
        />
      );
    }
    if (view === 'awards') {
      return <AwardsScreen season={season} onGoToPlayoffs={() => setView('playoffs')} onStartNewSeason={handleStartNewSeason} />;
    }
    if (view === 'playoffs') return <PlayoffsScreen season={season} onAdvanceRound={advancePlayoffs} onResumeLiveGame={() => setView('live-game')} />;
    if (view === 'live-game' && season.liveGame) {
      return (
        <LiveGameScreen
          liveGame={season.liveGame}
          teams={season.teams}
          onAdvanceQuarter={handleAdvanceLiveQuarter}
          onRequestTimeout={handleRequestLiveTimeout}
          onSetTactic={handleSetLiveTactic}
          onResolve={handleResolveLiveGame}
        />
      );
    }
    if (view === 'draft' && season.draft) {
      return <Draft season={season} onPick={handleDraftPick} onAutoPick={handleAutoPick} onFinish={handleFinishDraft} onScout={handleScoutProspect} />;
    }
    if (view === 'free-agency' && season.status === 'free_agency') {
      return <FreeAgency season={season} onSign={handleSignFreeAgent} onStartSeason={handleStartSeason} />;
    }
    const ph = PLACEHOLDERS[view];
    return <Placeholder title={ph?.title ?? view} icon={ph?.icon} />;
  };

  // Hold the first paint until the display face is ready — otherwise the hero
  // text pops from system font to Inter.
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      {/* The confirmation screen already themes to the franchise being previewed:
          per the design, choosing the team is the exact moment the app gains
          color, so the accent lands one step before the season actually starts. */}
      <ThemeProvider teamId={season?.userTeamId ?? (view === 'team-confirm' ? pendingTeamId : null)}>
        {/* Only the bottom edge is inset. The redesign gives every screen a
            full-bleed hero in the team's colors that has to bleed UNDER the
            status bar, so the top inset is applied inside <Screen> (as padding
            over the gradient) rather than as a letterbox around it. */}
        <SafeAreaView className="flex-1" style={{ backgroundColor: COLORS.bg }} edges={['bottom']}>
          <StatusBar style="light" />

          {/* Screen. Keyed on `view` so each navigation remounts and fades in —
              the RN stand-in for the web's AnimatePresence page transitions. */}
          <View className="flex-1">
            <FadeInView key={view} className="flex-1">
              {renderScreen()}
            </FadeInView>
            <NotificationContainer notifications={notifications} onRemove={(id) => setNotifications((p) => p.filter((n) => n.id !== id))} />
          </View>

          {/* Fired: full-screen takeover that ends the save. */}
          <FiredOverlay
            visible={!!season?.owner.fired}
            note={season?.owner.note}
            seasons={season?.gmLegacy.seasons ?? 0}
            titles={season?.gmLegacy.titles ?? 0}
            onRestart={() => {
              setSeason(null);
              setPendingEraId(null);
              setView('era-select');
            }}
          />

          {/* Bottom nav (only once a season exists) */}
          {season ? (
            <BottomNav
              view={view}
              onNavigate={(v) => setView(v as AppView)}
              hasSeason={!!season}
              faOpen={season.status === 'free_agency'}
              draftOpen={season.status === 'draft'}
            />
          ) : null}
        </SafeAreaView>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
