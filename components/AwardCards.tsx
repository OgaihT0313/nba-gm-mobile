import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';

import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamAccent, getTeamNickname } from '../constants';
import { Player, Team } from '../types';
import { COLORS, FONT, visibleTeamColor } from '../src/theme/tokens';
import { Panel, TeamBadge } from './ui/kit';

// The award cards in the "Transmissão" register: flat surface, a colored stroke
// on the left, condensed caps. Gold is the system's trophy color and appears
// nowhere else, so a regular-season award reads gold while a playoff-run award
// can take the winner's franchise color (`themed`).

interface AwardCardProps {
  title: string;
  winnerId: string;
  players: { [key: string]: Player };
  // The season's LIVE team rosters, not the static preseason data — a winner
  // may have been traded/waived/re-signed since the roster snapshot was taken,
  // and the badge must reflect who they play for now. Confirmed bug: MVP shown
  // with their original team after a mid-season trade.
  teams: Team[];
  /** Use the winner's team colors instead of trophy-gold — for playoff-run awards. */
  themed?: boolean;
}

const Kicker: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color, textTransform: 'uppercase' }}>{children}</Text>
);

const Headshot: React.FC<{ p: Player; size: number }> = ({ p, size }) => (
  <Image
    source={{ uri: getPlayerImageUrl(p) }}
    placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
    style={{ width: size, height: size, borderRadius: 12, backgroundColor: COLORS.surface2 }}
    contentFit="cover"
    contentPosition="top"
  />
);

export const AwardCard: React.FC<AwardCardProps> = ({ title, winnerId, players, teams, themed }) => {
  const p = players[winnerId];
  const t = teams.find((team) => team.roster.includes(winnerId) || team.sixthMan === winnerId);
  const tint = themed && t ? (({ primary, secondary }) => visibleTeamColor(primary, secondary))(getTeamAccent(t.id)) : COLORS.gold;
  if (!p) return null;

  const stats = p.seasonStats && p.seasonStats.gp > 0
    ? ([['PTS', p.seasonStats.ppg.toFixed(1)], ['REB', p.seasonStats.rpg.toFixed(1)], ['AST', p.seasonStats.apg.toFixed(1)]] as [string, string][])
    : ([['OVR', String(p.ovr)], ['OFF', String(p.off)], ['DEF', String(p.def)]] as [string, string][]);

  return (
    <Panel bar={tint} padding={14}>
      <Kicker color={tint}>{title}</Kicker>

      <View className="flex-row items-center" style={{ gap: 12, marginTop: 10 }}>
        <Headshot p={p} size={52} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text numberOfLines={1} style={{ fontFamily: FONT.cond800, fontSize: 21, lineHeight: 22, color: COLORS.text, textTransform: 'uppercase' }}>{p.name}</Text>
          {t ? (
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <TeamBadge teamId={t.id} />
              <Text style={{ fontFamily: FONT.body500, fontSize: 12.5, color: COLORS.muted }}>{getTeamNickname(t)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View className="flex-row" style={{ gap: 22, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.line }}>
        {stats.map(([label, val], i) => (
          <View key={label}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 20, lineHeight: 21, color: i === 0 ? tint : COLORS.text }}>{val}</Text>
            <Text style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.3, color: COLORS.dim }}>{label}</Text>
          </View>
        ))}
      </View>
    </Panel>
  );
};

interface FinalsAwardCardProps {
  title: string;
  pId?: string;
  players: { [key: string]: Player };
  subtitle?: string;
  accentColor?: string;
}

/** The Finals MVP, in the champion screen's gold register. */
export const FinalsAwardCard: React.FC<FinalsAwardCardProps> = ({
  title, pId, players, subtitle = 'Campeão da NBA', accentColor = COLORS.gold,
}) => {
  const p = pId ? players[pId] : null;
  if (!pId || !p) return null;

  const s = p.seasonStats;

  return (
    <Panel bar={accentColor} padding={16}>
      <Kicker color={accentColor}>{title}</Kicker>
      <View className="flex-row items-center" style={{ gap: 12, marginTop: 10 }}>
        <Headshot p={p} size={50} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text numberOfLines={1} style={{ fontFamily: FONT.cond800, fontSize: 21, lineHeight: 22, color: COLORS.text, textTransform: 'uppercase' }}>{p.name}</Text>
          <Text style={{ fontFamily: FONT.body500, fontSize: 12.5, color: COLORS.muted }}>
            {s && s.gp > 0
              ? `${s.ppg.toFixed(1)} pts · ${s.apg.toFixed(1)} ast · ${s.rpg.toFixed(1)} reb`
              : subtitle}
          </Text>
        </View>
      </View>
    </Panel>
  );
};

interface ChampionHeroProps {
  team: Team;
  gmTitles?: number;
}

/** Used only outside the champion screen (which paints its own hero). */
export const ChampionHero: React.FC<ChampionHeroProps> = ({ team, gmTitles }) => (
  <Panel bar={COLORS.gold} padding={16}>
    <Kicker color={COLORS.gold}>Campeão da NBA</Kicker>
    <View className="flex-row items-center" style={{ gap: 12, marginTop: 10 }}>
      <TeamBadge teamId={team.id} width={52} height={52} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT.cond800, fontSize: 28, lineHeight: 28, color: COLORS.text, textTransform: 'uppercase' }}>{getTeamNickname(team)}</Text>
        {typeof gmTitles === 'number' ? (
          <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1.2, color: COLORS.gold, marginTop: 3, textTransform: 'uppercase' }}>
            Seu {gmTitles}º título como GM
          </Text>
        ) : null}
      </View>
    </View>
  </Panel>
);
