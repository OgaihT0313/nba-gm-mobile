import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Panel, MonoLabel, Well } from './ui/kit';
import { COLORS, INK } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

// The league commentary, as the redesign's "DA CABINE" block: a mono label over
// a quoted line in an inset well, no icon and no card title competing with it.
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
    <Panel padding={14}>
      <MonoLabel size={9} style={{ marginBottom: 10 }}>Da cabine</MonoLabel>

      {isLoading && !commentary ? (
        <View className="flex-row items-center" style={{ gap: 10, paddingVertical: 4 }}>
          <ActivityIndicator size="small" color={accent.primary} />
          <MonoLabel size={9.5} color={INK.meta}>Analisando a liga…</MonoLabel>
        </View>
      ) : commentary ? (
        <View style={{ gap: 8 }}>
          <Well padding={11}>
            <Text style={{ fontSize: 12, lineHeight: 18, color: COLORS.textSoft }}>
              “{unquote(commentary.text)}”
            </Text>
          </Well>
          <MonoLabel size={9} color={INK.faint} style={{ letterSpacing: 0 }}>
            Após {commentary.gamesPlayed} jogos{isLoading ? ' · atualizando…' : ''}
          </MonoLabel>
        </View>
      ) : (
        <Text style={{ fontSize: 11.5, lineHeight: 17, color: INK.body }}>
          A primeira análise chega após {interval} jogos simulados.
        </Text>
      )}
    </Panel>
  );
};

export default CommentaryPanel;
