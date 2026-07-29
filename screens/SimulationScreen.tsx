import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SeasonState } from '../types';
import { getTeamSalary, SALARY_CAP } from '../constants';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import Segmented from '../components/Segmented';
import StandingsTable from '../components/StandingsTable';
import CommentaryPanel from '../components/CommentaryPanel';
import CupPanel from '../components/CupPanel';

interface SimulationScreenProps {
  season: SeasonState;
  isSimulating: boolean;
  onAdvance: (target: number) => void;
  isCommentaryLoading: boolean;
  commentaryInterval: number;
}

const SimulationScreen: React.FC<SimulationScreenProps> = ({
  season,
  isSimulating,
  onAdvance,
  isCommentaryLoading,
  commentaryInterval,
}) => {
  const userTeam = season.teams.find((t) => t.id === season.userTeamId);
  const capSpace = userTeam ? SALARY_CAP - getTeamSalary(userTeam, season.players) : 0;
  const gp = season.gamesPlayed;
  const pct = Math.round((gp / 82) * 100);
  const over = season.status !== 'active';

  const disabled = (min?: number) => isSimulating || over || (min !== undefined && gp >= min);

  return (
    <ScrollView className="flex-1">
      <View className="px-4 py-6 gap-6">
        <PageHeader
          title="Simulação em Curso"
          subtitle="Acompanhando o progresso da liga"
          actions={
            <Segmented
              items={[
                { label: 'Dia', onClick: () => onAdvance(gp + 1), disabled: disabled(82) },
                { label: 'Semana', onClick: () => onAdvance(Math.min(82, gp + 7)), disabled: disabled(82) },
                { label: 'Metade', onClick: () => onAdvance(41), disabled: disabled(41) },
                { label: 'Temporada', onClick: () => onAdvance(82), disabled: disabled(82), primary: true },
              ]}
            />
          }
        />

        <Card padding="lg">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="font-bold text-xl text-white">Progresso da Temporada</Text>
            <Text className="text-accent font-black">
              {gp} / 82 · {pct}%
            </Text>
          </View>
          <View className="h-5 bg-slate-800 rounded-full overflow-hidden">
            <View className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
          </View>
          {over ? (
            <Text className="text-emerald-400 text-xs font-bold mt-3">
              Temporada regular encerrada.
            </Text>
          ) : null}
        </Card>

        <CommentaryPanel
          commentary={season.leagueCommentary}
          isLoading={isCommentaryLoading}
          interval={commentaryInterval}
        />

        <CupPanel cup={season.cup} teams={season.teams} />

        <View className="flex-row gap-3">
          <View className="flex-1">
            <StatCard label="Elenco" value={userTeam?.roster.length ?? 0} />
          </View>
          <View className="flex-1">
            <StatCard
              label="Cap Space"
              value={`$${(Math.abs(capSpace) / 1_000_000).toFixed(1)}M`}
              sub={capSpace >= 0 ? 'abaixo do teto' : 'acima do teto'}
              tone={capSpace >= 0 ? 'positive' : 'warning'}
            />
          </View>
        </View>

        <Card>
          <Text className="font-bold text-lg text-sky-400 mb-3">Leste</Text>
          <StandingsTable teams={season.teams} conference="East" schedule={season.schedule} />
        </Card>
        <Card>
          <Text className="font-bold text-lg text-red-400 mb-3">Oeste</Text>
          <StandingsTable teams={season.teams} conference="West" schedule={season.schedule} />
        </Card>

        {season.events.length > 0 ? (
          <Card>
            <Text className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
              Últimos Eventos da Liga
            </Text>
            <View className="gap-2">
              {season.events.slice(0, 6).map((e, i) => (
                <Text key={i} className="text-slate-300 text-xs leading-5">
                  {e.message}
                </Text>
              ))}
            </View>
          </Card>
        ) : null}
      </View>
    </ScrollView>
  );
};

export default SimulationScreen;
