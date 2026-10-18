import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesktop } from '../components/desktop/useDesktop';

import { Team, Player, Coach, WatchPlay, LiveTactic } from '../types';
import { getTeamAccent, getTeamCity, getTeamNickname, getTeamTricode, formatPositions, playerLastName } from '../constants';
import { WATCH_PLAY_META, TACTIC_META, STARTING_TIMEOUTS, getRotationWeights } from '../services/simulationService';
import {
  buildFive,
  courtStateAt,
  advanceClock,
  possessionAt,
  planQuarter,
  scoutingReport,
  restagePossession,
  quarterSeconds,
  tipOffState,
  initialEnergy,
  breakRecovery,
  rotationAt,
  playbackRate,
  replayWindow,
  REGULATION_QUARTERS,
  type CourtSide,
  type CourtState,
  type Energy,
  type FiveOnCourt,
  type Possession,
  type QuarterPlan,
} from '../services/watchDirector';
import { ROLE_LABEL, analystAccuracy } from '../services/staffService';
import { stageOf, type Moment, type MomentResult } from '../services/career/careerMoments';
import { eraGroupForEraId } from '../data/eras';
import { getEraVisual } from '../src/theme/eraVisuals';
import { COLORS, INK, RADIUS, FONT, withAlpha, onAccent, ovrColor } from '../src/theme/tokens';
import { Panel, MonoLabel, Stat, CtaButton, GhostButton, Meter } from '../components/ui/kit';
import { onPacedFrame } from '../components/court3d/framePacer';
import Court3D, { CameraView, type CourtSound, type JumboData } from '../components/court3d/Court3D';
import { eraYear } from '../src/eraIdentity';
import { cheer, newCrowdHype } from '../components/court3d/Arena';
import type { RigPlayer } from '../components/court3d/PlayerRig';
import { createSoundEngine, type SoundEngine } from '../components/court3d/sound/soundEngine';
import { createAnnouncer, LINES, spokenName } from '../components/court3d/sound/announcer';

const CAMERA_VIEWS: { id: CameraView; label: string }[] = [
  { id: 'iso', label: 'Livre' },
  { id: 'tv', label: 'TV' },
  { id: 'close', label: 'Perto' },
  { id: 'overhead', label: 'Aérea' },
  { id: 'behind_basket', label: 'Cesta' },
];

const PLAY_ORDER: WatchPlay[] = ['pick_roll', 'pindown', 'post_up', 'iso'];
const TACTIC_ORDER: LiveTactic[] = ['defesa', 'ritmo', 'isolar'];

const SHOT_LABEL: { [points in 1 | 2 | 3]: string } = {
  1: 'LANCE LIVRE!',
  2: 'CESTA DE 2!',
  3: 'CESTA DE 3!',
};

// "Assistir ao Jogo" — the 3D court. Deliberately its own full-bleed layout
// (not <Screen>, which is a ScrollView built for card stacks) with floating
// glass panels over the canvas, same visual language as the quadra-3d.html
// prototype this was ported from.
//
// The game is NOT pre-resolved. It used to be: simulateGameEvents ran a whole
// simulateGame() before this screen mounted and the screen replayed the
// result. That made calling a play impossible — nothing the user did could
// matter to a score that already existed. Now a quarter is resolved when it
// starts (services/watchDirector.ts, a quarter's slice of the same
// computeExpectedPoints every game uses), the play the user calls in the huddle
// is folded into it, and the final score handed to onFinish is the sum of the
// baskets that actually went in on screen.

// How fast the clock runs is the director's call (advanceClock in
// services/watchDirector.ts): each trip is cut in as the offense sets up and
// played at a pace where nobody outruns a sprint, ~3 real minutes a quarter.
// That replaced a flat 9.6 game-seconds per real second, which moved players
// at ~250 ft/s, and the slow-motion trip after a called play, which only
// existed because a possession used to flash by in under two seconds.
const MAX_QUARTER = 8; // 4 regulation + 4 OT, a safety valve against an endless game

// Replays (the big plays, again, slowed, from the baseline): a dunk, a three
// of yours, or anyone's three in the fourth quarter on. Not at 4x -- that's
// the user saying he wants it over with -- and not more than one every
// REPLAY_GAP game-seconds, or a hot quarter turns into a highlight package.
const REPLAY_SLOW = 0.5;
const REPLAY_GAP = 90;
/** How long the jumbotron holds a moment ("DE TRÊS!"), ms. */
const JUMBO_MOMENT = 3200;

type Phase = 'huddle' | 'live' | 'final';

// The camera the user last picked, kept for the next game this session: it
// reset to the overview every time (phone playthrough, 2026-10-11).
let lastCameraView: CameraView = 'iso';
// Same for the announcer's voice: switched off once, it stays off.
let lastVoiceOn = true;
type HuddleTab = 'play' | 'lineup';

/** Below this the live panel calls a player out as spent. */
const EXHAUSTED = 35;

const energyColor = (e: number) => (e >= 70 ? COLORS.good : e >= 50 ? COLORS.warn : COLORS.cta);
const lastName = playerLastName;

/** Minutes each player spent on the floor in a plan's trips, added into `into`. */
const addMinutes = (into: { [id: string]: number }, plan: QuarterPlan, until = Infinity) => {
  for (const p of plan.possessions) {
    if (p.start >= until) continue;
    const secs = Math.min(p.end, until) - p.start;
    for (const five of [p.fiveHome, p.fiveAway]) {
      five?.players.forEach((pl) => { into[pl.playerId] = (into[pl.playerId] ?? 0) + secs / 60; });
    }
  }
};

const clockLabel = (secondsIntoQuarter: number, quarter: number) => {
  const remaining = Math.max(0, Math.round(quarterSeconds(quarter) - secondsIntoQuarter));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const periodLabel = (quarter: number, phase: Phase) => {
  if (phase === 'final') return 'Final';
  return quarter <= REGULATION_QUARTERS ? `${quarter}º Q` : `Prorrogação ${quarter - REGULATION_QUARTERS}`;
};

interface WatchGameScreenProps {
  home: Team;
  away: Team;
  players: { [key: string]: Player };
  coaches: { [key: string]: Coach };
  userTeamId: string;
  /** Called with the score that actually happened on screen — App pins exactly
   * this into the season, so the game is never re-rolled afterward. */
  onFinish: (scoreHome: number, scoreAway: number, minutes?: { [playerId: string]: number }) => void;
  /** Which historical era (if any) the save is in — see data/eras/index.ts.
   * Only used to pick Court3D's floor tone (Fase C's per-era visual
   * identity); undefined for a live/current-season save renders the exact
   * same court that already ships today. */
  eraId?: string;
  /** Set when this is the user's Game 7 ("Jogo 7 · Final do Leste"): the
   * huddle adds the quarter tactics and the game can't end tied. */
  decider?: string;
  /** The home team's title years for the arena's rafters (historyService.bannerYears). */
  homeBanners?: number[];
  /** Minha Carreira: you are a player on `userTeamId`, not its coach. No play
   * calling, lineup or timeouts; the game stops at your moments instead
   * (services/career/careerMoments.ts) and your man is marked on the floor. */
  career?: {
    meId: string;
    moments: Moment[];
    /** Decides one; the career keeps the result. */
    onMoment: (m: Moment, optionId: string) => MomentResult;
  };
}

const WatchGameScreen: React.FC<WatchGameScreenProps> = ({
  home, away, players, coaches, userTeamId, onFinish, eraId, decider, homeBanners, career,
}) => {
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  const homeAccent = getTeamAccent(home.id);
  const awayAccent = getTeamAccent(away.id);
  // Memoized: a fresh object literal here would be a new prop on every
  // scoreboard tick, re-reconciling the whole 3D scene five times a second.
  const courtVisual = useMemo(() => {
    const v = getEraVisual(eraId ? eraGroupForEraId(eraId)?.visualId : undefined);
    return v ? { floorColor: v.floorTone } : undefined;
  }, [eraId]);
  const userSide: CourtSide = home.id === userTeamId ? 'home' : 'away';
  // Stable across renders (the parent rebuilds the array): the banner texture
  // is drawn once, not on every scoreboard tick.
  const bannerKey = (homeBanners ?? []).join(',');
  const banners = useMemo(() => homeBanners, [bannerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Jersey numbers for Court3D, both rosters. Memoized for the same reason as
  // courtVisual: the 3D scene must not see a new object every scoreboard tick.
  const jerseyNumbers = useMemo(() => {
    const out: { [id: string]: RigPlayer } = {};
    [...home.roster, ...away.roster].forEach((id) => {
      const p = players[id];
      if (p) out[id] = { number: p.number, name: p.name, heightCm: p.heightCm, weightKg: p.weightKg, skinTone: p.skinTone, marked: id === career?.meId };
    });
    return out;
  }, [home, away, players, career?.meId]);

  const fives = useRef<{ home: FiveOnCourt; away: FiveOnCourt }>({
    home: buildFive(home, players, 'home'),
    away: buildFive(away, players, 'away'),
  });
  // Everyone's legs, carried across periods (see breakRecovery) and read back
  // out of the plan at a timeout (rotationAt).
  const energyRef = useRef<Energy>(initialEnergy([home, away], players));
  // Minutes actually played on screen, handed back with the score so the
  // season's box score -- and therefore load -- is the game you watched.
  const minutesRef = useRef<{ [id: string]: number }>({});
  const autoRef = useRef(true);
  // Set the first time the GM edits his five: his choice becomes the coach's
  // starters (see autoSubstitute), the rest of the rotation behind them.
  const priorityRef = useRef<string[] | undefined>(undefined);

  // --- Everything the 60fps loop touches lives in a ref, never in state. ---
  // Seeded with the tip-off so the court is already populated behind the
  // opening huddle instead of showing ten bodies stacked on the center spot.
  const courtRef = useRef<CourtState | null>(tipOffState(fives.current.home, fives.current.away));
  const planRef = useRef<QuarterPlan | null>(null);
  const phaseRef = useRef<Phase>('huddle');
  const quarterRef = useRef(1);
  const clockRef = useRef(0); // seconds into the current quarter
  const cutRef = useRef(0); // playback cuts so far (CourtState.cut)
  const completedRef = useRef({ home: 0, away: 0 }); // points from finished quarters
  const firedRef = useRef(0); // possessions already announced
  const speedRef = useRef(1);
  const playRef = useRef<WatchPlay>('pick_roll');
  // A basket waiting for its replay (starts when its trip ends), the replay
  // running, and when the last one was (quarter * 10000 + seconds).
  const pendingReplay = useRef<Possession | null>(null);
  const replayRef = useRef<{ plan: QuarterPlan; t: number; to: number } | null>(null);
  const lastReplayAt = useRef(-Infinity);
  // Points per player this game, for the jumbotron's top scorer.
  const pointsRef = useRef<Map<string, number>>(new Map());

  // --- State, updated a few times a second, never per frame. ---
  const [phase, setPhase] = useState<Phase>('huddle');
  const [quarter, setQuarter] = useState(1);
  const [clock, setClock] = useState(0);
  const [score, setScore] = useState({ home: 0, away: 0 });
  // Seconds left on the shot clock of the trip in progress; undefined between
  // trips and in the huddle. The trip's own start is when the clock reset.
  const [shotClock, setShotClock] = useState<number | undefined>(undefined);
  // How much of the 3D the top bar and the bottom panel cover, measured from
  // their layout, so the camera can frame the play in the strip between them.
  const [hudTop, setHudTop] = useState(0);
  const [livePanelH, setLivePanelH] = useState(0);
  const [screenH, setScreenH] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [play, setPlay] = useState<WatchPlay>('pick_roll');
  // Game 7 only. Lasts one quarter (a timeout inside it may change it).
  const [tactic, setTactic] = useState<LiveTactic | null>(null);
  const [timeoutsLeft, setTimeoutsLeft] = useState(STARTING_TIMEOUTS);
  const [isTimeoutHuddle, setIsTimeoutHuddle] = useState(false);
  const [cameraView, setCameraViewState] = useState<CameraView>(lastCameraView);
  const setCameraView = (v: CameraView) => { lastCameraView = v; setCameraViewState(v); };
  const [banner, setBanner] = useState<{ text: string; sub: string; color: string } | null>(null);
  const [huddleTab, setHuddleTab] = useState<HuddleTab>('play');
  const [autoSubs, setAutoSubs] = useState(true);
  // Bumped whenever the user's five or the energy map changes outside a plan
  // (a swap in the huddle, a quarter break), so the lineup panel re-reads refs.
  const [rotationTick, setRotationTick] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  // The analyst's read of the five the opponent opens this period with. One
  // per period: endQuarter swaps fives.current before bumping the quarter, so
  // this reads the five that will actually start it. A timeout keeps it.
  const userTeam = userSide === 'home' ? home : away;
  const report = useMemo(
    () => scoutingReport(userTeam, userSide === 'home' ? fives.current.away : fives.current.home, players),
    [quarter], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // The user's five and their energy as of the last scoreboard refresh.
  const [liveFive, setLiveFive] = useState<{ id: string; name: string; energy: number }[]>([]);
  const [replaying, setReplaying] = useState<1 | -1 | 0>(0);
  const [homeDefending, setHomeDefending] = useState(false);
  const [leader, setLeader] = useState<{ name: string; pts: number } | undefined>(undefined);
  const [moment, setMoment] = useState<{ title: string; sub?: string } | undefined>(undefined);

  // Minha Carreira: the moments still to come, the one on screen, and what
  // they have added to each side's score so far (fractions kept, the board
  // shows them rounded -- see withMoments).
  const pendingMoments = useRef<Moment[]>(career ? [...career.moments] : []);
  const momentAdj = useRef({ home: 0, away: 0 });
  // A staged trip's share of the adjustment waits for its ball to reach the
  // rim, so the board moves with the shot and not before it.
  const pendingAdj = useRef<{ quarter: number; at: number; side: CourtSide; value: number }[]>([]);
  const settleAdj = (all = false) => {
    if (!pendingAdj.current.length) return;
    const q = quarterRef.current;
    const keep: typeof pendingAdj.current = [];
    pendingAdj.current.forEach((e) => {
      if (all || e.quarter < q || (e.quarter === q && clockRef.current >= e.at)) {
        momentAdj.current = { ...momentAdj.current, [e.side]: momentAdj.current[e.side] + e.value } as { home: number; away: number };
      } else keep.push(e);
    });
    pendingAdj.current = keep;
  };
  const pausedRef = useRef(false);
  const [activeMoment, setActiveMoment] = useState<Moment | null>(null);
  const [momentLog, setMomentLog] = useState<MomentResult[]>([]);

  // Live-synthesized sound (components/court3d/sound): one engine for the
  // screen, opened on mount and closed on the way out.
  const sound = useRef<SoundEngine | null>(null);
  // The announcer (sound/announcer.ts) and the crowd's mood (Arena's cheer).
  const voice = useRef(createAnnouncer());
  const crowd = useRef(newCrowdHype());
  const [voiceOn, setVoiceOn] = useState(lastVoiceOn);
  useEffect(() => {
    const engine = createSoundEngine();
    sound.current = engine;
    engine.whistle(); // tip-off
    const v = voice.current;
    v.setEnabled(lastVoiceOn);
    // Leaving the app (home button, screen off) silences the arena; coming
    // back brings it back. Without this the crowd kept roaring in the pocket.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') engine.resume();
      else { engine.pause(); v.stop(); }
    });
    return () => { sub.remove(); sound.current = null; engine.close(); v.stop(); };
  }, []);
  const toggleVoice = () => {
    lastVoiceOn = !voiceOn;
    voice.current.setEnabled(lastVoiceOn);
    setVoiceOn(lastVoiceOn);
  };

  // The floor's own sounds come from the 3D: the ball hitting the hardwood on
  // each dribble (in time with the bounce you see) and a sneaker squeaking
  // when a player plants or cuts hard. They used to be a timer, unrelated to
  // anything on screen.
  const onCourtSound = useMemo(() => (kind: CourtSound) => {
    if (phaseRef.current !== 'live' || replayRef.current) return;
    if (kind === 'bounce') sound.current?.dribble(); else sound.current?.squeak();
  }, []);
  // Who led after the last basket, for the announcer's "virada".
  const leaderRef = useRef<CourtSide | null>(null);

  /* ---------------------------------------------------------------- */
  /* Score bookkeeping — always the sum of baskets that have actually  */
  /* gone in on screen, never the director's target for the quarter.   */
  /* ---------------------------------------------------------------- */
  const scoreAt = (seconds: number) => {
    let h = completedRef.current.home;
    let a = completedRef.current.away;
    const plan = planRef.current;
    if (plan) {
      for (const p of plan.possessions) {
        if (!p.made || p.shotAt > seconds) continue;
        if (p.side === 'home') h += p.points; else a += p.points;
      }
    }
    return { home: h, away: a };
  };
  // What the board shows: the baskets plus what your moments added. Kept out
  // of completedRef, which only ever holds the director's own baskets.
  const withMoments = (s: { home: number; away: number }) => {
    settleAdj();
    return withAdj(s);
  };
  const withAdj = (s: { home: number; away: number }) => ({
    home: s.home + Math.round(momentAdj.current.home),
    away: s.away + Math.round(momentAdj.current.away),
  });

  const totalOf = (plan: QuarterPlan) => {
    let h = 0;
    let a = 0;
    for (const p of plan.possessions) {
      if (!p.made) continue;
      if (p.side === 'home') h += p.points; else a += p.points;
    }
    return { home: h, away: a };
  };

  const openPlan = (nextPlay: WatchPlay, spendTimeout: boolean) => {
    const from = spendTimeout ? clockRef.current : 0;
    const fresh = planQuarter({
      home, away, players, coaches,
      fiveHome: fives.current.home,
      fiveAway: fives.current.away,
      energy: energyRef.current,
      autoSubs: { home: userSide === 'home' ? autoRef.current : true, away: userSide === 'away' ? autoRef.current : true },
      userPriority: priorityRef.current,
      userSide,
      play: nextPlay,
      tactic: decider ? tactic : null,
      report,
      coached: !career,
      timeout: spendTimeout,
      quarter: quarterRef.current,
      from,
    });

    if (spendTimeout && planRef.current) {
      // Keep everything already played (and already on the scoreboard); only
      // the rest of the quarter is re-resolved with the new call. The kept
      // trips' minutes were banked at the whistle, so they are flagged to be
      // skipped when the quarter's minutes are counted.
      const kept = planRef.current.possessions
        .filter((p) => p.start < from)
        .map((p) => ({ ...p, fiveHome: undefined, fiveAway: undefined }));
      planRef.current = { ...fresh, possessions: [...kept, ...fresh.possessions] };
    } else {
      planRef.current = fresh;
    }

    // The announce cursor has to be rebuilt: the possession list just changed
    // underneath it.
    const list = planRef.current.possessions;
    let cursor = 0;
    while (cursor < list.length && list[cursor].shotAt <= clockRef.current) cursor++;
    firedRef.current = cursor;
  };

  const startQuarter = (nextPlay: WatchPlay, spendTimeout: boolean) => {
    if (!spendTimeout) {
      if (quarterRef.current === 1) voice.current.say(LINES.tipOff(), true);
      else if (quarterRef.current > REGULATION_QUARTERS) voice.current.say(LINES.overtime(), true);
    }
    playRef.current = nextPlay;
    setPlay(nextPlay);
    openPlan(nextPlay, spendTimeout);
    if (spendTimeout) setTimeoutsLeft((n) => Math.max(0, n - 1));
    phaseRef.current = 'live';
    setPhase('live');
    setIsTimeoutHuddle(false);
  };

  const endQuarter = () => {
    pendingReplay.current = null;
    const final = scoreAt(quarterSeconds(quarterRef.current));
    const q = quarterRef.current;
    const ended = planRef.current;
    if (ended) {
      addMinutes(minutesRef.current, ended);
      fives.current = { home: ended.endFiveHome, away: ended.endFiveAway };
      energyRef.current = breakRecovery(ended.endEnergy, q);
      setRotationTick((n) => n + 1);
    }
    const shown = withMoments(final);
    const decided = q >= REGULATION_QUARTERS && shown.home !== shown.away;
    // Safety valve: past four overtimes, settle
    // it rather than loop forever. A tie must never reach the season — the
    // standings have no concept of one.
    if (!decided && q >= MAX_QUARTER) final.home += 1;

    completedRef.current = final;
    setScore(withMoments(final));
    planRef.current = null;
    firedRef.current = 0;
    sound.current?.buzzer();

    if (decided || q >= MAX_QUARTER) {
      const end = withMoments(final);
      if (end.home > end.away) {
        sound.current?.crowd(1, 4.5);
        cheer(crowd.current, 'home', 1, 6);
      }
      const homeWon = end.home > end.away;
      voice.current.say(LINES.final(getTeamNickname(homeWon ? home : away), Math.max(end.home, end.away), Math.min(end.home, end.away)), true);
      phaseRef.current = 'final';
      setPhase('final');
      return;
    }
    voice.current.say(q >= REGULATION_QUARTERS ? LINES.toOvertime() : LINES.quarterEnd(q), true);
    quarterRef.current = q + 1;
    clockRef.current = 0;
    setQuarter(q + 1);
    setClock(0);
    phaseRef.current = 'huddle';
    setPhase('huddle');
    setIsTimeoutHuddle(false);
    setTactic(null);
  };

  // Announce every shot the clock just crossed. A made basket names its
  // scorer — the old screen only ever said "CESTA DE 3!" with no idea whose.
  const announce = () => {
    const plan = planRef.current;
    if (!plan) return;
    const list = plan.possessions;
    while (firedRef.current < list.length && list[firedRef.current].shotAt <= clockRef.current) {
      const p = list[firedRef.current];
      firedRef.current++;
      if (!p.made) {
        // A miss rings the rim; a free throw that misses is no event.
        if (p.points !== 1) sound.current?.rim();
        continue;
      }
      const pts = Math.min(3, Math.max(1, p.points)) as 1 | 2 | 3;
      pointsRef.current.set(p.scorerName, (pointsRef.current.get(p.scorerName) ?? 0) + p.points);
      // The board goes up with the ball through the net, not on the next
      // 200 ms scoreboard refresh.
      setScore(withMoments(scoreAt(p.shotAt)));
      setBanner({
        text: `${SHOT_LABEL[pts]}${p.points > 3 ? ` (+${p.points})` : ''}`,
        sub: p.assistName ? `${p.scorerName} · passe de ${p.assistName}` : p.scorerName,
        color: p.side === userSide ? COLORS.good : COLORS.textDim,
      });
      // The building is the home team's: its baskets get the noise, a
      // dunk or a three the most; the visitors' get a murmur.
      const dunk = p.finish === 'dunk';
      if (dunk) sound.current?.dunk(); else sound.current?.swish();
      const big = dunk || pts === 3;
      // The jumbotron calls the home team's baskets.
      if (p.side === 'home') {
        setMoment({ title: dunk ? 'ENTERRADA!' : pts === 3 ? 'DE TRÊS!' : pts === 1 ? 'LANCE LIVRE' : 'CESTA!', sub: spokenName(p.scorerName) });
      }
      // Worth seeing again?
      const gameT = quarterRef.current * 10000 + p.shotAt;
      if (speedRef.current === 1 && (dunk || (pts === 3 && (p.side === userSide || quarterRef.current >= REGULATION_QUARTERS)))
        && gameT - lastReplayAt.current >= REPLAY_GAP) {
        pendingReplay.current = p;
        lastReplayAt.current = gameT;
      }
      if (p.side === 'home') {
        sound.current?.crowd(big ? 0.85 : pts === 2 ? 0.4 : 0.2, big ? 2.4 : 1.4);
        // ...and the building gets up: on its feet for a dunk or a three.
        cheer(crowd.current, 'home', big ? 1 : pts === 2 ? 0.45 : 0.2, big ? 3 : 1.6);
      } else {
        if (pts >= 2) sound.current?.crowd(0.04, 0.8);
        // The visitors' corner of the stands celebrates its own.
        cheer(crowd.current, 'away', big ? 1 : 0.5, big ? 2.6 : 1.4);
      }
      // A lead change late is the line that matters most; otherwise the
      // dunks and the threes get called, and now and then a basket of yours.
      const now = withMoments(scoreAt(p.shotAt));
      const leader: CourtSide | null = now.home > now.away ? 'home' : now.away > now.home ? 'away' : null;
      const flipped = leader !== null && leaderRef.current !== null && leader !== leaderRef.current;
      if (leader !== null) leaderRef.current = leader;
      const who = spokenName(p.scorerName);
      if (flipped && quarterRef.current >= REGULATION_QUARTERS) {
        voice.current.say(LINES.leadChange(getTeamNickname(p.side === 'home' ? home : away)), true);
      } else if (dunk) voice.current.say(LINES.dunk(who));
      else if (pts === 3) voice.current.say(LINES.three(who));
      else if (p.side === userSide && pts === 2 && Math.random() < 0.3) voice.current.say(LINES.two(who));
    }
  };

  const startReplay = (p: Possession) => {
    const plan = planRef.current;
    if (!plan) return;
    const w = replayWindow(p);
    replayRef.current = { plan, t: w.from, to: w.to };
    cutRef.current++;
    setReplaying(p.side === 'home' ? 1 : -1);
    setMoment({ title: 'REPLAY', sub: spokenName(p.scorerName) });
  };
  const endReplay = () => {
    if (!replayRef.current) return;
    replayRef.current = null;
    cutRef.current++;
    setReplaying(0);
    setMoment(undefined);
    // Back to the game where it was.
    const plan = planRef.current;
    if (plan) {
      const court = courtStateAt(plan, clockRef.current, fives.current.home, fives.current.away);
      if (court) court.cut = cutRef.current;
      courtRef.current = court;
    }
  };

  /* ---------------------------------------------------------------- */
  /* The playback loop. One paced 60 Hz frame for the whole screen: it */
  /* advances the clock, writes the court state into courtRef (which   */
  /* Court3D then renders on the same frame) and fires announcements.  */
  /* It never calls setState for movement — only for things a human    */
  /* reads.                                                            */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (phaseRef.current !== 'live' || !planRef.current) return;
      // Minha Carreira: frozen on your moment until you decide.
      if (pausedRef.current) return;

      // A replay holds the game clock and plays its window again, slowed.
      const r = replayRef.current;
      if (r) {
        r.t += dt * playbackRate(r.plan, r.t) * REPLAY_SLOW;
        if (r.t >= r.to) { endReplay(); return; }
        const court = courtStateAt(r.plan, r.t, fives.current.home, fives.current.away);
        if (court) court.cut = cutRef.current;
        courtRef.current = court;
        return;
      }

      const step = advanceClock(planRef.current, clockRef.current, dt, { speed: speedRef.current, userSide });
      clockRef.current = step.seconds;
      if (step.cut) cutRef.current++;

      const total = quarterSeconds(quarterRef.current);
      if (clockRef.current >= total) {
        clockRef.current = total;
        announce();
        endQuarter();
        return;
      }
      // The trip with a replay owed is over: show it before the next one.
      const owed = pendingReplay.current;
      if (owed && clockRef.current >= owed.end) {
        pendingReplay.current = null;
        if (speedRef.current === 1) { startReplay(owed); return; }
      }
      const court = courtStateAt(
        planRef.current, clockRef.current, fives.current.home, fives.current.away,
      );
      if (court) court.cut = cutRef.current;
      courtRef.current = court;
      announce();
      reachMoment();
    };
    return onPacedFrame(tick, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scoreboard refresh — 5Hz is plenty for a clock read in mm:ss, and keeps
  // the React tree out of the per-frame path entirely.
  useEffect(() => {
    const id = setInterval(() => {
      if (phaseRef.current !== 'live') return;
      setClock(clockRef.current);
      setScore(withMoments(scoreAt(clockRef.current)));
      const trip = planRef.current ? possessionAt(planRef.current, clockRef.current) : null;
      setShotClock(trip && clockRef.current < trip.end ? Math.max(0, 24 - (clockRef.current - trip.start)) : undefined);
      setHomeDefending(!!trip && trip.side === 'away' && !replayRef.current);
      let top: { name: string; pts: number } | undefined;
      pointsRef.current.forEach((pts, name) => { if (!top || pts > top.pts) top = { name, pts }; });
      setLeader((prev) => (top && (!prev || prev.name !== top.name || prev.pts !== top.pts) ? top : prev));
      const at = planRef.current ? rotationAt(planRef.current, clockRef.current) : null;
      if (at) {
        const five = userSide === 'home' ? at.fiveHome : at.fiveAway;
        setLiveFive(five.players.map((p) => ({ id: p.playerId, name: p.name, energy: at.energy[p.playerId] ?? 100 })));
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The jumbotron's moment clears itself, except the replay's.
  useEffect(() => {
    if (!moment || moment.title === 'REPLAY') return;
    const id = setTimeout(() => setMoment(undefined), JUMBO_MOMENT);
    return () => clearTimeout(id);
  }, [moment]);

  // Banners clear themselves; one timer, restarted per banner.
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 1400);
    return () => clearTimeout(id);
  }, [banner]);

  const callTimeout = () => {
    if (timeoutsLeft <= 0 || phaseRef.current !== 'live') return;
    endReplay();
    pendingReplay.current = null;
    sound.current?.whistle();
    voice.current.say(LINES.timeout(getTeamNickname(userSide === 'home' ? home : away)), true);
    // The huddle edits the five that is actually out there, with the legs it
    // has right now. Minutes up to the whistle are banked; the rest of the
    // quarter is replanned from here.
    const plan = planRef.current;
    if (plan) {
      const at = rotationAt(plan, clockRef.current);
      if (at) {
        fives.current = { home: at.fiveHome, away: at.fiveAway };
        energyRef.current = at.energy;
      }
      addMinutes(minutesRef.current, plan, clockRef.current);
      planRef.current = { ...plan, possessions: plan.possessions.filter((p) => p.start < clockRef.current) };
      setRotationTick((n) => n + 1);
    }
    phaseRef.current = 'huddle';
    setPhase('huddle');
    setIsTimeoutHuddle(true);
    setClock(clockRef.current);
  };

  // Resolve whatever is left of the game at once, with the play currently
  // called and no further input, then jump to the result.
  const skipToEnd = () => {
    endReplay();
    pendingReplay.current = null;
    let h = completedRef.current.home;
    let a = completedRef.current.away;
    let energy = energyRef.current;
    let fh = fives.current.home;
    let fa = fives.current.away;
    if (planRef.current) {
      const t = totalOf(planRef.current);
      h += t.home;
      a += t.away;
      addMinutes(minutesRef.current, planRef.current);
      energy = breakRecovery(planRef.current.endEnergy, quarterRef.current);
      fh = planRef.current.endFiveHome;
      fa = planRef.current.endFiveAway;
    }
    // Skipping hands the rest of your moments to the simulation: no more stops.
    pendingMoments.current = [];
    settleAdj(true);
    pausedRef.current = false;
    setActiveMoment(null);
    const tied = () => withMoments({ home: h, away: a }).home === withMoments({ home: h, away: a }).away;
    let q = quarterRef.current;
    while (q < REGULATION_QUARTERS || tied()) {
      q += 1;
      if (q > MAX_QUARTER) { h += 1; break; }
      const plan = planQuarter({
        home, away, players, coaches,
        fiveHome: fh,
        fiveAway: fa,
        energy,
        autoSubs: { home: userSide === 'home' ? autoRef.current : true, away: userSide === 'away' ? autoRef.current : true },
        userPriority: priorityRef.current,
        userSide,
        play: playRef.current,
        coached: !career,
        // Skipped periods still get their report: the call left running pays
        // when it happens to be the one a right report names.
        report: scoutingReport(userTeam, userSide === 'home' ? fa : fh, players),
        timeout: false,
        quarter: q,
        from: 0,
      });
      const t = totalOf(plan);
      h += t.home;
      a += t.away;
      addMinutes(minutesRef.current, plan);
      energy = breakRecovery(plan.endEnergy, q);
      fh = plan.endFiveHome;
      fa = plan.endFiveAway;
    }
    completedRef.current = { home: h, away: a };
    planRef.current = null;
    quarterRef.current = q;
    phaseRef.current = 'final';
    const end = withMoments({ home: h, away: a });
    setScore(end);
    setQuarter(q);
    setPhase('final');
    sound.current?.buzzer();
    voice.current.say(LINES.final(getTeamNickname(end.home > end.away ? home : away), Math.max(end.home, end.away), Math.min(end.home, end.away)), true);
  };

  /* ---------------------------------------------------------------- */
  /* Minha Carreira: your moments.                                      */
  /* ---------------------------------------------------------------- */
  // Called from the playback loop: the next moment's time has come. It only
  // stops the game if you are on the floor; a moment that comes while you sit
  // (or in a quarter already gone) is simply dropped.
  const reachMoment = (): boolean => {
    if (!career || !planRef.current) return false;
    const q = quarterRef.current;
    while (pendingMoments.current.length && pendingMoments.current[0].quarter < q) pendingMoments.current.shift();
    const next = pendingMoments.current[0];
    if (!next || next.quarter !== q || clockRef.current < next.at) return false;
    pendingMoments.current.shift();
    const at = rotationAt(planRef.current, clockRef.current);
    const five = at ? (userSide === 'home' ? at.fiveHome : at.fiveAway) : null;
    if (!five?.players.some((pl) => pl.playerId === career.meId)) return false;
    pausedRef.current = true;
    endReplay();
    setActiveMoment(next);
    return true;
  };

  const decideMoment = (optionId: string) => {
    if (!career || !activeMoment) return;
    const m = activeMoment;
    const r = career.onMoment(m, optionId);
    const mine = userSide;
    const theirs: CourtSide = mine === 'home' ? 'away' : 'home';
    const st = stageOf(m, r);
    const tripSide = st.onDefense ? theirs : mine;
    // What the moment is worth to the score (careerMoments measures it
    // against the average choice) -- the court will show the shot itself.
    const worth = st.onDefense ? r.oppDelta : r.teamDelta;
    // The court plays it out: the next trip of that side, with you on the
    // floor, rebuilt as the choice you made (restagePossession).
    let staged: ReturnType<typeof restagePossession> = null;
    if (planRef.current) {
      const at = rotationAt(planRef.current, clockRef.current);
      const myFive = at ? (mine === 'home' ? at.fiveHome : at.fiveAway) : null;
      const mate = myFive?.players
        .filter((pl) => pl.playerId !== career.meId)
        .sort((a, b) => (players[b.playerId]?.ovr ?? 0) - (players[a.playerId]?.ovr ?? 0))[0]?.playerId;
      staged = restagePossession(planRef.current, players, {
        side: tripSide,
        mustHave: career.meId,
        shooterId: st.shooter === 'me' ? career.meId : st.shooter === 'mate' ? mate : m.defenderId,
        play: st.play, made: st.made, points: st.points, shotKind: st.shotKind,
        assistId: st.assist ? career.meId : undefined,
        after: clockRef.current,
      });
    }
    const option = m.options.find((o) => o.id === optionId);
    const read = r.good ? ' · boa leitura' : r.bad ? ' · leitura ruim' : '';
    if (staged) {
      planRef.current = staged.plan;
      // The staged trip already moves the score by its own result; the rest
      // of the moment's worth lands with that shot.
      pendingAdj.current = [...pendingAdj.current, { quarter: quarterRef.current, at: staged.shotAt, side: tripSide, value: worth - staged.delta }];
      setBanner({ text: 'SEU LANCE', sub: `${option?.label ?? ''}${read}`, color: r.good ? COLORS.good : r.bad ? COLORS.bad : COLORS.warn });
    } else {
      // No trip of yours left this quarter to show it on: the result, straight away.
      momentAdj.current = { ...momentAdj.current, [tripSide]: momentAdj.current[tripSide] + worth } as { home: number; away: number };
      setScore(withMoments(scoreAt(clockRef.current)));
      setBanner({ text: r.success ? (r.good ? 'BOA LEITURA' : 'DEU CERTO') : r.bad ? 'LEITURA RUIM' : 'NÃO SAIU', sub: r.text, color: r.success ? COLORS.good : COLORS.bad });
      if (r.success && r.pts >= 2) sound.current?.swish();
    }
    setMomentLog((l) => [...l, r]);
    setActiveMoment(null);
    pausedRef.current = false;
  };

  const toggleSpeed = () => {
    const next = speed === 1 ? 4 : 1;
    if (next !== 1) { endReplay(); pendingReplay.current = null; }
    speedRef.current = next;
    setSpeed(next);
  };

  const jumbo: JumboData = {
    homeLabel: getTeamTricode(home),
    awayLabel: getTeamTricode(away),
    home: score.home,
    away: score.away,
    period: phase === 'final' ? 'FINAL' : quarter <= REGULATION_QUARTERS ? `${quarter}º Q` : `PR ${quarter - REGULATION_QUARTERS}`,
    // No game clock up there: the clock runs ~3.7 game-seconds per real
    // second, and every change repainted the whole screen -- the 3D's periodic
    // hitch. The center-hung scoreboard keeps the clock; the jumbotron now
    // repaints on a basket, a moment or a change of possession.
    clock: '',
    leader,
    message: moment,
    defense: phase === 'live' && homeDefending,
  };

  const myFive = userSide === 'home' ? fives.current.home : fives.current.away;
  // The bench: everyone on the roster who is not out there and not hurt,
  // freshest-first within the rotation order.
  const bench = useMemo(() => {
    const onCourt = new Set(myFive.players.map((p) => p.playerId));
    const out = userTeam.playerAbsences ?? {};
    return userTeam.roster
      .filter((id) => !onCourt.has(id) && !out[id] && players[id])
      .map((id) => ({ p: players[id], e: energyRef.current[id] ?? 100 }))
      .sort((x, y) => y.p.ovr - x.p.ovr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationTick, userTeam, players]);

  const swapIn = (playerId: string) => {
    if (selectedSlot === null) return;
    const p = players[playerId];
    if (!p) return;
    const five = myFive.players.map((x, i) => (i === selectedSlot ? { playerId, name: p.name, slot: x.slot } : x));
    const next = { ...myFive, players: five };
    fives.current = userSide === 'home' ? { ...fives.current, home: next } : { ...fives.current, away: next };
    const chosen = five.map((x) => x.playerId);
    // Behind his five, the rotation as he set it in Meu Time -- rotationSize
    // still decides who is even eligible, so the deep bench stays on it.
    priorityRef.current = [...chosen, ...getRotationWeights(userTeam, players).ids.filter((id) => !chosen.includes(id))];
    setSelectedSlot(null);
    setRotationTick((n) => n + 1);
  };

  const toggleAuto = () => {
    autoRef.current = !autoRef.current;
    setAutoSubs(autoRef.current);
  };

  const exhausted = liveFive.filter((p) => p.energy < EXHAUSTED);

  const userAccent = userSide === 'home' ? homeAccent : awayAccent;
  const huddleMoment = isTimeoutHuddle
    ? 'Tempo pedido'
    : quarter === 1 ? 'Antes da bola subir' : `Intervalo do ${periodLabel(quarter, 'huddle')}`;
  const huddleTitle = decider ? `${decider} · ${huddleMoment}` : huddleMoment;
  const huddleSub = isTimeoutHuddle
    ? `Reabre o restante do ${periodLabel(quarter, 'huddle')} com a nova jogada`
    : `Escolha a jogada do ${periodLabel(quarter, 'huddle')}`;

  const margin = userSide === 'home' ? score.home - score.away : score.away - score.home;
  const userWon = margin > 0;

  const winnerLine = useMemo(() => {
    if (score.home === score.away) return `Empate ${score.home}-${score.away}`;
    return score.home > score.away
      ? `${getTeamNickname(home)} vence`
      : `${getTeamNickname(away)} vence`;
  }, [score, home, away]);

  // Minha Carreira's break: you don't call the play, you go back out. What
  // your moments have done so far, and the button.
  const momentsSoFar = momentLog.length
    ? `${momentLog.length} lance${momentLog.length === 1 ? '' : 's'} · ${momentLog.filter((r) => r.good).length} boa${momentLog.filter((r) => r.good).length === 1 ? '' : 's'} leitura${momentLog.filter((r) => r.good).length === 1 ? '' : 's'} · ${momentLog.reduce((s, r) => s + r.pts, 0)} pts seus`
    : 'O jogo para quando a bola for sua: leia a defesa e escolha.';
  const careerHuddle = (
    <View style={desktop
      ? { position: 'absolute', top: 0, right: 0, bottom: 0, width: 420, backgroundColor: 'rgba(11,11,13,0.96)', borderLeftWidth: 1, borderLeftColor: COLORS.lineStrong, padding: 20, paddingTop: 24, gap: 8 }
      : { backgroundColor: 'rgba(11,11,13,0.94)', borderRadius: 20, borderWidth: 1, borderColor: COLORS.lineStrong, padding: 14, gap: 8 }}>
      <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.warn, textTransform: 'uppercase' }}>{huddleMoment}</Text>
      <Text style={{ fontFamily: FONT.cond800, fontSize: 22, lineHeight: 24, color: COLORS.text, textTransform: 'uppercase' }}>
        {quarter === 1 ? 'Sua noite começa' : 'De volta para a quadra'}
      </Text>
      <Text style={{ fontFamily: FONT.body500, fontSize: 13, lineHeight: 18, color: COLORS.muted }}>{momentsSoFar}</Text>
      <Text style={{ fontFamily: FONT.body500, fontSize: 12.5, lineHeight: 17, color: COLORS.dim }}>O anel amarelo no chão é você.</Text>
      <CtaButton label={`Começar ${periodLabel(quarter, 'huddle')}`} sub="Jogar" onPress={() => startQuarter(play, false)} />
    </View>
  );

  // Your moment: the game frozen, the read, the options.
  const momentCard = activeMoment ? (
    <View style={{ backgroundColor: 'rgba(11,11,13,0.95)', borderRadius: 18, borderWidth: 1, borderColor: COLORS.warn, padding: 14, gap: 8 }}>
      <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.warn, textTransform: 'uppercase' }}>
        Seu lance · {periodLabel(quarter, phase)} · {clockLabel(clock, quarter)} · {activeMoment.kind === 'defense' ? 'na defesa' : activeMoment.kind === 'offball' ? 'sem a bola' : 'com a bola'}
      </Text>
      <Text style={{ fontFamily: FONT.body600, fontSize: 14.5, lineHeight: 20, color: COLORS.text }}>{activeMoment.read}</Text>
      <View style={{ gap: 6 }}>
        {activeMoment.options.map((o) => (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            onPress={() => decideMoment(o.id)}
            className="active:opacity-75"
            style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: COLORS.surface2 }}
          >
            <Text style={{ fontFamily: FONT.cond800, fontSize: 16, color: COLORS.text, textTransform: 'uppercase' }}>{o.label}</Text>
            <Text style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.muted }}>{o.detail}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  ) : null;

  // The timeout huddle: a card at the foot on the phone, a 420px drawer on
  // the right edge on PC.
  const huddle = career ? careerHuddle : (
    <View style={desktop
      ? { position: 'absolute', top: 0, right: 0, bottom: 0, width: 420, backgroundColor: 'rgba(11,11,13,0.96)', borderLeftWidth: 1, borderLeftColor: COLORS.lineStrong, padding: 20, paddingTop: 24 }
      : { backgroundColor: 'rgba(11,11,13,0.94)', borderRadius: 20, borderWidth: 1, borderColor: COLORS.lineStrong, padding: 14 }}>

      <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.warn, textTransform: 'uppercase' }}>{huddleTitle}</Text>
      <Text style={{ fontFamily: FONT.cond800, fontSize: 22, lineHeight: 24, color: COLORS.text, textTransform: 'uppercase' }}>{huddleSub}</Text>

      <View className="flex-row" style={{ gap: 4, marginTop: 10, padding: 3, borderRadius: 12, backgroundColor: COLORS.surface2 }}>
        {([['play', 'Jogada'], ['lineup', 'Quinteto']] as [HuddleTab, string][]).map(([id, label]) => {
          const active = huddleTab === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityLabel={label}
              aria-selected={active}
              onPress={() => { setHuddleTab(id); setSelectedSlot(null); }}
              className="active:opacity-70"
              style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9, backgroundColor: active ? COLORS.text : 'transparent' }}
            >
              <Text style={{ fontFamily: FONT.cond700, fontSize: 13, letterSpacing: 1.1, color: active ? COLORS.bg : COLORS.muted, textTransform: 'uppercase' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {huddleTab === 'lineup' ? (
        <ScrollView style={desktop ? { flex: 1, marginTop: 10 } : { maxHeight: 262, marginTop: 10 }} showsVerticalScrollIndicator={false}>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Rotação automática"
            aria-checked={autoSubs}
            onPress={toggleAuto}
            className="flex-row items-center justify-between active:opacity-70"
            style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: COLORS.surface2 }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 15, color: COLORS.text }}>Rotação automática</Text>
              <Text style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.muted }}>
                {autoSubs ? 'O técnico tira quem cansa' : 'Ninguém sai sem você mandar'}
              </Text>
            </View>
            <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1.2, color: autoSubs ? COLORS.good : COLORS.dim }}>{autoSubs ? 'LIGADA' : 'DESLIGADA'}</Text>
          </Pressable>

          <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted, textTransform: 'uppercase', marginTop: 12, marginBottom: 6 }}>
            {selectedSlot === null ? 'Em quadra · toque em quem sai' : `Quem entra no lugar de ${lastName(myFive.players[selectedSlot].name)}?`}
          </Text>
          <View style={{ gap: 4 }}>
            {myFive.players.map((cp, i) => {
              const e = energyRef.current[cp.playerId] ?? 100;
              const sel = selectedSlot === i;
              return (
                <Pressable
                  key={cp.playerId}
                  accessibilityRole="button"
                  accessibilityLabel={`${cp.slot} ${cp.name}, energia ${Math.round(e)}`}
                  aria-selected={sel}
                  onPress={() => setSelectedSlot(sel ? null : i)}
                  className="flex-row items-center active:opacity-70"
                  style={{ gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: sel ? COLORS.text : COLORS.surface2 }}
                >
                  <Text style={{ width: 24, fontFamily: FONT.cond700, fontSize: 12, color: sel ? COLORS.bg : COLORS.dim }}>{cp.slot}</Text>
                  <Text style={{ flex: 1, fontFamily: FONT.cond700, fontSize: 15, color: sel ? COLORS.bg : COLORS.text }} numberOfLines={1}>{cp.name}</Text>
                  <Meter value={e / 100} color={energyColor(e)} height={4} track={sel ? 'rgba(11,11,13,0.15)' : COLORS.lineStrong} style={{ width: 50 }} />
                  <Text style={{ width: 24, textAlign: 'right', fontFamily: FONT.cond700, fontSize: 13, color: sel ? COLORS.bg : energyColor(e) }}>{Math.round(e)}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted, textTransform: 'uppercase', marginTop: 12, marginBottom: 6 }}>Banco</Text>
          <View style={{ gap: 4 }}>
            {bench.map(({ p, e }) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${formatPositions(p)}, ${p.ovr} de geral, energia ${Math.round(e)}`}
                aria-disabled={selectedSlot === null}
                onPress={() => swapIn(p.id)}
                className="flex-row items-center active:opacity-70"
                style={{ gap: 8, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: COLORS.surface, opacity: selectedSlot === null ? 0.6 : 1 }}
              >
                <Text style={{ width: 24, fontFamily: FONT.cond700, fontSize: 13, color: ovrColor(p.ovr) }}>{p.ovr}</Text>
                <Text style={{ flex: 1, fontFamily: FONT.cond600, fontSize: 14.5, color: COLORS.textSoft }} numberOfLines={1}>
                  {p.name} <Text style={{ fontFamily: FONT.cond600, color: COLORS.dim, fontSize: 12 }}>{formatPositions(p)}</Text>
                </Text>
                <Meter value={e / 100} color={energyColor(e)} height={4} track={COLORS.lineStrong} style={{ width: 50 }} />
                <Text style={{ width: 24, textAlign: 'right', fontFamily: FONT.cond700, fontSize: 13, color: energyColor(e) }}>{Math.round(e)}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : (
      <ScrollView style={desktop ? { flex: 1, marginTop: 10 } : { maxHeight: (decider ? 300 : 232) + (report ? 64 : 0), marginTop: 10 }} showsVerticalScrollIndicator={false}>
        {decider ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted, textTransform: 'uppercase', marginBottom: 6 }}>
              Tática do {periodLabel(quarter, 'huddle')}
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: 6 }}>
              {([null, ...TACTIC_ORDER] as (LiveTactic | null)[]).map((id) => {
                const active = id === tactic;
                const label = id ? TACTIC_META[id].label : 'Nenhuma';
                return (
                  <Pressable
                    key={id ?? 'none'}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    aria-selected={active}
                    onPress={() => setTactic(id)}
                    className="active:opacity-70"
                    style={{ paddingVertical: 7, paddingHorizontal: 11, borderRadius: 9, backgroundColor: active ? COLORS.text : COLORS.surface2 }}
                  >
                    <Text style={{ fontFamily: FONT.cond700, fontSize: 13, letterSpacing: 0.8, color: active ? COLORS.bg : COLORS.textSoft, textTransform: 'uppercase' }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontFamily: FONT.body500, fontSize: 12.5, lineHeight: 17, marginTop: 6, color: COLORS.muted }}>
              {tactic ? TACTIC_META[tactic].blurb : 'Sem ênfase: o jogo segue o plano. Vale só para este quarto.'}
            </Text>
          </View>
        ) : null}
        {report ? (
          <View style={{ marginBottom: 10, padding: 10, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: COLORS.warn, backgroundColor: COLORS.surface2 }}>
            <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted, textTransform: 'uppercase' }}>
              {ROLE_LABEL.analyst} · nota {report.rating}
            </Text>
            <Text style={{ fontFamily: FONT.body500, fontSize: 13, lineHeight: 18, marginTop: 3, color: COLORS.text }}>
              Chame {WATCH_PLAY_META[report.play].label}: {report.reason}.
            </Text>
            <Text style={{ fontFamily: FONT.body500, fontSize: 12, lineHeight: 16, marginTop: 3, color: COLORS.muted }}>
              Se a leitura estiver certa, rende +{report.bonus.toFixed(1)} pts no quarto. Nesta nota, acerta {Math.round(analystAccuracy(report.rating) * 100)}% das leituras.
            </Text>
          </View>
        ) : null}
        <View style={{ gap: 6 }}>
          {PLAY_ORDER.map((id) => {
            const meta = WATCH_PLAY_META[id];
            const active = id === play;
            const advised = report?.play === id;
            return (
              <Pressable accessibilityRole="button"
                key={id}
                aria-selected={active}
                onPress={() => setPlay(id)}
                className="active:opacity-70"
                style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: active ? COLORS.text : COLORS.surface2 }}
              >
                <View className="flex-row items-center justify-between">
                  <Text style={{ fontFamily: FONT.cond800, fontSize: 17, color: active ? COLORS.bg : COLORS.text, textTransform: 'uppercase' }}>{meta.label}</Text>
                  <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.2, color: active ? 'rgba(11,11,13,0.6)' : advised ? COLORS.warn : COLORS.dim }}>{advised ? `ANALISTA · ${meta.short}` : meta.short}</Text>
                </View>
                <Text style={{ fontFamily: FONT.body500, fontSize: 12.5, lineHeight: 17, marginTop: 2, color: active ? 'rgba(11,11,13,0.72)' : COLORS.muted }}>{meta.blurb}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      )}

      <View style={{ marginTop: 10 }}>
        <CtaButton
          label={isTimeoutHuddle ? 'Voltar pra quadra' : `Começar ${periodLabel(quarter, 'huddle')}`}
          sub={tactic && decider ? `${WATCH_PLAY_META[play].label} · ${TACTIC_META[tactic].label}` : WATCH_PLAY_META[play].label}
          onPress={() => startQuarter(play, isTimeoutHuddle)}
        />
      </View>
    </View>
  );

  // Cameras: a column on the right edge (PC: pinned to the screen corner).
  const cameras = (
    <View style={{ position: 'absolute', top: desktop ? 20 : 58, right: desktop ? (phase === 'huddle' ? 440 : 20) : 0, gap: 4, padding: 4, borderRadius: 12, backgroundColor: 'rgba(11,11,13,0.82)' }}>
      {CAMERA_VIEWS.map((v) => {
        const active = v.id === cameraView;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Câmera ${v.label}`}
            aria-selected={active}
            key={v.id}
            onPress={() => setCameraView(v.id)}
            className="active:opacity-75"
            style={{ height: 36, paddingHorizontal: 12, borderRadius: 9, justifyContent: 'center', backgroundColor: active ? COLORS.ctaFill : 'transparent' }}
          >
            <Text style={{ fontFamily: FONT.cond800, fontSize: 12.5, letterSpacing: 1, color: active ? COLORS.ctaInk : COLORS.textSoft, textTransform: 'uppercase' }}>{v.label}</Text>
          </Pressable>
        );
      })}
      <View style={{ height: 1, marginHorizontal: 6, backgroundColor: COLORS.lineStrong }} />
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Locutor"
        aria-checked={voiceOn}
        onPress={toggleVoice}
        className="active:opacity-75"
        style={{ height: 36, paddingHorizontal: 12, borderRadius: 9, justifyContent: 'center' }}
      >
        <Text style={{ fontFamily: FONT.cond800, fontSize: 12.5, letterSpacing: 1, color: voiceOn ? COLORS.textSoft : COLORS.dim, textTransform: 'uppercase', textDecorationLine: voiceOn ? 'none' : 'line-through' }}>Locutor</Text>
      </Pressable>
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: COLORS.bg }} onLayout={(e) => setScreenH(e.nativeEvent.layout.height)}>
      <Court3D
        home={homeAccent}
        away={awayAccent}
        courtRef={courtRef}
        visual={courtVisual}
        cameraView={cameraView}
        tvYear={eraYear()}
        homeLabel={getTeamTricode(home)}
        homeNickname={getTeamNickname(home)}
        homeCity={getTeamCity(home)}
        crowd={crowd}
        onSound={onCourtSound}
        replay={replaying ? { hoopSide: replaying, slow: REPLAY_SLOW } : null}
        // On a phone held upright the TV and close cameras put the far wall
        // at the top of the frame, and the jumbotron sat right under the HUD's
        // own scoreboard (device audit, 2026-10-17). The HUD already shows the
        // score there; the other cameras and the PC keep it.
        jumbo={desktop || (cameraView !== 'tv' && cameraView !== 'close') ? jumbo : undefined}
        bodies={jerseyNumbers}
        banners={banners}
        scoreboard={{
          home: score.home,
          away: score.away,
          quarter,
          clock: quarterSeconds(quarter) - clock,
          shotClock: phase === 'live' ? shotClock : undefined,
          homeLabel: getTeamTricode(home),
          awayLabel: getTeamTricode(away),
        }}
        insets={screenH && livePanelH ? { top: hudTop, bottom: livePanelH + insets.bottom + (desktop ? 24 : 14) } : undefined}
      />

      {desktop ? cameras : null}

      {replaying ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pular replay"
          onPress={endReplay}
          className="active:opacity-75"
          style={{ position: 'absolute', top: desktop ? 96 : insets.top + 68, right: desktop ? (phase === 'huddle' ? 440 : 120) : 96, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(11,11,13,0.86)' }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.cta }} />
          <Text style={{ fontFamily: FONT.cond800, fontSize: 13, letterSpacing: 1.4, color: COLORS.text }}>REPLAY</Text>
          <Text style={{ fontFamily: FONT.cond600, fontSize: 11.5, letterSpacing: 0.8, color: COLORS.muted }}>TOQUE P/ PULAR</Text>
        </Pressable>
      ) : null}

      {banner && (
        <View style={{ pointerEvents: 'none', position: 'absolute', top: desktop ? 20 : insets.top + 68, left: desktop ? 20 : 14, maxWidth: desktop ? 280 : 220 }}>
          <View style={{ backgroundColor: 'rgba(11,11,13,0.82)', borderRadius: 12, paddingVertical: 9, paddingLeft: 15, paddingRight: 12, gap: 2, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: banner.color }} />
            <Text style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.3, color: banner.color, textTransform: 'uppercase' }}>{banner.text}</Text>
            <Text style={{ fontFamily: FONT.cond600, fontSize: 14, lineHeight: 17, color: COLORS.text }}>{banner.sub}</Text>
          </View>
        </View>
      )}

      {/* Score bar: color blocks at the ends, the clock and possession in the middle.
          Above the bottom controls (zIndex): on a phone it carries the camera
          column, whose last button (Locutor) the huddle sheet used to cover. */}
      <View
        onLayout={(e) => { const l = e.nativeEvent.layout; setHudTop(l.y + l.height); }}
        style={{ pointerEvents: 'box-none', zIndex: 2, position: 'absolute', top: insets.top + (desktop ? 20 : 10), ...(desktop ? { left: '50%', width: 640, marginLeft: -320 } : { left: 14, right: 14 }) }}
      >
        <View style={{ height: desktop ? 60 : 48, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', backgroundColor: 'rgba(11,11,13,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
          <View style={{ width: desktop ? 90 : 58, backgroundColor: homeAccent.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: desktop ? 20 : 16, color: onAccent(homeAccent.primary) }}>{getTeamTricode(home)}</Text>
          </View>
          <View style={{ width: desktop ? 70 : 46, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: desktop ? 34 : 26, color: score.home >= score.away ? COLORS.text : COLORS.muted, fontVariant: ['tabular-nums'] }}>{score.home}</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: COLORS.lineStrong }}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 16, lineHeight: 17, color: COLORS.text }}>
              {phase === 'final' ? 'FINAL' : `${periodLabel(quarter, phase)} · ${clockLabel(clock, quarter)}`}
            </Text>
            <Text numberOfLines={1} style={{ fontFamily: FONT.cond600, fontSize: 10.5, letterSpacing: 1, color: COLORS.muted, textTransform: 'uppercase' }}>
              {career
                ? `Minha carreira · ${momentLog.length} lance${momentLog.length === 1 ? '' : 's'}`
                : phase === 'live' ? `${WATCH_PLAY_META[play].label} · ${timeoutsLeft} tempo${timeoutsLeft === 1 ? '' : 's'}` : decider ? decider.split(' · ')[0] : 'Assistir ao jogo'}
            </Text>
          </View>
          <View style={{ width: desktop ? 70 : 46, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: desktop ? 34 : 26, color: score.away >= score.home ? COLORS.text : COLORS.muted, fontVariant: ['tabular-nums'] }}>{score.away}</Text>
          </View>
          <View style={{ width: desktop ? 90 : 58, backgroundColor: awayAccent.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: desktop ? 20 : 16, color: onAccent(awayAccent.primary) }}>{getTeamTricode(away)}</Text>
          </View>
        </View>

        {/* Not during the break on a phone: the huddle sheet needs the room
            (on a short screen the column covered its options), and the
            cameras only matter with the game running. */}
        {desktop || phase === 'huddle' ? null : cameras}
      </View>

      {/* Bottom controls. The tab bar is hidden while watching, so this
          clears the home indicator itself. */}
      {phase === 'huddle' && desktop ? huddle : null}
      <View
        style={{ position: 'absolute', bottom: insets.bottom + (desktop ? 24 : 14), ...(desktop ? { left: '50%', width: 760, marginLeft: -380 } : { left: 14, right: 14 }) }}
      >
        {phase === 'huddle' && !desktop ? huddle : null}
        {phase === 'live' && activeMoment ? momentCard : null}
        {phase === 'live' && !activeMoment && (
          // Measured here, on the live panel only: the container above also
          // holds the huddle sheet, which covers half the screen, and the
          // camera kept that framing after play resumed -- the bottom of the
          // 3D went black (phone playthrough, 2026-10-11). This panel remounts
          // every time play resumes, so its onLayout always reports fresh; in
          // the huddle the camera keeps the last live value.
          <View
            style={{ gap: 8 }}
            onLayout={(e) => setLivePanelH(e.nativeEvent.layout.height)}
          >
            {liveFive.length === 5 ? (
              <View style={{ backgroundColor: 'rgba(11,11,13,0.9)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
                <View className="flex-row justify-between">
                  <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted }}>EM QUADRA</Text>
                  <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: autoSubs ? COLORS.good : COLORS.dim }}>
                    {autoSubs ? 'ROTAÇÃO AUTOMÁTICA' : 'ROTAÇÃO MANUAL'}
                  </Text>
                </View>
                {/* Your five's legs: the one number that tells you when to stop the game. */}
                <View className="flex-row" style={{ gap: 4 }}>
                  {liveFive.map((pl) => (
                    <View key={pl.id} accessibilityLabel={`${pl.name}, energia ${Math.round(pl.energy)}`} style={{ flex: 1, borderRadius: 8, backgroundColor: COLORS.surface2, paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center', gap: 3 }}>
                      <Text numberOfLines={1} style={{ fontFamily: FONT.cond700, fontSize: 12, color: pl.energy < EXHAUSTED ? COLORS.bad : COLORS.text }}>{lastName(pl.name)}</Text>
                      <View style={{ width: '100%', height: 3, borderRadius: 2, backgroundColor: COLORS.lineStrong }}>
                        <View style={{ height: '100%', borderRadius: 2, backgroundColor: energyColor(pl.energy), width: `${Math.max(0, Math.min(100, pl.energy))}%` }} />
                      </View>
                    </View>
                  ))}
                </View>
                {exhausted.length > 0 ? (
                  <Text numberOfLines={1} style={{ fontFamily: FONT.body600, fontSize: 12, color: COLORS.bad }}>
                    {exhausted.map((pl) => lastName(pl.name)).join(', ')} {exhausted.length === 1 ? 'está exausto' : 'estão exaustos'}
                    {timeoutsLeft > 0 ? ' · peça tempo' : ''}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <View className="flex-row" style={{ gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                onPress={toggleSpeed}
                className="active:opacity-75"
                style={{ flex: 1, height: 48, borderRadius: 12, backgroundColor: 'rgba(11,11,13,0.9)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: FONT.cond700, fontSize: 14, letterSpacing: 1.1, color: COLORS.text }}>{speed > 1 ? `${speed}X ✓` : '4X'}</Text>
              </Pressable>
              {career ? null : <Pressable
                accessibilityRole="button"
                aria-disabled={timeoutsLeft <= 0}
                onPress={timeoutsLeft > 0 ? callTimeout : undefined}
                className="active:opacity-75"
                style={{ flex: 1.4, height: 48, borderRadius: 12, backgroundColor: timeoutsLeft > 0 ? COLORS.ctaFill : 'rgba(11,11,13,0.9)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: FONT.cond800, fontSize: 16, letterSpacing: 1, color: timeoutsLeft > 0 ? COLORS.ctaInk : COLORS.dim }}>
                  {timeoutsLeft > 0 ? 'PEDIR TEMPO' : 'SEM TEMPOS'}
                </Text>
              </Pressable>}
              <Pressable
                accessibilityRole="button"
                onPress={skipToEnd}
                className="active:opacity-75"
                style={{ flex: 1, height: 48, borderRadius: 12, backgroundColor: 'rgba(11,11,13,0.9)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: FONT.cond700, fontSize: 14, letterSpacing: 1.1, color: COLORS.text }}>PULAR ›</Text>
              </Pressable>
            </View>
          </View>
        )}

        {phase === 'final' && (
          <CtaButton
            style={desktop ? { width: 420, alignSelf: 'center' } : undefined}
            label={winnerLine}
            sub={`${userWon ? 'Vitória' : 'Derrota'} ${score.home}-${score.away}`}
            onPress={() => onFinish(score.home, score.away, minutesRef.current)}
          />
        )}
      </View>
    </View>
  );
};

export default WatchGameScreen;
