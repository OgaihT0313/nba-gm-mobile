import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer, type AudioPlayer } from 'expo-audio';

import { Team, Player, Coach, WatchPlay } from '../types';
import { getTeamAccent, getTeamNickname, getTeamTricode, formatPositions } from '../constants';
import { WATCH_PLAY_META, STARTING_TIMEOUTS, getRotationWeights } from '../services/simulationService';
import {
  buildFive,
  courtStateAt,
  planQuarter,
  quarterSeconds,
  tipOffState,
  initialEnergy,
  breakRecovery,
  rotationAt,
  REGULATION_QUARTERS,
  type CourtSide,
  type CourtState,
  type Energy,
  type FiveOnCourt,
  type QuarterPlan,
} from '../services/watchDirector';
import { eraGroupForEraId } from '../data/eras';
import { getEraVisual } from '../src/theme/eraVisuals';
import { COLORS, INK, RADIUS, FONT, withAlpha, onAccent } from '../src/theme/tokens';
import { Panel, MonoLabel, Stat, CtaButton, GhostButton, Meter } from '../components/ui/kit';
import Court3D, { CameraView } from '../components/court3d/Court3D';

const CAMERA_VIEWS: { id: CameraView; label: string }[] = [
  { id: 'iso', label: 'Livre' },
  { id: 'tv', label: 'TV' },
  { id: 'close', label: 'Perto' },
  { id: 'overhead', label: 'Aérea' },
  { id: 'behind_basket', label: 'Cesta' },
];

const PLAY_ORDER: WatchPlay[] = ['pick_roll', 'pindown', 'post_up', 'iso'];

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
// starts (services/watchDirector.ts, same computeExpectedPoints slice
// advanceLiveQuarter uses for a Game 7), the play the user calls in the huddle
// is folded into it, and the final score handed to onFinish is the sum of the
// baskets that actually went in on screen.

// Game-seconds per real second: 48 game-minutes in about five real ones.
const BASE_RATE = 9.6;
// A possession is ~15 game-seconds — under two real seconds at full speed,
// which is not long enough to read a pick & roll. The possession right after
// a play is called runs at this fraction of speed so the user actually sees
// the thing they asked for.
const SLOW_MO_SCALE = 0.4;
const SLOW_MO_SECONDS = 20; // game-seconds, i.e. roughly one possession
const MAX_QUARTER = 8; // 4 regulation + 4 OT, the same safety valve advanceLiveQuarter has

type Phase = 'huddle' | 'live' | 'final';
type HuddleTab = 'play' | 'lineup';

/** Below this the live panel calls a player out as spent. */
const EXHAUSTED = 35;

const energyColor = (e: number) => (e >= 70 ? COLORS.good : e >= 50 ? COLORS.warn : COLORS.cta);
const lastName = (name: string) => name.split(' ').slice(-1)[0];

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
}

const WatchGameScreen: React.FC<WatchGameScreenProps> = ({
  home, away, players, coaches, userTeamId, onFinish, eraId,
}) => {
  const insets = useSafeAreaInsets();
  const homeAccent = getTeamAccent(home.id);
  const awayAccent = getTeamAccent(away.id);
  // Memoized: a fresh object literal here would be a new prop on every
  // scoreboard tick, re-reconciling the whole 3D scene five times a second.
  const courtVisual = useMemo(() => {
    const v = getEraVisual(eraId ? eraGroupForEraId(eraId)?.visualId : undefined);
    return v ? { floorColor: v.floorTone } : undefined;
  }, [eraId]);
  const userSide: CourtSide = home.id === userTeamId ? 'home' : 'away';
  // Jersey numbers for Court3D, both rosters. Memoized for the same reason as
  // courtVisual: the 3D scene must not see a new object every scoreboard tick.
  const jerseyNumbers = useMemo(() => {
    const out: { [id: string]: number } = {};
    [...home.roster, ...away.roster].forEach((id) => { if (players[id]) out[id] = players[id].number; });
    return out;
  }, [home, away, players]);

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
  const completedRef = useRef({ home: 0, away: 0 }); // points from finished quarters
  const firedRef = useRef(0); // possessions already announced
  const speedRef = useRef(1);
  const slowUntilRef = useRef(-1); // quarter-second until which playback is slowed
  const playRef = useRef<WatchPlay>('pick_roll');

  // --- State, updated a few times a second, never per frame. ---
  const [phase, setPhase] = useState<Phase>('huddle');
  const [quarter, setQuarter] = useState(1);
  const [clock, setClock] = useState(0);
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [speed, setSpeed] = useState(1);
  const [play, setPlay] = useState<WatchPlay>('pick_roll');
  const [timeoutsLeft, setTimeoutsLeft] = useState(STARTING_TIMEOUTS);
  const [isTimeoutHuddle, setIsTimeoutHuddle] = useState(false);
  const [cameraView, setCameraView] = useState<CameraView>('iso');
  const [banner, setBanner] = useState<{ text: string; sub: string; color: string } | null>(null);
  const [huddleTab, setHuddleTab] = useState<HuddleTab>('play');
  const [autoSubs, setAutoSubs] = useState(true);
  // Bumped whenever the user's five or the energy map changes outside a plan
  // (a swap in the huddle, a quarter break), so the lineup panel re-reads refs.
  const [rotationTick, setRotationTick] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  // The user's five and their energy as of the last scoreboard refresh.
  const [liveFive, setLiveFive] = useState<{ id: string; name: string; energy: number }[]>([]);

  // Synthesized placeholder SFX (assets/sfx — see scripts/generate_sfx.js).
  // .seekTo(0) before each play() so a basket landing mid-decay of the
  // previous one restarts cleanly instead of no-op'ing on an already-playing
  // player.
  const swishSound = useAudioPlayer(require('../assets/sfx/swish.wav'));
  const buzzerSound = useAudioPlayer(require('../assets/sfx/buzzer.wav'));
  const whistleSound = useAudioPlayer(require('../assets/sfx/whistle.wav'));
  const dribbleSound = useAudioPlayer(require('../assets/sfx/dribble.wav'));
  const crowdSound = useAudioPlayer(require('../assets/sfx/crowd.wav'));
  const playSound = (player: AudioPlayer) => {
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // Best-effort — a missing/unready audio device should never block the game.
    }
  };
  const sfx = useRef({ swishSound, buzzerSound, whistleSound, dribbleSound, crowdSound });
  sfx.current = { swishSound, buzzerSound, whistleSound, dribbleSound, crowdSound };

  // Tip-off whistle, once, when the screen mounts.
  useEffect(() => {
    playSound(whistleSound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ambient dribble bounce during live possession — idea borrowed from the
  // Gemini-prototype zip (fills the silence between plays instead of dead
  // air); a soft loop, not synced to any specific event.
  useEffect(() => {
    if (phase !== 'live') return;
    const id = setInterval(() => playSound(sfx.current.dribbleSound), 1800 / speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, speed]);

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
    playRef.current = nextPlay;
    setPlay(nextPlay);
    openPlan(nextPlay, spendTimeout);
    if (spendTimeout) setTimeoutsLeft((n) => Math.max(0, n - 1));
    slowUntilRef.current = clockRef.current + SLOW_MO_SECONDS;
    phaseRef.current = 'live';
    setPhase('live');
    setIsTimeoutHuddle(false);
  };

  const endQuarter = () => {
    const final = scoreAt(quarterSeconds(quarterRef.current));
    const q = quarterRef.current;
    const ended = planRef.current;
    if (ended) {
      addMinutes(minutesRef.current, ended);
      fives.current = { home: ended.endFiveHome, away: ended.endFiveAway };
      energyRef.current = breakRecovery(ended.endEnergy, q);
      setRotationTick((n) => n + 1);
    }
    const decided = q >= REGULATION_QUARTERS && final.home !== final.away;
    // Safety valve, same as advanceLiveQuarter's: past four overtimes, settle
    // it rather than loop forever. A tie must never reach the season — the
    // standings have no concept of one.
    if (!decided && q >= MAX_QUARTER) final.home += 1;

    completedRef.current = final;
    setScore(final);
    planRef.current = null;
    firedRef.current = 0;
    playSound(sfx.current.buzzerSound);

    if (decided || q >= MAX_QUARTER) {
      phaseRef.current = 'final';
      setPhase('final');
      return;
    }
    quarterRef.current = q + 1;
    clockRef.current = 0;
    setQuarter(q + 1);
    setClock(0);
    phaseRef.current = 'huddle';
    setPhase('huddle');
    setIsTimeoutHuddle(false);
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
      if (!p.made) continue;
      const pts = Math.min(3, Math.max(1, p.points)) as 1 | 2 | 3;
      setBanner({
        text: `${SHOT_LABEL[pts]}${p.points > 3 ? ` (+${p.points})` : ''}`,
        sub: p.assistName ? `${p.scorerName} · passe de ${p.assistName}` : p.scorerName,
        color: p.side === userSide ? COLORS.good : COLORS.textDim,
      });
      playSound(sfx.current.swishSound);
      if (pts === 3) playSound(sfx.current.crowdSound);
    }
  };

  /* ---------------------------------------------------------------- */
  /* The playback loop. One rAF for the whole screen: it advances the  */
  /* clock, writes the court state into courtRef (which Court3D reads  */
  /* in its own useFrame) and fires announcements. It never calls      */
  /* setState for movement — only for things a human reads.            */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    let raf = 0;
    let last = Date.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (phaseRef.current !== 'live' || !planRef.current) return;

      const slow = clockRef.current < slowUntilRef.current ? SLOW_MO_SCALE : 1;
      clockRef.current += dt * BASE_RATE * speedRef.current * slow;

      const total = quarterSeconds(quarterRef.current);
      if (clockRef.current >= total) {
        clockRef.current = total;
        announce();
        endQuarter();
        return;
      }
      courtRef.current = courtStateAt(
        planRef.current, clockRef.current, fives.current.home, fives.current.away,
      );
      announce();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scoreboard refresh — 5Hz is plenty for a clock read in mm:ss, and keeps
  // the React tree out of the per-frame path entirely.
  useEffect(() => {
    const id = setInterval(() => {
      if (phaseRef.current !== 'live') return;
      setClock(clockRef.current);
      setScore(scoreAt(clockRef.current));
      const at = planRef.current ? rotationAt(planRef.current, clockRef.current) : null;
      if (at) {
        const five = userSide === 'home' ? at.fiveHome : at.fiveAway;
        setLiveFive(five.players.map((p) => ({ id: p.playerId, name: p.name, energy: at.energy[p.playerId] ?? 100 })));
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Banners clear themselves; one timer, restarted per banner.
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 1400);
    return () => clearTimeout(id);
  }, [banner]);

  const callTimeout = () => {
    if (timeoutsLeft <= 0 || phaseRef.current !== 'live') return;
    playSound(whistleSound);
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
    let q = quarterRef.current;
    while (q < REGULATION_QUARTERS || h === a) {
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
    setScore({ home: h, away: a });
    setQuarter(q);
    setPhase('final');
    playSound(buzzerSound);
  };

  const toggleSpeed = () => {
    const next = speed === 1 ? 4 : 1;
    speedRef.current = next;
    setSpeed(next);
  };

  const userTeam = userSide === 'home' ? home : away;
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
  const huddleTitle = isTimeoutHuddle
    ? 'Tempo pedido'
    : quarter === 1 ? 'Antes da bola subir' : `Intervalo do ${periodLabel(quarter, 'huddle')}`;
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

  return (
    <View className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      <Court3D
        home={homeAccent}
        away={awayAccent}
        courtRef={courtRef}
        visual={courtVisual}
        cameraView={cameraView}
        homeLabel={getTeamTricode(home)}
        numbers={jerseyNumbers}
      />

      {banner && (
        <View style={{ pointerEvents: 'none', position: 'absolute', top: insets.top + 68, left: 14, maxWidth: 220 }}>
          <View style={{ backgroundColor: 'rgba(11,11,13,0.82)', borderRadius: 12, paddingVertical: 9, paddingLeft: 15, paddingRight: 12, gap: 2, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: banner.color }} />
            <Text style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.3, color: banner.color, textTransform: 'uppercase' }}>{banner.text}</Text>
            <Text style={{ fontFamily: FONT.cond600, fontSize: 14, lineHeight: 17, color: COLORS.text }}>{banner.sub}</Text>
          </View>
        </View>
      )}

      {/* Score bar: color blocks at the ends, the clock and possession in the middle. */}
      <View style={{ pointerEvents: 'box-none', position: 'absolute', top: insets.top + 10, left: 14, right: 14 }}>
        <View style={{ height: 48, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', backgroundColor: 'rgba(11,11,13,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
          <View style={{ width: 58, backgroundColor: homeAccent.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 16, color: onAccent(homeAccent.primary) }}>{getTeamTricode(home)}</Text>
          </View>
          <View style={{ width: 46, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 26, color: score.home >= score.away ? COLORS.text : COLORS.muted, fontVariant: ['tabular-nums'] }}>{score.home}</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: COLORS.lineStrong }}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 16, lineHeight: 17, color: COLORS.text }}>
              {phase === 'final' ? 'FINAL' : `${periodLabel(quarter, phase)} · ${clockLabel(clock, quarter)}`}
            </Text>
            <Text numberOfLines={1} style={{ fontFamily: FONT.cond600, fontSize: 10.5, letterSpacing: 1, color: COLORS.muted, textTransform: 'uppercase' }}>
              {phase === 'live' ? `${WATCH_PLAY_META[play].label} · ${timeoutsLeft} tempo${timeoutsLeft === 1 ? '' : 's'}` : 'Assistir ao jogo'}
            </Text>
          </View>
          <View style={{ width: 46, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 26, color: score.away >= score.home ? COLORS.text : COLORS.muted, fontVariant: ['tabular-nums'] }}>{score.away}</Text>
          </View>
          <View style={{ width: 58, backgroundColor: awayAccent.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 16, color: onAccent(awayAccent.primary) }}>{getTeamTricode(away)}</Text>
          </View>
        </View>

        {/* Cameras: a column on the right edge. */}
        <View style={{ position: 'absolute', top: 58, right: 0, gap: 4, padding: 4, borderRadius: 12, backgroundColor: 'rgba(11,11,13,0.82)' }}>
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
        </View>
      </View>

      {/* Bottom controls. The app's BottomNav already reserves its own space
          below this screen (it's a normal flex sibling, not an overlay), so
          this only needs a flat gutter — no extra safe-area padding. */}
      <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14 }}>
        {phase === 'huddle' && (
          <Panel padding={14}>
            <MonoLabel size={9} color={userAccent.primary}>{huddleTitle}</MonoLabel>
            <MonoLabel size={9} color={INK.faint} style={{ marginTop: 3 }}>{huddleSub}</MonoLabel>

            <View className="flex-row" style={{ gap: 6, marginTop: 10 }}>
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
                    style={{
                      flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999,
                      backgroundColor: active ? '#ffffff' : 'rgba(255,255,255,0.05)',
                      borderWidth: 1, borderColor: active ? '#ffffff' : 'rgba(255,255,255,0.12)',
                    }}
                  >
                    <MonoLabel size={9.5} color={active ? COLORS.bg : INK.faint}>{label}</MonoLabel>
                  </Pressable>
                );
              })}
            </View>

            {huddleTab === 'lineup' ? (
              <ScrollView style={{ maxHeight: 262, marginTop: 10 }} showsVerticalScrollIndicator={false}>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityLabel="Rotação automática"
                  aria-checked={autoSubs}
                  onPress={toggleAuto}
                  className="flex-row items-center justify-between active:opacity-70"
                  style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: RADIUS.control, backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '800' }}>Rotação automática</Text>
                    <MonoLabel size={9} color={INK.faint} style={{ marginTop: 2, letterSpacing: 0 }}>
                      {autoSubs ? 'O técnico tira quem cansa' : 'Ninguém sai sem você mandar'}
                    </MonoLabel>
                  </View>
                  <MonoLabel size={9.5} color={autoSubs ? COLORS.good : INK.faint}>{autoSubs ? 'Ligada' : 'Desligada'}</MonoLabel>
                </Pressable>

                <MonoLabel size={9} color={INK.faint} style={{ marginTop: 10, marginBottom: 6 }}>
                  {selectedSlot === null ? 'Em quadra · toque em quem sai' : `Quem entra no lugar de ${lastName(myFive.players[selectedSlot].name)}?`}
                </MonoLabel>
                <View style={{ gap: 5 }}>
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
                        style={{
                          gap: 8, paddingVertical: 7, paddingHorizontal: 10, borderRadius: RADIUS.control,
                          backgroundColor: sel ? withAlpha(userAccent.primary, 0.18) : 'rgba(255,255,255,0.04)',
                          borderWidth: 1, borderColor: sel ? userAccent.primary : 'transparent',
                        }}
                      >
                        <MonoLabel size={9} color={INK.faint} style={{ width: 22 }}>{cp.slot}</MonoLabel>
                        <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '700', flex: 1 }} numberOfLines={1}>{cp.name}</Text>
                        <Meter value={e / 100} color={energyColor(e)} height={5} track="rgba(255,255,255,0.08)" style={{ width: 54 }} />
                        <MonoLabel size={9} color={energyColor(e)} style={{ width: 22, textAlign: 'right' }}>{Math.round(e)}</MonoLabel>
                      </Pressable>
                    );
                  })}
                </View>

                <MonoLabel size={9} color={INK.faint} style={{ marginTop: 10, marginBottom: 6 }}>Banco</MonoLabel>
                <View style={{ gap: 5 }}>
                  {bench.map(({ p, e }) => (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.name}, ${formatPositions(p)}, ${p.ovr} de geral, energia ${Math.round(e)}`}
                      aria-disabled={selectedSlot === null}
                      onPress={() => swapIn(p.id)}
                      className="flex-row items-center active:opacity-70"
                      style={{
                        gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: RADIUS.control,
                        backgroundColor: 'rgba(255,255,255,0.03)', opacity: selectedSlot === null ? 0.65 : 1,
                      }}
                    >
                      <MonoLabel size={9} color={INK.faint} style={{ width: 22 }}>{p.ovr}</MonoLabel>
                      <Text style={{ color: COLORS.textDim, fontSize: 11.5, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                        {p.name} <Text style={{ color: INK.faint, fontSize: 10 }}>{formatPositions(p)}</Text>
                      </Text>
                      <Meter value={e / 100} color={energyColor(e)} height={5} track="rgba(255,255,255,0.08)" style={{ width: 54 }} />
                      <MonoLabel size={9} color={energyColor(e)} style={{ width: 22, textAlign: 'right' }}>{Math.round(e)}</MonoLabel>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            ) : (
            <ScrollView style={{ maxHeight: 232, marginTop: 10 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 7 }}>
                {PLAY_ORDER.map((id) => {
                  const meta = WATCH_PLAY_META[id];
                  const active = id === play;
                  return (
                    <Pressable accessibilityRole="button"
                      key={id}
                      onPress={() => setPlay(id)}
                      className="active:opacity-70"
                      style={{
                        padding: 11,
                        borderRadius: RADIUS.control,
                        backgroundColor: active ? withAlpha(userAccent.primary, 0.16) : 'rgba(255,255,255,0.04)',
                        borderWidth: 1,
                        borderColor: active ? userAccent.primary : 'rgba(255,255,255,0.1)',
                      }}
                    >
                      <View className="flex-row items-center justify-between">
                        <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: '800' }}>{meta.label}</Text>
                        <MonoLabel size={9} color={active ? userAccent.primary : INK.faint}>{meta.short}</MonoLabel>
                      </View>
                      <MonoLabel size={9} color={INK.faint} style={{ marginTop: 4 }}>{meta.blurb}</MonoLabel>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            )}

            <View style={{ marginTop: 10 }}>
              <CtaButton
                label={isTimeoutHuddle ? 'Voltar pra quadra ›' : `Começar ${periodLabel(quarter, 'huddle')} ›`}
                sub={WATCH_PLAY_META[play].label}
                onPress={() => startQuarter(play, isTimeoutHuddle)}
              />
            </View>
          </Panel>
        )}

        {phase === 'live' && (
          <View style={{ gap: 8 }}>
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
              <Pressable
                accessibilityRole="button"
                aria-disabled={timeoutsLeft <= 0}
                onPress={timeoutsLeft > 0 ? callTimeout : undefined}
                className="active:opacity-75"
                style={{ flex: 1.4, height: 48, borderRadius: 12, backgroundColor: timeoutsLeft > 0 ? COLORS.ctaFill : 'rgba(11,11,13,0.9)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: FONT.cond800, fontSize: 16, letterSpacing: 1, color: timeoutsLeft > 0 ? COLORS.ctaInk : COLORS.dim }}>
                  {timeoutsLeft > 0 ? 'PEDIR TEMPO' : 'SEM TEMPOS'}
                </Text>
              </Pressable>
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
            label={winnerLine}
            sub={`${score.home}-${score.away} · ${userWon ? 'vitória sua' : 'derrota'} · toque para continuar`}
            onPress={() => onFinish(score.home, score.away, minutesRef.current)}
          />
        )}
      </View>
    </View>
  );
};

export default WatchGameScreen;
