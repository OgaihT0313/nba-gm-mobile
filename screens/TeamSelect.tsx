import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Team, Player } from '../types';
import { getTeamLogoUrl, getTeamNickname, conferenceLabel, getTeamAccent, TEAM_TITLES } from '../constants';
import { teamRating, teamDifficulty, DIFFICULTY_LABEL, Difficulty } from '../services/formService';
import { COLORS, INK, RADIUS, tracking, withAlpha } from '../src/theme/tokens';
import { MonoLabel, HeroTitle, FilterRow } from '../components/ui/kit';

// Design 4b. All 30 franchises in one grid, each carrying its own real brand
// color — the last screen before the app commits to a single accent, so it's
// the one place all 30 appear at once. Still on the pre-team black palette
// (#050505 / #0d0d0d): color belongs to the franchise cards, not the chrome.

interface TeamSelectProps {
  teams: Team[];
  players: { [key: string]: Player };
  onSelect: (teamId: string) => void;
}

const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

const DIFF_TONE: Record<Difficulty, { bg: string; fg: string }> = {
  easy: { bg: withAlpha(COLORS.goodSoft, 0.16), fg: COLORS.goodSoft },
  medium: { bg: withAlpha(COLORS.warn, 0.16), fg: COLORS.warn },
  hard: { bg: withAlpha(COLORS.cta, 0.16), fg: COLORS.badSoft },
};

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'East', label: 'Leste' },
  { id: 'West', label: 'Oeste' },
  { id: 'easy', label: 'Fáceis' },
];

const TeamSelect: React.FC<TeamSelectProps> = ({ teams, players, onSelect }) => {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState('all');

  const rows = useMemo(() => {
    const list = teams.filter((t) => {
      if (filter === 'East' || filter === 'West') return t.conference === filter;
      if (filter === 'easy') return teamDifficulty(t) === 'easy';
      return true;
    });
    return [...list].sort((a, b) => a.powerRank - b.powerRank);
  }, [teams, filter]);

  return (
    <View className="flex-1" style={{ backgroundColor: '#050505' }}>
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 18 }}>
        <Text
          className="font-mono-bold"
          style={{ fontSize: 9.5, letterSpacing: tracking(9.5, 0.24), color: COLORS.cta, textTransform: 'uppercase' }}
        >
          Passo 1 de 1
        </Text>
        <HeroTitle size={30} style={{ marginTop: 9 }}>Escolha sua franquia</HeroTitle>
        <FilterRow items={FILTERS} value={filter} onChange={setFilter} style={{ marginTop: 15 }} />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row flex-wrap justify-between">
          {rows.map((t) => {
            const accent = getTeamAccent(t.id);
            const diff = teamDifficulty(t);
            const tone = DIFF_TONE[diff];
            const titles = TEAM_TITLES[t.id] ?? 0;

            return (
              <Pressable
                key={t.id}
                onPress={() => onSelect(t.id)}
                className="active:opacity-75"
                style={{ width: '48.5%', marginBottom: 10 }}
              >
                {/* The franchise color washes in from the top-left and fades to
                    near-black, so 30 cards stay legible side by side instead of
                    turning into 30 competing color blocks. */}
                <LinearGradient
                  colors={[withAlpha(accent.primary, 0.32), '#0d0d0d']}
                  locations={[0, 0.72]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={{
                    borderRadius: RADIUS.card,
                    padding: 13,
                    borderWidth: 1,
                    borderColor: '#1f1f1f',
                    overflow: 'hidden',
                  }}
                >
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accent.primary }} />
                  <Image
                    source={{ uri: getTeamLogoUrl(t) }}
                    placeholder={{ uri: NBA_FALLBACK }}
                    style={{ width: 34, height: 34 }}
                    contentFit="contain"
                    transition={120}
                  />
                  <Text className="font-extrabold text-white" style={{ fontSize: 12.5, marginTop: 9 }} numberOfLines={1}>
                    {getTeamNickname(t)}
                  </Text>
                  <MonoLabel size={9.5} color="rgba(255,255,255,0.42)" style={{ marginTop: 3, letterSpacing: 0 }} numberOfLines={1}>
                    {conferenceLabel(t)} · {titles} {titles === 1 ? 'título' : 'títulos'}
                  </MonoLabel>
                  <View className="flex-row items-center" style={{ gap: 6, marginTop: 9 }}>
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: tone.bg }}>
                      <MonoLabel size={8.5} color={tone.fg} style={{ letterSpacing: 0.4 }}>
                        {DIFFICULTY_LABEL[diff]}
                      </MonoLabel>
                    </View>
                    <MonoLabel size={9.5} color={INK.meta} style={{ letterSpacing: 0 }}>
                      OVR {teamRating(t, players)}
                    </MonoLabel>
                  </View>
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

export default TeamSelect;
