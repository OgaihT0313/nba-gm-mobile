import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer, type AudioPlayer } from 'expo-audio';

import { Team } from '../types';
import { getTeamAccent, getTeamNickname, getTeamTricode } from '../constants';
import { WatchableGame, GameEvent } from '../services/simulationService';
import { eraGroupForEraId } from '../data/eras';
import { getEraVisual } from '../src/theme/eraVisuals';
import { COLORS, INK } from '../src/theme/tokens';
import { Panel, MonoLabel, Stat, CtaButton, GhostButton } from '../components/ui/kit';
import Court3D, { ShotEvent } from '../components/court3d/Court3D';

// "Assistir ao Jogo" — the 3D court. Deliberately its own full-bleed layout
// (not <Screen>, which is a ScrollView built for card stacks) with floating
// glass panels over the canvas, same visual language as the quadra-3d.html
// prototype this was ported from.
//
// The game itself is never simulated here — `game` already comes from
// simulationEngine.simulateGameEvents (a real simulateGame() result plus a
// dramatized play-by-play). This screen only plays that back on a clock; the
// final score it ends on is exactly what onFinish() commits to the season.

const GAME_SECONDS = 48 * 60;
const WATCH_MS = 5 * 60 * 1000; // "jogo rápido de 5min" — 5 real minutes for the full 48 game-minutes
const QUARTER_SECONDS = GAME_SECONDS / 4;

const clockLabel = (secondsIntoQuarter: number) => {
  const remaining = Math.max(0, Math.round(QUARTER_SECONDS - secondsIntoQuarter));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

interface WatchGameScreenProps {
  home: Team;
  away: Team;
  game: WatchableGame;
  onFinish: () => void;
  /** Which historical era (if any) started this save — see data/eras/index.ts.
   * Only used to pick Court3D's floor tone (Fase C's per-era visual
   * identity); undefined for a live/current-season save renders the exact
   * same court that already ships today. */
  eraId?: string;
}

const WatchGameScreen: React.FC<WatchGameScreenProps> = ({ home, away, game, onFinish, eraId }) => {
  const insets = useSafeAreaInsets();
  const homeAccent = getTeamAccent(home.id);
  const awayAccent = getTeamAccent(away.id);
  const eraVisual = getEraVisual(eraId ? eraGroupForEraId(eraId)?.visualId : undefined);

  const [elapsedMs, setElapsedMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const firedRef = useRef(0); // index into game.events already animated
  const startRef = useRef<number | null>(null);
  const [shot, setShot] = useState<ShotEvent | null>(null);
  const shotSeq = useRef(0);

  // Synthesized placeholder SFX (assets/sfx — see scripts/generate_sfx.js).
  // .seekTo(0) before each play() so a basket landing mid-decay of the
  // previous one restarts cleanly instead of no-op'ing on an already-playing
  // player.
  const swishSound = useAudioPlayer(require('../assets/sfx/swish.wav'));
  const buzzerSound = useAudioPlayer(require('../assets/sfx/buzzer.wav'));
  const whistleSound = useAudioPlayer(require('../assets/sfx/whistle.wav'));
  const playSound = (player: AudioPlayer) => {
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // Best-effort — a missing/unready audio device should never block the game.
    }
  };

  // Tip-off whistle, once, when the screen mounts.
  useEffect(() => {
    playSound(whistleSound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = elapsedMs >= WATCH_MS;

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      setElapsedMs((prev) => Math.min(WATCH_MS, prev + 200 * speed));
    }, 200);
    return () => clearInterval(id);
  }, [done, speed]);

  const gameClockSeconds = Math.min(GAME_SECONDS, (elapsedMs / WATCH_MS) * GAME_SECONDS);
  const quarter = Math.min(4, Math.floor(gameClockSeconds / QUARTER_SECONDS) + 1);
  const secondsIntoQuarter = gameClockSeconds - (quarter - 1) * QUARTER_SECONDS;

  // Fire any events the clock just crossed. Only the LAST one newly crossed
  // drives the ball animation (a real basket every ~1-2s of watch time can
  // cross several game-events per 200ms tick) — the running score below
  // always reflects the true cumulative sum regardless of which one animates.
  useEffect(() => {
    let idx = firedRef.current;
    let lastCrossed: GameEvent | null = null;
    while (idx < game.events.length && game.events[idx].clockSeconds <= gameClockSeconds) {
      lastCrossed = game.events[idx];
      idx++;
    }
    if (idx !== firedRef.current) {
      firedRef.current = idx;
      if (lastCrossed) {
        shotSeq.current += 1;
        setShot({ id: shotSeq.current, side: lastCrossed.team === 'A' ? 'home' : 'away', points: lastCrossed.points });
        // Roughly synced to the ball's ~0.9s flight in Court3D rather than
        // firing the instant the score updates.
        setTimeout(() => playSound(swishSound), 650);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameClockSeconds, game.events]);

  // Buzzer on every quarter change, and once more when the watch ends.
  const prevQuarterRef = useRef(1);
  useEffect(() => {
    if (quarter !== prevQuarterRef.current) {
      prevQuarterRef.current = quarter;
      playSound(buzzerSound);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quarter]);

  const firedFinalBuzzerRef = useRef(false);
  useEffect(() => {
    if (done && !firedFinalBuzzerRef.current) {
      firedFinalBuzzerRef.current = true;
      playSound(buzzerSound);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const { scoreHome, scoreAway } = useMemo(() => {
    let a = 0, b = 0;
    for (const e of game.events) {
      if (e.clockSeconds > gameClockSeconds) break;
      if (e.team === 'A') a += e.points; else b += e.points;
    }
    return { scoreHome: a, scoreAway: b };
  }, [gameClockSeconds, game.events]);

  const skipToEnd = () => setElapsedMs(WATCH_MS);

  return (
    <View className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      <Court3D
        home={homeAccent}
        away={awayAccent}
        shot={shot}
        visual={eraVisual ? { floorColor: eraVisual.floorTone } : undefined}
      />

      {/* Scoreboard, floating over the canvas like the prototype's top-left panel. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 10, left: 14, right: 14 }}>
        <Panel padding={14}>
          <View className="flex-row items-center justify-between">
            <MonoLabel size={9}>Assistir ao jogo</MonoLabel>
            <MonoLabel size={9} color={INK.faint}>
              {done ? 'Final' : `${quarter}º Q · ${clockLabel(secondsIntoQuarter)}`}
            </MonoLabel>
          </View>
          <View className="flex-row items-center justify-between" style={{ marginTop: 10 }}>
            <View className="flex-1">
              <MonoLabel size={9} color={homeAccent.primary} numberOfLines={1}>{getTeamTricode(home)}</MonoLabel>
              <Stat size={26} style={{ marginTop: 2 }}>{scoreHome}</Stat>
            </View>
            <MonoLabel size={9} color={INK.faint} style={{ marginHorizontal: 10 }}>VS</MonoLabel>
            <View className="flex-1" style={{ alignItems: 'flex-end' }}>
              <MonoLabel size={9} color={awayAccent.primary} numberOfLines={1}>{getTeamTricode(away)}</MonoLabel>
              <Stat size={26} style={{ marginTop: 2 }}>{scoreAway}</Stat>
            </View>
          </View>
        </Panel>
      </View>

      {/* Bottom action: skip while live, confirm+commit once it's over. The
          app's BottomNav already reserves its own space below this screen
          (it's a normal flex sibling, not an overlay), so this only needs a
          flat gutter — no extra safe-area padding on top of that. */}
      <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14 }}>
        {done ? (
          <CtaButton
            label={scoreHome >= scoreAway ? `${getTeamNickname(home)} vence` : `${getTeamNickname(away)} vence`}
            sub={`${scoreHome}-${scoreAway} · toque para continuar`}
            onPress={onFinish}
          />
        ) : (
          <View className="flex-row" style={{ gap: 8 }}>
            <GhostButton
              label={speed > 1 ? `${speed}x ✓` : 'Acelerar 4x'}
              onPress={() => setSpeed((s) => (s === 1 ? 4 : 1))}
              padding={13}
              style={{ flex: 1 }}
            />
            <GhostButton label="Pular pro final" onPress={skipToEnd} padding={13} style={{ flex: 1 }} />
          </View>
        )}
      </View>
    </View>
  );
};

export default WatchGameScreen;
