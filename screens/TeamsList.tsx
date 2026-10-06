import React from 'react';
import { View, Text, Pressable } from 'react-native';

import { Team, Player, ScheduleGame } from '../types';
import { getTeamNickname } from '../constants';
import { sortStandings } from '../services/scheduleService';
import { COLORS, FONT } from '../src/theme/tokens';
import Screen, { Body } from '../components/ui/Screen';
import { ScreenTitle, BodyText, TeamBadge, TeamLogo } from '../components/ui/kit';

// Design 4b ("Transmissão"). The same two-column West/East layout as the team
// picker, 38px rows; under each name one tag line — VOCÊ, RIVAL, LOTERIA (a CPU
// team playing for the lottery is a different trade partner: it wants picks
// and youth), or where it stands (PLAYOFFS / PLAY-IN) — and the record.

const TeamsList: React.FC<{
  teams: Team[];
  players: { [key: string]: Player };
  /** Your franchise's rivals, tagged on their rows. */
  rivalIds?: string[];
  userTeamId?: string;
  schedule?: ScheduleGame[];
  onSelect: (teamId: string) => void;
}> = ({ teams, rivalIds = [], userTeamId, schedule = [], onSelect }) => {
  const hasGames = teams.some((t) => (t.wins || 0) + (t.losses || 0) > 0);
  const order = (conf: 'East' | 'West') => {
    const list = teams.filter((t) => t.conference === conf);
    return hasGames ? sortStandings(list, schedule) : [...list].sort((a, b) => a.powerRank - b.powerRank);
  };

  const tagOf = (t: Team, seed: number): { text: string; color: string } | null => {
    if (t.id === userTeamId) return { text: 'Você', color: COLORS.east };
    if (rivalIds.includes(t.id)) return { text: 'Rival', color: COLORS.west };
    if (t.tanking) return { text: 'Loteria', color: COLORS.warn };
    if (!hasGames) return null;
    if (seed <= 6) return { text: 'Playoffs', color: COLORS.good };
    if (seed <= 10) return { text: 'Play-in', color: COLORS.muted };
    return null;
  };

  const Column: React.FC<{ conf: 'East' | 'West' }> = ({ conf }) => (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ backgroundColor: conf === 'West' ? COLORS.west : COLORS.east, borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ fontFamily: FONT.cond800, fontSize: 18, lineHeight: 18, letterSpacing: 1.1, color: '#fff' }}>{conf === 'West' ? 'OESTE' : 'LESTE'}</Text>
      </View>
      <View style={{ backgroundColor: COLORS.surface, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden' }}>
        {order(conf).map((t, i) => {
          const tag = tagOf(t, i + 1);
          return (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityLabel={getTeamNickname(t)}
              onPress={() => onSelect(t.id)}
              className="flex-row items-center active:opacity-75"
              style={{ height: 38, gap: 8, paddingLeft: 7, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: COLORS.line }}
            >
              <TeamBadge teamId={t.id} width={32} height={22} />
            <TeamLogo teamId={t.id} size={22} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: FONT.cond600, fontSize: 14, lineHeight: 15, color: COLORS.text }}>{getTeamNickname(t)}</Text>
                {tag ? (
                  <Text style={{ fontFamily: FONT.cond600, fontSize: 10.5, letterSpacing: 0.6, color: tag.color, textTransform: 'uppercase' }}>{tag.text}</Text>
                ) : null}
              </View>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 13, color: COLORS.muted, fontVariant: ['tabular-nums'] }}>
                {t.wins ?? 0}–{t.losses ?? 0}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <Screen heroHeight={100}>
      <ScreenTitle title="Franquias" />
      <BodyText size={14} style={{ paddingHorizontal: 20, marginTop: -10 }}>Toque para ver elenco, folha e picks</BodyText>
      <Body top={12}>
        <View className="flex-row" style={{ gap: 8, marginHorizontal: -2 }}>
          <Column conf="West" />
          <Column conf="East" />
        </View>
      </Body>
    </Screen>
  );
};

export default TeamsList;
