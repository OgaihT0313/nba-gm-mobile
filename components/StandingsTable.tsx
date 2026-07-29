import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Team, ScheduleGame } from '../types';
import { getTeamLogoUrl } from '../constants';
import { sortStandings } from '../services/scheduleService';

// RN port of the flex-row standings. Same logic: real tiebreak sort once games
// exist, powerRank pre-season; seed coloring (1-6 sky / 7-10 amber / rest muted)
// and a hairline at the playoff & play-in cutoffs.
interface StandingsTableProps {
  teams: Team[];
  conference: 'East' | 'West';
  schedule?: ScheduleGame[];
}

const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

const StandingsTable: React.FC<StandingsTableProps> = ({ teams, conference, schedule }) => {
  const confTeams = teams.filter((t) => t.conference === conference);
  const hasGames = confTeams.some((t) => (t.wins || 0) + (t.losses || 0) > 0);

  const rows = hasGames
    ? schedule
      ? sortStandings(confTeams, schedule)
      : [...confTeams].sort((a, b) => (b.wins || 0) - (a.wins || 0))
    : [...confTeams].sort((a, b) => a.powerRank - b.powerRank);

  return (
    <View>
      {!hasGames ? (
        <Text className="text-[10px] text-slate-600 italic px-2 pb-2">
          Temporada ainda não começou — ordenado por força do elenco.
        </Text>
      ) : null}
      {rows.map((t, i) => {
        const wins = t.wins || 0;
        const losses = t.losses || 0;
        const total = wins + losses;
        const pct = total > 0 ? (wins / total).toFixed(3).replace(/^0/, '') : '.000';
        const zoneColor = !hasGames ? 'text-slate-600' : i < 6 ? 'text-sky-400' : i < 10 ? 'text-amber-400' : 'text-slate-600';
        const cutoff = hasGames && (i === 5 || i === 9);

        return (
          <View
            key={t.id}
            className={`flex-row items-center gap-2.5 px-2 py-2 rounded-lg ${cutoff ? 'border-b border-slate-800 mb-1 pb-2.5' : ''}`}
          >
            <Text className={`w-5 text-center font-mono-bold text-xs ${zoneColor}`}>{i + 1}</Text>
            <Image
              source={{ uri: getTeamLogoUrl(t) }}
              placeholder={{ uri: NBA_FALLBACK }}
              style={{ width: 24, height: 24 }}
              contentFit="contain"
            />
            <Text className="flex-1 font-semibold text-sm text-slate-200" numberOfLines={1}>
              {t.name}
            </Text>
            <Text className="font-mono text-xs text-slate-300">
              {wins}
              <Text className="text-slate-600">-{losses}</Text>
            </Text>
            <Text className="font-mono text-[10px] text-slate-500 w-9 text-right">{pct}</Text>
          </View>
        );
      })}
    </View>
  );
};

export default React.memo(StandingsTable);
