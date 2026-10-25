import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SALARY_CAP } from '../constants';
import type { GmSlot, SaveSummary } from '../services/saveService';
import { COLORS, FONT, type ThemeMode } from '../src/theme/tokens';
import { CtaButton, GhostButton, BodyText } from '../components/ui/kit';
import BrandLogo from '../components/BrandLogo';
import { useDesktop } from '../components/desktop/useDesktop';

// Design 2a ("Transmissão"). No team color yet — black and white, with the two
// conference strokes as the only color. The three GM save slots get a card
// each; "Continuar" (the slot played last) is the light CTA, "Nova carreira"
// the outline under it and goes into the first empty slot.

interface HomeProps {
  /** One entry per slot, null when empty. */
  slots: (SaveSummary | null)[];
  activeSlot: GmSlot;
  onOpen: (slot: GmSlot) => void;
  onNew: (slot: GmSlot) => void;
  onDelete: (slot: GmSlot) => void;
  themeMode: ThemeMode;
  onThemeMode: (mode: ThemeMode) => void;
  /** Opens Minha Carreira, the other mode (its own save). */
  onCareer?: () => void;
}

const Home: React.FC<HomeProps> = ({ slots, activeSlot, onOpen, onNew, onDelete, themeMode, onThemeMode, onCareer }) => {
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  // Deleting takes a second tap on the same card.
  const [confirming, setConfirming] = useState<GmSlot | null>(null);
  const active = slots[activeSlot - 1];
  const firstEmpty = ([1, 2, 3] as GmSlot[]).find((n) => !slots[n - 1]);
  const anySave = slots.some(Boolean);

  const slotCards = anySave ? (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted }}>CARREIRAS SALVAS</Text>
      {([1, 2, 3] as GmSlot[]).map((n) => {
        const s = slots[n - 1];
        if (!s) {
          return (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityLabel={`Nova carreira no espaço ${n}`}
              onPress={() => onNew(n)}
              className="active:opacity-80"
              style={{ borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.lineStrong, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' }}
            >
              <Text style={{ flex: 1, fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1.5, color: COLORS.dim }}>ESPAÇO {n} · VAZIO</Text>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 14, letterSpacing: 1, color: COLORS.textSoft }}>NOVA CARREIRA +</Text>
            </Pressable>
          );
        }
        const isActive = n === activeSlot;
        const sure = confirming === n;
        const line = s.rank
          ? `${s.wins}–${s.losses} · ${s.rank}º no ${s.conference === 'East' ? 'Leste' : 'Oeste'}`
          : `${s.wins}–${s.losses} · temporada ${s.seasonNumber}`;
        // The card and its delete button sit side by side: a button inside a
        // button is invalid HTML on the web build.
        return (
          <View
            key={n}
            style={{ backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: isActive ? COLORS.lineStrong : 'transparent', paddingRight: 14, flexDirection: 'row', alignItems: 'center' }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Abrir a carreira do ${s.nickname}, espaço ${n}`}
              onPress={() => { setConfirming(null); onOpen(n); }}
              className="active:opacity-80"
              style={{ flex: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View style={{ width: 46, height: 46, borderRadius: 10, backgroundColor: COLORS.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 16, color: COLORS.text, letterSpacing: 0.4 }}>{s.tricode}</Text>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.4, color: COLORS.muted }}>
                  ESPAÇO {n} · {s.yearLabel} · DIA {s.gamesPlayed}{s.fired ? ' · DEMITIDO' : ''}
                </Text>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 21, lineHeight: 22, color: COLORS.text, textTransform: 'uppercase' }} numberOfLines={1}>{s.nickname}</Text>
                <BodyText size={12.5}>
                  {line} · {s.titles} {s.titles === 1 ? 'título' : 'títulos'} · dono {s.confidence}%
                </BodyText>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={sure ? `Confirmar: apagar o espaço ${n}` : `Apagar o espaço ${n}`}
              onPress={() => {
                if (sure) { setConfirming(null); onDelete(n); } else setConfirming(n);
              }}
              hitSlop={8}
              style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: sure ? COLORS.bad : 'transparent' }}
            >
              <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1, color: sure ? '#ffffff' : COLORS.dim }}>{sure ? 'APAGAR?' : 'APAGAR'}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  ) : null;

  const big = desktop ? { minHeight: 58 } : undefined;
  const actions = active ? (
    <>
      <CtaButton label="Continuar" sub={active.nickname} onPress={() => onOpen(activeSlot)} size={desktop ? 21 : 20} style={big} />
      {firstEmpty ? (
        <GhostButton label="Nova carreira" onPress={() => onNew(firstEmpty)} style={desktop ? { minHeight: 48 } : undefined} />
      ) : (
        <Text style={{ textAlign: 'center', fontFamily: FONT.body500, fontSize: desktop ? 12 : 11.5, color: COLORS.dim }}>Os 3 espaços estão ocupados: apague um para começar outra carreira</Text>
      )}
    </>
  ) : firstEmpty ? (
    <CtaButton label="Nova carreira" onPress={() => onNew(firstEmpty)} size={desktop ? 21 : 20} style={big} />
  ) : (
    <Text style={{ textAlign: 'center', fontFamily: FONT.body500, fontSize: 12, color: COLORS.dim }}>Toque numa carreira para continuar</Text>
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
          {slotCards ?? <View />}
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

        {slotCards}
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
