import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SeasonState } from '../types';
import PageHeader from '../components/PageHeader';
import PlayoffBracket from '../components/PlayoffBracket';

interface PlayoffsScreenProps {
  season: SeasonState;
  onAdvanceRound: () => void;
  onResumeLiveGame: () => void;
}

const PlayoffsScreen: React.FC<PlayoffsScreenProps> = ({ season, onAdvanceRound, onResumeLiveGame }) => (
  <ScrollView className="flex-1">
    <View className="py-6 gap-6">
      <View className="px-4">
        <PageHeader
          title="Playoffs"
          actions={
            season.liveGame ? (
              <Pressable onPress={onResumeLiveGame} className="bg-red-600 px-6 py-3 rounded-control items-center flex-row gap-2">
                <View className="w-2 h-2 rounded-full bg-white" />
                <Text className="text-white font-bold">JOGO AO VIVO</Text>
              </Pressable>
            ) : season.status === 'playoffs_idle' ? (
              <Pressable onPress={onAdvanceRound} className="bg-red-600 px-8 py-3 rounded-control items-center">
                <Text className="text-white font-bold">SIMULAR RODADA</Text>
              </Pressable>
            ) : undefined
          }
        />
      </View>

      {season.playoff ? (
        <PlayoffBracket playoffState={season.playoff} />
      ) : (
        <Text className="text-slate-500 italic px-4">Os playoffs começam após os 82 jogos da temporada regular.</Text>
      )}
    </View>
  </ScrollView>
);

export default PlayoffsScreen;
