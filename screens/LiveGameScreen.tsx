import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { Image } from 'expo-image';

import { Team, LiveGameState, LiveTactic, PendingDeciderRef } from '../types';
import { getTeamLogoUrl, getTeamTricode, getTeamAccent } from '../constants';
import { TACTIC_META } from '../services/simulationService';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK, RADIUS, FONT, withAlpha, onAccent } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import { Panel, MonoLabel, Stat, CtaButton, GhostButton, HeroTitle, Dock, SectionLabel, BodyText } from '../components/ui/kit';

// Design 2c — the tensest screen in the app, so the scoreboard takes the whole
// hero and the three bench tactics sit directly under it as court decisions
// rather than as a settings list. There is no game clock in LiveGameState (the
// sim resolves a whole quarter at a time), so the center column carries the
// period and timeouts, and the quarter-by-quarter line replaces a running time.

const REF_LABEL: (ref: PendingDeciderRef) => string = (ref) => {
  if (ref.scope === 'finals') return 'Finais da NBA · jogo decisivo';
  const round = ref.round === 'round1' ? '1ª rodada' : ref.round === 'round2' ? 'Semis de conferência' : 'Finais de conferência';
  return `${round} · jogo 7`;
};

const TACTIC_ORDER: LiveTactic[] = ['ritmo', 'defesa', 'isolar'];

interface LiveGameScreenProps {
  liveGame: LiveGameState;
  teams: Team[];
  onAdvanceQuarter: () => void;
  onRequestTimeout: () => void;
  onSetTactic: (tactic: LiveTactic | null) => void;
  onResolve: () => void;
}

// The pulsing "AO VIVO" dot. Animated core, not Reanimated — same fail-safe
// choice FadeInView makes, so a dropped native module can never take the
// screen down with it.
const PulseDot: React.FC<{ color: string }> = ({ color }) => {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color, opacity }} />;
};

const LiveGameScreen: React.FC<LiveGameScreenProps> = ({
  liveGame, teams, onAdvanceQuarter, onRequestTimeout, onSetTactic, onResolve,
}) => {
  const { accent } = useTheme();
  const teamA = teams.find((t) => t.id === liveGame.teamAId);
  const teamB = teams.find((t) => t.id === liveGame.teamBId);
  if (!teamA || !teamB) return null;

  const userTeam = liveGame.userIsTeamA ? teamA : teamB;
  const won = liveGame.winnerId === userTeam.id;
  const quarterLabel = liveGame.quarter <= 4 ? `${liveGame.quarter}º quarto` : `Prorrogação ${liveGame.quarter - 4}`;
  const margin = (liveGame.userIsTeamA ? liveGame.scoreA - liveGame.scoreB : liveGame.scoreB - liveGame.scoreA);
  // Tied is its own state — `>=` called 0-0 "você está à frente, +0".
  const situation = margin > 0 ? 'ahead' : margin < 0 ? 'behind' : 'tied';
  const userLeads = margin >= 0;

  const TOTAL_TIMEOUTS = 3;
  const periodLabel = liveGame.complete ? 'Final' : liveGame.quarter <= 4 ? `${liveGame.quarter}º Q` : `PRO ${liveGame.quarter - 4}`;
  const block = (team: Team, score: number, right: boolean, lead: boolean) => {
    const bg = getTeamAccent(team.id).primary;
    const ink = onAccent(bg);
    return (
      <View style={{ flex: 1, backgroundColor: bg, padding: 14, gap: 2, alignItems: right ? 'flex-end' : 'flex-start' }}>
        <Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: ink }}>{team.id.toUpperCase()}</Text>
        <Text style={{ fontFamily: FONT.cond800, fontSize: 64, lineHeight: 56, color: ink, opacity: lead || liveGame.quarterScores.length === 0 ? 1 : 0.7, fontVariant: ['tabular-nums'] }}>
          {score}
        </Text>
      </View>
    );
  };
  // Quarter-by-quarter table: four quarters plus any overtime, then the total.
  const periods = Math.max(4, liveGame.quarterScores.length);

  return (
    <Screen
      heroHeight={100}
      footer={
        <Dock>
          {liveGame.complete ? (
            <CtaButton label="Ver resultado" onPress={onResolve} />
          ) : (
            <View className="flex-row" style={{ gap: 8 }}>
              <GhostButton
                label={liveGame.pendingTimeout ? 'Tempo pedido ✓' : 'Pedir tempo'}
                onPress={onRequestTimeout}
                disabled={liveGame.timeoutsLeft <= 0 || liveGame.pendingTimeout}
                style={{ flex: 1, minHeight: 52 }}
              />
              <CtaButton label="Avançar quarto ›" onPress={onAdvanceQuarter} size={18} style={{ flex: 1.6 }} />
            </View>
          )}
        </Dock>
      }
    >
      <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1.9, color: COLORS.muted, textTransform: 'uppercase' }}>{REF_LABEL(liveGame.ref)}</Text>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          {!liveGame.complete ? <PulseDot color={COLORS.bad} /> : null}
          <Text style={{ fontFamily: FONT.cond800, fontSize: 12, letterSpacing: 1.7, color: liveGame.complete ? COLORS.muted : COLORS.bad }}>
            {liveGame.complete ? 'FIM DE JOGO' : 'AO VIVO'}
          </Text>
        </View>
      </View>

      <Body top={14} gap={14}>
        {/* Scoreboard: team blocks at the ends, the period in the middle. */}
        <View style={{ borderRadius: 20, overflow: 'hidden', flexDirection: 'row', backgroundColor: COLORS.surface }}>
          {block(teamA, liveGame.scoreA, false, liveGame.scoreA >= liveGame.scoreB)}
          <View style={{ width: 84, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 22, lineHeight: 22, color: COLORS.text }}>{periodLabel}</Text>
            <Text style={{ fontFamily: FONT.cond600, fontSize: 11, letterSpacing: 1.1, color: COLORS.muted }}>
              {liveGame.complete ? `${liveGame.quarterScores.length > 4 ? 'APÓS PRORROG.' : '4 QUARTOS'}` : liveGame.quarterScores.length ? 'A SEGUIR' : 'BOLA AO ALTO'}
            </Text>
            <View className="flex-row" style={{ gap: 3, marginTop: 4 }}>
              {Array.from({ length: TOTAL_TIMEOUTS }, (_, i) => (
                <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i < liveGame.timeoutsLeft ? COLORS.text : COLORS.lineStrong }} />
              ))}
            </View>
          </View>
          {block(teamB, liveGame.scoreB, true, liveGame.scoreB >= liveGame.scoreA)}
        </View>

        {/* Quarter by quarter. */}
        <View style={{ gap: 6 }}>
          {[
            { label: 'Time', vals: Array.from({ length: periods }, (_, i) => (i < 4 ? `${i + 1}Q` : `P${i - 3}`)), tot: 'TOT', head: true },
            { label: teamA.id.toUpperCase(), vals: Array.from({ length: periods }, (_, i) => liveGame.quarterScores[i]?.a), tot: liveGame.scoreA, head: false, mine: liveGame.userIsTeamA },
            { label: teamB.id.toUpperCase(), vals: Array.from({ length: periods }, (_, i) => liveGame.quarterScores[i]?.b), tot: liveGame.scoreB, head: false, mine: !liveGame.userIsTeamA },
          ].map((row) => (
            <View key={row.label} className="flex-row items-center">
              <Text style={{ width: 44, fontFamily: FONT.cond700, fontSize: row.head ? 11 : 13, letterSpacing: row.head ? 1 : 0, color: row.head ? COLORS.faint : row.mine ? COLORS.text : COLORS.muted, textTransform: 'uppercase' }}>{row.label}</Text>
              {row.vals.map((v, i) => (
                <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: FONT.cond700, fontSize: row.head ? 11 : 13, color: row.head ? COLORS.faint : v === undefined ? '#4A4950' : row.mine ? COLORS.text : COLORS.muted }}>
                  {v === undefined ? '—' : v}
                </Text>
              ))}
              <Text style={{ width: 44, textAlign: 'center', fontFamily: FONT.cond800, fontSize: row.head ? 11 : 13, color: row.head ? COLORS.faint : row.mine ? COLORS.text : COLORS.muted }}>{row.tot}</Text>
            </View>
          ))}
        </View>

        {liveGame.complete ? (
          <Panel bar={won ? COLORS.good : COLORS.bad} style={{ gap: 6 }}>
            <MonoLabel size={9} color={won ? COLORS.good : COLORS.bad}>{won ? 'Você venceu o jogo decisivo' : 'Derrota no jogo decisivo'}</MonoLabel>
            <HeroTitle size={24}>{getTeamTricode(teamA)} {liveGame.scoreA} — {liveGame.scoreB} {getTeamTricode(teamB)}</HeroTitle>
            <BodyText>{won ? 'A série é sua. O vestiário é seu.' : 'Acabou aqui. A diretoria vai querer explicações.'}</BodyText>
          </Panel>
        ) : (
          <View style={{ gap: 8 }}>
            <SectionLabel>Tática do banco · vale 1 quarto</SectionLabel>
            <View className="flex-row" style={{ gap: 6 }}>
              {TACTIC_ORDER.map((tactic) => {
                const meta = TACTIC_META[tactic];
                const on = liveGame.pendingTactic === tactic;
                return (
                  <Pressable
                    key={tactic}
                    accessibilityRole="button"
                    aria-selected={on}
                    onPress={() => onSetTactic(on ? null : tactic)}
                    className="active:opacity-75"
                    style={{ flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, gap: 3, backgroundColor: on ? COLORS.ctaFill : COLORS.surface }}
                  >
                    <Text style={{ fontFamily: FONT.cond800, fontSize: 16, lineHeight: 16, color: on ? COLORS.ctaInk : COLORS.text, textTransform: 'uppercase' }}>{meta.label}</Text>
                    <Text style={{ fontFamily: FONT.body500, fontSize: 11.5, lineHeight: 15, color: on ? 'rgba(11,11,13,0.7)' : COLORS.muted }} numberOfLines={2}>
                      {on ? 'Ativa neste quarto' : 'Toque para usar'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {liveGame.pendingTactic ? <BodyText size={12.5}>{TACTIC_META[liveGame.pendingTactic].blurb}</BodyText> : null}
            <BodyText size={12.5} color={situation === 'ahead' ? COLORS.good : situation === 'behind' ? COLORS.warn : COLORS.muted}>
              {situation === 'ahead' ? `Você está à frente por ${margin}.` : situation === 'behind' ? `Você está atrás por ${Math.abs(margin)}.` : 'Jogo empatado.'}
            </BodyText>
          </View>
        )}

        {/* Narração: newest first, brighter. The sim has no clock, so recency is the only marker. */}
        <Panel style={{ gap: 9 }}>
          <SectionLabel>Narração</SectionLabel>
          {liveGame.log.length === 0 ? (
            <BodyText>A bola ainda não subiu. Escolha uma tática e avance o primeiro quarto.</BodyText>
          ) : (
            liveGame.log.map((line, i) => (
              <View key={i} className="flex-row" style={{ gap: 10 }}>
                <View style={{ width: 3, borderRadius: 2, backgroundColor: i === 0 ? COLORS.text : COLORS.lineStrong }} />
                <Text style={{ flex: 1, fontFamily: FONT.body500, fontSize: 13.5, lineHeight: 19, color: i === 0 ? COLORS.text : COLORS.muted }}>{line}</Text>
              </View>
            ))
          )}
        </Panel>
      </Body>
    </Screen>
  );
};

const Side: React.FC<{ team: Team; score: number; lead: boolean }> = ({ team, score, lead }) => (
  <View className="items-center" style={{ flex: 1 }}>
    <Image source={{ uri: getTeamLogoUrl(team) }} style={{ width: 48, height: 48 }} contentFit="contain" />
    <HeroTitle size={12} color={lead ? '#fff' : 'rgba(255,255,255,0.6)'} style={{ marginTop: 6 }}>
      {getTeamTricode(team)}
    </HeroTitle>
    <Stat size={46} color={lead ? '#fff' : 'rgba(255,255,255,0.65)'} style={{ marginTop: 6, lineHeight: 46 }}>
      {score}
    </Stat>
  </View>
);

export default LiveGameScreen;
