import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Player, SeasonAwardRecord } from '../types';
import { teamsData, getTeamLogoUrl } from '../constants';

type PlayerMap = { [key: string]: Player };

const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

// Franchise award ledger — every completed season's champion + headline
// winners, newest first.
const AwardHistory: React.FC<{ history: SeasonAwardRecord[]; players: PlayerMap }> = ({ history, players }) => {
  if (!history.length) return null;
  const name = (id?: string) => (id && players[id]?.name) || '—';

  return (
    <View className="gap-3">
      <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Histórico de Campeões</Text>
      <View className="bg-panel rounded-card border border-line overflow-hidden">
        {[...history].reverse().map((rec, i) => {
          const champ = teamsData.find((t) => t.id === rec.championId);
          return (
            <View key={rec.season} className={`p-4 gap-2 ${i > 0 ? 'border-t border-line' : ''}`}>
              <View className="flex-row items-center gap-2.5">
                <Text className="text-xs font-black text-slate-500">T{rec.season}</Text>
                {champ ? <Image source={{ uri: getTeamLogoUrl(champ) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 24, height: 24 }} contentFit="contain" /> : null}
                <Text className="text-sm font-black text-white uppercase italic tracking-tight flex-1" numberOfLines={1}>{champ?.name || '—'}</Text>
              </View>
              <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                <Text className="text-slate-300 text-xs"><Text className="text-amber-400 font-black">MVP</Text> {name(rec.mvp)}</Text>
                <Text className="text-slate-300 text-xs"><Text className="text-slate-500 font-black">FINAIS</Text> {name(rec.finalsMvp)}</Text>
                <Text className="text-slate-300 text-xs"><Text className="text-slate-500 font-black">DPOY</Text> {name(rec.dpoy)}</Text>
                <Text className="text-slate-300 text-xs"><Text className="text-slate-500 font-black">ROY</Text> {name(rec.roy)}</Text>
                {rec.mip ? <Text className="text-slate-300 text-xs"><Text className="text-slate-500 font-black">MIP</Text> {name(rec.mip)}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default AwardHistory;
