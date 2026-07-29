import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SeasonState } from '../types';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import StandingsTable from '../components/StandingsTable';

const StandingsScreen: React.FC<{ season: SeasonState }> = ({ season }) => (
  <ScrollView className="flex-1">
    <View className="px-4 py-6 gap-6">
      <PageHeader title="Classificação" subtitle="Ordenada pelos critérios de desempate reais da NBA." />
      <Card>
        <Text className="font-bold text-lg text-sky-400 mb-3">Leste</Text>
        <StandingsTable teams={season.teams} conference="East" schedule={season.schedule} />
      </Card>
      <Card>
        <Text className="font-bold text-lg text-red-400 mb-3">Oeste</Text>
        <StandingsTable teams={season.teams} conference="West" schedule={season.schedule} />
      </Card>
    </View>
  </ScrollView>
);

export default StandingsScreen;
