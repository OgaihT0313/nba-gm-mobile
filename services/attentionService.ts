// "Precisa da sua atenção": what is waiting on the GM right now, gathered from
// the season so it doesn't have to be found screen by screen (ROADMAP Q3).
// Pure read of SeasonState; the season screen draws the list, each item with
// the screen (and My Team tab) that settles it.

import type { SeasonState } from '../types';
import { LUXURY_TAX, getTeamSalary } from '../constants';
import { MIN_ROSTER_SIZE, MAX_ROSTER_SIZE, TRADE_DEADLINE_GAME, OFFER_TTL } from './tradeService';
import { TRADE_REQUEST_MORALE } from './simulationService';
import { STAFF_ROLES, ROLE_LABEL } from './staffService';
import { luxuryTaxConfidenceHit } from './ownerService';

export type AttentionTarget =
  | { view: 'trade' }
  | { view: 'my-team'; tab: 'roster' | 'rotation' | 'coach' };

export interface AttentionItem {
  id: string;
  /** bad: costs games or confidence if left; warn: will, soon; info: worth a look. */
  tone: 'bad' | 'warn' | 'info';
  title: string;
  detail: string;
  target: AttentionTarget;
}

// Morale this close above the trade-request line reads as "about to ask".
const UNHAPPY_MARGIN = 10;
// The contracts worth a reminder: the rotation, not the end of the bench.
const KEY_PLAYERS = 8;

const surname = (name: string) =>
  name.split(' ').filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(w)).slice(-1)[0] ?? name;
const names = (list: string[]) =>
  list.length <= 2 ? list.join(' e ') : `${list.slice(0, 2).join(', ')} e mais ${list.length - 2}`;
const money = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;

export function attentionItems(season: SeasonState): AttentionItem[] {
  const team = season.teams.find((t) => t.id === season.userTeamId);
  if (!team || season.owner.fired) return [];
  const live = season.status === 'active';
  const offseason = season.status === 'draft' || season.status === 'free_agency';
  if (!live && !offseason) return [];
  const items: AttentionItem[] = [];
  const roster = team.roster.map((id) => season.players[id]).filter(Boolean);
  const gp = season.gamesPlayed;

  // Offers die after OFFER_TTL games and all at the deadline.
  const offers = live && gp < TRADE_DEADLINE_GAME ? season.tradeOffers ?? [] : [];
  if (offers.length) {
    const left = Math.min(...offers.map((o) => (o.day === undefined ? OFFER_TTL : OFFER_TTL - (gp - o.day))), TRADE_DEADLINE_GAME - gp);
    items.push({
      id: 'offers',
      tone: left <= 2 ? 'bad' : 'warn',
      title: offers.length === 1 ? '1 proposta de troca' : `${offers.length} propostas de troca`,
      detail: left <= 1 ? 'Vence amanhã.' : `A mais antiga vence em ${left} dias.`,
      target: { view: 'trade' },
    });
  }

  const requested = (team.tradeRequestedIds ?? []).filter((id) => team.roster.includes(id)).map((id) => season.players[id]).filter(Boolean);
  if (requested.length && live && gp < TRADE_DEADLINE_GAME) {
    items.push({
      id: 'requests',
      tone: 'warn',
      title: requested.length === 1 ? `${surname(requested[0].name)} pediu para sair` : `${requested.length} jogadores pediram para sair`,
      detail: `O prazo de trocas é no dia ${TRADE_DEADLINE_GAME}.`,
      target: { view: 'trade' },
    });
  }

  if (roster.length < MIN_ROSTER_SIZE) {
    items.push({
      id: 'roster-short',
      tone: 'bad',
      title: `Elenco com ${roster.length} jogadores`,
      detail: `O mínimo é ${MIN_ROSTER_SIZE}: contrate na agência livre.`,
      target: { view: 'my-team', tab: 'roster' },
    });
  } else if (roster.length > MAX_ROSTER_SIZE) {
    items.push({
      id: 'roster-long',
      tone: 'bad',
      title: `Elenco com ${roster.length} jogadores`,
      detail: `O máximo é ${MAX_ROSTER_SIZE}: dispense ou troque alguém.`,
      target: { view: 'my-team', tab: 'roster' },
    });
  }

  // A starter out: the rotation fills his spot on its own, but who does is the GM's call.
  if (live) {
    // The GM's picks; a team that never set any starts its five best.
    const picked = Object.values(team.starters ?? {});
    const starterIds = new Set(picked.length ? picked : [...roster].sort((a, b) => b.ovr - a.ovr).slice(0, 5).map((p) => p.id));
    const out = Object.entries(team.playerAbsences ?? {})
      .filter(([id]) => starterIds.has(id) && season.players[id])
      .map(([id, a]) => ({ name: surname(season.players[id].name), games: a.duration }));
    if (out.length) {
      items.push({
        id: 'starters-out',
        tone: 'warn',
        title: out.length === 1 ? `Titular fora: ${out[0].name}` : `${out.length} titulares fora`,
        detail: out.length === 1 ? `Por ${out[0].games} ${out[0].games === 1 ? 'jogo' : 'jogos'}. Confira a rotação.` : `${names(out.map((o) => o.name))}. Confira a rotação.`,
        target: { view: 'my-team', tab: 'rotation' },
      });
    }
  }

  const unhappy = roster
    .filter((p) => (p.morale ?? 70) < TRADE_REQUEST_MORALE + UNHAPPY_MARGIN && !(team.tradeRequestedIds ?? []).includes(p.id))
    .sort((a, b) => (a.morale ?? 70) - (b.morale ?? 70));
  if (unhappy.length) {
    items.push({
      id: 'unhappy',
      tone: 'warn',
      title: unhappy.length === 1 ? `${surname(unhappy[0].name)} está insatisfeito` : `${unhappy.length} jogadores insatisfeitos`,
      detail: `${names(unhappy.map((p) => surname(p.name)))}: perto de pedir troca. Minutos e vitórias ajudam.`,
      target: { view: 'my-team', tab: 'roster' },
    });
  }

  const payroll = getTeamSalary(team, season.players);
  if (payroll > LUXURY_TAX) {
    items.push({
      id: 'tax',
      tone: 'warn',
      title: 'Folha acima do imposto',
      // The bill lands on opening night (offseasonService.startSeason), on
      // whatever the payroll is then -- not at the end of this season.
      detail: `${money(payroll)}, ${money(payroll - LUXURY_TAX)} acima da linha (${money(LUXURY_TAX)}). Se continuar assim, o dono tira ${luxuryTaxConfidenceHit(payroll)} de confiança na abertura da ${offseason ? 'temporada' : 'próxima temporada'}.`,
      target: { view: 'my-team', tab: 'roster' },
    });
  }

  // Last year of a deal, not extended yet, among the players who matter.
  if (live) {
    const expiring = [...roster]
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, KEY_PLAYERS)
      .filter((p) => p.contractYears === 1 && p.nextSalary === undefined);
    if (expiring.length) {
      items.push({
        id: 'expiring',
        tone: 'info',
        title: expiring.length === 1 ? `Contrato no fim: ${surname(expiring[0].name)}` : `${expiring.length} contratos no fim`,
        detail: `${names(expiring.map((p) => surname(p.name)))}: ${expiring.length === 1 ? 'vira agente livre' : 'viram agentes livres'} no verão.`,
        target: { view: 'my-team', tab: 'roster' },
      });
    }
  }

  const interim = STAFF_ROLES.filter((r) => !team.staff?.[r] || team.staff[r]!.interim);
  if (interim.length) {
    items.push({
      id: 'staff',
      tone: 'info',
      title: interim.length === 1 ? `${ROLE_LABEL[interim[0]]} interino` : `${interim.length} cargos do staff com interino`,
      detail: interim.length === 1
        ? 'Um interino rende menos: contrate alguém para o cargo.'
        : `${interim.map((r) => ROLE_LABEL[r].toLowerCase()).join(', ')}: contrate alguém para os cargos.`,
      target: { view: 'my-team', tab: 'coach' },
    });
  }

  const order = { bad: 0, warn: 1, info: 2 };
  return items.sort((a, b) => order[a.tone] - order[b.tone]);
}
