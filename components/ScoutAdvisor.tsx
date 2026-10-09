import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Player, Team } from '../types';
import { formatPositions } from '../constants';
import { buildScoutReport, Recommendation } from '../services/advisorService';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, FONT, RADIUS, withAlpha, ovrColor } from '../src/theme/tokens';
import { Panel, MonoLabel, PlayerFace, BodyText } from './ui/kit';
import Icon from './Icon';

// Collapsed by default on the phone: the Scout screen's job is browsing, and
// the advisor is a "tell me what to do" side-trip. The diagnosis line is always
// visible so the GM knows whether it's worth opening. On PC it sits in its own
// column and stays open (`alwaysOpen`).
interface ScoutAdvisorProps {
  userTeam: Team;
  teams: Team[];
  players: { [key: string]: Player };
  onSelectPlayer: (p: Player) => void;
  alwaysOpen?: boolean;
}

const RecRow: React.FC<{ rec: Recommendation; onPress: () => void }> = ({ rec, onPress }) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    className="flex-row items-center active:opacity-75"
    style={{ gap: 10, padding: 10, backgroundColor: COLORS.surface2, borderRadius: RADIUS.control }}
  >
    <PlayerFace player={rec.player} size={32} style={{ borderRadius: 16 }} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ fontFamily: FONT.cond600, fontSize: 14.5, color: COLORS.text }}>
        {rec.player.name}
        {rec.teamName ? <Text style={{ color: COLORS.dim }}> · {rec.teamName}</Text> : null}
      </Text>
      <Text numberOfLines={1} style={{ fontFamily: FONT.body500, fontSize: 11.5, color: COLORS.dim }}>
        {formatPositions(rec.player)} · {rec.reason}
      </Text>
    </View>
    <Text style={{ fontFamily: FONT.cond800, fontSize: 17, color: ovrColor(rec.player.ovr) }}>{rec.player.ovr}</Text>
  </Pressable>
);

const ScoutAdvisor: React.FC<ScoutAdvisorProps> = ({ userTeam, teams, players, onSelectPlayer, alwaysOpen }) => {
  const { accent } = useTheme();
  const [toggled, setOpen] = useState(false);
  const open = alwaysOpen || toggled;

  // The report walks every team's lineup — memo it so browsing/filtering the
  // 530-player list below doesn't recompute it on each keystroke.
  const report = useMemo(() => buildScoutReport(userTeam, teams, players), [userTeam, teams, players]);

  const summary =
    report.needs.length === 0
      ? 'Nenhuma fraqueza clara — seu elenco está acima da média da liga.'
      : report.needs.map((n) => n.label).join(' · ');

  return (
    <Panel padding={14} style={{ gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        disabled={alwaysOpen}
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center"
        style={{ gap: 10 }}
      >
        <Icon name="scout" size={18} color={accent.primary} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 17, color: COLORS.text, textTransform: 'uppercase' }}>Análise do Scout</Text>
          <Text numberOfLines={alwaysOpen ? 3 : 1} style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.dim }}>{summary}</Text>
        </View>
        {alwaysOpen ? null : <MonoLabel size={9} color={COLORS.dim}>{open ? 'Fechar' : 'Ver'}</MonoLabel>}
      </Pressable>

      {open ? (
        <View style={{ gap: 14, paddingTop: 2 }}>
          {report.needs.length > 0 ? (
            <View style={{ gap: 6 }}>
              <MonoLabel size={9} color={COLORS.warn}>Diagnóstico</MonoLabel>
              {report.needs.map((n) => (
                <View key={n.label} style={{ backgroundColor: withAlpha(COLORS.warn, 0.08), borderWidth: 1, borderColor: withAlpha(COLORS.warn, 0.25), borderRadius: RADIUS.control, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ fontFamily: FONT.cond700, fontSize: 14, color: COLORS.warn }}>{n.label}</Text>
                  <BodyText size={12} color={COLORS.muted}>{n.detail}</BodyText>
                </View>
              ))}
            </View>
          ) : null}

          {report.freeAgents.length > 0 ? (
            <View style={{ gap: 6 }}>
              <MonoLabel size={9} color={COLORS.good}>Agentes livres que encaixam</MonoLabel>
              {report.freeAgents.map((r) => (
                <RecRow key={r.player.id} rec={r} onPress={() => onSelectPlayer(r.player)} />
              ))}
            </View>
          ) : null}

          {report.tradeTargets.length > 0 ? (
            <View style={{ gap: 6 }}>
              <MonoLabel size={9} color={COLORS.east}>Alvos de troca</MonoLabel>
              {report.tradeTargets.map((r) => (
                <RecRow key={r.player.id} rec={r} onPress={() => onSelectPlayer(r.player)} />
              ))}
            </View>
          ) : null}

          {report.needs.length > 0 && report.freeAgents.length === 0 && report.tradeTargets.length === 0 ? (
            <BodyText size={12} color={COLORS.dim}>Nenhum jogador disponível encaixa nessas necessidades agora.</BodyText>
          ) : null}
        </View>
      ) : null}
    </Panel>
  );
};

export default ScoutAdvisor;
