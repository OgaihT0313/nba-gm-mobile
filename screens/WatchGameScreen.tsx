import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer, type AudioPlayer } from 'expo-audio';

import { Team, Player, Coach, WatchPlay } from '../types';
import { getTeamAccent, getTeamNickname, getTeamTricode } from '../constants';
import { WATCH_PLAY_META, STARTING_TIMEOUTS } from '../services/simulationService';
import {
  buildFive,
  courtStateAt,
  planQuarter,
  quarterSeconds,
  tipOffState,
  REGULATION_QUARTERS,
  type CourtSide,
  type CourtState,
  type FiveOnCourt,
  type QuarterPlan,
} from '../services/watchDirector';
import { eraGroupForEraId } from '../data/eras';
import { getEraVisual } from '../src/theme/eraVisuals';
import { COLORS, INK, RADIUS, withAlpha } from '../src/theme/tokens';
import { Panel, MonoLabel, Stat, CtaButton, GhostButton } from '../components/ui/kit';
import Court3D, { CameraView } from '../components/court3d/Court3D';

const CAMERA_VIEWS: { id: CameraView; label: string }[] = [
  { id: 'iso', label: 'Livre' },
  { id: 'tv', label: 'TV' },
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
  onFinish: (scoreHome: number, scoreAway: number) => void;
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

  const fives = useRef<{ home: FiveOnCourt; away: FiveOnCourt }>({
    home: buildFive(home, players, 'home'),
    away: buildFive(away, players, 'away'),
  });

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
      userSide,
      play: nextPlay,
      timeout: spendTimeout,
      quarter: quarterRef.current,
      from,
    });

    if (spendTimeout && planRef.current) {
      // Keep everything already played (and already on the scoreboard); only
      // the rest of the quarter is re-resolved with the new call.
      const kept = planRef.current.possessions.filter((p) => p.start < from);
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
    if (planRef.current) {
      const t = totalOf(planRef.current);
      h += t.home;
      a += t.away;
    }
    let q = quarterRef.current;
    while (q < REGULATION_QUARTERS || h === a) {
      q += 1;
      if (q > MAX_QUARTER) { h += 1; break; }
      const t = totalOf(planQuarter({
        home, away, players, coaches,
        fiveHome: fives.current.home,
        fiveAway: fives.current.away,
        userSide,
        play: playRef.current,
        timeout: false,
        quarter: q,
        from: 0,
      }));
      h += t.home;
      a += t.away;
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
      />

      {banner && (
        <View pointerEvents="none" style={{ position: 'absolute', top: '40%', left: 0, right: 0, alignItems: 'center' }}>
          <View
            style={{
              backgroundColor: 'rgba(10,15,25,0.88)',
              borderWidth: 1.5,
              borderColor: banner.color,
              borderRadius: 12,
              paddingVertical: 8,
              paddingHorizontal: 18,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: banner.color, fontSize: 18, fontWeight: '900', letterSpacing: 1 }}>
              {banner.text}
            </Text>
            <MonoLabel size={9} color={INK.faint} style={{ marginTop: 3 }}>{banner.sub}</MonoLabel>
          </View>
        </View>
      )}

      {/* Scoreboard, floating over the canvas like the prototype's top-left panel. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 10, left: 14, right: 14 }}>
        <Panel padding={14}>
          <View className="flex-row items-center justify-between">
            <MonoLabel size={9}>Assistir ao jogo</MonoLabel>
            <MonoLabel size={9} color={INK.faint}>
              {phase === 'final' ? 'Final' : `${periodLabel(quarter, phase)} · ${clockLabel(clock, quarter)}`}
            </MonoLabel>
          </View>
          <View className="flex-row items-center justify-between" style={{ marginTop: 10 }}>
            <View className="flex-1">
              <MonoLabel size={9} color={homeAccent.primary} numberOfLines={1}>{getTeamTricode(home)}</MonoLabel>
              <Stat size={26} style={{ marginTop: 2 }}>{score.home}</Stat>
            </View>
            <MonoLabel size={9} color={INK.faint} style={{ marginHorizontal: 10 }}>VS</MonoLabel>
            <View className="flex-1" style={{ alignItems: 'flex-end' }}>
              <MonoLabel size={9} color={awayAccent.primary} numberOfLines={1}>{getTeamTricode(away)}</MonoLabel>
              <Stat size={26} style={{ marginTop: 2 }}>{score.away}</Stat>
            </View>
          </View>

          {phase === 'live' && (
            <View
              className="flex-row items-center justify-between"
              style={{ marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: withAlpha('#ffffff', 0.08) }}
            >
              <MonoLabel size={9} color={userAccent.primary}>
                {WATCH_PLAY_META[play].label}
              </MonoLabel>
              <MonoLabel size={9} color={INK.faint} numberOfLines={1}>
                {courtRef.current?.handlerName ?? '—'} · {timeoutsLeft} tempo{timeoutsLeft === 1 ? '' : 's'}
              </MonoLabel>
            </View>
          )}
        </Panel>

        <View className="flex-row" style={{ marginTop: 8, gap: 6 }}>
          {CAMERA_VIEWS.map((v) => {
            const active = v.id === cameraView;
            return (
              <Pressable
                key={v.id}
                onPress={() => setCameraView(v.id)}
                className="active:opacity-70"
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  borderRadius: 999,
                  alignItems: 'center',
                  backgroundColor: active ? COLORS.cta : 'rgba(10,15,25,0.75)',
                  borderWidth: 1,
                  borderColor: active ? COLORS.cta : 'rgba(255,255,255,0.14)',
                }}
              >
                <MonoLabel size={9} color={active ? '#ffffff' : INK.faint}>{v.label}</MonoLabel>
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

            <ScrollView style={{ maxHeight: 232, marginTop: 10 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 7 }}>
                {PLAY_ORDER.map((id) => {
                  const meta = WATCH_PLAY_META[id];
                  const active = id === play;
                  return (
                    <Pressable
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
          <View className="flex-row" style={{ gap: 8 }}>
            <GhostButton
              label="Pedir tempo"
              onPress={callTimeout}
              disabled={timeoutsLeft <= 0}
              color={timeoutsLeft > 0 ? userAccent.primary : COLORS.textDim}
              padding={13}
              style={{ flex: 1.2 }}
            />
            <GhostButton
              label={speed > 1 ? `${speed}x ✓` : '4x'}
              onPress={toggleSpeed}
              padding={13}
              style={{ flex: 0.7 }}
            />
            <GhostButton label="Pular" onPress={skipToEnd} padding={13} style={{ flex: 0.8 }} />
          </View>
        )}

        {phase === 'final' && (
          <CtaButton
            label={winnerLine}
            sub={`${score.home}-${score.away} · ${userWon ? 'vitória sua' : 'derrota'} · toque para continuar`}
            onPress={() => onFinish(score.home, score.away)}
          />
        )}
      </View>
    </View>
  );
};

export default WatchGameScreen;
