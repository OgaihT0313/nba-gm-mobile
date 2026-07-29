import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SeasonState } from '../types';
import { getTeamAccent } from '../constants';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import { AwardCard, FinalsAwardCard, ChampionHero } from '../components/AwardCards';
import AllNbaTeams from '../components/AllNbaTeams';
import AwardHistory from '../components/AwardHistory';

interface AwardsScreenProps {
  season: SeasonState;
  onGoToPlayoffs: () => void;
  onStartNewSeason: () => void;
}

const AwardsScreen: React.FC<AwardsScreenProps> = ({ season, onGoToPlayoffs, onStartNewSeason }) => {
  const playoffAwards = season.playoff?.awards;
  const hasPlayoffAwards = !!(playoffAwards?.eastConfFinalsMVP || playoffAwards?.westConfFinalsMVP || playoffAwards?.finalsMVP);

  return (
    <ScrollView className="flex-1">
      <View className="px-4 py-6 gap-6">
        <PageHeader
          title="Prêmios"
          actions={
            season.status === 'playoffs_idle' ? (
              <Pressable onPress={onGoToPlayoffs} className="bg-red-600 px-8 py-3 rounded-control items-center">
                <Text className="text-white font-bold">IR PARA OS PLAYOFFS</Text>
              </Pressable>
            ) : season.status === 'offseason' ? (
              <Pressable onPress={onStartNewSeason} className="bg-emerald-600 px-8 py-3 rounded-control items-center">
                <Text className="text-white font-bold">INICIAR NOVA TEMPORADA</Text>
              </Pressable>
            ) : undefined
          }
        />

        {season.playoff?.champion ? (
          <ChampionHero
            team={season.playoff.champion}
            gmTitles={season.playoff.champion.id === season.userTeamId ? season.gmLegacy.titles : undefined}
          />
        ) : null}

        {season.awards ? (
          <View className="gap-3">
            <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Temporada Regular</Text>
            <View className="gap-4">
              <AwardCard title="MVP" winnerId={season.awards.mvp} players={season.players} teams={season.teams} />
              <AwardCard title="DPOY" winnerId={season.awards.dpoy} players={season.players} teams={season.teams} />
              <AwardCard title="ROY" winnerId={season.awards.roy} players={season.players} teams={season.teams} />
              <AwardCard title="6MOY" winnerId={season.awards.smoy} players={season.players} teams={season.teams} />
              {season.awards.mip ? <AwardCard title="MIP" winnerId={season.awards.mip} players={season.players} teams={season.teams} /> : null}
            </View>
          </View>
        ) : (
          <Text className="text-slate-500 italic">Prêmios serão anunciados após a temporada.</Text>
        )}

        {season.awards?.allNba && season.awards.allNba.length > 0 ? (
          <AllNbaTeams teams={season.awards.allNba} players={season.players} leagueTeams={season.teams} />
        ) : null}

        {hasPlayoffAwards ? (
          <View className="gap-4">
            <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Playoffs</Text>
            {playoffAwards!.eastConfFinalsMVP ? (
              <AwardCard title="MVP Finais da Conf. Leste" winnerId={playoffAwards!.eastConfFinalsMVP} players={season.players} teams={season.teams} themed />
            ) : null}
            {playoffAwards!.westConfFinalsMVP ? (
              <AwardCard title="MVP Finais da Conf. Oeste" winnerId={playoffAwards!.westConfFinalsMVP} players={season.players} teams={season.teams} themed />
            ) : null}
            {playoffAwards!.finalsMVP ? (
              <FinalsAwardCard
                title="MVP das Finais"
                pId={playoffAwards!.finalsMVP}
                players={season.players}
                subtitle="NBA Finals MVP"
                accentColor={getTeamAccent(season.playoff?.champion?.id).primary}
              />
            ) : null}
          </View>
        ) : null}

        {season.awardHistory.length > 0 ? <AwardHistory history={season.awardHistory} players={season.players} /> : null}

        {season.status === 'offseason' ? (
          <Card>
            <Text className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Offseason</Text>
            <Text className="text-slate-400 text-sm leading-5">
              Temporada encerrada. "Iniciar Nova Temporada" roda a progressão dos jogadores, aplica as movimentações
              reais da NBA, expira contratos e abre o Draft de Recrutas.
            </Text>
          </Card>
        ) : null}
      </View>
    </ScrollView>
  );
};

export default AwardsScreen;
