import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ERAS } from '../data/eras';
import { COLORS, INK, RADIUS, tracking } from '../src/theme/tokens';
import { MonoLabel, HeroTitle } from '../components/ui/kit';

// Design 4a-bis. Sits between Home and TeamSelect, on the same pre-team
// black/white palette (no accent exists yet — see TeamSelect's own note on
// this) — picking an era is a decision made BEFORE picking a franchise, not
// a per-franchise thing. `null` = today's live snapshot, the default and
// first card; every other card is a historical starting point from
// data/eras/index.ts.

interface EraSelectProps {
  onSelect: (eraId: string | null) => void;
}

const EraCard: React.FC<{
  eyebrow: string;
  title: string;
  blurb: string;
  onPress: () => void;
}> = ({ eyebrow, title, blurb, onPress }) => (
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
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: COLORS.cta }} />
      <MonoLabel size={9} color={COLORS.cta} style={{ letterSpacing: tracking(9, 0.24) }}>
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

const EraSelect: React.FC<EraSelectProps> = ({ onSelect }) => {
  const insets = useSafeAreaInsets();

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

        {ERAS.map((era) => (
          <EraCard
            key={era.id}
            eyebrow={`Era histórica · ${era.seasonLabel}`}
            title={era.label}
            blurb={era.blurb}
            onPress={() => onSelect(era.id)}
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
