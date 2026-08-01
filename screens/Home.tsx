import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SeasonState } from '../types';
import { getTeamLogoUrl, getTeamNickname, SALARY_CAP } from '../constants';
import { COLORS, INK, RADIUS, tracking } from '../src/theme/tokens';
import { MonoLabel, HeroTitle, Stat, CtaButton } from '../components/ui/kit';

// Design 4a. This and the team picker are the only two screens that exist
// BEFORE there is a franchise, so there is no accent to theme with — the rule
// the redesign sets is that the home screen stays black and white with a single
// red, and color only arrives as a reward when you pick a team (see
// TeamConfirm). The palette here is deliberately NOT the #06080f/#0d1526 system
// ramp: it's near-black #050505 with #0e0e0e cards, so the moment the app gains
// franchise navy one screen later actually reads as a change.

interface HomeProps {
  onStart: () => void;
  /** Present only when a save is in progress. */
  onContinue?: () => void;
  season: SeasonState | null;
}

const CARD = { backgroundColor: '#0e0e0e', borderWidth: 1, borderColor: '#232323', borderRadius: RADIUS.card } as const;

const Home: React.FC<HomeProps> = ({ onStart, onContinue, season }) => {
  const insets = useSafeAreaInsets();
  const userTeam = season?.teams.find((t) => t.id === season.userTeamId);
  const seasonNumber = (season?.gmLegacy.seasons ?? 0) + 1;

  return (
    <View className="flex-1" style={{ backgroundColor: '#050505' }}>
      {/* The single red in the whole screen, as a glow rather than a fill. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="homeGlow" cx="20%" cy="8%" r="75%">
              <Stop offset="0" stopColor={COLORS.cta} stopOpacity={0.22} />
              <Stop offset="1" stopColor={COLORS.cta} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#homeGlow)" />
        </Svg>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 34, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: 22 }}>
          <Text
            className="font-mono-bold"
            style={{ fontSize: 9.5, letterSpacing: tracking(9.5, 0.3), color: COLORS.cta, textTransform: 'uppercase' }}
          >
            Simulador de carreira
          </Text>
          <HeroTitle size={64} style={{ marginTop: 18, lineHeight: 55, letterSpacing: -3.2 }}>
            NBA{'\n'}GM
          </HeroTitle>
          <Text style={{ fontSize: 13, lineHeight: 20, color: 'rgba(255,255,255,0.5)', marginTop: 20, maxWidth: 280 }}>
            Assuma uma franquia real, monte o elenco, sobreviva à diretoria e levante o troféu.
          </Text>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 30, gap: 10 }}>
          {/* Save in progress — the one card that isn't chrome. */}
          {season && userTeam && onContinue ? (
            <Pressable onPress={onContinue} className="active:opacity-80">
              <View style={[CARD, { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                <Image source={{ uri: getTeamLogoUrl(userTeam) }} style={{ width: 40, height: 40 }} contentFit="contain" />
                <View style={{ flex: 1 }}>
                  <MonoLabel size={8.5} color={INK.meta}>Continuar</MonoLabel>
                  <Text className="font-extrabold text-white" style={{ fontSize: 13.5, marginTop: 3 }} numberOfLines={1}>
                    {getTeamNickname(userTeam)} · Temporada {seasonNumber}
                  </Text>
                  <MonoLabel size={10} color={INK.meta} style={{ marginTop: 3, letterSpacing: 0 }}>
                    {userTeam.wins ?? 0}-{userTeam.losses ?? 0} · Jogo {season.gamesPlayed} de 82
                  </MonoLabel>
                </View>
                <View
                  style={{
                    width: 30, height: 30, borderRadius: RADIUS.pill, backgroundColor: '#1c1c1c',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Text className="font-extrabold text-white" style={{ fontSize: 14, lineHeight: 17 }}>›</Text>
                </View>
              </View>
            </Pressable>
          ) : null}

          {/* Career record, only meaningful once a save exists. */}
          {season ? (
            <View className="flex-row" style={{ gap: 10 }}>
              <Tile value={String(season.gmLegacy.titles)} label="Títulos" color={season.gmLegacy.titles > 0 ? COLORS.warn : '#fff'} />
              <Tile value={String(season.gmLegacy.seasons)} label="Temporadas" />
              <Tile value={`${season.owner.confidence}%`} label="Confiança" color={season.owner.confidence >= 60 ? COLORS.goodSoft : COLORS.warn} />
            </View>
          ) : null}

          <View style={[CARD, { padding: 14, gap: 9 }]}>
            <MonoLabel size={8.5} color={INK.meta}>Dados da liga</MonoLabel>
            <Row label="Elencos e ratings" value="2025-26 reais" />
            <Row label="Teto salarial" value={`$${(SALARY_CAP / 1_000_000).toFixed(1)}M`} />
            <Row label="Franquias" value="30" />
            <Text style={{ fontSize: 10.5, lineHeight: 15, color: 'rgba(255,255,255,0.32)', marginTop: 4 }}>
              Temporada completa: 82 jogos, play-in, playoffs, prêmios, draft e agência livre.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: 20, paddingTop: 4 }}>
        <CtaButton label="Nova carreira" onPress={onStart} size={16} />
        {season ? (
          <Text style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 12 }} className="font-semibold">
            Isso apaga o save atual
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const Tile: React.FC<{ value: string; label: string; color?: string }> = ({ value, label, color = '#fff' }) => (
  <View style={[CARD, { flex: 1, padding: 14 }]}>
    <Stat size={22} color={color} fit>{value}</Stat>
    <MonoLabel size={8.5} color={INK.meta} style={{ marginTop: 4, letterSpacing: tracking(8.5, 0.14) }} numberOfLines={1}>
      {label}
    </MonoLabel>
  </View>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View className="flex-row justify-between">
    <Text className="font-semibold" style={{ fontSize: 11, color: '#d4d4d4' }}>{label}</Text>
    <Text className="font-mono" style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{value}</Text>
  </View>
);

export default Home;
