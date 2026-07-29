import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Player } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, formatPositions, formatPositionsFull } from '../constants';
import PlayerDetailModal from './PlayerDetailModal';

const formatMoney = (value: number) => `$${(value / 1_000_000).toFixed(1)}M`;

// RN port. Both variants are compact and open the full PlayerDetailModal on tap.
const PlayerCard: React.FC<{ player: Player; isDetailed?: boolean }> = ({ player, isDetailed = false }) => {
  const [showDetail, setShowDetail] = useState(false);
  if (!player) return null;

  const uri = getPlayerImageUrl(player);
  const modal = showDetail ? <PlayerDetailModal player={player} onClose={() => setShowDetail(false)} /> : null;

  if (!isDetailed) {
    return (
      <>
        <Pressable
          onPress={() => setShowDetail(true)}
          className="flex-row items-center justify-between p-3 bg-slate-900/50 rounded-2xl border border-slate-800 active:border-slate-600"
        >
          <View className="flex-row items-center gap-3 flex-1 min-w-0">
            <Image source={{ uri }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
            <View className="flex-1 min-w-0">
              <Text className="font-bold text-sm text-white" numberOfLines={1}>{player.name}</Text>
              <Text className="text-[10px] font-black text-sky-500 uppercase tracking-widest">{formatPositions(player)}</Text>
            </View>
          </View>
          <Text className="text-lg font-black text-white ml-2">{player.ovr}</Text>
        </Pressable>
        {modal}
      </>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setShowDetail(true)}
        className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden active:border-slate-600"
      >
        <View className="h-28 bg-slate-800 items-center justify-end overflow-hidden">
          <Text className="absolute top-3 left-4 text-3xl font-black italic text-white/10">#{player.number || '00'}</Text>
          <View className="absolute top-3 right-3 bg-slate-950/80 px-3 py-1 rounded-full border border-white/10 z-10">
            <Text className="text-[11px] font-black text-sky-400">{player.ovr} OVR</Text>
          </View>
          <Image source={{ uri }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: 112, height: 112 }} contentFit="contain" />
        </View>

        <View className="p-4 gap-3">
          <View className="items-center">
            <Text className="font-black text-base uppercase tracking-tighter text-white text-center" numberOfLines={1}>{player.name}</Text>
            <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
              {formatPositionsFull(player)} • {player.age} anos
            </Text>
          </View>

          <View className="flex-row gap-2">
            <View className="flex-1 bg-slate-800/50 p-2 rounded-xl border border-slate-700/50 items-center">
              <Text className="text-[8px] font-bold text-slate-500 uppercase">Ataque</Text>
              <Text className="text-sm font-black text-white">{player.off}</Text>
            </View>
            <View className="flex-1 bg-slate-800/50 p-2 rounded-xl border border-slate-700/50 items-center">
              <Text className="text-[8px] font-bold text-slate-500 uppercase">Defesa</Text>
              <Text className="text-sm font-black text-white">{player.def}</Text>
            </View>
          </View>

          <View className="flex-row justify-between items-center">
            <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Contrato</Text>
            <Text className="text-xs font-black text-emerald-400">
              {formatMoney(player.salary)} · {player.contractYears} {player.contractYears === 1 ? 'ano' : 'anos'}
            </Text>
          </View>
        </View>
      </Pressable>
      {modal}
    </>
  );
};

export default React.memo(PlayerCard);
