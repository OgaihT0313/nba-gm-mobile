import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SeasonState } from '../types';
import { getTeamNickname, SALARY_CAP } from '../constants';
import { sortStandings } from '../services/scheduleService';
import { COLORS, FONT } from '../src/theme/tokens';
import { CtaButton, GhostButton, TeamBadge, StatStrip, BodyText } from '../components/ui/kit';
import BrandLogo from '../components/BrandLogo';

// Design 2a ("Transmissão"). No team color yet — black and white, with the two
// conference strokes as the only color. A saved career gets its own card;
// "Continuar" is the light CTA, "Nova carreira" the outline under it.

interface HomeProps {
  onStart: () => void;
  /** Present only when a save is in progress. */
  onContinue?: () => void;
  season: SeasonState | null;
}

const Home: React.FC<HomeProps> = ({ onStart, onContinue, season }) => {
  const insets = useSafeAreaInsets();
  const userTeam = season?.teams.find((t) => t.id === season.userTeamId);
  const seasonNumber = (season?.gmLegacy.seasons ?? 0) + 1;
  const y = 2025 + seasonNumber - 1;
  const yearLabel = season?.era?.seasonLabel ?? `${y}-${String(y + 1).slice(-2)}`;
  const rank = season && userTeam && season.gamesPlayed > 0
    ? sortStandings(season.teams.filter((t) => t.conference === userTeam.conference), season.schedule)
      .findIndex((t) => t.id === userTeam.id) + 1
    : 0;

  return (
    <View className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 28, paddingHorizontal: 20, paddingBottom: 12, gap: 26 }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <BrandLogo size={96} />
          <BodyText size={15} style={{ marginTop: 14 }}>Monte a franquia. Aguente o dono. Ganhe o anel.</BodyText>
        </View>

        {season && userTeam ? (
          <View style={{ backgroundColor: COLORS.surface, borderRadius: 20, overflow: 'hidden' }}>
            <View className="flex-row justify-between items-center" style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted }}>CARREIRA SALVA</Text>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted }}>
                {yearLabel} · DIA {season.gamesPlayed}
              </Text>
            </View>
            <View className="flex-row items-center" style={{ padding: 16, gap: 12 }}>
              <TeamBadge teamId={userTeam.id} width={48} height={48} fill={COLORS.lineStrong} />
              <View className="flex-1" style={{ gap: 2 }}>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 24, lineHeight: 24, color: COLORS.text, textTransform: 'uppercase' }}>
                  {getTeamNickname(userTeam)}
                </Text>
                <BodyText size={13}>
                  {userTeam.wins ?? 0}–{userTeam.losses ?? 0}
                  {rank ? ` · ${rank}º no ${userTeam.conference === 'East' ? 'Leste' : 'Oeste'}` : ` · temporada ${seasonNumber}`}
                </BodyText>
              </View>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: COLORS.line, paddingVertical: 8 }}>
              <StatStrip
                size={22}
                items={[
                  { label: 'Títulos', value: season.gmLegacy.titles, color: season.gmLegacy.titles > 0 ? COLORS.gold : undefined },
                  { label: 'Temporadas', value: season.gmLegacy.seasons },
                  { label: 'Confiança', value: `${season.owner.confidence}%` },
                ]}
              />
            </View>
          </View>
        ) : null}

        <View>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.dim, paddingBottom: 6 }}>DADOS DA LIGA</Text>
          <Row label="Elencos e ratings" value="2025-26 reais" />
          <Row label="Teto salarial" value={`$${(SALARY_CAP / 1_000_000).toFixed(1)}M`} />
          <Row label="Franquias" value="30" last />
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, gap: 8 }}>
        {season && userTeam && onContinue ? (
          <>
            <CtaButton label="Continuar" sub={getTeamNickname(userTeam)} onPress={onContinue} size={20} />
            <GhostButton label="Nova carreira" onPress={onStart} />
            <Text style={{ textAlign: 'center', fontFamily: FONT.body500, fontSize: 11.5, color: COLORS.dim }}>Uma nova carreira apaga o save atual</Text>
          </>
        ) : (
          <CtaButton label="Nova carreira" onPress={onStart} size={20} />
        )}
      </View>
    </View>
  );
};

const Row: React.FC<{ label: string; value: string; last?: boolean }> = ({ label, value, last }) => (
  <View className="flex-row justify-between" style={{ paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderBottomColor: COLORS.lineSoft }}>
    <Text style={{ fontFamily: FONT.body500, fontSize: 14, color: COLORS.muted }}>{label}</Text>
    <Text style={{ fontFamily: FONT.body600, fontSize: 14, color: COLORS.text }}>{value}</Text>
  </View>
);

export default Home;
