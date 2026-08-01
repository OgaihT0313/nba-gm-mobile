import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Team, ScheduleGame } from '../types';
import { getTeamLogoUrl, getTeamNickname } from '../constants';
import { sortStandings } from '../services/scheduleService';
import { COLORS, INK, tracking, withAlpha } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

// Design 3e: the densest table in the app. The seed zone is carried by a
// colored 3px edge on the LEFT of each row (green = playoff berth, amber =
// play-in) rather than by tinting the rank number, so the two bands read as
// continuous blocks you can find without counting rows — and the user's own
// team is washed in the franchise color so it's findable at a glance.
interface StandingsTableProps {
  teams: Team[];
  conference: 'East' | 'West';
  schedule?: ScheduleGame[];
  userTeamId?: string;
  /** Cap the rows shown (the season screen doesn't need all 15). */
  limit?: number;
}

const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

const StandingsTable: React.FC<StandingsTableProps> = ({ teams, conference, schedule, userTeamId, limit }) => {
  const { accent } = useTheme();
  const confTeams = teams.filter((t) => t.conference === conference);
  const hasGames = confTeams.some((t) => (t.wins || 0) + (t.losses || 0) > 0);

  const ranked = hasGames
    ? schedule
      ? sortStandings(confTeams, schedule)
      : [...confTeams].sort((a, b) => (b.wins || 0) - (a.wins || 0))
    : [...confTeams].sort((a, b) => a.powerRank - b.powerRank);

  // Games behind the conference leader, the column the mockup ends on.
  const leader = ranked[0];
  const leadW = leader?.wins ?? 0;
  const leadL = leader?.losses ?? 0;

  // With a limit, the user's team is pulled in even if it fell outside the cut
  // — a standings table that can't show you where YOU are is useless.
  let rows = ranked;
  if (limit && ranked.length > limit) {
    const head = ranked.slice(0, limit);
    const userRow = ranked.find((t) => t.id === userTeamId);
    rows = userRow && !head.includes(userRow) ? [...head, userRow] : head;
  }

  return (
    <View>
      {!hasGames ? (
        <Text style={{ fontSize: 10, color: INK.faint, fontStyle: 'italic', paddingHorizontal: 4, paddingBottom: 8 }}>
          Temporada ainda não começou — ordenado por força do elenco.
        </Text>
      ) : null}

      {/* Column head */}
      <View
        className="flex-row"
        style={{ backgroundColor: COLORS.sunken, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, marginBottom: 2 }}
      >
        <Head style={{ width: 18 }}>#</Head>
        <Head style={{ flex: 1 }}>Time</Head>
        <Head style={{ width: 46, textAlign: 'right' }}>V-D</Head>
        <Head style={{ width: 38, textAlign: 'right' }}>Pct</Head>
        <Head style={{ width: 30, textAlign: 'right' }}>GB</Head>
      </View>

      {rows.map((t) => {
        const seed = ranked.indexOf(t) + 1;
        const wins = t.wins || 0;
        const losses = t.losses || 0;
        const total = wins + losses;
        const pct = total > 0 ? (wins / total).toFixed(3).replace(/^0/, '') : '.000';
        const gb = hasGames ? ((leadW - wins) + (losses - leadL)) / 2 : 0;
        const zone = !hasGames ? 'transparent' : seed <= 6 ? COLORS.good : seed <= 10 ? COLORS.warn : 'transparent';
        const isUser = t.id === userTeamId;

        return (
          <View
            key={t.id}
            className="flex-row items-center"
            style={{
              paddingHorizontal: 11,
              paddingVertical: isUser ? 10 : 8,
              borderLeftWidth: 3,
              borderLeftColor: zone,
              backgroundColor: isUser ? withAlpha(accent.primary, 0.16) : 'transparent',
              borderTopWidth: 1,
              borderTopColor: '#131e33',
            }}
          >
            <Text className="font-mono-bold" style={{ width: 18, fontSize: 11, color: '#fff' }}>{seed}</Text>
            <View className="flex-row items-center" style={{ flex: 1, gap: 8 }}>
              <Image
                source={{ uri: getTeamLogoUrl(t) }}
                placeholder={{ uri: NBA_FALLBACK }}
                style={{ width: 18, height: 18 }}
                contentFit="contain"
              />
              <Text
                className={isUser ? 'font-bold' : 'font-semibold'}
                style={{ flex: 1, fontSize: 11, color: isUser ? '#fff' : COLORS.textSoft }}
                numberOfLines={1}
              >
                {getTeamNickname(t)}
              </Text>
            </View>
            <Text className="font-mono-bold" style={{ width: 46, fontSize: 11, color: '#fff', textAlign: 'right' }}>
              {wins}-{losses}
            </Text>
            <Text className="font-mono" style={{ width: 38, fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>
              {pct}
            </Text>
            <Text className="font-mono" style={{ width: 30, fontSize: 11, color: INK.meta, textAlign: 'right' }}>
              {!hasGames || gb <= 0 ? '—' : gb.toFixed(1)}
            </Text>
          </View>
        );
      })}

      {hasGames ? (
        <View className="flex-row" style={{ gap: 12, paddingHorizontal: 4, paddingTop: 9 }}>
          <Legend color={COLORS.good} label="Playoffs" />
          <Legend color={COLORS.warn} label="Play-in" />
        </View>
      ) : null}
    </View>
  );
};

const Head: React.FC<{ children: React.ReactNode; style?: object }> = ({ children, style }) => (
  <Text
    className="font-mono-bold"
    style={[{ fontSize: 8, letterSpacing: tracking(8, 0.14), color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }, style]}
  >
    {children}
  </Text>
);

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <View className="flex-row items-center" style={{ gap: 5 }}>
    <View style={{ width: 8, height: 3, borderRadius: 2, backgroundColor: color }} />
    <Text className="font-mono" style={{ fontSize: 9, color: INK.meta, textTransform: 'uppercase' }}>{label}</Text>
  </View>
);

export default React.memo(StandingsTable);
