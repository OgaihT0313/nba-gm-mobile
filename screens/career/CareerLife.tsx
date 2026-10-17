// Minha Carreira, off the floor (PLANO-CARREIRA.md, fase 3): the "Vida" tab
// (relations, contract, trade request, agent) and the two cards that come up
// on "Hoje" -- a press question and, at the end of a deal, the offers.
import React from 'react';
import { View, Text } from 'react-native';

import { COLORS, FONT } from '../../src/theme/tokens';
import { getTeamNickname } from '../../constants';
import type { CareerState } from '../../services/career/careerTypes';
import { me, myTeam } from '../../services/career/careerLeague';
import {
  relationsOf, relationLabel, tradeRequestBlock, tradeAcceptChance, extensionOffer, EXTENSION_GAME,
  contractEnding, agentPick, type ContractOffer,
} from '../../services/career/careerLife';
import { Page, Label, Title, Body, Box, Option, Bar, Cta, Ghost } from './careerUi';

const money = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;
const relColor = (v: number) => (v >= 58 ? COLORS.good : v >= 42 ? COLORS.text : v >= 25 ? COLORS.warn : COLORS.bad);

export interface LifeActions {
  answerPress: (id: string) => void;
  requestTrade: () => void;
  acceptExtension: () => void;
  declineExtension: () => void;
  loadOffers: () => void;
  signOffer: (o: ContractOffer) => void;
}

/** The extension talk is open: your last year, past the midpoint, not answered yet this season. */
export const extensionOpen = (c: CareerState) =>
  c.league.status === 'active' && c.league.gamesPlayed >= EXTENSION_GAME
  && c.extensionAnswered !== c.league.gmLegacy.seasons && !!extensionOffer(c);

/** The press question, on top of "Hoje". */
export const PressCard: React.FC<{ career: CareerState; actions: LifeActions }> = ({ career, actions }) => {
  const q = career.press;
  if (!q) return null;
  return (
    <Box highlight={COLORS.warn}>
      <Label color={COLORS.warn}>Coletiva de imprensa</Label>
      <Text style={{ fontFamily: FONT.body600, fontSize: 15, lineHeight: 21, color: COLORS.text }}>{q.question}</Text>
      <View style={{ gap: 6 }}>
        {q.answers.map((a) => <Option key={a.id} label={a.label} active={false} onPress={() => actions.answerPress(a.id)} />)}
      </View>
    </Box>
  );
};

/** The extension offer, on top of "Hoje" while it is open. */
export const ExtensionCard: React.FC<{ career: CareerState; actions: LifeActions }> = ({ career, actions }) => {
  if (!extensionOpen(career)) return null;
  const o = extensionOffer(career)!;
  const t = myTeam(career);
  return (
    <Box highlight={COLORS.gold}>
      <Label color={COLORS.gold}>Proposta de extensão</Label>
      <Text style={{ fontFamily: FONT.cond800, fontSize: 22, color: COLORS.text, textTransform: 'uppercase' }}>{o.years} anos · {money(o.salary)}/ano</Text>
      <Body>O {t ? getTeamNickname(t) : 'seu time'} quer você antes do mercado abrir. Recusar é apostar que vale mais lá fora.</Body>
      <View className="flex-row" style={{ gap: 8 }}>
        <Ghost label="Assinar" onPress={actions.acceptExtension} style={{ flex: 1 }} />
        <Ghost label="Recusar" onPress={actions.declineExtension} style={{ flex: 1 }} />
      </View>
    </Box>
  );
};

/** At the end of your deal: the market, before the summer runs. */
export const OffersCard: React.FC<{ career: CareerState; actions: LifeActions }> = ({ career, actions }) => {
  if (career.league.status !== 'offseason' || !contractEnding(career)) return null;
  if (!career.offers) {
    return (
      <Box highlight={COLORS.gold}>
        <Label color={COLORS.gold}>Fim de contrato</Label>
        <Body color={COLORS.text}>Seu contrato acabou. Antes do verão, veja quem quer você.</Body>
        <Cta label="Ver ofertas" onPress={actions.loadOffers} />
      </Box>
    );
  }
  const pick = agentPick(career.offers);
  return (
    <Box highlight={COLORS.gold}>
      <Label color={COLORS.gold}>Agência livre · escolha o seu time</Label>
      {pick ? <Body color={COLORS.text}>Seu agente: "{pick.why}"</Body> : null}
      <View style={{ gap: 6 }}>
        {career.offers.map((o) => {
          const t = career.league.teams.find((x) => x.id === o.teamId);
          const star = pick?.teamId === o.teamId;
          return (
            <Option
              key={o.teamId}
              label={`${t ? getTeamNickname(t) : o.teamId}${star ? ' · agente recomenda' : ''}`}
              sub={`${o.years} anos · ${money(o.salary)}/ano · ${o.roleLabel} · ${o.contender >= 0.8 ? 'candidato ao título' : o.contender >= 0.5 ? 'time de playoff' : 'em construção'} · ${o.note}`}
              active={star}
              onPress={() => actions.signOffer(o)}
            />
          );
        })}
      </View>
    </Box>
  );
};

/** The "Vida" tab. */
export const LifeTab: React.FC<{ career: CareerState; actions: LifeActions }> = ({ career, actions }) => {
  const p = me(career)!;
  const t = myTeam(career);
  const r = relationsOf(career);
  const block = tradeRequestBlock(career);
  const ext = extensionOffer(career);
  return (
    <Page>
      <Label>{t ? getTeamNickname(t) : 'Sem time'} · fora da quadra</Label>
      <Title>Vida</Title>
      <Box>
        <Label>Relações</Label>
        <Bar label="Técnico" value={career.trust} max={100} color={relColor(career.trust)} right={<Text style={{ width: 84, textAlign: 'right', fontFamily: FONT.cond700, fontSize: 13, color: relColor(career.trust) }}>{relationLabel(career.trust)}</Text>} />
        <Bar label="Vestiário" value={r.locker} max={100} color={relColor(r.locker)} right={<Text style={{ width: 84, textAlign: 'right', fontFamily: FONT.cond700, fontSize: 13, color: relColor(r.locker) }}>{relationLabel(r.locker)}</Text>} />
        <Bar label="Diretoria" value={r.front} max={100} color={relColor(r.front)} right={<Text style={{ width: 84, textAlign: 'right', fontFamily: FONT.cond700, fontSize: 13, color: relColor(r.front) }}>{relationLabel(r.front)}</Text>} />
        <Body size={12.5}>O técnico decide os seus minutos. O vestiário cresce com vitórias e com quem divide a bola. A diretoria olha o que você entrega pelo que custa: pesa na renovação e num pedido de troca.</Body>
      </Box>
      <Box>
        <Label>Contrato</Label>
        <Text style={{ fontFamily: FONT.cond800, fontSize: 22, color: COLORS.text }}>{money(p.salary)}/ano · {p.contractYears} {p.contractYears === 1 ? 'ano restante' : 'anos restantes'}</Text>
        {p.nextSalary !== undefined ? <Body color={COLORS.good}>Extensão assinada: {money(p.nextSalary)}/ano a partir da próxima temporada.</Body> : null}
        {ext && p.contractYears === 1 ? (
          <Body>{career.league.gamesPlayed < EXTENSION_GAME
            ? `Último ano. A conversa sobre extensão vem no meio da temporada (jogo ${EXTENSION_GAME}).`
            : career.extensionAnswered === career.league.gmLegacy.seasons ? 'Você recusou a extensão: no fim da temporada, o mercado decide.' : 'Há uma proposta de extensão esperando na aba Hoje.'}</Body>
        ) : null}
      </Box>
      <Box>
        <Label>Pedido de troca</Label>
        <Body>Uma vez por temporada, se o técnico te esqueceu no banco. A diretoria aceita ou não pelo quanto você vale para ela.</Body>
        {block
          ? <Body color={COLORS.dim}>{block}</Body>
          : <Body color={COLORS.text}>Chance de aceitarem hoje: {Math.round(tradeAcceptChance(career) * 100)}%. Se recusarem, técnico e diretoria não esquecem.</Body>}
        <Ghost label="Pedir para ser trocado" onPress={actions.requestTrade} disabled={!!block} />
      </Box>
    </Page>
  );
};
