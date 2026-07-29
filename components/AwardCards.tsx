import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamLogoUrl, getTeamAccent } from '../constants';
import { Player, Team } from '../types';
import Icon from './Icon';

// RN port of the award cards. The web used inline SVG trophy data-URIs
// (LARRY_OBRIEN / BILL_RUSSELL) — swapped for the `awards` Icon glyph here,
// which renders reliably through react-native-svg on both platforms.
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
  const accentColor = themed && t ? getTeamAccent(t.id).primary : '#f59e0b';
  if (!p) return null;

  return (
    <View className="bg-slate-900 rounded-hero p-5 border border-slate-800 items-center gap-4">
      <View className="items-center gap-1">
        <Text className="text-[10px] font-black uppercase tracking-widest" style={{ color: accentColor }}>{title}</Text>
        <View className="h-px w-8" style={{ backgroundColor: `${accentColor}4d` }} />
      </View>

      <Image
        source={{ uri: getPlayerImageUrl(p) }}
        placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
        style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: `${accentColor}80`, backgroundColor: '#1e293b' }}
        contentFit="cover"
      />

      <View className="items-center gap-1">
        <Text className="text-lg font-black italic uppercase tracking-tighter text-white text-center" numberOfLines={1}>{p.name}</Text>
        <View className="flex-row items-center gap-2">
          {t ? <Image source={{ uri: getTeamLogoUrl(t) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 16, height: 16 }} contentFit="contain" /> : null}
          <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t?.name}</Text>
        </View>
      </View>

      {p.seasonStats && p.seasonStats.gp > 0 ? (
        <View className="flex-row justify-center gap-5 pt-3 border-t border-slate-800 w-full">
          {([['PTS', p.seasonStats.ppg], ['REB', p.seasonStats.rpg], ['AST', p.seasonStats.apg]] as [string, number][]).map(([label, val]) => (
            <View key={label} className="items-center">
              <Text className="text-[8px] font-bold text-slate-500 uppercase">{label}</Text>
              <Text className="text-sm font-black text-white" style={label === 'PTS' ? { color: accentColor } : undefined}>{val.toFixed(1)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View className="flex-row justify-center gap-5 pt-3 border-t border-slate-800 w-full">
          {([['OVR', p.ovr, accentColor], ['OFF', p.off, '#ffffff'], ['DEF', p.def, '#ffffff']] as [string, number, string][]).map(([label, val, c]) => (
            <View key={label} className="items-center">
              <Text className="text-[8px] font-bold text-slate-500 uppercase">{label}</Text>
              <Text className="text-sm font-black" style={{ color: c }}>{val}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

interface FinalsAwardCardProps {
  title: string;
  pId?: string;
  players: { [key: string]: Player };
  subtitle?: string;
  accentColor?: string;
}

export const FinalsAwardCard: React.FC<FinalsAwardCardProps> = ({ title, pId, players, subtitle = 'Campeão da NBA', accentColor = '#0ea5e9' }) => {
  const p = pId ? players[pId] : null;
  if (!pId || !p) return null;

  return (
    <View className="bg-slate-900 rounded-hero p-7 border items-center gap-4" style={{ borderColor: `${accentColor}4d` }}>
      <Icon name="awards" size={34} color={accentColor} strokeWidth={2} />
      <Text className="text-xs font-black uppercase tracking-widest" style={{ color: accentColor }}>{title}</Text>
      <Image
        source={{ uri: getPlayerImageUrl(p) }}
        placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
        style={{ width: 128, height: 128, borderRadius: 64, borderWidth: 4, borderColor: accentColor, backgroundColor: '#1e293b' }}
        contentFit="cover"
      />
      <View className="items-center gap-1">
        <Text className="text-2xl font-black italic uppercase tracking-tighter text-white text-center">{p.name}</Text>
        <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: accentColor }}>{subtitle}</Text>
      </View>
    </View>
  );
};

interface ChampionHeroProps {
  team: Team;
  gmTitles?: number;
}

export const ChampionHero: React.FC<ChampionHeroProps> = ({ team, gmTitles }) => {
  const accentColor = getTeamAccent(team.id).primary;
  return (
    <View className="bg-slate-900 rounded-hero p-7 border items-center gap-5" style={{ borderColor: `${accentColor}66` }}>
      <Icon name="awards" size={52} color="#fbbf24" strokeWidth={1.6} />
      <View className="flex-row items-center gap-4">
        <Image source={{ uri: getTeamLogoUrl(team) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 56, height: 56 }} contentFit="contain" />
        <View>
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: accentColor }}>Campeão da NBA</Text>
          <Text className="text-2xl font-black italic uppercase tracking-tighter text-white">{team.name}</Text>
        </View>
      </View>
      {typeof gmTitles === 'number' ? (
        <Text className="text-amber-400 font-bold text-sm uppercase tracking-widest text-center">🏆 Seu {gmTitles}º título como GM!</Text>
      ) : null}
    </View>
  );
};
