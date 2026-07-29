import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Team, Player } from '../types';
import { getTeamLogoUrl, getTeamSalary, SALARY_CAP } from '../constants';

interface TeamSelectProps {
  teams: Team[];
  players: { [key: string]: Player };
  onSelect: (teamId: string) => void;
}

const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

const TeamSelect: React.FC<TeamSelectProps> = ({ teams, players, onSelect }) => (
  <ScrollView className="flex-1">
    <View className="px-4 py-6">
      <View className="items-center gap-2 mb-7">
        <Text className="text-4xl font-display uppercase tracking-tighter text-white text-center">
          Escolha seu Time
        </Text>
        <Text className="text-slate-400 text-sm text-center">
          Você será o General Manager desta franquia pela temporada inteira.
        </Text>
      </View>

      <View className="flex-row flex-wrap justify-between">
        {teams.map((t) => {
          const salary = getTeamSalary(t, players);
          const capSpace = SALARY_CAP - salary;
          return (
            <Pressable
              key={t.id}
              onPress={() => onSelect(t.id)}
              className="w-[48%] mb-3 bg-slate-900 p-5 rounded-card border border-slate-800 items-center active:border-accent"
            >
              <Image
                source={{ uri: getTeamLogoUrl(t) }}
                placeholder={{ uri: NBA_FALLBACK }}
                style={{ width: 56, height: 56 }}
                contentFit="contain"
                transition={150}
              />
              <Text className="font-bold text-sm text-white text-center mt-3">{t.name}</Text>
              <Text className={`text-[10px] font-mono mt-1 ${capSpace >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {capSpace >= 0
                  ? `$${(capSpace / 1_000_000).toFixed(1)}M abaixo do teto`
                  : `$${Math.abs(capSpace / 1_000_000).toFixed(1)}M acima do teto`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  </ScrollView>
);

export default TeamSelect;
