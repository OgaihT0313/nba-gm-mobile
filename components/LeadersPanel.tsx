import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';

import { Player, Team, PlayerSeasonStats } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamTricode } from '../constants';
import { COLORS, INK, RADIUS } from '../src/theme/tokens';
import { Panel, MonoLabel, Stat } from './ui/kit';

// The "LÍDERES DA LIGA" block from design 3e: one line per category, the
// league leader only. It sits under the standings on the same tab because the
// question "who's leading the league" is the same glance as "who's winning".
//
// Categories are the ones the sim actually tracks (see PlayerSeasonStats) —
// there is no 3PT% or double-double count in the box score model, so those
// columns from the mockup are replaced by minutes and turnovers, which exist.

export type LeaderKey = keyof Pick<PlayerSeasonStats, 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'mpg'>;

export const LEADER_CATEGORIES: { key: LeaderKey; label: string; abbr: string }[] = [
  { key: 'ppg', label: 'Pontos', abbr: 'PTS' },
  { key: 'rpg', label: 'Rebotes', abbr: 'REB' },
  { key: 'apg', label: 'Assistências', abbr: 'AST' },
  { key: 'bpg', label: 'Tocos', abbr: 'TOC' },
  { key: 'spg', label: 'Roubos', abbr: 'ROU' },
  { key: 'mpg', label: 'Minutos', abbr: 'MIN' },
];

interface LeadersPanelProps {
  players: { [key: string]: Player };
  teams: Team[];
  /** Highlight the user's own players in the accent color. */
  userTeamId?: string;
  title?: string;
}

const LeadersPanel: React.FC<LeadersPanelProps> = ({ players, teams, userTeamId, title = 'Líderes da liga' }) => {
  const teamOf = useMemo(() => {
    const map = new Map<string, Team>();
    teams.forEach((t) => t.roster.forEach((id) => map.set(id, t)));
    return map;
  }, [teams]);

  const withStats = useMemo<Player[]>(
    () => (Object.values(players) as Player[]).filter((p) => !!p.seasonStats && p.seasonStats.gp > 0),
    [players],
  );

  if (withStats.length === 0) {
    return (
      <Panel padding={13}>
        <MonoLabel style={{ marginBottom: 8 }}>{title}</MonoLabel>
        <Text style={{ fontSize: 11.5, lineHeight: 17, color: INK.body }}>
          As lideranças aparecem assim que os primeiros jogos forem simulados.
        </Text>
      </Panel>
    );
  }

  return (
    <Panel padding={13}>
      <MonoLabel style={{ marginBottom: 11 }}>{title}</MonoLabel>
      <View style={{ gap: 11 }}>
        {LEADER_CATEGORIES.map((cat) => {
          const leader = [...withStats].sort((a, b) => b.seasonStats![cat.key] - a.seasonStats![cat.key])[0];
          const t = teamOf.get(leader.id);
          const mine = t?.id === userTeamId;
          return (
            <View key={cat.key} className="flex-row items-center" style={{ gap: 11 }}>
              <MonoLabel size={8.5} color={INK.faint} style={{ width: 30 }}>{cat.abbr}</MonoLabel>
              <Image
                source={{ uri: getPlayerImageUrl(leader) }}
                placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
                style={{ width: 28, height: 28, borderRadius: RADIUS.pill, backgroundColor: COLORS.line }}
                contentFit="cover"
              />
              <View style={{ flex: 1 }} className="flex-row items-baseline">
                <Text className="font-bold text-white" style={{ fontSize: 11.5, flexShrink: 1 }} numberOfLines={1}>
                  {leader.name}
                </Text>
                <MonoLabel size={9} color={mine ? COLORS.info : INK.meta} style={{ marginLeft: 6, letterSpacing: 0 }}>
                  {getTeamTricode(t)}
                </MonoLabel>
              </View>
              <Stat size={14} color={mine ? COLORS.goodSoft : COLORS.textSoft}>
                {leader.seasonStats![cat.key].toFixed(1)}
              </Stat>
            </View>
          );
        })}
      </View>
    </Panel>
  );
};

export default LeadersPanel;
