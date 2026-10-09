import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ERA_GROUPS, eraById, type EraGroup } from '../data/eras';
import { COLORS, FONT } from '../src/theme/tokens';
import { Eyebrow, HeroTitle, BodyText } from '../components/ui/kit';
import { useDesktop } from '../components/desktop/useDesktop';
import { Hover, BackLink } from '../components/desktop/kit';

// Design 2b ("Transmissão"). The live league as the one light card (the
// default); each era group as a surface row — decade, name, one line — that
// starts at the group's first season. The chevron opens level 2: pick the exact
// starting season inside the group.

interface EraSelectProps {
  onSelect: (eraId: string | null) => void;
  /** Back to Início (shown on PC, where the page has room for it). */
  onBack?: () => void;
}

/**
 * "1979-80 → 1989-90" → "1980s": the decade of the span's midpoint, so the
 * Kobe era (1998-99 → 2009-10) reads 2000s rather than the year it opens in.
 */
const decadeOf = (span: string) => {
  const years = span.match(/\d{4}/g)?.map(Number) ?? [];
  if (!years.length) return '';
  const mid = (years[0] + years[years.length - 1]) / 2;
  return `${Math.floor(mid / 10) * 10}s`;
};

const Row: React.FC<{ big: string; title: string; sub: string; onPress: () => void; onMore?: () => void }> = ({
  big, title, sub, onPress, onMore,
}) => (
  <View className="flex-row items-center" style={{ backgroundColor: COLORS.surface, borderRadius: 16 }}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="flex-1 flex-row items-center active:opacity-75"
      style={{ paddingVertical: 12, paddingLeft: 14, gap: 14 }}
    >
      <Text style={{ width: 64, fontFamily: FONT.cond800, fontSize: 24, lineHeight: 26, color: COLORS.dim }}>{big}</Text>
      <View className="flex-1" style={{ minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT.cond800, fontSize: 19, lineHeight: 20, color: COLORS.text, textTransform: 'uppercase' }}>{title}</Text>
        <BodyText size={12.5} numberOfLines={2}>{sub}</BodyText>
      </View>
    </Pressable>
    {onMore ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Escolher temporada inicial: ${title}`}
        onPress={onMore}
        hitSlop={6}
        className="active:opacity-60"
        style={{ width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontFamily: FONT.cond700, fontSize: 22, color: '#4A4950' }}>›</Text>
      </Pressable>
    ) : <View style={{ width: 14 }} />}
  </View>
);

const EraSelect: React.FC<EraSelectProps> = ({ onSelect, onBack }) => {
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  const [expandedGroup, setExpandedGroup] = useState<EraGroup | null>(null);

  // PC: the groups on the left, and level 2 — the seasons of the selected
  // group — embedded on the right instead of behind the chevron.
  if (desktop) {
    const sel = expandedGroup ?? ERA_GROUPS[0];
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ paddingTop: 40, paddingHorizontal: 64, paddingBottom: 24, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
          <View style={{ gap: 6 }}>
            {onBack ? <BackLink onPress={onBack} /> : null}
            <Eyebrow size={12}>Passo 1 de 2</Eyebrow>
            <HeroTitle size={48}>Escolha sua era</HeroTitle>
          </View>
          <BodyText size={13} color={COLORS.dim} style={{ maxWidth: 420, textAlign: 'right' }}>
            Clique numa era para ver as temporadas dela à direita. Fotos e títulos de franquia mostram o dado mais recente, mesmo numa era antiga.
          </BodyText>
        </View>
        <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', gap: 24, paddingHorizontal: 64, paddingBottom: 40 }}>
          <ScrollView style={{ width: 560, flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8 }}>
            <Hover onPress={() => onSelect(null)} accessibilityLabel="2025-26" hoverStyle={{ opacity: 0.9 }} style={{ backgroundColor: COLORS.ctaFill, borderRadius: 18, padding: 18, gap: 4 }}>
              <View className="flex-row justify-between">
                <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: 'rgba(11,11,13,0.6)' }}>LIGA ATUAL</Text>
                <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: 'rgba(11,11,13,0.6)' }}>PADRÃO</Text>
              </View>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 48, lineHeight: 48, color: COLORS.ctaInk }}>2025-26</Text>
              <Text style={{ fontFamily: FONT.body500, fontSize: 13, color: 'rgba(11,11,13,0.7)' }}>Elencos reais de hoje</Text>
            </Hover>
            {ERA_GROUPS.map((group) => {
              const on = group.id === sel.id;
              return (
                <Hover
                  key={group.id}
                  onPress={() => setExpandedGroup(group)}
                  selected={on}
                  accessibilityLabel={group.label}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16,
                    backgroundColor: on ? COLORS.surface2 : COLORS.surface, borderWidth: 1, borderColor: on ? COLORS.text : 'transparent',
                  }}
                >
                  <Text style={{ width: 72, fontFamily: FONT.cond800, fontSize: 26, lineHeight: 26, color: COLORS.dim }}>{decadeOf(group.spanLabel)}</Text>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text numberOfLines={1} style={{ fontFamily: FONT.cond800, fontSize: 20, lineHeight: 20, color: COLORS.text, textTransform: 'uppercase' }}>{group.label}</Text>
                    <BodyText size={12.5} numberOfLines={2}>{group.blurb}</BodyText>
                  </View>
                  <Text style={{ fontFamily: FONT.cond700, fontSize: 22, color: on ? COLORS.text : '#4A4950' }}>›</Text>
                </Hover>
              );
            })}
          </ScrollView>

          <View style={{ flex: 1, minWidth: 0, backgroundColor: COLORS.navBg, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20 }}>
            <View style={{ paddingTop: 20, paddingHorizontal: 22, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.line, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View>
                <Eyebrow>Temporada inicial · {sel.spanLabel}</Eyebrow>
                <HeroTitle size={32} style={{ marginTop: 4, lineHeight: 32 }}>{sel.label}</HeroTitle>
              </View>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1.2, color: COLORS.dim }}>{sel.seasonIds.length} TEMPORADAS</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, gap: 6 }}>
              {sel.seasonIds.map((eraId) => {
                const era = eraById(eraId);
                if (!era) return null;
                return (
                  <Hover key={era.id} onPress={() => onSelect(era.id)} accessibilityLabel={era.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.surface, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
                    <Text style={{ width: 64, fontFamily: FONT.cond800, fontSize: 24, lineHeight: 26, color: COLORS.dim }}>{era.seasonLabel.slice(2)}</Text>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text numberOfLines={1} style={{ fontFamily: FONT.cond800, fontSize: 18, lineHeight: 19, color: COLORS.text, textTransform: 'uppercase' }}>{era.label}</Text>
                      <BodyText size={12.5} numberOfLines={2}>{era.blurb}</BodyText>
                    </View>
                  </Hover>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </View>
    );
  }

  if (expandedGroup) {
    return (
      <View className="flex-1" style={{ backgroundColor: COLORS.bg }}>
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 20, paddingBottom: 16, gap: 6 }}>
          <Pressable accessibilityRole="button" onPress={() => setExpandedGroup(null)} className="active:opacity-60" hitSlop={8}>
            <Text style={{ fontFamily: FONT.cond700, fontSize: 14, letterSpacing: 1.4, color: COLORS.text }}>‹ VOLTAR</Text>
          </Pressable>
          <Eyebrow>Temporada inicial · {expandedGroup.spanLabel}</Eyebrow>
          <HeroTitle size={34}>{expandedGroup.label}</HeroTitle>
        </View>
        <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24, gap: 8 }} showsVerticalScrollIndicator={false}>
          {expandedGroup.seasonIds.map((eraId) => {
            const era = eraById(eraId);
            if (!era) return null;
            return <Row key={era.id} big={era.seasonLabel.slice(2)} title={era.label} sub={era.blurb} onPress={() => onSelect(era.id)} />;
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 20, paddingBottom: 16, gap: 6 }}>
        <Eyebrow>Passo 1 de 2</Eyebrow>
        <HeroTitle size={34}>Escolha sua era</HeroTitle>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24, gap: 8 }} showsVerticalScrollIndicator={false}>
        {/* The live league: the default, so the one inverted card. */}
        <Pressable accessibilityRole="button" accessibilityLabel="2025-26" onPress={() => onSelect(null)} className="active:opacity-80">
          <View style={{ backgroundColor: COLORS.ctaFill, borderRadius: 18, padding: 16, gap: 4 }}>
            <View className="flex-row justify-between">
              <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: 'rgba(11,11,13,0.6)' }}>LIGA ATUAL</Text>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: 'rgba(11,11,13,0.6)' }}>PADRÃO</Text>
            </View>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 40, lineHeight: 40, color: COLORS.ctaInk }}>2025-26</Text>
            <Text style={{ fontFamily: FONT.body500, fontSize: 13, color: 'rgba(11,11,13,0.7)' }}>Elencos reais de hoje</Text>
          </View>
        </Pressable>

        {ERA_GROUPS.map((group) => (
          <Row
            key={group.id}
            big={decadeOf(group.spanLabel)}
            title={group.label}
            sub={group.blurb}
            onPress={() => onSelect(group.seasonIds[0])}
            onMore={() => setExpandedGroup(group)}
          />
        ))}

        <BodyText size={12} color={COLORS.dim} style={{ marginTop: 6, paddingHorizontal: 4 }}>
          Toque numa era para começar na primeira temporada dela, ou no › para escolher a temporada inicial. Fotos e títulos de franquia mostram o dado mais recente, mesmo numa era antiga.
        </BodyText>
      </ScrollView>
    </View>
  );
};

export default EraSelect;
