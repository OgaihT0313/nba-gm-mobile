import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import Card from './Card';
import Icon from './Icon';
import { useTheme } from '../src/theme/ThemeProvider';

// RN port of the web's "Comentaristas" panel. The web's CSS-spinner div becomes
// an ActivityIndicator; everything else is the same three states (loading with
// nothing yet / commentary / not-enough-games).
interface CommentaryPanelProps {
  commentary?: { text: string; gamesPlayed: number };
  isLoading: boolean;
  interval: number;
}

// The model often returns its line already wrapped in quotes; the panel adds its
// own pair, so strip any it came with to avoid rendering `""like this""`.
const unquote = (s: string) => s.replace(/^["'“”]+/, '').replace(/["'“”]+$/, '').trim();

const CommentaryPanel: React.FC<CommentaryPanelProps> = ({ commentary, isLoading, interval }) => {
  const { accent } = useTheme();

  return (
    <Card>
      <View className="flex-row items-center gap-2.5 mb-4">
        <Icon name="commentary" size={20} color={accent.primary} />
        <Text className="font-bold text-lg text-white">Comentaristas</Text>
      </View>

      {isLoading && !commentary ? (
        <View className="flex-row items-center gap-3 py-2">
          <ActivityIndicator size="small" color={accent.primary} />
          <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Analisando a liga...
          </Text>
        </View>
      ) : commentary ? (
        <View className="gap-2">
          <Text className="text-slate-300 text-sm italic leading-5">"{unquote(commentary.text)}"</Text>
          <Text className="text-[10px] text-slate-600 font-mono uppercase tracking-widest">
            Análise após {commentary.gamesPlayed} jogos{isLoading ? ' · atualizando...' : ''}
          </Text>
        </View>
      ) : (
        <Text className="text-slate-500 italic text-sm">
          A primeira análise chega após {interval} jogos simulados.
        </Text>
      )}
    </Card>
  );
};

export default CommentaryPanel;
