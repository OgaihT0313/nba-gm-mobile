import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SeasonState } from '../types';
import { getTeamNickname, SALARY_CAP } from '../constants';
import { sortStandings } from '../services/scheduleService';
import { COLORS, FONT, type ThemeMode } from '../src/theme/tokens';
import { CtaButton, GhostButton, TeamBadge, StatStrip, BodyText } from '../components/ui/kit';
import BrandLogo from '../components/BrandLogo';
import { seasonLabelOf } from '../src/eraYear';
import { useDesktop } from '../components/desktop/useDesktop';

// Design 2a ("Transmissão"). No team color yet — black and white, with the two
// conference strokes as the only color. A saved career gets its own card;
// "Continuar" is the light CTA, "Nova carreira" the outline under it.

interface HomeProps {
  onStart: () => void;
  /** Present only when a save is in progress. */
  onContinue?: () => void;
  season: SeasonState | null;
  themeMode: ThemeMode;
  onThemeMode: (mode: ThemeMode) => void;
  /** Opens Minha Carreira, the other mode (its own save). */
  onCareer?: () => void;
}

const Home: React.FC<HomeProps> = ({ onStart, onContinue, season, themeMode, onThemeMode, onCareer }) => {
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  const userTeam = season?.teams.find((t) => t.id === season.userTeamId);
  const seasonNumber = (season?.gmLegacy.seasons ?? 0) + 1;
  // The season the save is in now, not the era it started in (it showed
  // "1990-91" on a save six seasons into the chain; device audit, 2026-10-18).
  const yearLabel = season ? seasonLabelOf(season) : '';
  const rank = season && userTeam && season.gamesPlayed > 0
    ? sortStandings(season.teams.filter((t) => t.conference === userTeam.conference), season.schedule)
      .findIndex((t) => t.id === userTeam.id) + 1
    : 0;

  const savedCard = season && userTeam ? (
    <View style={{ backgroundColor: COLORS.surface, borderRadius: 20, overflow: 'hidden' }}>
      <View className="flex-row justify-between items-center" style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted }}>CARREIRA SALVA</Text>
        <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted }}>
          {yearLabel} · DIA {season.gamesPlayed}
        </Text>
      </View>
      <View className="flex-row items-center" style={{ padding: desktop ? 18 : 16, gap: desktop ? 14 : 12 }}>
        <TeamBadge teamId={userTeam.id} width={desktop ? 56 : 48} height={desktop ? 56 : 48} fill={COLORS.lineStrong} />
        <View className="flex-1" style={{ gap: 2 }}>
          <Text style={{ fontFamily: FONT.cond800, fontSize: desktop ? 30 : 24, lineHeight: desktop ? 30 : 24, color: COLORS.text, textTransform: 'uppercase' }}>
            {getTeamNickname(userTeam)}
          </Text>
          <BodyText size={desktop ? 14 : 13}>
            {userTeam.wins ?? 0}–{userTeam.losses ?? 0}
            {rank ? ` · ${rank}º no ${userTeam.conference === 'East' ? 'Leste' : 'Oeste'}` : ` · temporada ${seasonNumber}`}
          </BodyText>
        </View>
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: COLORS.line, paddingVertical: desktop ? 10 : 8 }}>
        <StatStrip
          size={desktop ? 24 : 22}
          items={[
            { label: 'Títulos', value: season.gmLegacy.titles, color: season.gmLegacy.titles > 0 ? COLORS.gold : undefined },
            { label: 'Temporadas', value: season.gmLegacy.seasons },
            { label: 'Confiança', value: `${season.owner.confidence}%` },
          ]}
        />
      </View>
    </View>
  ) : null;

  const actions = season && userTeam && onContinue ? (
    <>
      <CtaButton label="Continuar" sub={getTeamNickname(userTeam)} onPress={onContinue} size={desktop ? 21 : 20} style={desktop ? { minHeight: 58 } : undefined} />
      <GhostButton label="Nova carreira" onPress={onStart} style={desktop ? { minHeight: 48 } : undefined} />
      <Text style={{ textAlign: 'center', fontFamily: FONT.body500, fontSize: desktop ? 12 : 11.5, color: COLORS.dim }}>Uma nova carreira apaga o save atual</Text>
    </>
  ) : (
    <CtaButton label="Nova carreira" onPress={onStart} size={desktop ? 21 : 20} style={desktop ? { minHeight: 58 } : undefined} />
  );

  // The other mode: a player, not a GM. Its own save, its own screens.
  const careerCard = onCareer ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Minha carreira"
      onPress={onCareer}
      className="active:opacity-80"
      style={{ backgroundColor: COLORS.surface, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, maxWidth: desktop ? 440 : undefined }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted }}>OUTRO MODO</Text>
        <Text style={{ fontFamily: FONT.cond800, fontSize: 24, lineHeight: 25, color: COLORS.text, textTransform: 'uppercase' }}>Minha carreira</Text>
        <BodyText size={13}>Crie um jogador, vá para o draft e conquiste o seu espaço na liga.</BodyText>
      </View>
      <Text style={{ fontFamily: FONT.cond800, fontSize: 26, color: COLORS.textSoft }}>›</Text>
    </Pressable>
  ) : null;

  const leagueData = (
    <View style={desktop ? { maxWidth: 440 } : undefined}>
      <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.dim, paddingBottom: 6 }}>DADOS DA LIGA</Text>
      <Row label="Elencos e ratings" value="2025-26 reais" />
      <Row label="Teto salarial" value={`$${(SALARY_CAP / 1_000_000).toFixed(1)}M`} />
      <Row label="Franquias" value="30" last />
      <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.dim, paddingTop: 18, paddingBottom: 8 }}>APARÊNCIA</Text>
      <ModeSwitch mode={themeMode} onChange={onThemeMode} />
    </View>
  );

  // PC: the brand on the left, the career on a 520px side panel.
  if (desktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: COLORS.bg }}>
        <View style={{ flex: 1, minWidth: 0, paddingTop: 96, paddingHorizontal: 96, paddingBottom: 72, justifyContent: 'space-between' }}>
          <View>
            <BrandLogo size={144} />
            <BodyText size={20} style={{ marginTop: 28 }}>Monte a franquia. Aguente o dono. Ganhe o anel.</BodyText>
          </View>
          <View style={{ gap: 24 }}>
            {careerCard}
            {leagueData}
          </View>
        </View>
        <View style={{ width: 520, backgroundColor: COLORS.navBg, borderLeftWidth: 1, borderLeftColor: COLORS.line, paddingTop: 96, paddingHorizontal: 48, paddingBottom: 72, justifyContent: 'space-between' }}>
          {savedCard ?? <View />}
          <View style={{ gap: 8 }}>{actions}</View>
        </View>
      </View>
    );
  }

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

        {savedCard}
        {careerCard}
        {leagueData}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, gap: 8 }}>
        {actions}
      </View>
    </View>
  );
};

/** Escuro | Claro, a two-way segmented control. */
const ModeSwitch: React.FC<{ mode: ThemeMode; onChange: (mode: ThemeMode) => void }> = ({ mode, onChange }) => (
  <View className="flex-row" style={{ backgroundColor: COLORS.surface2, borderRadius: 12, padding: 4, gap: 4 }}>
    {([['dark', 'Escuro'], ['light', 'Claro']] as const).map(([id, label]) => {
      const active = mode === id;
      return (
        <Pressable
          key={id}
          accessibilityRole="button"
          accessibilityLabel={`Modo ${label.toLowerCase()}`}
          aria-selected={active}
          onPress={() => onChange(id)}
          className="active:opacity-75"
          style={{ flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? COLORS.ctaFill : 'transparent' }}
        >
          <Text style={{ fontFamily: FONT.cond800, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', color: active ? COLORS.ctaInk : COLORS.muted }}>{label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const Row: React.FC<{ label: string; value: string; last?: boolean }> = ({ label, value, last }) => (
  <View className="flex-row justify-between" style={{ paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderBottomColor: COLORS.lineSoft }}>
    <Text style={{ fontFamily: FONT.body500, fontSize: 14, color: COLORS.muted }}>{label}</Text>
    <Text style={{ fontFamily: FONT.body600, fontSize: 14, color: COLORS.text }}>{value}</Text>
  </View>
);

export default Home;
