// Minha Carreira, step 2: the spring before the draft. The league plays out
// the season (it runs in the background, the bar at the top) while you go
// through the combine: two tests where you choose to play it safe or show
// off, and the interview. How the week goes moves how good you really are,
// a little, and how sure the teams are of you, more.
import React, { useState } from 'react';
import { View, Text } from 'react-native';

import { COLORS, FONT } from '../../src/theme/tokens';
import type { Player } from '../../types';
import {
  finishCombine, interviewScore, runCombineTest, type CombineChoice, type InterviewTone,
} from '../../services/career/careerCreate';
import type { CombineResult } from '../../services/career/careerTypes';
import { Page, Label, Title, Body, Box, Option, Cta } from './careerUi';

interface Props {
  prospect: Player;
  /** The league's season, 0-1, and what it's on. */
  progress: { frac: number; label: string; done: boolean };
  combine?: CombineResult;
  onCombine: (c: CombineResult) => void;
  onDraft: () => void;
}

const grade = (n: number) => (n >= 85 ? 'Excelente' : n >= 70 ? 'Bom' : n >= 55 ? 'Regular' : 'Ruim');
const gradeColor = (n: number) => (n >= 85 ? COLORS.good : n >= 70 ? COLORS.text : n >= 55 ? COLORS.warn : COLORS.bad);

const Score: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <View className="flex-row items-center justify-between">
    <Text style={{ fontFamily: FONT.cond700, fontSize: 15, color: COLORS.textSoft, textTransform: 'uppercase' }}>{label}</Text>
    <Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: gradeColor(value) }}>{value} · {grade(value)}</Text>
  </View>
);

const CareerPreDraftScreen: React.FC<Props> = ({ prospect, progress, combine, onCombine, onDraft }) => {
  const [shooting, setShooting] = useState<number | null>(combine?.shooting ?? null);
  const [athletic, setAthletic] = useState<number | null>(combine?.athletic ?? null);
  const a = prospect.attributes!;

  const doShooting = (c: CombineChoice) => setShooting(runCombineTest(a.shooting, c));
  const doAthletic = (c: CombineChoice) => setAthletic(runCombineTest(a.athleticism, c));
  const doInterview = (t: InterviewTone) => onCombine(finishCombine(shooting!, athletic!, interviewScore(t)));

  const ready = progress.done && !!combine;
  return (
    <Page dock={<Cta label="Noite do draft" sub={ready ? 'Começar ›' : progress.done ? 'Termine o combine' : 'A temporada ainda rola'} onPress={onDraft} disabled={!ready} />}>
      <Label>Pré-draft · {prospect.name}</Label>
      <Title>Combine</Title>
      <Box>
        <View className="flex-row justify-between">
          <Label>{progress.done ? 'Temporada encerrada' : 'A liga joga a temporada'}</Label>
          <Label color={COLORS.textSoft}>{progress.label}</Label>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.sunken, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(progress.frac * 100)}%`, height: '100%', backgroundColor: COLORS.text }} />
        </View>
        <Body size={12.5}>Os times vão escolher pela campanha desta temporada: os piores escolhem primeiro.</Body>
      </Box>

      <Box>
        <Label>1 · Arremesso parado</Label>
        {shooting === null ? (
          <View style={{ gap: 6 }}>
            <Option label="Jogar seguro" sub="Ritmo de treino, sem inventar. Quase sempre uma nota boa." active={false} onPress={() => doShooting('safe')} />
            <Option label="Mostrar alcance" sub="Arremessos lá de trás da linha. Ou impressiona, ou queima." active={false} onPress={() => doShooting('bold')} />
          </View>
        ) : <Score label="Arremesso" value={shooting} />}
      </Box>

      {shooting !== null ? (
        <Box>
          <Label>2 · Agilidade e salto</Label>
          {athletic === null ? (
            <View style={{ gap: 6 }}>
              <Option label="Técnica limpa" sub="Movimentos certinhos. Os números ficam na média." active={false} onPress={() => doAthletic('safe')} />
              <Option label="Explodir" sub="Tudo no limite. Um salto de destaque, ou um escorregão." active={false} onPress={() => doAthletic('bold')} />
            </View>
          ) : <Score label="Físico" value={athletic} />}
        </Box>
      ) : null}

      {athletic !== null ? (
        <Box>
          <Label>3 · Entrevista com os times</Label>
          {!combine ? (
            <View style={{ gap: 6 }}>
              <Option label="Humilde" sub="Fala de trabalho e de aprender. Ninguém se assusta." active={false} onPress={() => doInterview('humble')} />
              <Option label="Confiante" sub="Diz que vai ser titular logo. Alguns gostam, outros não." active={false} onPress={() => doInterview('confident')} />
              <Option label="Marrento" sub="Promete ser o melhor da classe. Ou conquista a sala, ou a perde." active={false} onPress={() => doInterview('brash')} />
            </View>
          ) : (
            <>
              <Score label="Entrevista" value={combine.interview} />
              <View style={{ height: 1, backgroundColor: COLORS.line, marginVertical: 4 }} />
              <Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: COLORS.text, textTransform: 'uppercase' }}>{combine.summary}</Text>
              <Body>{combine.ovrDelta > 0 ? `Você chega ao draft ${combine.ovrDelta} ponto${combine.ovrDelta > 1 ? 's' : ''} melhor do que entrou.` : combine.ovrDelta < 0 ? 'A semana te custou: você chega ao draft um pouco abaixo do que entrou.' : 'Você chega ao draft do jeito que entrou.'}</Body>
            </>
          )}
        </Box>
      ) : null}
    </Page>
  );
};

export default CareerPreDraftScreen;
