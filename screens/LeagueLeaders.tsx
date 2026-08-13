import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';

import { Player, Team, PlayerSeasonStats } from '../types';
import { getPlayerImageUrl, getTeamLogoUrl, PLAYER_PLACEHOLDER_SVG, getTeamNickname, getTeamTricode, attributeColor } from '../constants';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK, RADIUS } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import { Panel, MonoLabel, Eyebrow, HeroTitle, Stat, StatTile } from '../components/ui/kit';

// The deep version of the leaders list: the scoring leader gets the hero (this
// is the app's one editorial moment outside the champion screen), then a top-5
// board per category. The compact one-per-category block lives in
// components/LeadersPanel and is what the Classificação tab uses.

const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';
const fmt = (n: number) => n.toFixed(1);

type StatKey = keyof Pick<PlayerSeasonStats, 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg'>;
const CATEGORIES: { key: StatKey; label: string; abbr: string }[] = [
  { key: 'ppg', label: 'Pontos', abbr: 'PPG' },
  { key: 'rpg', label: 'Rebotes', abbr: 'RPG' },
  { key: 'apg', label: 'Assistências', abbr: 'APG' },
  { key: 'spg', label: 'Roubos', abbr: 'SPG' },
  { key: 'bpg', label: 'Tocos', abbr: 'BPG' },
];

const LeagueLeaders: React.FC<{ players: { [key: string]: Player }; teams: Team[] }> = ({ players, teams }) => {
  const { accent } = useTheme();

  const teamOf = useMemo(() => {
    const map = new Map<string, Team>();
    teams.forEach((t) => t.roster.forEach((id) => map.set(id, t)));
    return map;
  }, [teams]);

  const withStats = useMemo<Player[]>(
    () => (Object.values(players) as Player[]).filter((p) => !!p.seasonStats && p.seasonStats.gp > 0),
    [players],
  );

  const leaderboards = useMemo(
    () => CATEGORIES.map((cat) => ({
      ...cat,
      top: [...withStats].sort((a, b) => b.seasonStats![cat.key] - a.seasonStats![cat.key]).slice(0, 5),
    })),
    [withStats],
  );

  // Pre-season: no games yet → fall back to a ratings list.
  if (withStats.length === 0) {
    const topByOvr = (Object.values(players) as Player[])
      .filter((p) => !p.prospect)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 8);
    return (
      <Screen heroHeight={132}>
        <HeroContent>
          <Eyebrow>Líderes</Eyebrow>
          <HeroTitle size={28} style={{ marginTop: 9 }}>Antes do apito</HeroTitle>
        </HeroContent>
        <Body top={16}>
          <Text style={{ fontSize: 11.5, lineHeight: 17, color: INK.body, paddingHorizontal: 4 }}>
            As lideranças estatísticas aparecem assim que os primeiros jogos forem simulados. Por enquanto, os mais bem
            avaliados da liga:
          </Text>
          {topByOvr.map((p, i) => (
            <Panel key={p.id} bar={attributeColor(p.ovr)} padding={11}>
              <View className="flex-row items-center" style={{ gap: 11 }}>
                <MonoLabel size={11} color={INK.faint} style={{ width: 18, letterSpacing: 0 }}>{i + 1}</MonoLabel>
                <Image
                  source={{ uri: getPlayerImageUrl(p) }}
                  placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
                  style={{ width: 32, height: 32, borderRadius: RADIUS.pill, backgroundColor: COLORS.line }}
                  contentFit="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text className="font-bold text-white" style={{ fontSize: 12 }} numberOfLines={1}>{p.name}</Text>
                  <MonoLabel size={9.5} color={INK.meta} style={{ marginTop: 2, letterSpacing: 0 }}>
                    {getTeamTricode(teamOf.get(p.id))}
                  </MonoLabel>
                </View>
                <Stat size={17} color={attributeColor(p.ovr)}>{p.ovr}</Stat>
              </View>
            </Panel>
          ))}
        </Body>
      </Screen>
    );
  }

  const scoringLeader = leaderboards[0].top[0];
  const leaderTeam = teamOf.get(scoringLeader.id);
  const ls = scoringLeader.seasonStats!;
  const parts = scoringLeader.name.split(' ');
  const first = parts[0];
  const last = parts.slice(1).join(' ') || parts[0];

  return (
    <Screen heroHeight={300}>
      <HeroContent>
        <Eyebrow>Cestinha da liga · {ls.gp} jogos</Eyebrow>

        {/* The one editorial moment in the app, so the headshot is shown the way
            it was shot: `contain` on the full 1040x760 bust, not cropped into an
            avatar circle. The name sits beside it and the photo is allowed to
            run past the hero band's bottom edge. */}
        <View className="flex-row items-end" style={{ marginTop: 10 }}>
          <View style={{ flex: 1, paddingBottom: 12 }}>
            <HeroTitle size={30} numberOfLines={1} adjustsFontSizeToFit>{first}</HeroTitle>
            <HeroTitle size={30} numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 1 }}>{last}</HeroTitle>
            <View className="flex-row items-center" style={{ gap: 8, marginTop: 9 }}>
              {leaderTeam ? (
                <Image source={{ uri: getTeamLogoUrl(leaderTeam) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 24, height: 24 }} contentFit="contain" />
              ) : null}
              <MonoLabel size={10} color="rgba(255,255,255,0.7)" style={{ letterSpacing: 0.4 }} numberOfLines={1}>
                {getTeamNickname(leaderTeam)}
              </MonoLabel>
            </View>
          </View>
          <Image
            source={{ uri: getPlayerImageUrl(scoringLeader) }}
            placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
            style={{ width: 168, height: 174, marginRight: -14, marginBottom: -6 }}
            contentFit="contain"
          />
        </View>
      </HeroContent>

      <Body top={18}>
        <View className="flex-row" style={{ gap: 10 }}>
          <StatTile label="PPG" value={fmt(ls.ppg)} color={accent.primary} bar={accent.primary} />
          <StatTile label="RPG" value={fmt(ls.rpg)} />
          <StatTile label="APG" value={fmt(ls.apg)} />
        </View>

        {leaderboards.map((board) => (
          <Panel key={board.key} padding={13}>
            <View className="flex-row items-baseline justify-between" style={{ marginBottom: 11 }}>
              <MonoLabel>{board.label}</MonoLabel>
              <MonoLabel size={9} color={INK.faint}>{board.abbr}</MonoLabel>
            </View>
            <View style={{ gap: 10 }}>
              {board.top.map((p, i) => {
                const t = teamOf.get(p.id);
                return (
                  <View key={p.id} className="flex-row items-center" style={{ gap: 10 }}>
                    <MonoLabel size={10} color={i === 0 ? accent.primary : INK.faint} style={{ width: 14, letterSpacing: 0 }}>
                      {i + 1}
                    </MonoLabel>
                    <Image
                      source={{ uri: getPlayerImageUrl(p) }}
                      placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
                      style={{ width: 30, height: 30, borderRadius: RADIUS.pill, backgroundColor: COLORS.line }}
                      contentFit="cover"
                    />
                    <View style={{ flex: 1 }} className="flex-row items-baseline">
                      <Text className="font-bold text-white" style={{ fontSize: 11.5, flexShrink: 1 }} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <MonoLabel size={9} color={INK.meta} style={{ marginLeft: 6, letterSpacing: 0 }}>
                        {getTeamTricode(t)}
                      </MonoLabel>
                    </View>
                    <Stat size={14} color={i === 0 ? accent.primary : '#fff'}>{fmt(p.seasonStats![board.key])}</Stat>
                  </View>
                );
              })}
            </View>
          </Panel>
        ))}
      </Body>
    </Screen>
  );
};

export default LeagueLeaders;
