import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { Team, Player } from '../types';
import { getTeamLogoUrl, getTeamSalary, SALARY_CAP, getTeamNickname, conferenceLabel, getTeamAccent } from '../constants';
import { teamRating } from '../services/formService';
import { COLORS, INK, RADIUS, withAlpha } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import { MonoLabel, Stat } from '../components/ui/kit';
import PageHeader from '../components/PageHeader';

const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

// Franchise browser — taps through to TeamDetail. Same card treatment as the
// team picker (design 4b): each franchise wearing its own real color, washed
// out to near-black so thirty of them can sit side by side.
const TeamsList: React.FC<{ teams: Team[]; players: { [key: string]: Player }; onSelect: (teamId: string) => void }> = ({
  teams, players, onSelect,
}) => (
  <Screen heroHeight={132}>
    <HeroContent>
      <PageHeader eyebrow="A liga" title="Franquias" subtitle="Elencos e folha salarial de qualquer time." />
    </HeroContent>

    <Body top={16}>
      <View className="flex-row flex-wrap justify-between">
        {[...teams].sort((a, b) => a.powerRank - b.powerRank).map((t) => {
          const capSpace = SALARY_CAP - getTeamSalary(t, players);
          const accent = getTeamAccent(t.id);
          return (
            <Pressable
              key={t.id}
              onPress={() => onSelect(t.id)}
              className="active:opacity-75"
              style={{ width: '48.5%', marginBottom: 10 }}
            >
              <LinearGradient
                colors={[withAlpha(accent.primary, 0.28), COLORS.panel]}
                locations={[0, 0.75]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={{ borderRadius: RADIUS.card, padding: 13, borderWidth: 1, borderColor: COLORS.line, overflow: 'hidden' }}
              >
                <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accent.primary }} />
                <Image
                  source={{ uri: getTeamLogoUrl(t) }}
                  placeholder={{ uri: NBA_FALLBACK }}
                  style={{ width: 34, height: 34 }}
                  contentFit="contain"
                />
                <Text className="font-extrabold text-white" style={{ fontSize: 12.5, marginTop: 9 }} numberOfLines={1}>
                  {getTeamNickname(t)}
                </Text>
                <MonoLabel size={9.5} color={INK.meta} style={{ marginTop: 3, letterSpacing: 0 }} numberOfLines={1}>
                  {conferenceLabel(t)} · {t.wins ?? 0}-{t.losses ?? 0}
                </MonoLabel>
                <View className="flex-row items-center justify-between" style={{ marginTop: 9 }}>
                  <Stat size={12} color={capSpace >= 0 ? COLORS.goodSoft : COLORS.badSoft}>
                    {capSpace >= 0
                      ? `$${(capSpace / 1_000_000).toFixed(1)}M`
                      : `-$${Math.abs(capSpace / 1_000_000).toFixed(1)}M`}
                  </Stat>
                  <MonoLabel size={9.5} color={INK.faint} style={{ letterSpacing: 0 }}>
                    OVR {teamRating(t, players)}
                  </MonoLabel>
                </View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </Body>
  </Screen>
);

export default TeamsList;
