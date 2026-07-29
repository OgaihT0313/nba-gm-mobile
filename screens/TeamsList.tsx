import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Team, Player } from '../types';
import { getTeamLogoUrl, getTeamSalary, SALARY_CAP } from '../constants';
import PageHeader from '../components/PageHeader';

const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

// Franchise browser — taps through to TeamDetail. Mirrors the web's renderTeams.
const TeamsList: React.FC<{ teams: Team[]; players: { [key: string]: Player }; onSelect: (teamId: string) => void }> = ({ teams, players, onSelect }) => (
  <ScrollView className="flex-1">
    <View className="px-4 py-6 gap-4">
      <PageHeader title="Franquias" subtitle="Explore os elencos e a folha salarial de qualquer time." />
      <View className="flex-row flex-wrap justify-between">
        {teams.map((t) => {
          const capSpace = SALARY_CAP - getTeamSalary(t, players);
          return (
            <Pressable
              key={t.id}
              onPress={() => onSelect(t.id)}
              className="w-[48%] mb-3 bg-slate-900 p-5 rounded-card border border-slate-800 items-center active:border-accent"
            >
              <Image source={{ uri: getTeamLogoUrl(t) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 48, height: 48 }} contentFit="contain" />
              <Text className="font-bold text-sm text-white text-center mt-3" numberOfLines={1}>{t.name}</Text>
              <Text className={`text-[10px] font-mono mt-1 ${capSpace >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {capSpace >= 0 ? `$${(capSpace / 1_000_000).toFixed(1)}M livre` : `$${Math.abs(capSpace / 1_000_000).toFixed(1)}M acima`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  </ScrollView>
);

export default TeamsList;
