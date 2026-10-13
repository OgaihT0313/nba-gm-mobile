// Minha Carreira, step 1: who you are. Name and number, position and style,
// height and build, skin tone and personality -- each choice shown in the
// attributes it gives him, so the trade-offs (a taller guard shoots worse,
// a protector of the rim can't stretch the floor) are visible before he exists.
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';

import { COLORS, FONT } from '../../src/theme/tokens';
import { PERSONALITIES, type PersonalityId } from '../../services/personalityService';
import {
  CAREER_STYLES, HEIGHT_RANGE, SKIN_CHOICES, STARTING_OVR, attributesFor, defaultWeight, styleById,
} from '../../services/career/careerCreate';
import type { CareerCreation } from '../../services/career/careerTypes';
import { Page, Label, Title, Body, Box, Option, Stepper, Bar, Cta, Ghost, heightLabel } from './careerUi';

const POSITIONS: CareerCreation['position'][] = ['PG', 'SG', 'SF', 'PF', 'C'];
const POS_LABEL: Record<CareerCreation['position'], string> = { PG: 'Armador', SG: 'Ala-armador', SF: 'Ala', PF: 'Ala-pivô', C: 'Pivô' };
const ATTR_LABEL: Record<string, string> = {
  shooting: 'Arremesso', finishing: 'Finalização', playmaking: 'Armação', perimeterD: 'Def. perímetro',
  interiorD: 'Def. interior', rebounding: 'Rebote', athleticism: 'Atletismo',
};

const Input: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; label: string }> = ({ value, onChange, placeholder, label }) => (
  <TextInput
    accessibilityLabel={label}
    value={value}
    onChangeText={(v) => onChange(v.slice(0, 18))}
    placeholder={placeholder}
    placeholderTextColor={COLORS.dim}
    autoCapitalize="words"
    style={{ flex: 1, minWidth: 0, width: 10, height: 46, borderRadius: 12, backgroundColor: COLORS.sunken, paddingHorizontal: 12, fontFamily: FONT.cond700, fontSize: 18, color: COLORS.text }}
  />
);

const CareerCreateScreen: React.FC<{ onDone: (c: CareerCreation) => void; onBack: () => void }> = ({ onDone, onBack }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [number, setNumber] = useState(7);
  const [position, setPosition] = useState<CareerCreation['position']>('SG');
  const [style, setStyle] = useState(CAREER_STYLES[0].id);
  const [heightCm, setHeightCm] = useState(196);
  const [weightKg, setWeightKg] = useState(defaultWeight(196));
  const [skinTone, setSkinTone] = useState(SKIN_CHOICES[4]);
  const [personality, setPersonality] = useState<PersonalityId>('guerreiro');

  const styles = CAREER_STYLES.filter((s) => s.positions.includes(position));
  const pickPosition = (p: CareerCreation['position']) => {
    setPosition(p);
    const [lo, hi] = HEIGHT_RANGE[p];
    const h = Math.round((lo + hi) / 2);
    setHeightCm(h);
    setWeightKg(defaultWeight(h));
    if (!styleById(style).positions.includes(p)) setStyle(CAREER_STYLES.find((s) => s.positions.includes(p))!.id);
  };
  const setHeight = (h: number) => {
    const [lo, hi] = HEIGHT_RANGE[position];
    const next = Math.max(lo, Math.min(hi, h));
    setWeightKg((w) => w + (defaultWeight(next) - defaultWeight(heightCm)));
    setHeightCm(next);
  };

  const creation: CareerCreation = {
    firstName: firstName.trim(), lastName: lastName.trim(), number, position, style, heightCm, weightKg, skinTone, personality,
  };
  // A preview of the attributes (the real roll happens when he's created).
  const preview = useMemo(() => attributesFor(creation, STARTING_OVR), [position, style, heightCm]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = creation.firstName.length > 0 && creation.lastName.length > 0;

  return (
    <Page dock={<Cta label="Ir para o combine" sub="Pré-draft ›" onPress={() => onDone(creation)} disabled={!ready} />}>
      <View className="flex-row items-center justify-between">
        <Label>Minha carreira · criação</Label>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} className="active:opacity-70">
          <Label color={COLORS.textSoft}>‹ Voltar</Label>
        </Pressable>
      </View>
      <Title>Quem é você?</Title>
      <Body>Você tem 19 anos e vai para o draft. Escolha como joga: o estilo define onde você começa forte e onde vai ter que trabalhar.</Body>

      <Box>
        <Label>Nome</Label>
        <View className="flex-row" style={{ gap: 8 }}>
          <Input value={firstName} onChange={setFirstName} placeholder="Nome" label="Nome" />
          <Input value={lastName} onChange={setLastName} placeholder="Sobrenome" label="Sobrenome" />
        </View>
        <Label style={{ marginTop: 4 }}>Número da camisa</Label>
        <Stepper label="número" value={`#${number}`} onMinus={() => setNumber((n) => (n + 99) % 100)} onPlus={() => setNumber((n) => (n + 1) % 100)} />
      </Box>

      <Box>
        <Label>Posição</Label>
        <View className="flex-row flex-wrap" style={{ gap: 6 }}>
          {POSITIONS.map((p) => (
            <Option key={p} label={p} sub={POS_LABEL[p]} active={position === p} onPress={() => pickPosition(p)} style={{ flexGrow: 1, minWidth: 96 }} />
          ))}
        </View>
      </Box>

      <Box>
        <Label>Estilo de jogo</Label>
        <View style={{ gap: 6 }}>
          {styles.map((s) => (
            <Option key={s.id} label={s.label} sub={s.blurb} active={style === s.id} onPress={() => setStyle(s.id)} />
          ))}
        </View>
      </Box>

      <Box>
        <Label>Altura</Label>
        <Stepper label="altura" value={heightLabel(heightCm)} onMinus={() => setHeight(heightCm - 2)} onPlus={() => setHeight(heightCm + 2)} />
        <Body size={12.5}>Mais alto: rebote e defesa interior sobem; arremesso e atletismo caem.</Body>
        <Label style={{ marginTop: 4 }}>Peso</Label>
        <Stepper label="peso" value={`${weightKg} kg`} onMinus={() => setWeightKg((w) => Math.max(defaultWeight(heightCm) - 15, w - 2))} onPlus={() => setWeightKg((w) => Math.min(defaultWeight(heightCm) + 18, w + 2))} />
      </Box>

      <Box>
        <Label>Tom de pele</Label>
        <View className="flex-row flex-wrap" style={{ gap: 10 }}>
          {SKIN_CHOICES.map((c) => (
            <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Tom de pele ${c}`} aria-selected={skinTone === c} onPress={() => setSkinTone(c)}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c, borderWidth: skinTone === c ? 3 : 0, borderColor: COLORS.text }} />
          ))}
        </View>
      </Box>

      <Box>
        <Label>Personalidade</Label>
        <View style={{ gap: 6 }}>
          {(Object.keys(PERSONALITIES) as PersonalityId[]).map((id) => (
            <Option key={id} label={PERSONALITIES[id].label} sub={PERSONALITIES[id].blurb} active={personality === id} onPress={() => setPersonality(id)} />
          ))}
        </View>
      </Box>

      <Box>
        <Label>Como você chega</Label>
        <View style={{ gap: 7 }}>
          {Object.entries(preview).map(([k, v]) => (
            <Bar key={k} label={ATTR_LABEL[k]} value={v} color={styleById(style).strengths.includes(k as never) ? COLORS.good : k === styleById(style).weakness ? COLORS.warn : COLORS.text} />
          ))}
        </View>
        <Body size={12.5}>O seu potencial verdadeiro ninguém sabe ainda: nem você. Ele aparece com o tempo.</Body>
      </Box>
      <Ghost label="Cancelar" onPress={onBack} />
    </Page>
  );
};

export default CareerCreateScreen;
