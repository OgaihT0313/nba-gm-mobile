import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { AllStarResult, Player, Team } from '../types';
import { AwardCard } from '../components/AwardCards';
import PlayerCard from '../components/PlayerCard';
import PageHeader from '../components/PageHeader';

interface AllStarWeekendProps {
  allStar?: AllStarResult;
  players: { [key: string]: Player };
  teams: Team[];
  allStarGame: number;
}

const RosterColumn: React.FC<{ title: string; roster: string[]; players: { [key: string]: Player }; color: string }> = ({ title, roster, players, color }) => (
  <View className="gap-2">
    <Text className={`text-center text-sm font-black uppercase tracking-widest ${color}`}>{title}</Text>
    {roster.map((pId) => (players[pId] ? <PlayerCard key={pId} player={players[pId]} /> : null))}
  </View>
);

const AllStarWeekend: React.FC<AllStarWeekendProps> = ({ allStar, players, teams, allStarGame }) => {
  if (!allStar) {
    return (
      <ScrollView className="flex-1">
        <View className="px-4 py-6 gap-4">
          <PageHeader title="All-Star Weekend" />
          <Text className="text-slate-500 italic">
            O All-Star Weekend acontece no jogo {allStarGame} da temporada regular.
          </Text>
        </View>
      </ScrollView>
    );
  }

  const winnerLabel = allStar.winner === 'east' ? 'Leste' : 'Oeste';

  return (
    <ScrollView className="flex-1">
      <View className="px-4 py-6 gap-6">
        <PageHeader title="All-Star Weekend" />

        <View className="bg-slate-900 rounded-card border border-slate-800 p-6 items-center gap-2">
          <Text className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">All-Star Game</Text>
          <Text className="text-2xl font-black italic uppercase tracking-tighter text-white text-center">
            Conferência {winnerLabel} venceu!
          </Text>
        </View>

        <AwardCard title="MVP do All-Star Game" winnerId={allStar.mvpId} players={players} teams={teams} />
        <AwardCard title="Concurso de Enterradas" winnerId={allStar.dunkWinnerId} players={players} teams={teams} />
        <AwardCard title="Concurso de 3 Pontos" winnerId={allStar.threePointWinnerId} players={players} teams={teams} />

        <RosterColumn title="Conferência Leste" roster={allStar.eastRoster} players={players} color="text-sky-500" />
        <RosterColumn title="Conferência Oeste" roster={allStar.westRoster} players={players} color="text-red-500" />
      </View>
    </ScrollView>
  );
};

export default AllStarWeekend;
