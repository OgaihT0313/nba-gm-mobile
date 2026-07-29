import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Player, Team } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, formatPositions } from '../constants';
import { buildScoutReport, Recommendation } from '../services/advisorService';
import { useTheme } from '../src/theme/ThemeProvider';
import Card from './Card';
import Icon from './Icon';

// Collapsed by default: the Scout screen's job is browsing, and the advisor is
// a "tell me what to do" side-trip. The diagnosis line is always visible so the
// GM knows whether it's worth opening.
interface ScoutAdvisorProps {
  userTeam: Team;
  teams: Team[];
  players: { [key: string]: Player };
  onSelectPlayer: (p: Player) => void;
}

const RecRow: React.FC<{ rec: Recommendation; onPress: () => void }> = ({ rec, onPress }) => (
  <Pressable
    onPress={onPress}
    className="flex-row items-center gap-2.5 p-2.5 bg-slate-950/50 rounded-xl border border-slate-800 active:border-slate-600"
  >
    <Image
      source={{ uri: getPlayerImageUrl(rec.player) }}
      placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1e293b' }}
      contentFit="cover"
    />
    <View className="flex-1 min-w-0">
      <Text className="text-xs font-bold text-white" numberOfLines={1}>
        {rec.player.name}
        {rec.teamName ? <Text className="text-slate-500 font-normal"> · {rec.teamName}</Text> : null}
      </Text>
      <Text className="text-[10px] text-slate-500" numberOfLines={1}>
        {formatPositions(rec.player)} · {rec.reason}
      </Text>
    </View>
    <Text className="font-mono-bold text-sm text-white">{rec.player.ovr}</Text>
  </Pressable>
);

const ScoutAdvisor: React.FC<ScoutAdvisorProps> = ({ userTeam, teams, players, onSelectPlayer }) => {
  const { accent } = useTheme();
  const [open, setOpen] = useState(false);

  // The report walks every team's lineup — memo it so browsing/filtering the
  // 530-player list below doesn't recompute it on each keystroke.
  const report = useMemo(() => buildScoutReport(userTeam, teams, players), [userTeam, teams, players]);

  const summary =
    report.needs.length === 0
      ? 'Nenhuma fraqueza clara — seu elenco está acima da média da liga.'
      : report.needs.map((n) => n.label).join(' · ');

  return (
    <Card padding="md" className="gap-3">
      <Pressable onPress={() => setOpen((v) => !v)} className="flex-row items-center gap-2.5">
        <Icon name="scout" size={18} color={accent.primary} />
        <View className="flex-1 min-w-0">
          <Text className="font-bold text-sm text-white">Análise do Scout</Text>
          <Text className="text-[10px] text-slate-500" numberOfLines={1}>{summary}</Text>
        </View>
        <Text className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
          {open ? 'Fechar' : 'Ver'}
        </Text>
      </Pressable>

      {open ? (
        <View className="gap-4 pt-1">
          {report.needs.length > 0 ? (
            <View className="gap-1.5">
              <Text className="text-[9px] font-black uppercase tracking-widest text-amber-500">Diagnóstico</Text>
              {report.needs.map((n) => (
                <View key={n.label} className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                  <Text className="text-[11px] font-bold text-amber-300">{n.label}</Text>
                  <Text className="text-[10px] text-slate-400 leading-4">{n.detail}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {report.freeAgents.length > 0 ? (
            <View className="gap-1.5">
              <Text className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                Agentes livres que encaixam
              </Text>
              {report.freeAgents.map((r) => (
                <RecRow key={r.player.id} rec={r} onPress={() => onSelectPlayer(r.player)} />
              ))}
            </View>
          ) : null}

          {report.tradeTargets.length > 0 ? (
            <View className="gap-1.5">
              <Text className="text-[9px] font-black uppercase tracking-widest text-sky-500">Alvos de troca</Text>
              {report.tradeTargets.map((r) => (
                <RecRow key={r.player.id} rec={r} onPress={() => onSelectPlayer(r.player)} />
              ))}
            </View>
          ) : null}

          {report.needs.length > 0 && report.freeAgents.length === 0 && report.tradeTargets.length === 0 ? (
            <Text className="text-[11px] text-slate-500 italic">
              Nenhum jogador disponível encaixa nessas necessidades agora.
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
};

export default ScoutAdvisor;
