// Minha Carreira, the legacy (PLANO-CARREIRA.md, fase 4): the Hall of Fame
// meter, your place among the careers the league holds, the body's warnings,
// the retirement button, and the screen after it.
import React, { useState } from 'react';
import { View, Text } from 'react-native';

import { COLORS, FONT } from '../../src/theme/tokens';
import { getTeamNickname } from '../../constants';
import type { CareerState } from '../../services/career/careerTypes';
import { me } from '../../services/career/careerLeague';
import { hallOfFameProgress, legendRanks, bodyWarning, canRetire } from '../../services/career/careerLegacy';
import { Page, Label, Title, Body, Box, Cta, Ghost } from './careerUi';

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');

/** On the Carreira tab: Hall of Fame, the legends, the body, the button. */
export const LegacyBoxes: React.FC<{ career: CareerState; onRetire: () => void }> = ({ career, onRetire }) => {
  const [confirm, setConfirm] = useState(false);
  const hof = hallOfFameProgress(career);
  const ranks = legendRanks(career);
  const warn = bodyWarning(career);
  return (
    <>
      <Box>
        <View className="flex-row items-center justify-between">
          <Label>Hall da Fama</Label>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 14, color: hof.frac >= 1 ? COLORS.gold : COLORS.text }}>{hof.label}</Text>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.sunken, overflow: 'hidden' }}>
          <View style={{ width: `${hof.frac * 100}%`, height: '100%', backgroundColor: hof.frac >= 1 ? COLORS.gold : COLORS.text }} />
        </View>
        <Body size={12.5}>{hof.score.toFixed(1)} de {hof.needed} pontos. Conta MVP, MVP das Finais, Defensor do Ano, All-NBA, All-Star, títulos e pontos na carreira, como o Hall da liga. Atualiza no fim de cada temporada.</Body>
      </Box>
      <Box>
        <Label>Entre as carreiras da liga</Label>
        {ranks.map((r) => (
          <View key={r.stat} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: COLORS.line }}>
            <View className="flex-row justify-between">
              <Text style={{ fontFamily: FONT.cond800, fontSize: 16, color: COLORS.text }}>{r.label}: {fmt(r.total)}</Text>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 16, color: r.rank <= 10 ? COLORS.gold : COLORS.textSoft }}>{r.rank}º</Text>
            </View>
            {r.next ? <Body size={12.5}>Próximo: {r.next.name}, {fmt(r.next.total)} ({fmt(r.next.total - r.total)} a mais)</Body> : <Body size={12.5} color={COLORS.gold}>Ninguém na liga tem mais.</Body>}
          </View>
        ))}
        <Body size={12}>Carreiras reais dos jogadores em atividade e as que se formaram neste save.</Body>
      </Box>
      {warn ? (
        <Box highlight={COLORS.warn}>
          <Label color={COLORS.warn}>O corpo avisa</Label>
          <Body color={COLORS.text}>{warn}</Body>
        </Box>
      ) : null}
      {canRetire(career) ? (
        <Box>
          <Label>Aposentadoria</Label>
          <Body>A decisão é sua. Entre uma temporada e outra, você pode encerrar a carreira.</Body>
          {confirm ? (
            <View style={{ gap: 8 }}>
              <Body color={COLORS.warn}>Não tem volta. Encerrar a carreira agora?</Body>
              <View className="flex-row" style={{ gap: 8 }}>
                <Ghost label="Aposentar" onPress={onRetire} style={{ flex: 1 }} />
                <Ghost label="Ainda não" onPress={() => setConfirm(false)} style={{ flex: 1 }} />
              </View>
            </View>
          ) : <Ghost label="Encerrar a carreira" onPress={() => setConfirm(true)} />}
        </Box>
      ) : null}
    </>
  );
};

/** After the last game: the career, summed up. */
export const RetiredScreen: React.FC<{ career: CareerState; onNew: () => void; onExit: () => void }> = ({ career, onNew, onExit }) => {
  const p = me(career)!;
  const r = career.retirement;
  const c = p.career;
  const honors = career.seasons.flatMap((s) => s.honors);
  const count = (h: string) => honors.filter((x) => x === h).length;
  const teams = [...new Set(career.seasons.map((s) => s.teamId))];
  const nick = (id: string) => getTeamNickname(career.league.teams.find((t) => t.id === id));
  return (
    <Page dock={<View style={{ gap: 8 }}><Cta label="Nova carreira" onPress={onNew} /><Ghost label="Início" onPress={onExit} /></View>}>
      <Label>Fim de carreira · {r?.label}</Label>
      <Title size={36}>{p.name}</Title>
      <Body>{r?.seasons ?? career.seasons.length} temporadas · aposentado aos {r?.age ?? p.age} · {teams.map(nick).join(', ')}</Body>
      <Box highlight={r?.inducted ? COLORS.gold : undefined}>
        <Label color={r?.inducted ? COLORS.gold : COLORS.muted}>Hall da Fama</Label>
        <Text style={{ fontFamily: FONT.cond800, fontSize: 24, color: r?.inducted ? COLORS.gold : COLORS.text, textTransform: 'uppercase' }}>
          {r?.inducted ? 'Eleito' : 'Fora'}
        </Text>
        <Body>{(r?.hofScore ?? 0).toFixed(1)} pontos de currículo (o corte é 25).</Body>
      </Box>
      <Box>
        <Label>Números</Label>
        <View className="flex-row">
          {[['Jogos', c?.gp ?? 0], ['Pontos', c?.pts ?? 0], ['Rebotes', c?.reb ?? 0], ['Assist.', c?.ast ?? 0]].map(([l, v], i) => (
            <View key={l as string} style={{ flex: 1, borderLeftWidth: i ? 1 : 0, borderLeftColor: COLORS.line, paddingHorizontal: 6 }}>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 20, color: COLORS.text }}>{fmt(v as number)}</Text>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.1, color: COLORS.muted, textTransform: 'uppercase' }}>{l}</Text>
            </View>
          ))}
        </View>
        <Body color={COLORS.text}>{honors.length ? [...new Set(honors)].map((h) => `${h}${count(h) > 1 ? ` ×${count(h)}` : ''}`).join(' · ') : 'Nenhum prêmio.'}</Body>
      </Box>
      {r?.jerseys.length ? (
        <Box highlight={COLORS.gold}>
          <Label color={COLORS.gold}>Camisa aposentada</Label>
          <Body color={COLORS.text}>A #{p.number} sobe para o teto do {r.jerseys.map(nick).join(' e do ')}.</Body>
        </Box>
      ) : null}
    </Page>
  );
};
