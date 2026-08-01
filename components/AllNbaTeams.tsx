import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Player, Team } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG } from '../constants';

type PlayerMap = { [key: string]: Player };

const TEAM_LABELS = ['1º Time', '2º Time', '3º Time'];
// Gold / silver / bronze, matching the prestige tiers of the three teams.
const TEAM_ACCENTS = ['#f59e0b', '#94a3b8', '#b45309'];

const PlayerChip: React.FC<{ id: string; players: PlayerMap; leagueTeams: Team[]; accent: string }> = ({ id, players, leagueTeams, accent }) => {
  const p = players[id];
  if (!p) return null;
  // LIVE rosters — a static import would show a traded All-NBA honoree's
  // original team instead of who they actually played for. Same class of bug
  // as AwardCard.
  const t = leagueTeams.find((tm) => tm.roster.includes(id));
  return (
    <View className="flex-row items-center gap-2.5 bg-sunken rounded-xl px-3 py-2 mb-2">
      <Image
        source={{ uri: getPlayerImageUrl(p) }}
        placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
        style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1e293b' }}
        contentFit="cover"
      />
      <View className="flex-1 min-w-0">
        <Text className="text-sm font-bold text-white" numberOfLines={1}>{p.name}</Text>
        <Text className="text-[10px] text-slate-500 uppercase tracking-widest" numberOfLines={1}>{t?.name || 'Sem time'}</Text>
      </View>
      <Text className="text-xs font-black" style={{ color: accent }}>{p.ovr}</Text>
    </View>
  );
};

const AllNbaTeams: React.FC<{ teams: string[][]; players: PlayerMap; leagueTeams: Team[] }> = ({ teams, players, leagueTeams }) => (
  <View className="gap-4">
    <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">All-NBA</Text>
    {teams.map((team, i) => (
      <View key={i}>
        <Text className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: TEAM_ACCENTS[i] }}>
          {TEAM_LABELS[i]}
        </Text>
        {team.map((id) => <PlayerChip key={id} id={id} players={players} leagueTeams={leagueTeams} accent={TEAM_ACCENTS[i]} />)}
      </View>
    ))}
  </View>
);

export default AllNbaTeams;
