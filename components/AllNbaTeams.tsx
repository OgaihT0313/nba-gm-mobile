import React from 'react';
import { View, Text } from 'react-native';
import { Player, Team } from '../types';
import { COLORS, FONT, ovrColor } from '../src/theme/tokens';
import { SectionLabel, TeamBadge } from './ui/kit';

type PlayerMap = { [key: string]: Player };

const TEAM_LABELS = ['1º Time', '2º Time', '3º Time'];
// Gold, then the neutral ramp: gold is the trophy color, and only the first
// team is a trophy.
const TEAM_TONES = [COLORS.gold, COLORS.textSoft, COLORS.muted];

const Row: React.FC<{ id: string; players: PlayerMap; leagueTeams: Team[]; last: boolean }> = ({ id, players, leagueTeams, last }) => {
  const p = players[id];
  if (!p) return null;
  // LIVE rosters — a static import would show a traded All-NBA honoree's
  // original team instead of who they actually played for. Same class of bug
  // as AwardCard.
  const t = leagueTeams.find((tm) => tm.roster.includes(id));
  const s = p.seasonStats;
  return (
    <View className="flex-row items-center" style={{ gap: 10, paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderBottomColor: COLORS.line }}>
      {t ? <TeamBadge teamId={t.id} /> : <View style={{ width: 30 }} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT.cond700, fontSize: 16, color: COLORS.text }}>{p.name}</Text>
        {s && s.gp > 0 ? (
          <Text numberOfLines={1} style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.dim }}>
            {s.ppg.toFixed(1)} pts · {s.rpg.toFixed(1)} reb · {s.apg.toFixed(1)} ast
          </Text>
        ) : null}
      </View>
      <Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: ovrColor(p.ovr) }}>{p.ovr}</Text>
    </View>
  );
};

/** `columns`: the three teams side by side (PC). */
const AllNbaTeams: React.FC<{ teams: string[][]; players: PlayerMap; leagueTeams: Team[]; columns?: boolean }> = ({ teams, players, leagueTeams, columns }) => (
  <View style={{ gap: 10 }}>
    <SectionLabel>All-NBA</SectionLabel>
    <View style={{ flexDirection: columns ? 'row' : 'column', gap: 10 }}>
    {teams.map((team, i) => (
      <View key={i} style={{ flex: columns ? 1 : undefined, minWidth: 0, backgroundColor: COLORS.surface, borderRadius: 16, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
        <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: TEAM_TONES[i] ?? COLORS.muted, textTransform: 'uppercase' }}>
          {TEAM_LABELS[i] ?? `${i + 1}º Time`}
        </Text>
        {team.map((id, j) => <Row key={id} id={id} players={players} leagueTeams={leagueTeams} last={j === team.length - 1} />)}
      </View>
    ))}
    </View>
  </View>
);

export default AllNbaTeams;
