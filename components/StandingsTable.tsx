import React from 'react';
import { View, Text } from 'react-native';
import { Team, ScheduleGame } from '../types';
import { getTeamNickname, getTeamAccent } from '../constants';
import { sortStandings } from '../services/scheduleService';
import { recentForm } from '../services/formService';
import { COLORS, FONT, withAlpha } from '../src/theme/tokens';
import { TeamBadge } from './ui/kit';

// Design 4a ("Transmissão"). 36px rows: seed · tricode badge · name · W–L ·
// point differential · last five as tiny bars. Seeds 1-6 in full text, 7-10
// muted, the rest faint; a white rule under the 6th (playoffs) and a grey one
// under the 10th (play-in). Your row carries your team color at 22%.
//
// Before a game is played there is no ranking, so it falls back to roster
// strength and drops the seed colors and cut lines that would imply one.

interface StandingsTableProps {
  teams: Team[];
  conference: 'East' | 'West';
  schedule?: ScheduleGame[];
  userTeamId?: string;
  /** Cap the rows shown (the season screen doesn't need all 15). */
  limit?: number;
  /** Row height: 36 by default, 42 on the PC standings page. */
  rowHeight?: number;
}

const StandingsTable: React.FC<StandingsTableProps> = ({ teams, conference, schedule, userTeamId, limit, rowHeight = 36 }) => {
  const confTeams = teams.filter((t) => t.conference === conference);
  const hasGames = confTeams.some((t) => (t.wins || 0) + (t.losses || 0) > 0);

  const ranked = hasGames
    ? schedule
      ? sortStandings(confTeams, schedule)
      : [...confTeams].sort((a, b) => (b.wins || 0) - (a.wins || 0))
    : [...confTeams].sort((a, b) => a.powerRank - b.powerRank);

  let rows = ranked;
  if (limit && ranked.length > limit) {
    const head = ranked.slice(0, limit);
    const userRow = ranked.find((t) => t.id === userTeamId);
    rows = userRow && !head.includes(userRow) ? [...head, userRow] : head;
  }

  return (
    <View>
      {!hasGames ? (
        <Text style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.dim, paddingBottom: 8 }}>
          Temporada ainda não começou — ordenado por força do elenco.
        </Text>
      ) : null}

      <View className="flex-row items-center" style={{ height: 28, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        <View style={{ width: 18 }} />
        <Head style={{ flex: 1 }}>Time</Head>
        <Head style={{ width: 46, textAlign: 'right' }}>V–D</Head>
        <Head style={{ width: 32, textAlign: 'right' }}>Dif</Head>
        {schedule ? <Head style={{ width: 50, textAlign: 'right' }}>Últ. 5</Head> : null}
      </View>

      {rows.map((t) => {
        const seed = ranked.indexOf(t) + 1;
        const wins = t.wins || 0;
        const losses = t.losses || 0;
        const isUser = t.id === userTeamId;
        const diff = t.stats ? (t.stats.ppg ?? 0) - (t.stats.oppg ?? 0) : 0;
        const seedColor = !hasGames ? COLORS.dim : seed <= 6 ? COLORS.text : seed <= 10 ? COLORS.muted : COLORS.faint;
        // The cut lines: white under the 6th, grey under the 10th.
        const cut = hasGames && seed === 6 ? COLORS.text : hasGames && seed === 10 ? '#4A4950' : COLORS.line;
        const last5 = schedule ? recentForm(schedule, t.id, 5) : [];

        return (
          <View
            key={t.id}
            className="flex-row items-center"
            style={{
              height: rowHeight, gap: 8,
              borderBottomWidth: cut === COLORS.line ? 1 : 2, borderBottomColor: cut,
              backgroundColor: isUser ? withAlpha(getTeamAccent(t.id).primary, 0.22) : 'transparent',
            }}
          >
            <Text style={{ width: 18, textAlign: 'right', fontFamily: FONT.cond800, fontSize: 13, color: seedColor }}>{seed}</Text>
            <TeamBadge teamId={t.id} width={30} height={20} />
            <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: FONT.cond600, fontSize: 14.5, color: COLORS.text }}>
              {getTeamNickname(t)}
            </Text>
            <Text style={{ width: 46, textAlign: 'right', fontFamily: FONT.cond700, fontSize: 14, color: COLORS.text, fontVariant: ['tabular-nums'] }}>
              {wins}–{losses}
            </Text>
            <Text style={{ width: 32, textAlign: 'right', fontFamily: FONT.cond600, fontSize: 12.5, color: diff > 0 ? COLORS.good : diff < 0 ? COLORS.bad : COLORS.dim }}>
              {!hasGames ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}`}
            </Text>
            {schedule ? (
              <View className="flex-row justify-end" style={{ width: 50, gap: 2 }}>
                {last5.map((g, i) => (
                  <View key={i} style={{ width: 8, height: 12, borderRadius: 2, backgroundColor: g.won ? COLORS.good : COLORS.bad }} />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      {hasGames ? (
        <View className="flex-row" style={{ gap: 14, paddingTop: 10 }}>
          <Legend color={COLORS.text} label="Playoffs" />
          <Legend color="#4A4950" label="Play-in" />
        </View>
      ) : null}
    </View>
  );
};

const Head: React.FC<{ children: React.ReactNode; style?: object }> = ({ children, style }) => (
  <Text style={[{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.3, color: COLORS.faint, textTransform: 'uppercase' }, style]}>
    {children}
  </Text>
);

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <View className="flex-row items-center" style={{ gap: 5 }}>
    <View style={{ width: 10, height: 2, backgroundColor: color }} />
    <Text style={{ fontFamily: FONT.body600, fontSize: 11.5, color: COLORS.dim }}>{label}</Text>
  </View>
);

export default React.memo(StandingsTable);
