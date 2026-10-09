import React from 'react';
import { View, Text, Pressable } from 'react-native';

import { Team, Player, ScheduleGame } from '../types';
import { getTeamNickname } from '../constants';
import { sortStandings } from '../services/scheduleService';
import { teamRating } from '../services/formService';
import { COLORS, FONT } from '../src/theme/tokens';
import Screen, { Body } from '../components/ui/Screen';
import { ScreenTitle, BodyText, TeamBadge, TeamLogo } from '../components/ui/kit';
import { useDesktop } from '../components/desktop/useDesktop';
import { DPage, DTitle, Hover } from '../components/desktop/kit';

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
}> = ({ teams, players, rivalIds = [], userTeamId, schedule = [], onSelect }) => {
  const teamOvr = (t: Team) => teamRating(t, players);
  // PC: 46px rows, bigger type, hover state.
  const desktop = useDesktop();
  const rowH = desktop ? 46 : 38;
  const hasGames = teams.some((t) => (t.wins || 0) + (t.losses || 0) > 0);
  const order = (conf: 'East' | 'West') => {
    const list = teams.filter((t) => t.conference === conf);
    return hasGames ? sortStandings(list, schedule) : [...list].sort((a, b) => a.powerRank - b.powerRank);
  };

  const tagOf = (t: Team, seed: number): { text: string; color: string } | null => {
    if (t.id === userTeamId) return { text: 'Você', color: COLORS.east };
    if (rivalIds.includes(t.id)) return { text: 'Rival', color: COLORS.west };
    if (t.tanking) return { text: 'Loteria', color: COLORS.warn };
    // A playoff tag after one or two nights is a coin flip dressed as a
    // projection: wait for ~10 games.
    if (!hasGames || (t.wins ?? 0) + (t.losses ?? 0) < 10) return null;
    if (seed <= 6) return { text: 'Playoffs', color: COLORS.good };
    if (seed <= 10) return { text: 'Play-in', color: COLORS.muted };
    return null;
  };

  const Column: React.FC<{ conf: 'East' | 'West' }> = ({ conf }) => (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ backgroundColor: conf === 'West' ? COLORS.west : COLORS.east, borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingHorizontal: 12, paddingVertical: desktop ? 10 : 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontFamily: FONT.cond800, fontSize: desktop ? 22 : 18, lineHeight: desktop ? 22 : 18, letterSpacing: 1.1, color: '#fff' }}>{conf === 'West' ? 'OESTE' : 'LESTE'}</Text>
        {desktop ? (
          <View className="flex-row" style={{ gap: 10 }}>
            <Text style={{ width: 40, textAlign: 'right', fontFamily: FONT.cond600, fontSize: 11, letterSpacing: 0.9, color: 'rgba(255,255,255,0.85)' }}>OVR</Text>
            <Text style={{ width: 56, textAlign: 'right', fontFamily: FONT.cond600, fontSize: 11, letterSpacing: 0.9, color: 'rgba(255,255,255,0.85)' }}>V–D</Text>
          </View>
        ) : null}
      </View>
      <View style={{ backgroundColor: COLORS.surface, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden' }}>
        {order(conf).map((t, i) => {
          const tag = tagOf(t, i + 1);
          return (
            <Hover
              key={t.id}
              accessibilityLabel={getTeamNickname(t)}
              onPress={() => onSelect(t.id)}
              style={{ flexDirection: 'row', alignItems: 'center', height: rowH, gap: desktop ? 10 : 8, paddingLeft: desktop ? 10 : 7, paddingRight: desktop ? 12 : 8, borderBottomWidth: 1, borderBottomColor: COLORS.line }}
            >
              <TeamBadge teamId={t.id} width={32} height={22} />
            <TeamLogo teamId={t.id} size={22} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: FONT.cond600, fontSize: desktop ? 16 : 14, lineHeight: desktop ? 17 : 15, color: COLORS.text }}>{getTeamNickname(t)}</Text>
                {tag ? (
                  <Text style={{ fontFamily: FONT.cond600, fontSize: desktop ? 11 : 10.5, letterSpacing: 0.6, color: tag.color, textTransform: 'uppercase' }}>{tag.text}</Text>
                ) : null}
              </View>
              {desktop ? (
                <Text style={{ width: 40, textAlign: 'right', fontFamily: FONT.cond700, fontSize: 14, color: COLORS.dim, fontVariant: ['tabular-nums'] }}>
                  {teamOvr(t)}
                </Text>
              ) : null}
              <Text style={{ width: desktop ? 56 : undefined, textAlign: 'right', fontFamily: FONT.cond700, fontSize: desktop ? 15 : 13, color: desktop ? COLORS.text : COLORS.muted, fontVariant: ['tabular-nums'] }}>
                {t.wins ?? 0}–{t.losses ?? 0}
              </Text>
            </Hover>
          );
        })}
      </View>
    </View>
  );

  if (desktop) {
    return (
      <DPage>
        <DTitle title="Franquias" />
        <BodyText size={15} style={{ marginTop: 6 }}>Clique para ver elenco, folha e picks</BodyText>
        <View className="flex-row" style={{ gap: 16, marginTop: 22 }}>
          <Column conf="West" />
          <Column conf="East" />
        </View>
      </DPage>
    );
  }

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
