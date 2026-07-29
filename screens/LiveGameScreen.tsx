import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Team, LiveGameState, LiveTactic, PendingDeciderRef } from '../types';
import { getTeamLogoUrl, getTeamAccent } from '../constants';
import { TACTIC_META } from '../services/simulationService';
import Card from '../components/Card';
import Icon from '../components/Icon';

const REF_LABEL: (ref: PendingDeciderRef) => string = (ref) => {
  if (ref.scope === 'finals') return 'FINAIS DA NBA — JOGO DECISIVO';
  const roundLabel = ref.round === 'round1' ? '1ª Rodada' : ref.round === 'round2' ? 'Semifinal de Conferência' : 'Final de Conferência';
  return `JOGO 7 — ${roundLabel}`;
};

const TACTIC_ORDER: LiveTactic[] = ['ritmo', 'defesa', 'isolar'];
const TACTIC_ICON: Record<LiveTactic, string> = { ritmo: '⚡', defesa: '🛡️', isolar: '🎯' };

interface LiveGameScreenProps {
  liveGame: LiveGameState;
  teams: Team[];
  onAdvanceQuarter: () => void;
  onRequestTimeout: () => void;
  onSetTactic: (tactic: LiveTactic | null) => void;
  onResolve: () => void;
}

const LiveGameScreen: React.FC<LiveGameScreenProps> = ({ liveGame, teams, onAdvanceQuarter, onRequestTimeout, onSetTactic, onResolve }) => {
  const teamA = teams.find((t) => t.id === liveGame.teamAId);
  const teamB = teams.find((t) => t.id === liveGame.teamBId);
  if (!teamA || !teamB) return null;

  const userTeam = liveGame.userIsTeamA ? teamA : teamB;
  const accent = getTeamAccent(userTeam.id);
  const quarterLabel = liveGame.quarter <= 4 ? `${liveGame.quarter}º Quarto` : `Prorrogação ${liveGame.quarter - 4}`;

  return (
    <ScrollView className="flex-1">
      <View className="px-4 py-6 gap-5">
        <View className="items-center gap-1">
          <View className="flex-row items-center gap-1.5">
            <View className="w-2 h-2 rounded-full bg-red-500" />
            <Text className="text-[11px] font-black uppercase tracking-[0.25em] text-red-400">{REF_LABEL(liveGame.ref)}</Text>
          </View>
          <Text className="text-[10px] text-slate-500">{liveGame.complete ? 'Fim de jogo' : quarterLabel}</Text>
        </View>

        {/* Scoreboard */}
        <Card variant="offseason" padding="lg" accentColor={accent.primary} className="gap-4">
          <View className="flex-row items-center justify-between">
            <View className="items-center flex-1 gap-1.5">
              <Image source={{ uri: getTeamLogoUrl(teamA) }} style={{ width: 44, height: 44 }} contentFit="contain" />
              <Text className="text-xs font-bold text-white text-center" numberOfLines={1}>{teamA.name}</Text>
              {liveGame.userIsTeamA ? <Text className="text-[9px] font-black uppercase text-accent">Seu time</Text> : null}
            </View>
            <View className="flex-row items-center gap-3 px-2">
              <Text className="text-4xl font-mono-bold text-white">{liveGame.scoreA}</Text>
              <Text className="text-lg text-slate-600 font-black">-</Text>
              <Text className="text-4xl font-mono-bold text-white">{liveGame.scoreB}</Text>
            </View>
            <View className="items-center flex-1 gap-1.5">
              <Image source={{ uri: getTeamLogoUrl(teamB) }} style={{ width: 44, height: 44 }} contentFit="contain" />
              <Text className="text-xs font-bold text-white text-center" numberOfLines={1}>{teamB.name}</Text>
              {!liveGame.userIsTeamA ? <Text className="text-[9px] font-black uppercase text-accent">Seu time</Text> : null}
            </View>
          </View>

          {/* Quarter-by-quarter table */}
          {liveGame.quarterScores.length > 0 ? (
            <View className="border-t border-slate-800 pt-3 gap-1.5">
              {liveGame.quarterScores.map((q, i) => (
                <View key={i} className="flex-row items-center justify-between">
                  <Text className="text-[10px] font-bold text-slate-500 w-24">{q.label}</Text>
                  <Text className="text-xs font-mono-bold text-slate-300 flex-1 text-right">{q.a}</Text>
                  <Text className="text-xs text-slate-700 px-2">·</Text>
                  <Text className="text-xs font-mono-bold text-slate-300 flex-1">{q.b}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        {liveGame.complete ? (
          <Card variant="offseason" accentColor={liveGame.winnerId === userTeam.id ? '#34d399' : '#f87171'} padding="lg" className="gap-3 items-center">
            <Icon name="awards" size={28} color={liveGame.winnerId === userTeam.id ? '#34d399' : '#f87171'} />
            <Text className="text-xl font-black uppercase italic tracking-tight text-white text-center">
              {liveGame.winnerId === userTeam.id ? 'Você venceu o jogo decisivo!' : 'Derrota no jogo decisivo'}
            </Text>
            <Text className="text-sm text-slate-400 text-center">
              {teamA.name} {liveGame.scoreA} - {liveGame.scoreB} {teamB.name}
            </Text>
            <Pressable onPress={onResolve} className="mt-2 rounded-xl px-8 py-3" style={{ backgroundColor: accent.primary }}>
              <Text className="text-sm font-black uppercase text-slate-950">Ver Resultado</Text>
            </Pressable>
          </Card>
        ) : (
          <>
            {/* Timeout */}
            <View className="flex-row items-center justify-between bg-slate-950/50 rounded-2xl px-4 py-3 border border-slate-800">
              <View className="flex-1 pr-3">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pedido de Tempo</Text>
                <Text className="text-[11px] text-slate-500 mt-0.5">+{3} pontos no próximo quarto · {liveGame.timeoutsLeft} restante{liveGame.timeoutsLeft === 1 ? '' : 's'}</Text>
              </View>
              <Pressable
                onPress={onRequestTimeout}
                disabled={liveGame.timeoutsLeft <= 0 || liveGame.pendingTimeout}
                className={`px-4 py-2.5 rounded-xl border ${liveGame.pendingTimeout ? '' : liveGame.timeoutsLeft <= 0 ? 'bg-slate-900 border-slate-800' : 'bg-slate-800 border-slate-700'}`}
                style={liveGame.pendingTimeout ? { backgroundColor: `${accent.primary}33`, borderColor: accent.primary } : undefined}
              >
                <Text
                  className={`text-xs font-black uppercase ${liveGame.pendingTimeout ? '' : liveGame.timeoutsLeft <= 0 ? 'text-slate-700' : 'text-white'}`}
                  style={liveGame.pendingTimeout ? { color: accent.primary } : undefined}
                >
                  {liveGame.pendingTimeout ? 'Pedido ✓' : 'Pedir tempo'}
                </Text>
              </Pressable>
            </View>

            {/* Tactics */}
            <View className="gap-2">
              <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Ajuste Tático (1 quarto)</Text>
              {TACTIC_ORDER.map((tactic) => {
                const meta = TACTIC_META[tactic];
                const selected = liveGame.pendingTactic === tactic;
                return (
                  <Pressable
                    key={tactic}
                    onPress={() => onSetTactic(selected ? null : tactic)}
                    className={`flex-row items-center gap-3 rounded-xl px-4 py-3 border ${selected ? '' : 'bg-slate-950/50 border-slate-800'}`}
                    style={selected ? { backgroundColor: `${accent.primary}26`, borderColor: accent.primary } : undefined}
                  >
                    <Text className="text-lg">{TACTIC_ICON[tactic]}</Text>
                    <View className="flex-1">
                      <Text className={`text-sm font-bold ${selected ? 'text-accent' : 'text-white'}`}>{meta.label}</Text>
                      <Text className="text-[10px] text-slate-500 mt-0.5">{meta.blurb}</Text>
                    </View>
                    {selected ? <Icon name="chevron-down" size={14} color={accent.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={onAdvanceQuarter} className="rounded-2xl py-4 items-center" style={{ backgroundColor: accent.primary }}>
              <Text className="text-sm font-black uppercase tracking-widest text-slate-950">Simular Quarto</Text>
            </Pressable>
          </>
        )}

        {/* Play-by-play log */}
        {liveGame.log.length > 0 ? (
          <View className="gap-2">
            <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Últimas Jogadas</Text>
            <Card padding="sm" className="gap-2">
              {liveGame.log.map((line, i) => (
                <Text key={i} className="text-xs text-slate-400" numberOfLines={2}>{line}</Text>
              ))}
            </Card>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
};

export default LiveGameScreen;
