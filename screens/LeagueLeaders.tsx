import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Player, Team, PlayerSeasonStats } from '../types';
import { getPlayerImageUrl, getTeamLogoUrl, PLAYER_PLACEHOLDER_SVG } from '../constants';
import { useTheme } from '../src/theme/ThemeProvider';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';

// RN port. The web's editorial hero is a side-by-side 380px band; on a phone it
// stacks (photo above, name/stat line below). Same heroNameSize logic keeps a
// long surname on one line instead of fracturing it.
const fmt = (n: number) => n.toFixed(1);
const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

const heroNameSize = (name: string): string => {
  const longest = Math.max(...name.split(' ').map((w) => w.length));
  if (longest >= 11) return 'text-3xl';
  if (longest >= 9) return 'text-4xl';
  return 'text-5xl';
};

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
    [players]
  );

  const leaderboards = useMemo(
    () => CATEGORIES.map((cat) => ({
      ...cat,
      top: [...withStats].sort((a, b) => b.seasonStats![cat.key] - a.seasonStats![cat.key]).slice(0, 5),
    })),
    [withStats]
  );

  // Pre-season: no games yet → fall back to a ratings list.
  if (withStats.length === 0) {
    const topByOvr = (Object.values(players) as Player[]).filter((p) => !p.retired && !p.prospect).sort((a, b) => b.ovr - a.ovr).slice(0, 5);
    return (
      <ScrollView className="flex-1">
        <View className="px-4 py-6 gap-4">
          <PageHeader title="Líderes" />
          <Text className="text-sm text-slate-500 italic">
            As lideranças estatísticas aparecem assim que os primeiros jogos forem simulados. Por enquanto, os mais bem
            avaliados da liga:
          </Text>
          {topByOvr.map((p, i) => (
            <View key={p.id} className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 flex-row items-center gap-3">
              <Text className="text-2xl font-black text-slate-700 italic">#{i + 1}</Text>
              <View className="flex-1 min-w-0">
                <Text className="font-bold text-sm text-white" numberOfLines={1}>{p.name}</Text>
                <Text className="text-[10px] text-slate-500 font-bold uppercase">{p.ovr} OVR</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  const scoringLeader = leaderboards[0].top[0];
  const leaderTeam = teamOf.get(scoringLeader.id);
  const ls = scoringLeader.seasonStats!;
  const [first, ...rest] = scoringLeader.name.split(' ');

  return (
    <ScrollView className="flex-1">
      <View className="px-4 py-6 gap-6">
        <PageHeader title="Líderes" />

        {/* Scoring leader hero */}
        <View className="bg-slate-900 rounded-hero border border-slate-800 overflow-hidden">
          <View className="h-44 items-center justify-end bg-slate-800/40">
            <Image
              source={{ uri: getPlayerImageUrl(scoringLeader) }}
              placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
              style={{ width: 170, height: 176 }}
              contentFit="contain"
            />
          </View>
          <View className="p-5 gap-3">
            <View className="flex-row items-center gap-2 flex-wrap">
              <Text className="text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest" style={{ backgroundColor: accent.primary }}>
                Cestinha da Liga
              </Text>
              <Text className="text-slate-500 font-bold text-xs uppercase tracking-widest">{ls.gp} jogos</Text>
            </View>
            <Text className={`${heroNameSize(scoringLeader.name)} font-black tracking-tighter uppercase italic text-white`}>
              {first}
            </Text>
            <Text className={`${heroNameSize(scoringLeader.name)} font-black tracking-tighter uppercase italic`} style={{ color: accent.primary, marginTop: -8 }}>
              {rest.join(' ')}
            </Text>
            <View className="flex-row items-center gap-3">
              {leaderTeam ? <Image source={{ uri: getTeamLogoUrl(leaderTeam) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 32, height: 32 }} contentFit="contain" /> : null}
              <Text className="font-bold text-base uppercase italic tracking-tighter text-white flex-1" numberOfLines={1}>{leaderTeam?.name}</Text>
            </View>
            <View className="flex-row gap-7 pt-1">
              {([['PPG', ls.ppg], ['RPG', ls.rpg], ['APG', ls.apg]] as [string, number][]).map(([label, val]) => (
                <View key={label}>
                  <Text className="text-3xl font-black text-white">{fmt(val)}</Text>
                  <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Category leaderboards */}
        {leaderboards.map((board) => (
          <Card key={board.key} className="gap-3">
            <View className="flex-row items-baseline justify-between">
              <Text className="font-black text-sm uppercase tracking-tight text-white">{board.label}</Text>
              <Text className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{board.abbr}</Text>
            </View>
            {board.top.map((p, i) => {
              const t = teamOf.get(p.id);
              return (
                <View key={p.id} className="flex-row items-center gap-3">
                  <Text className="text-sm font-black w-4 text-center" style={{ color: i === 0 ? accent.primary : '#475569' }}>{i + 1}</Text>
                  <Image source={{ uri: getPlayerImageUrl(p) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1e293b' }} contentFit="cover" />
                  <View className="flex-1 min-w-0">
                    <Text className="text-xs font-bold text-white" numberOfLines={1}>{p.name}</Text>
                    <Text className="text-[9px] text-slate-500 font-bold uppercase tracking-widest" numberOfLines={1}>{t?.name}</Text>
                  </View>
                  <Text className="text-base font-black" style={{ color: i === 0 ? accent.primary : '#ffffff' }}>{fmt(p.seasonStats![board.key])}</Text>
                </View>
              );
            })}
          </Card>
        ))}
      </View>
    </ScrollView>
  );
};

export default LeagueLeaders;
