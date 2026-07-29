import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { PlayoffState, PlayoffSeries, Team } from '../types';
import { getTeamLogoUrl, getTeamTricode } from '../constants';
import { useTheme } from '../src/theme/ThemeProvider';
import Icon from './Icon';

// RN port of the bracket. The web laid this out at min-width 1200px inside an
// overflow-x container; here it's a horizontal ScrollView (same "arraste para o
// lado" affordance). The web's color-mix() winner highlight becomes an 8-digit
// alpha hex off the live accent.
const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

const Matchup: React.FC<{ team: Team | null; seed: number | string; score?: string; isTop: boolean; accent: string }> = ({ team, seed, score, isTop, accent }) => {
  if (!team) return <View className="h-10 bg-slate-900/20 rounded-xl border border-slate-800/50 mb-1" />;

  const scoreParts = score ? score.split('-').map(Number) : [0, 0];
  const teamScore = isTop ? scoreParts[0] : scoreParts[1];
  const opponentScore = isTop ? scoreParts[1] : scoreParts[0];
  const isWinner = !!score && teamScore > opponentScore;
  const isLoser = !!score && teamScore < opponentScore;

  return (
    <View
      className={`flex-row items-center justify-between p-2 rounded-xl border ${isTop ? 'mb-1' : ''} ${isLoser ? 'bg-slate-900/40 border-slate-800/50 opacity-50' : 'bg-slate-900/60 border-slate-800/50'}`}
      style={isWinner ? { backgroundColor: `${accent}33`, borderColor: `${accent}4d` } : undefined}
    >
      <View className="flex-row items-center gap-2 flex-1 min-w-0">
        <Text className="text-[8px] font-black text-slate-500 w-4">[{seed}]</Text>
        <Image source={{ uri: getTeamLogoUrl(team) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 20, height: 20 }} contentFit="contain" />
        {/* Tricode, not the full name: this card is only 192px wide, so anything
            past ~9 chars ("Denver Nuggets") already clipped mid-word — every
            team.id is already a real 3-letter tricode, same fix broadcasts use. */}
        <Text className="text-xs font-black text-white uppercase tracking-tight italic flex-1">{getTeamTricode(team)}</Text>
      </View>
      {score ? (
        <Text className="font-mono-bold text-xs" style={{ color: isWinner ? accent : '#64748b' }}>{teamScore}</Text>
      ) : null}
    </View>
  );
};

// Seeds 1-6 keep their true regular-season rank; a play-in survivor is
// relabeled 7 or 8 per NBA convention once they reach Round 1.
const seedWithinConference = (conf: PlayoffState['east'], teamId: string): number => {
  const topSixIndex = conf.initialSeeds.slice(0, 6).findIndex((t) => t.id === teamId);
  if (topSixIndex !== -1) return topSixIndex + 1;
  if (conf.playIn?.sevenEight.w?.id === teamId) return 7;
  if (conf.playIn?.finalSeed.w?.id === teamId) return 8;
  const rawIndex = conf.initialSeeds.findIndex((t) => t.id === teamId);
  return rawIndex !== -1 ? rawIndex + 1 : -1;
};

const Series: React.FC<{ series: PlayoffSeries; playoffState: PlayoffState; conference: string; round: string; accent: string }> = ({ series, playoffState, conference, round, accent }) => {
  const [team1, team2] = series.m;

  const getSeed = (teamId?: string) => {
    if (!teamId) return '?';
    if (conference === 'east' || conference === 'west') {
      const conf = conference === 'east' ? playoffState.east : playoffState.west;
      if (round === 'playin') {
        const idx = conf.initialSeeds.findIndex((t) => t.id === teamId);
        return idx !== -1 ? idx + 1 : '?';
      }
      const seed = seedWithinConference(conf, teamId);
      return seed !== -1 ? seed : '?';
    }
    const eastSeed = seedWithinConference(playoffState.east, teamId);
    if (eastSeed !== -1) return eastSeed;
    const westSeed = seedWithinConference(playoffState.west, teamId);
    return westSeed !== -1 ? westSeed : '?';
  };

  return (
    <View className="w-48 p-3 bg-slate-950/40 rounded-2xl border border-slate-800/50">
      <Matchup team={team1} seed={getSeed(team1?.id)} score={series.s} isTop accent={accent} />
      <Matchup team={team2} seed={getSeed(team2?.id)} score={series.s} isTop={false} accent={accent} />
    </View>
  );
};

const Round: React.FC<{ matchups: PlayoffSeries[]; playoffState: PlayoffState; round: string; conference: string; accent: string }> = ({ matchups, playoffState, round, conference, accent }) => (
  <View className="justify-around gap-6">
    {matchups.map((series, index) => (
      <Series key={index} series={series} playoffState={playoffState} round={round} conference={conference} accent={accent} />
    ))}
  </View>
);

const ConferenceBracket: React.FC<{ conference: PlayoffState['east']; confKey: 'east' | 'west'; playoffState: PlayoffState; accent: string }> = ({ conference, confKey, playoffState, accent }) => {
  if (!conference.bracket) return null;
  const showPlayIn = conference.playIn && conference.bracket.round1.length === 0;

  if (showPlayIn) {
    return (
      <View className="gap-2">
        <Text className="text-center text-[9px] font-black uppercase tracking-widest text-amber-500 mb-2">Play-In</Text>
        <Round
          matchups={[conference.playIn!.sevenEight, conference.playIn!.nineTen, conference.playIn!.finalSeed]}
          round="playin"
          conference={confKey}
          playoffState={playoffState}
          accent={accent}
        />
      </View>
    );
  }

  // The east half is mirrored so both conferences funnel inward toward the
  // Finals — round 1 on the outside, conference final adjacent to the middle.
  // Without this the east reads inside-out (its round 1 touching the Finals).
  return (
    <View className={`gap-6 ${confKey === 'west' ? 'flex-row' : 'flex-row-reverse'}`}>
      <Round matchups={conference.bracket.round1} round="round1" conference={confKey} playoffState={playoffState} accent={accent} />
      <Round matchups={conference.bracket.round2} round="round2" conference={confKey} playoffState={playoffState} accent={accent} />
      <Round matchups={conference.bracket.round3} round="round3" conference={confKey} playoffState={playoffState} accent={accent} />
    </View>
  );
};

const PlayoffBracket: React.FC<{ playoffState: PlayoffState | null }> = ({ playoffState }) => {
  const { accent } = useTheme();
  if (!playoffState) return null;

  return (
    <View>
      <Text className="text-center text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">
        ← Arraste para o lado para ver o chaveamento completo →
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, gap: 24, alignItems: 'center' }}>
        {/* Western */}
        <View className="gap-4">
          <Text className="text-center text-xs font-black uppercase tracking-widest text-red-500">Western Conference</Text>
          <ConferenceBracket conference={playoffState.west} confKey="west" playoffState={playoffState} accent={accent.primary} />
        </View>

        {/* Finals */}
        <View className="items-center gap-6">
          <View className="items-center gap-2">
            <View className="w-16 h-16 bg-amber-500 rounded-full items-center justify-center border-4 border-slate-950">
              <Icon name="awards" size={28} color="#020617" strokeWidth={2} />
            </View>
            <Text className="text-xl font-black italic uppercase tracking-tighter text-white">NBA Finals</Text>
          </View>
          {playoffState.finals ? (
            <Series series={playoffState.finals} round="finals" conference="finals" playoffState={playoffState} accent={accent.primary} />
          ) : (
            <View className="w-48 h-24 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800 items-center justify-center">
              <Text className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Aguardando Finalistas</Text>
            </View>
          )}
        </View>

        {/* Eastern */}
        <View className="gap-4">
          <Text className="text-center text-xs font-black uppercase tracking-widest text-sky-500">Eastern Conference</Text>
          <ConferenceBracket conference={playoffState.east} confKey="east" playoffState={playoffState} accent={accent.primary} />
        </View>
      </ScrollView>
    </View>
  );
};

export default PlayoffBracket;
