import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamLogoUrl, getTeamAccent, getTeamNickname } from '../constants';
import { Player, Team } from '../types';
import { COLORS, INK, RADIUS, withAlpha } from '../src/theme/tokens';
import { MonoLabel, HeroTitle, Stat, Panel } from './ui/kit';

// The award cards, repainted onto the redesign's ramp. Gold is the system's
// trophy color and appears nowhere else, so a regular-season award reads gold
// while a playoff-run award can take the winner's franchise color (`themed`).
const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

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

export const AwardCard: React.FC<AwardCardProps> = ({ title, winnerId, players, teams, themed }) => {
  const p = players[winnerId];
  const t = teams.find((team) => team.roster.includes(winnerId) || team.sixthMan === winnerId);
  const tint = themed && t ? getTeamAccent(t.id).primary : COLORS.gold;
  if (!p) return null;

  const stats = p.seasonStats && p.seasonStats.gp > 0
    ? ([['PTS', p.seasonStats.ppg.toFixed(1)], ['REB', p.seasonStats.rpg.toFixed(1)], ['AST', p.seasonStats.apg.toFixed(1)]] as [string, string][])
    : ([['OVR', String(p.ovr)], ['OFF', String(p.off)], ['DEF', String(p.def)]] as [string, string][]);

  return (
    <Panel bar={tint} padding={14}>
      <MonoLabel color={tint}>{title}</MonoLabel>

      <View className="flex-row items-center" style={{ gap: 13, marginTop: 11 }}>
        <Image
          source={{ uri: getPlayerImageUrl(p) }}
          placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
          style={{
            width: 56, height: 56, borderRadius: RADIUS.pill,
            borderWidth: 2, borderColor: withAlpha(tint, 0.5), backgroundColor: COLORS.line,
          }}
          contentFit="cover"
        />
        <View style={{ flex: 1 }}>
          <HeroTitle size={17} numberOfLines={1} adjustsFontSizeToFit>{p.name}</HeroTitle>
          <View className="flex-row items-center" style={{ gap: 6, marginTop: 5 }}>
            {t ? (
              <Image source={{ uri: getTeamLogoUrl(t) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 15, height: 15 }} contentFit="contain" />
            ) : null}
            <MonoLabel size={9.5} color={INK.meta} style={{ letterSpacing: 0.4 }}>{getTeamNickname(t)}</MonoLabel>
          </View>
        </View>
      </View>

      <View
        className="flex-row"
        style={{ gap: 20, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.line }}
      >
        {stats.map(([label, val], i) => (
          <View key={label}>
            <MonoLabel size={8} color={INK.faint}>{label}</MonoLabel>
            <Stat size={14} color={i === 0 ? tint : '#fff'} style={{ marginTop: 2 }}>{val}</Stat>
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

/**
 * The Finals MVP, in the champion screen's gold register — 32px radius (the
 * hero tier), which the design reserves for the one card that only happens
 * once a season.
 */
export const FinalsAwardCard: React.FC<FinalsAwardCardProps> = ({
  title, pId, players, subtitle = 'Campeão da NBA', accentColor = COLORS.gold,
}) => {
  const p = pId ? players[pId] : null;
  if (!pId || !p) return null;

  const s = p.seasonStats;

  return (
    <LinearGradient
      colors={['#3a2a08', '#1a1305']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{
        borderRadius: RADIUS.hero,
        padding: 18,
        borderWidth: 1,
        borderColor: withAlpha(accentColor, 0.35),
      }}
    >
      <MonoLabel size={8.5} color={accentColor} style={{ letterSpacing: 1.6 }}>{title}</MonoLabel>
      <View className="flex-row items-center" style={{ gap: 13, marginTop: 12 }}>
        <Image
          source={{ uri: getPlayerImageUrl(p) }}
          placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
          style={{
            width: 50, height: 50, borderRadius: RADIUS.pill,
            borderWidth: 2, borderColor: accentColor, backgroundColor: '#1a1305',
          }}
          contentFit="cover"
        />
        <View style={{ flex: 1 }}>
          <HeroTitle size={17} numberOfLines={1} adjustsFontSizeToFit>{p.name}</HeroTitle>
          <MonoLabel size={10} color="rgba(255,255,255,0.6)" style={{ marginTop: 4, letterSpacing: 0.4 }}>
            {s && s.gp > 0
              ? `${s.ppg.toFixed(1)} pts · ${s.apg.toFixed(1)} ast · ${s.rpg.toFixed(1)} reb`
              : subtitle}
          </MonoLabel>
        </View>
      </View>
    </LinearGradient>
  );
};

interface ChampionHeroProps {
  team: Team;
  gmTitles?: number;
}

/** Used only outside the champion screen (which paints its own hero). */
export const ChampionHero: React.FC<ChampionHeroProps> = ({ team, gmTitles }) => (
  <Panel bar={COLORS.gold} padding={16}>
    <MonoLabel color={COLORS.gold}>Campeão da NBA</MonoLabel>
    <View className="flex-row items-center" style={{ gap: 14, marginTop: 11 }}>
      <Image source={{ uri: getTeamLogoUrl(team) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 52, height: 52 }} contentFit="contain" />
      <View style={{ flex: 1 }}>
        <HeroTitle size={24} numberOfLines={1} adjustsFontSizeToFit>{getTeamNickname(team)}</HeroTitle>
        {typeof gmTitles === 'number' ? (
          <MonoLabel size={10} color={COLORS.gold} style={{ marginTop: 5, letterSpacing: 0.4 }}>
            🏆 Seu {gmTitles}º título como GM
          </MonoLabel>
        ) : null}
      </View>
    </View>
  </Panel>
);
