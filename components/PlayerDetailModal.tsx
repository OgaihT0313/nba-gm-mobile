import React from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { Image } from 'expo-image';
import { Player } from '../types';
import { careerAverages, honorsSummary } from '../services/careerService';
import {
  getPlayerImageUrl,
  PLAYER_PLACEHOLDER_SVG,
  formatPositionsFull,
  ATTRIBUTE_META,
  getPlayerAttributes,
  attributeColor,
} from '../constants';

// RN port of the player detail sheet. On the web this had to portal to <body>
// to escape a transform containing block; RN's <Modal> renders above everything
// natively, so that whole gotcha disappears.
const formatMoney = (value: number) => `$${(value / 1_000_000).toFixed(1)}M`;

const POTENTIAL_LABEL: { [key: string]: string } = {
  A: 'Elite (A)', B: 'Alto (B)', C: 'Estável (C)', D: 'Limitado (D)',
};

const Tile: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <View className="flex-1 bg-slate-800/50 p-3 rounded-2xl border border-slate-700/50 items-center">
    <Text className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{label}</Text>
    <Text className="text-xl font-black text-white">{value}</Text>
  </View>
);

const PlayerDetailModal: React.FC<{ player: Player; onClose: () => void }> = ({ player, onClose }) => {
  const attrs = getPlayerAttributes(player);
  const ranked = [...ATTRIBUTE_META].sort((a, b) => attrs[b.key] - attrs[a.key]);
  const strengths = ranked.slice(0, 2);
  const weaknesses = ranked.slice(-2).reverse();
  const uri = getPlayerImageUrl(player);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/70 justify-end" onPress={onClose}>
        <Pressable
          className="bg-slate-900 border border-slate-800 rounded-t-3xl max-h-[90%]"
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View className="h-36 bg-slate-800 rounded-t-3xl items-center justify-end overflow-hidden">
            <Pressable
              onPress={onClose}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-slate-950/70 border border-slate-700 items-center justify-center"
            >
              <Text className="text-slate-300 text-lg leading-5">×</Text>
            </Pressable>
            <Image
              source={{ uri }}
              placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
              style={{ width: 130, height: 144 }}
              contentFit="contain"
            />
            <View className="absolute bottom-3 right-4 bg-slate-950/80 px-3 py-1 rounded-full border border-white/10">
              <Text className="text-sm font-black text-sky-400">{player.ovr} OVR</Text>
            </View>
          </View>

          <ScrollView className="px-5" contentContainerStyle={{ paddingVertical: 20, gap: 20 }}>
            <View className="items-center">
              <Text className="font-black text-2xl uppercase tracking-tighter text-white text-center">{player.name}</Text>
              <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1.5">
                {formatPositionsFull(player)} • {player.age} anos
              </Text>
              {/* Draft pedigree, kept for anyone drafted in this save: what the
                  board projected next to what the team actually got. */}
              {player.draftInfo ? (
                <Text className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-1">
                  Pick #{player.draftInfo.pick} · projetado {player.draftInfo.projected} OVR
                </Text>
              ) : null}
              {player.retired ? (
                <View className="mt-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30">
                  <Text className="text-[9px] font-black text-amber-400 uppercase tracking-widest">
                    Aposentado{player.retiredSeason ? ` · temporada ${player.retiredSeason}` : ''}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Headline ratings */}
            <View className="flex-row gap-2">
              <Tile label="OVR" value={player.ovr} />
              <Tile label="Ataque" value={player.off} />
              <Tile label="Defesa" value={player.def} />
            </View>

            {/* Morale */}
            {typeof player.morale === 'number' ? (() => {
              const m = player.morale;
              const color = m >= 65 ? '#34d399' : m >= 35 ? '#fbbf24' : '#f87171';
              const label = m >= 65 ? 'Satisfeito' : m >= 35 ? 'Neutro' : m >= 20 ? 'Insatisfeito' : 'Quer sair';
              return (
                <View className="gap-1.5">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Moral</Text>
                    <Text className="text-[11px] font-black uppercase" style={{ color }}>{label} · {m}%</Text>
                  </View>
                  <View className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <View className="h-full rounded-full" style={{ width: `${m}%`, backgroundColor: color }} />
                  </View>
                </View>
              );
            })() : null}

            {/* Season stats */}
            {player.seasonStats && player.seasonStats.gp > 0 ? (
              <View className="gap-2">
                <Text className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Temporada · {player.seasonStats.gp} jogos
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {([['PTS', player.seasonStats.ppg], ['REB', player.seasonStats.rpg], ['AST', player.seasonStats.apg], ['MIN', player.seasonStats.mpg], ['ROU', player.seasonStats.spg], ['TOC', player.seasonStats.bpg], ['ERR', player.seasonStats.tpg]] as [string, number][]).map(([label, val]) => (
                    <View key={label} className="w-[22%] bg-slate-800/50 p-2 rounded-xl border border-slate-700/50 items-center">
                      <Text className="text-sm font-black text-white">{val.toFixed(1)}</Text>
                      <Text className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Career totals — only once a full season has been folded in */}
            {player.career && player.career.seasons > 0 ? (() => {
              const c = player.career;
              const avg = careerAverages(c);
              const honors = honorsSummary(c);
              return (
                <View className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Carreira · {c.seasons} {c.seasons === 1 ? 'temporada' : 'temporadas'}
                    </Text>
                    <Text className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Pico {c.peakOvr} OVR
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    {([['PTS', avg.ppg], ['REB', avg.rpg], ['AST', avg.apg], ['ROU', avg.spg], ['TOC', avg.bpg]] as [string, number][]).map(([label, val]) => (
                      <View key={label} className="w-[22%] bg-slate-800/50 p-2 rounded-xl border border-slate-700/50 items-center">
                        <Text className="text-sm font-black text-white">{val.toFixed(1)}</Text>
                        <Text className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{label}</Text>
                      </View>
                    ))}
                  </View>
                  <Text className="text-[10px] font-bold text-slate-500">
                    {c.gp} jogos · {c.pts.toLocaleString('pt-BR')} pontos · {c.reb.toLocaleString('pt-BR')} rebotes · {c.ast.toLocaleString('pt-BR')} assistências
                  </Text>
                  {honors ? (
                    <View className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3">
                      <Text className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">Conquistas</Text>
                      <Text className="text-[11px] font-bold text-slate-300">{honors}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })() : null}

            {/* Attribute bars */}
            <View className="gap-2">
              <Text className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Atributos</Text>
              {ATTRIBUTE_META.map(({ key, label }) => {
                const value = attrs[key];
                return (
                  <View key={key} className="flex-row items-center gap-3">
                    <Text className="text-[10px] font-bold text-slate-400 uppercase w-28">{label}</Text>
                    <View className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <View className="h-full rounded-full" style={{ width: `${((value - 55) / 44) * 100}%`, backgroundColor: attributeColor(value) }} />
                    </View>
                    <Text className="text-xs font-black text-white w-7 text-right">{value}</Text>
                  </View>
                );
              })}
            </View>

            {/* Strengths / weaknesses */}
            <View className="flex-row gap-3">
              <View className="flex-1 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-3">
                <Text className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1.5">Pontos Fortes</Text>
                {strengths.map((s) => (
                  <Text key={s.key} className="text-[11px] font-bold text-slate-300">{s.label} <Text className="text-emerald-400">{attrs[s.key]}</Text></Text>
                ))}
              </View>
              <View className="flex-1 bg-red-500/5 border border-red-500/20 rounded-2xl p-3">
                <Text className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1.5">A Melhorar</Text>
                {weaknesses.map((w) => (
                  <Text key={w.key} className="text-[11px] font-bold text-slate-300">{w.label} <Text className="text-red-400">{attrs[w.key]}</Text></Text>
                ))}
              </View>
            </View>

            {/* Contract + potential — meaningless once a player is out of the league */}
            {player.retired ? null : (
              <View className="flex-row items-center justify-between bg-slate-950/50 border border-slate-800 rounded-2xl p-4">
                <View>
                  <Text className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Contrato</Text>
                  <Text className="text-sm font-black text-emerald-400">
                    {formatMoney(player.salary)} · {player.contractYears} {player.contractYears === 1 ? 'ano' : 'anos'}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Potencial</Text>
                  <Text className="text-sm font-black text-sky-400">{POTENTIAL_LABEL[player.potential] || player.potential}</Text>
                </View>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default PlayerDetailModal;
