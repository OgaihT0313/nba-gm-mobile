import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ERA_GROUPS, eraById, type EraGroup } from '../data/eras';
import { getEraVisual } from '../src/theme/eraVisuals';
import { COLORS, INK, RADIUS, tracking } from '../src/theme/tokens';
import { MonoLabel, HeroTitle } from '../components/ui/kit';

// Design 4a-bis, reworked into a 2-level MyEras-style pick (NBA 2K's "MyEras"
// mode is the direct reference — see data/eras/index.ts's EraGroup comment).
// Sits between Home and TeamSelect, on the same pre-team black/white palette.
// `null` = today's live snapshot, the default and first card at level 1;
// every ERA_GROUPS card is a single tap into that group's iconic/default
// season (ERA_GROUPS[].seasonIds[0]) — the same 1-tap flow the real MyEras
// uses. A secondary "escolher temporada inicial" affordance drops into level
// 2, the flat per-season list this screen used to be entirely — nothing from
// that granularity is lost, it's just a level deeper now.

interface EraSelectProps {
  onSelect: (eraId: string | null) => void;
}

const EraCard: React.FC<{
  eyebrow: string;
  title: string;
  blurb: string;
  accentColor?: string;
  onPress: () => void;
}> = ({ eyebrow, title, blurb, accentColor, onPress }) => (
  <Pressable onPress={onPress} className="active:opacity-75">
    <View
      style={{
        backgroundColor: '#0e0e0e',
        borderWidth: 1,
        borderColor: '#232323',
        borderRadius: RADIUS.card,
        padding: 18,
        overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accentColor ?? COLORS.cta }} />
      <MonoLabel size={9} color={accentColor ?? COLORS.cta} style={{ letterSpacing: tracking(9, 0.24) }}>
        {eyebrow}
      </MonoLabel>
      <HeroTitle size={22} style={{ marginTop: 8 }} numberOfLines={1} adjustsFontSizeToFit>
        {title}
      </HeroTitle>
      <Text style={{ fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>
        {blurb}
      </Text>
    </View>
  </Pressable>
);

const EraGroupCard: React.FC<{
  group: EraGroup;
  onStart: () => void;
  onExpand: () => void;
}> = ({ group, onStart, onExpand }) => {
  const visual = getEraVisual(group.visualId);
  const accentColor = visual?.accentPrimary ?? COLORS.cta;
  return (
    <View
      style={{
        backgroundColor: '#0e0e0e',
        borderWidth: 1,
        borderColor: '#232323',
        borderRadius: RADIUS.card,
        padding: 18,
        overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accentColor }} />
      <Pressable onPress={onStart} className="active:opacity-75">
        <MonoLabel size={9} color={accentColor} style={{ letterSpacing: tracking(9, 0.24) }}>
          {`Era · ${group.spanLabel}`}
        </MonoLabel>
        <HeroTitle size={24} style={{ marginTop: 8 }} numberOfLines={1} adjustsFontSizeToFit>
          {group.label}
        </HeroTitle>
        <Text style={{ fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>
          {group.blurb}
        </Text>
      </Pressable>
      <Pressable onPress={onExpand} className="active:opacity-60" style={{ marginTop: 12 }}>
        <MonoLabel size={9} color={INK.faint} style={{ letterSpacing: tracking(9, 0.18) }}>
          Escolher temporada inicial ›
        </MonoLabel>
      </Pressable>
    </View>
  );
};

const EraSelect: React.FC<EraSelectProps> = ({ onSelect }) => {
  const insets = useSafeAreaInsets();
  const [expandedGroup, setExpandedGroup] = useState<EraGroup | null>(null);

  if (expandedGroup) {
    const visual = getEraVisual(expandedGroup.visualId);
    return (
      <View className="flex-1" style={{ backgroundColor: '#050505' }}>
        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 18 }}>
          <Pressable onPress={() => setExpandedGroup(null)} className="active:opacity-60">
            <MonoLabel size={9.5} color={visual?.accentPrimary ?? COLORS.cta} style={{ letterSpacing: tracking(9.5, 0.24) }}>
              ‹ Voltar
            </MonoLabel>
          </Pressable>
          <HeroTitle size={28} style={{ marginTop: 9 }}>{expandedGroup.label}</HeroTitle>
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: 'rgba(255,255,255,0.45)', marginTop: 10 }}>
            Escolha exatamente onde nessa era sua carreira de GM começa.
          </Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 24, gap: 10 }}
          showsVerticalScrollIndicator={false}
        >
          {expandedGroup.seasonIds.map((eraId) => {
            const era = eraById(eraId);
            if (!era) return null;
            return (
              <EraCard
                key={era.id}
                eyebrow={`Temporada · ${era.seasonLabel}`}
                title={era.label}
                blurb={era.blurb}
                accentColor={visual?.accentPrimary}
                onPress={() => onSelect(era.id)}
              />
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#050505' }}>
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 18 }}>
        <Text
          className="font-mono-bold"
          style={{ fontSize: 9.5, letterSpacing: tracking(9.5, 0.24), color: COLORS.cta, textTransform: 'uppercase' }}
        >
          Passo 1 de 2
        </Text>
        <HeroTitle size={30} style={{ marginTop: 9 }}>Escolha sua era</HeroTitle>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: 'rgba(255,255,255,0.45)', marginTop: 10 }}>
          De onde a sua carreira de GM começa. O resto do jogo — draft, agência livre, trocas — funciona igual em qualquer era.
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 24, gap: 10 }}
        showsVerticalScrollIndicator={false}
      >
        <EraCard
          eyebrow="Temporada atual"
          title="2025-26"
          blurb="Elenco e ratings reais de hoje — a experiência padrão do jogo."
          onPress={() => onSelect(null)}
        />

        {ERA_GROUPS.map((group) => (
          <EraGroupCard
            key={group.id}
            group={group}
            onStart={() => onSelect(group.seasonIds[0])}
            onExpand={() => setExpandedGroup(group)}
          />
        ))}

        <MonoLabel size={9} color={INK.faint} style={{ marginTop: 4, letterSpacing: 0, paddingHorizontal: 2 }}>
          Fotos e títulos de franquia mostram o dado mais recente, mesmo numa era antiga.
        </MonoLabel>
      </ScrollView>
    </View>
  );
};

export default EraSelect;
