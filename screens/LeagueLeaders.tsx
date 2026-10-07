import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';

import { Player, Team, PlayerSeasonStats } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamAccent } from '../constants';
import { COLORS, FONT, withAlpha, ovrColor } from '../src/theme/tokens';
import Screen, { Body } from '../components/ui/Screen';
import { ScreenTitle, TeamBadge, Panel, BodyText, Name } from '../components/ui/kit';

// Design 1e ("Transmissão"). Six category tabs; the leader as a big card
// (photo edged in his team color, the number at 66px, the gap over #2); ranks
// 2-9 as 44px rows with a bar proportional to the leader. Your players' rows
// carry your team color at 14%.

type StatKey = keyof Pick<PlayerSeasonStats, 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'mpg'>;
const CATEGORIES: { key: StatKey; label: string; abbr: string }[] = [
  { key: 'ppg', label: 'Pontos', abbr: 'PTS' },
  { key: 'rpg', label: 'Rebotes', abbr: 'REB' },
  { key: 'apg', label: 'Assistências', abbr: 'AST' },
  { key: 'spg', label: 'Roubos', abbr: 'ROU' },
  { key: 'bpg', label: 'Tocos', abbr: 'TOC' },
  { key: 'mpg', label: 'Minutos', abbr: 'MIN' },
];

/** A leader has to have played: a 3-game hot streak does not lead the league. */
const MIN_SHARE = 0.5;

const LeagueLeaders: React.FC<{ players: { [key: string]: Player }; teams: Team[]; userTeamId?: string }> = ({
  players, teams, userTeamId,
}) => {
  const [cat, setCat] = useState<StatKey>('ppg');
  const category = CATEGORIES.find((c) => c.key === cat)!;

  const teamOf = useMemo(() => {
    const map = new Map<string, Team>();
    teams.forEach((t) => t.roster.forEach((id) => map.set(id, t)));
    return map;
  }, [teams]);

  const withStats = useMemo<Player[]>(
    () => (Object.values(players) as Player[]).filter((p) => !!p.seasonStats && p.seasonStats.gp > 0 && teamOf.has(p.id)),
    [players, teamOf],
  );
  const gamesIn = withStats.reduce((m, p) => Math.max(m, p.seasonStats!.gp), 0);

  const board = useMemo(
    () => withStats
      .filter((p) => p.seasonStats!.gp >= gamesIn * MIN_SHARE)
      .sort((a, b) => b.seasonStats![cat] - a.seasonStats![cat])
      .slice(0, 9),
    [withStats, cat, gamesIn],
  );

  // Pre-season: no games yet → the best players by rating.
  if (withStats.length === 0) {
    const topByOvr = (Object.values(players) as Player[])
      .filter((p) => !p.prospect && !p.retired && teamOf.has(p.id))
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 10);
    return (
      <Screen heroHeight={100}>
        <ScreenTitle title="Líderes da liga" />
        <BodyText style={{ paddingHorizontal: 20, marginTop: -8 }}>Sem jogos ainda · os melhores pela nota</BodyText>
        <Body top={14} gap={0}>
          {topByOvr.map((p, i) => (
            <View key={p.id} className="flex-row items-center" style={{ height: 44, gap: 10, borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft }}>
              <Text style={{ width: 20, textAlign: 'right', fontFamily: FONT.cond800, fontSize: 15, color: COLORS.dim }}>{i + 1}</Text>
              <TeamBadge teamId={teamOf.get(p.id)!.id} width={34} height={20} />
              <Name size={15} style={{ flex: 1 }}>{p.name}</Name>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 19, color: ovrColor(p.ovr) }}>{p.ovr}</Text>
            </View>
          ))}
        </Body>
      </Screen>
    );
  }

  const [top, ...rest] = board;
  const topTeam = top ? teamOf.get(top.id) : undefined;
  const topValue = top?.seasonStats![cat] ?? 0;
  const gap = top && rest[0] ? topValue - rest[0].seasonStats![cat] : 0;

  return (
    <Screen heroHeight={100}>
      <ScreenTitle title="Líderes da liga" />
      <BodyText style={{ paddingHorizontal: 20, marginTop: -10 }}>Após {gamesIn} {gamesIn === 1 ? 'jogo' : 'jogos'} · média por partida</BodyText>

      <Body top={14} gap={14}>
        <View className="flex-row" style={{ gap: 6 }}>
          {CATEGORIES.map((c) => {
            const on = c.key === cat;
            return (
              <Pressable
                key={c.key}
                accessibilityRole="tab"
                aria-selected={on}
                onPress={() => setCat(c.key)}
                className="active:opacity-75"
                style={{ flex: 1, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? COLORS.ctaFill : COLORS.surface2 }}
              >
                <Text style={{ fontFamily: FONT.cond800, fontSize: 14, letterSpacing: 1.1, color: on ? COLORS.ctaInk : COLORS.muted }}>{c.abbr}</Text>
              </Pressable>
            );
          })}
        </View>

        {top && topTeam ? (
          <Panel padding={0} radius={20} style={{ height: 190, flexDirection: 'row' }}>
            <View style={{ width: 132, backgroundColor: COLORS.surface2, justifyContent: 'flex-end' }}>
              <Image source={{ uri: getPlayerImageUrl(top) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: 132, height: 170 }} contentFit="cover" contentPosition="top" />
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: getTeamAccent(topTeam.id).primary }} />
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 16, paddingVertical: 14, justifyContent: 'space-between' }}>
              <View style={{ gap: 6 }}>
                <View className="flex-row items-center" style={{ gap: 6 }}>
                  <Text style={{ fontFamily: FONT.cond800, fontSize: 12, letterSpacing: 1.2, color: COLORS.gold }}>1º</Text>
                  <TeamBadge teamId={topTeam.id} width={34} height={18} />
                </View>
                <Text numberOfLines={2} style={{ fontFamily: FONT.cond800, fontSize: 24, lineHeight: 24, color: COLORS.text, textTransform: 'uppercase' }}>
                  {top.name}
                </Text>
              </View>
              <View style={{ gap: 4 }}>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 66, lineHeight: 60, color: COLORS.text, fontVariant: ['tabular-nums'] }}>
                  {topValue.toFixed(1)}
                </Text>
                <Text style={{ fontFamily: FONT.body600, fontSize: 12, color: COLORS.muted }}>
                  {category.label} por jogo{gap > 0 ? <Text style={{ color: COLORS.good }}> · +{gap.toFixed(1)} sobre o 2º</Text> : null}
                </Text>
              </View>
            </View>
          </Panel>
        ) : null}

        <View>
          {rest.map((p, i) => {
            const t = teamOf.get(p.id)!;
            const v = p.seasonStats![cat];
            const mine = t.id === userTeamId;
            return (
              <View
                key={p.id}
                className="flex-row items-center"
                style={{
                  height: 44, gap: 10, borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft,
                  backgroundColor: mine ? withAlpha(getTeamAccent(t.id).primary, 0.14) : 'transparent',
                }}
              >
                <Text style={{ width: 20, textAlign: 'right', fontFamily: FONT.cond800, fontSize: 15, color: COLORS.dim }}>{i + 2}</Text>
                <TeamBadge teamId={t.id} width={34} height={20} />
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Name size={15}>{p.name}</Name>
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: COLORS.line }}>
                    <View style={{ height: '100%', borderRadius: 2, backgroundColor: '#4A4950', width: `${topValue > 0 ? (v / topValue) * 100 : 0}%` }} />
                  </View>
                </View>
                <Text style={{ width: 42, textAlign: 'right', fontFamily: FONT.cond800, fontSize: 19, color: COLORS.text, fontVariant: ['tabular-nums'] }}>
                  {v.toFixed(1)}
                </Text>
              </View>
            );
          })}
        </View>
      </Body>
    </Screen>
  );
};

export default LeagueLeaders;
