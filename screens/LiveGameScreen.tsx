import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { Image } from 'expo-image';

import { Team, LiveGameState, LiveTactic, PendingDeciderRef } from '../types';
import { getTeamLogoUrl, getTeamTricode } from '../constants';
import { TACTIC_META } from '../services/simulationService';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK, RADIUS, withAlpha } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import { Panel, MonoLabel, Stat, CtaButton, GhostButton, HeroTitle } from '../components/ui/kit';

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

  return (
    <Screen
      heroHeight={290}
      footer={
        liveGame.complete ? (
          <CtaButton label="Ver resultado" onPress={onResolve} />
        ) : (
          <View className="flex-row" style={{ gap: 8 }}>
            <GhostButton
              label={liveGame.pendingTimeout ? 'Tempo pedido ✓' : 'Pedir tempo'}
              onPress={onRequestTimeout}
              disabled={liveGame.timeoutsLeft <= 0 || liveGame.pendingTimeout}
              color={liveGame.pendingTimeout ? accent.primary : COLORS.textDim}
              padding={14}
              style={{ flex: 1 }}
            />
            <CtaButton label="Avançar quarto ›" onPress={onAdvanceQuarter} size={14} style={{ flex: 2 }} />
          </View>
        )
      }
    >
      <HeroContent>
        <View className="items-center">
          <View
            className="flex-row items-center"
            style={{
              gap: 7, paddingHorizontal: 11, paddingVertical: 4, borderRadius: RADIUS.pill,
              backgroundColor: withAlpha(COLORS.cta, 0.18), borderWidth: 1, borderColor: withAlpha(COLORS.cta, 0.4),
            }}
          >
            <PulseDot color={COLORS.cta} />
            <MonoLabel size={9} color={COLORS.badSoft} style={{ letterSpacing: 1.6 }}>
              {liveGame.complete ? 'Fim de jogo' : 'Ao vivo'} · {REF_LABEL(liveGame.ref)}
            </MonoLabel>
          </View>
        </View>

        {/* Scoreboard */}
        <View className="flex-row items-center justify-between" style={{ marginTop: 20, paddingHorizontal: 4 }}>
          <Side team={teamA} score={liveGame.scoreA} lead={liveGame.scoreA >= liveGame.scoreB} />
          <View className="items-center" style={{ paddingHorizontal: 6 }}>
            <MonoLabel size={11} color={COLORS.info} style={{ letterSpacing: 1.8 }}>
              {liveGame.complete ? 'Final' : quarterLabel}
            </MonoLabel>
            {/* Which period we're in, not how many are finished: "0/4" before
                the first quarter read as a scoreline. */}
            <Stat size={20} style={{ marginTop: 5 }}>
              {liveGame.complete
                ? 'FIM'
                : liveGame.quarter <= 4
                  ? `${liveGame.quarter}/4`
                  : `PRO${liveGame.quarter - 4}`}
            </Stat>
            <MonoLabel size={9} color={INK.meta} style={{ marginTop: 6, letterSpacing: 0 }}>
              Tempos: {liveGame.timeoutsLeft}
            </MonoLabel>
          </View>
          <Side team={teamB} score={liveGame.scoreB} lead={liveGame.scoreB >= liveGame.scoreA} />
        </View>

        {/* Quarter by quarter, in place of a running clock. */}
        {liveGame.quarterScores.length > 0 ? (
          <View className="flex-row justify-center" style={{ gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
            {liveGame.quarterScores.map((q, i) => (
              <View
                key={i}
                style={{
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                  backgroundColor: 'rgba(0,0,0,0.35)',
                }}
              >
                <MonoLabel size={8.5} color={INK.meta} style={{ letterSpacing: 0.5, textAlign: 'center' }}>
                  {q.label}
                </MonoLabel>
                <MonoLabel size={10.5} color="#fff" style={{ letterSpacing: 0, textAlign: 'center', marginTop: 2 }}>
                  {q.a}-{q.b}
                </MonoLabel>
              </View>
            ))}
          </View>
        ) : null}
      </HeroContent>

      <Body top={20}>
        {liveGame.complete ? (
          <Panel bar={won ? COLORS.good : COLORS.cta} padding={18}>
            <MonoLabel color={won ? COLORS.goodSoft : COLORS.badSoft}>
              {won ? 'Você venceu o jogo decisivo' : 'Derrota no jogo decisivo'}
            </MonoLabel>
            <HeroTitle size={20} style={{ marginTop: 8 }}>
              {getTeamTricode(teamA)} {liveGame.scoreA} — {liveGame.scoreB} {getTeamTricode(teamB)}
            </HeroTitle>
            <Text style={{ fontSize: 12, lineHeight: 18, color: INK.body, marginTop: 8 }}>
              {won
                ? 'A série é sua. O vestiário é seu.'
                : 'Acabou aqui. A diretoria vai querer explicações.'}
            </Text>
          </Panel>
        ) : (
          <>
            <MonoLabel style={{ paddingLeft: 3 }}>Tática do banco · vale 1 quarto</MonoLabel>
            <View className="flex-row" style={{ gap: 8 }}>
              {TACTIC_ORDER.map((tactic) => {
                const meta = TACTIC_META[tactic];
                const selected = liveGame.pendingTactic === tactic;
                return (
                  <Pressable
                    key={tactic}
                    onPress={() => onSetTactic(selected ? null : tactic)}
                    className="active:opacity-75"
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 12,
                      paddingHorizontal: 6,
                      borderRadius: 14,
                      backgroundColor: selected ? withAlpha(accent.primary, 0.2) : COLORS.panel,
                      borderWidth: 1,
                      borderColor: selected ? accent.primary : COLORS.line,
                    }}
                  >
                    <Text
                      className="font-extrabold"
                      style={{ fontSize: 11.5, color: selected ? accent.primary : COLORS.textSoft, textTransform: 'uppercase' }}
                    >
                      {meta.label}
                    </Text>
                    <MonoLabel size={8.5} color={selected ? INK.body : INK.faint} style={{ marginTop: 3, letterSpacing: 0 }}>
                      {selected ? 'Ativa' : 'Trocar'}
                    </MonoLabel>
                  </Pressable>
                );
              })}
            </View>
            {liveGame.pendingTactic ? (
              <Text style={{ fontSize: 11, lineHeight: 16, color: INK.body, paddingHorizontal: 4 }}>
                {TACTIC_META[liveGame.pendingTactic].blurb}
              </Text>
            ) : null}

            <Panel
              bar={situation === 'ahead' ? COLORS.good : situation === 'behind' ? COLORS.warn : COLORS.info}
              padding={13}
            >
              <View className="flex-row items-center" style={{ gap: 11 }}>
                <Image source={{ uri: getTeamLogoUrl(userTeam) }} style={{ width: 32, height: 32 }} contentFit="contain" />
                <View style={{ flex: 1 }}>
                  <MonoLabel size={8.5}>Situação</MonoLabel>
                  <Text className="font-extrabold text-white" style={{ fontSize: 12.5, marginTop: 3 }}>
                    {situation === 'ahead' ? 'Você está à frente' : situation === 'behind' ? 'Você está atrás' : 'Jogo empatado'}
                  </Text>
                </View>
                <Stat
                  size={18}
                  color={situation === 'ahead' ? COLORS.good : situation === 'behind' ? COLORS.warn : COLORS.info}
                >
                  {situation === 'ahead' ? `+${margin}` : situation === 'behind' ? `−${Math.abs(margin)}` : '='}
                </Stat>
              </View>
            </Panel>
          </>
        )}

        {/* Narração. Rendered even when empty: before the first quarter the log
            has nothing in it, and skipping the panel entirely left a screen-tall
            hole between the tactics and the pinned buttons. */}
        {liveGame.log.length === 0 ? (
          <Panel padding={13}>
            <MonoLabel style={{ marginBottom: 8 }}>Narração</MonoLabel>
            <Text style={{ fontSize: 11.5, lineHeight: 17, color: INK.body }}>
              A bola ainda não subiu. Escolha uma tática e avance o primeiro quarto.
            </Text>
          </Panel>
        ) : (
          <Panel padding={13}>
            <MonoLabel style={{ marginBottom: 10 }}>Narração</MonoLabel>
            <View style={{ gap: 9 }}>
              {/* The log carries no timestamps (the sim has no clock), so the
                  only marker is recency: the newest line leads, brighter. */}
              {liveGame.log.map((line, i) => (
                <View key={i} className="flex-row" style={{ gap: 9 }}>
                  <View
                    style={{
                      width: 5, height: 5, borderRadius: 3, marginTop: 6,
                      backgroundColor: i === 0 ? COLORS.info : COLORS.line,
                    }}
                  />
                  <Text style={{ flex: 1, fontSize: 11.5, lineHeight: 16, color: i === 0 ? '#fff' : COLORS.textSoft }}>
                    {line}
                  </Text>
                </View>
              ))}
            </View>
          </Panel>
        )}
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
