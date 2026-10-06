import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ERA_GROUPS, eraById, type EraGroup } from '../data/eras';
import { COLORS, FONT } from '../src/theme/tokens';
import { Eyebrow, HeroTitle, BodyText } from '../components/ui/kit';

// Design 2b ("Transmissão"). The live league as the one light card (the
// default); each era group as a surface row — decade, name, one line — that
// starts at the group's first season. The chevron opens level 2: pick the exact
// starting season inside the group.

interface EraSelectProps {
  onSelect: (eraId: string | null) => void;
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

const EraSelect: React.FC<EraSelectProps> = ({ onSelect }) => {
  const insets = useSafeAreaInsets();
  const [expandedGroup, setExpandedGroup] = useState<EraGroup | null>(null);

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
