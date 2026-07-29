import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Team, Player, Coach } from '../types';
import { getTeamLogoUrl, getTeamSalary, SALARY_CAP, getTeamAccent, getTeamTitles, coachOf } from '../constants';
import PlayerCard from '../components/PlayerCard';
import Card from '../components/Card';
import Icon from '../components/Icon';
import StatCard from '../components/StatCard';
import PickAssets from '../components/PickAssets';
import CoachPanel from '../components/CoachPanel';

const formatMoney = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;
const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

// RN port. Themes itself with the *viewed* team's colors (browsing a rival shows
// their brand), same as the web.
const TeamDetail: React.FC<{
  team: Team;
  players: { [key: string]: Player };
  // Needed to project where this team's picks would land — the whole point of
  // scouting a rival's draft capital before opening trade talks.
  teams: Team[];
  coaches: { [key: string]: Coach };
  currentDraft: number;
  onBack: () => void;
}> = ({ team, players, teams, coaches, currentDraft, onBack }) => {
  const salary = getTeamSalary(team, players);
  const capSpace = SALARY_CAP - salary;
  const roster = team.roster.map((pId) => players[pId]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const accent = getTeamAccent(team.id);
  const titles = getTeamTitles(team.id);
  const coach = coachOf(team, coaches);

  return (
    <ScrollView className="flex-1">
      <View className="px-4 py-6 gap-6">
        <Pressable onPress={onBack}>
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-widest">← Voltar para Franquias</Text>
        </Pressable>

        <Card variant="offseason" padding="lg" accentColor={accent.primary} className="gap-5">
          <View className="flex-row items-center gap-4">
            <Image source={{ uri: getTeamLogoUrl(team) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 64, height: 64 }} contentFit="contain" />
            <View className="flex-1 min-w-0">
              <Text className="text-2xl font-black tracking-tighter uppercase italic text-white" numberOfLines={2}>{team.name}</Text>
              {titles > 0 ? (
                <View className="flex-row items-center gap-1 self-start bg-amber-500/10 border border-amber-500/30 rounded-full px-2.5 py-0.5 mt-1">
                  <Icon name="awards" size={11} color="#fbbf24" />
                  <Text className="text-amber-400 text-[10px] font-black uppercase tracking-widest">
                    {titles} {titles === 1 ? 'Título' : 'Títulos'}
                  </Text>
                </View>
              ) : null}
              <Text className="text-slate-400 text-xs mt-1">
                {team.conference === 'East' ? 'Leste' : 'Oeste'} · {coach?.name ?? 'Sem técnico'}
                {typeof team.wins === 'number' ? ` · ${team.wins}-${team.losses}` : ''}
              </Text>
            </View>
          </View>
          <StatCard
            label="Cap Space"
            value={capSpace >= 0 ? formatMoney(capSpace) : `-${formatMoney(Math.abs(capSpace))}`}
            sub={`${formatMoney(salary)} / ${formatMoney(SALARY_CAP)}`}
            tone={capSpace >= 0 ? 'positive' : 'warning'}
          />
        </Card>

        <CoachPanel team={team} coaches={coaches} />

        <Card padding="lg">
          <PickAssets team={team} teams={teams} currentDraft={currentDraft} />
        </Card>

        <View className="gap-2">
          <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Elenco ({roster.length})</Text>
          {roster.map((player) => (
            <PlayerCard key={player.id} player={player} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

export default TeamDetail;
