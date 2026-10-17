// Off the floor (PLANO-CARREIRA.md, fase 3): the people around your career and
// the business of it.
//   - Relations: the coach is the trust you already earn; the locker room and
//     the front office are two more numbers (0-100) that move with how you
//     play, what you say and what you ask for.
//   - Press: a question now and then about you -- your role, a slump, a hot
//     run, your contract. Each answer moves the three relations.
//   - Trade request: once a season, when the coach has buried you. The front
//     office says yes or no by what you are worth to them and how they see you.
//   - Contract: an extension offer in your last year; at the end of a deal,
//     offers from real teams (money x role x chance of a ring) and an agent
//     who says which one he'd take.
// Contracts go through the league's own rules: the salary is askingSalary,
// and a deal is written the way the GM's extension writes it (contractYears
// one past the summer tick, nextSalary for the new money).
import type { Player, Team } from '../../types';
import { askingSalary, newContractYears } from '../freeAgencyService';
import { getRotationWeights } from '../simulationService';
import { personalityOf } from '../personalityService';
import type { CareerState } from './careerTypes';
import { favorFor, gameScore, expectedGameScore } from './careerTrust';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
// Local, not careerLeague's: that module imports this one.
const myTeam = (s: CareerState): Team | undefined => s.league.teams.find((t) => t.roster.includes(s.meId));
const money = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;

export interface Relations { locker: number; front: number }
export const relationsOf = (s: CareerState): Relations => s.relations ?? { locker: 50, front: 50 };

export const relationLabel = (v: number) => (v >= 75 ? 'Excelente' : v >= 58 ? 'Boa' : v >= 42 ? 'Neutra' : v >= 25 ? 'Desgastada' : 'Ruim');

/* ------------------------------------------------------------------ */
/* After each game                                                      */
/* ------------------------------------------------------------------ */

/** The locker room and the front office after one of your team's games. */
export const relationsAfterGame = (s: CareerState, won: boolean, line: CareerState['games'][number]['line'], assists = 0): Relations => {
  const r = relationsOf(s);
  const p = s.league.players[s.meId];
  let { locker, front } = r;
  locker += won ? 0.25 : -0.15;
  locker += assists * 0.3;
  if (line && p && line.min > 0) {
    // The front office reads the box score against what they pay for.
    const over = gameScore(line) - expectedGameScore(p.ovr, line.min);
    front += clamp(over / 8, -0.8, 0.8);
  }
  // Both drift back toward neutral, slower than the coach forgets.
  locker += (50 - locker) * 0.01;
  front += (50 - front) * 0.008;
  return { locker: clamp(locker, 0, 100), front: clamp(front, 0, 100) };
};

/* ------------------------------------------------------------------ */
/* Press                                                                */
/* ------------------------------------------------------------------ */

export interface PressAnswer {
  id: string;
  label: string;
  /** What it moves: coach (trust), locker room, front office. */
  trust: number;
  locker: number;
  front: number;
}
export interface CareerPress {
  day: number;
  topic: 'role' | 'slump' | 'hot' | 'contract' | 'losing';
  question: string;
  answers: PressAnswer[];
}

/** Games between two press conferences, at least. */
export const PRESS_GAP = 14;
/** A question nobody answered goes stale. */
const PRESS_TTL = 5;

/**
 * Whether tonight's game raised a question, and which. Read from the last few
 * games: a slump, a hot run, a buried role, a losing team, a contract year.
 */
export const pressFor = (s: CareerState): CareerPress | null => {
  const day = s.league.gamesPlayed;
  if (s.press || day - (s.lastPressDay ?? -PRESS_GAP) < PRESS_GAP || day < 6) return null;
  const p = s.league.players[s.meId];
  const t = myTeam(s);
  if (!p || !t) return null;
  const last = s.games.slice(-5).filter((g) => g.line && g.line.min > 0);
  const diff = last.map((g) => gameScore(g.line!) - expectedGameScore(p.ovr, g.line!.min));
  const avg = diff.length ? diff.reduce((a, b) => a + b, 0) / diff.length : 0;
  const rotation = getRotationWeights({ ...t, favor: { [s.meId]: favorFor(s.trust) } }, s.league.players).ids;
  const buried = !rotation.includes(s.meId) || rotation.indexOf(s.meId) >= 8;
  const gp = (t.wins ?? 0) + (t.losses ?? 0);
  const losing = gp >= 15 && (t.wins ?? 0) / gp < 0.38;
  const contractYear = p.contractYears === 1 && day >= 30;
  const name = p.name.split(' ').slice(-1)[0];
  if (buried && Math.random() < 0.6) {
    return { day, topic: 'role', question: `${name}, você quase não tem entrado. Está frustrado com os minutos?`, answers: [
      { id: 'patient', label: 'Meu trabalho é estar pronto quando chamarem.', trust: 2, locker: 2, front: 1 },
      { id: 'want', label: 'Quero jogar. Acho que mereço mais tempo.', trust: -2, locker: 0, front: 2 },
      { id: 'blame', label: 'Não fui eu que montei essa rotação.', trust: -6, locker: -3, front: -2 },
    ] };
  }
  if (diff.length >= 3 && avg <= -4) {
    return { day, topic: 'slump', question: 'Fase difícil: o que está acontecendo com o seu jogo?', answers: [
      { id: 'own', label: 'A culpa é minha. Vou sair dessa no treino.', trust: 2, locker: 2, front: 1 },
      { id: 'system', label: 'O sistema não me favorece.', trust: -4, locker: -2, front: 0 },
      { id: 'next', label: 'Fase passa. Próximo jogo.', trust: 0, locker: 0, front: 0 },
    ] };
  }
  if (diff.length >= 3 && avg >= 4) {
    return { day, topic: 'hot', question: `${name} em grande fase. O que mudou?`, answers: [
      { id: 'team', label: 'Os caras estão me achando livre. Mérito do time.', trust: 1, locker: 4, front: 0 },
      { id: 'me', label: 'Sempre soube que eu era desse nível.', trust: -1, locker: -2, front: 3 },
      { id: 'coach', label: 'O técnico confiou em mim. É retribuir.', trust: 4, locker: 0, front: 0 },
    ] };
  }
  if (contractYear) {
    return { day, topic: 'contract', question: 'Último ano de contrato. Pretende continuar aqui?', answers: [
      { id: 'stay', label: 'Quero ficar e ganhar aqui.', trust: 1, locker: 2, front: 4 },
      { id: 'market', label: 'Vou ouvir o mercado. É o meu momento.', trust: 0, locker: -1, front: -4 },
      { id: 'focus', label: 'Agora só penso na temporada.', trust: 1, locker: 1, front: 0 },
    ] };
  }
  if (losing && Math.random() < 0.5) {
    return { day, topic: 'losing', question: 'O time não engrena. Falta o quê?', answers: [
      { id: 'together', label: 'Ficar junto. Isso vira.', trust: 1, locker: 3, front: 0 },
      { id: 'talent', label: 'Precisamos de reforço.', trust: -1, locker: -3, front: -2 },
      { id: 'effort', label: 'Mais intensidade, a começar por mim.', trust: 2, locker: 1, front: 1 },
    ] };
  }
  return null;
};

/** After a game: a new question, or the old one gone stale. */
export const tickPress = (s: CareerState): CareerState => {
  if (s.press && s.league.gamesPlayed - s.press.day > PRESS_TTL) return { ...s, press: undefined };
  const press = pressFor(s);
  return press ? { ...s, press } : s;
};

export const answerPress = (s: CareerState, answerId: string): CareerState => {
  const a = s.press?.answers.find((x) => x.id === answerId);
  if (!s.press || !a) return s;
  const r = relationsOf(s);
  // The star personality doesn't do humble: the room hears it either way.
  const starTax = personalityOf(s.league.players[s.meId]).id === 'estrela' && a.locker > 0 ? 0.5 : 1;
  return {
    ...s,
    press: undefined,
    lastPressDay: s.league.gamesPlayed,
    trust: clamp(s.trust + a.trust, 0, 100),
    relations: { locker: clamp(r.locker + a.locker * starTax, 0, 100), front: clamp(r.front + a.front, 0, 100) },
    feed: [{ day: s.league.gamesPlayed, text: `Coletiva: "${a.label}"` }, ...s.feed].slice(0, 40),
  };
};

/* ------------------------------------------------------------------ */
/* Trade request                                                        */
/* ------------------------------------------------------------------ */

/** Whether you can ask out now, and why not when you can't. */
export const tradeRequestBlock = (s: CareerState): string | null => {
  if (s.league.status !== 'active') return 'Só durante a temporada.';
  if (s.tradeRequestSeason === s.league.gmLegacy.seasons) return 'Você já pediu nesta temporada.';
  if (s.league.gamesPlayed < 15) return 'Cedo demais: espere ao menos 15 jogos.';
  const t = myTeam(s);
  if (!t) return 'Sem time.';
  const rotation = getRotationWeights({ ...t, favor: { [s.meId]: favorFor(s.trust) } }, s.league.players).ids;
  const slot = rotation.indexOf(s.meId);
  if (s.trust >= 45 && slot >= 0 && slot < 8) return 'Você tem espaço e a confiança do técnico. Não há motivo.';
  return null;
};

/** The chance the front office agrees: what you are worth, and how they see you. */
export const tradeAcceptChance = (s: CareerState): number => {
  const p = s.league.players[s.meId];
  const r = relationsOf(s);
  if (!p) return 0;
  return clamp(0.25 + (p.ovr - 70) * 0.025 + (r.front - 50) * 0.006 + (p.age <= 24 ? 0.1 : 0), 0.1, 0.85);
};

/**
 * Ask out. Yes: you go to a team with room for you, swapped for a player of
 * about your level. No: the coach and the front office remember.
 */
export const requestTrade = (s: CareerState, rng: () => number = Math.random): CareerState => {
  if (tradeRequestBlock(s)) return s;
  const mine = myTeam(s);
  const p = s.league.players[s.meId];
  const season = s.league.gmLegacy.seasons;
  if (!mine || !p) return s;
  const r = relationsOf(s);
  if (rng() >= tradeAcceptChance(s)) {
    return {
      ...s,
      tradeRequestSeason: season,
      trust: clamp(s.trust - 5, 0, 100),
      relations: { locker: clamp(r.locker - 4, 0, 100), front: clamp(r.front - 8, 0, 100) },
      feed: [{ day: s.league.gamesPlayed, text: `A diretoria do ${mine.name} recusou o seu pedido de troca. O clima esfriou.` }, ...s.feed].slice(0, 40),
    };
  }
  // A partner: a team where you would play, with someone of about your level to send back.
  const candidates = s.league.teams
    .filter((t) => t.id !== mine.id)
    .map((t) => {
      const back = t.roster.map((id) => s.league.players[id]).filter((x): x is Player => !!x && !x.prospect && Math.abs(x.ovr - p.ovr) <= 4)
        .sort((a, b) => Math.abs(a.ovr - p.ovr) - Math.abs(b.ovr - p.ovr))[0];
      const rot = getRotationWeights({ ...t, roster: [...t.roster.filter((id) => id !== back?.id), s.meId] }, s.league.players).ids;
      return { t, back, slot: rot.indexOf(s.meId) };
    })
    .filter((c) => c.back && c.slot >= 0)
    .sort((a, b) => a.slot - b.slot);
  const pick = candidates[Math.floor(rng() * Math.min(5, candidates.length))];
  if (!pick || !pick.back) {
    return { ...s, tradeRequestSeason: season, feed: [{ day: s.league.gamesPlayed, text: 'A diretoria aceitou te trocar, mas nenhum time topou o negócio por enquanto.' }, ...s.feed].slice(0, 40) };
  }
  const back = pick.back;
  const teams = s.league.teams.map((t) => {
    if (t.id === mine.id) return { ...t, roster: [...t.roster.filter((id) => id !== s.meId), back.id], starters: undefined };
    if (t.id === pick.t.id) return { ...t, roster: [...t.roster.filter((id) => id !== back.id), s.meId], starters: undefined };
    return t;
  });
  return {
    ...s,
    league: { ...s.league, teams },
    tradeRequestSeason: season,
    // A new coach, a clean slate -- a little better than a rookie's.
    trust: 50,
    relations: { locker: 50, front: clamp(r.front, 40, 60) },
    feed: [{ day: s.league.gamesPlayed, text: `Pedido aceito: você foi trocado para o ${pick.t.name}, ${back.name} foi para o ${mine.name}.` }, ...s.feed].slice(0, 40),
  };
};

/* ------------------------------------------------------------------ */
/* Contract                                                             */
/* ------------------------------------------------------------------ */

export interface ContractOffer {
  teamId: string;
  salary: number;
  years: number;
  /** Where you'd be in that coach's minutes order (0 = first). */
  slot: number;
  roleLabel: string;
  /** 0-1: how close the team is to a ring, from its strength. */
  contender: number;
  /** The agent's score; the highest is his pick. */
  agentScore: number;
  note: string;
}

const roleForSlot = (slot: number) => (slot < 0 ? 'Fora da rotação' : slot < 5 ? 'Titular' : slot === 5 ? 'Sexto homem' : slot < 9 ? 'Rotação' : 'Fim do banco');

/** The extension your team offers in your last year, priced like the GM's. */
export const extensionOffer = (s: CareerState): { salary: number; years: number } | null => {
  const p = s.league.players[s.meId];
  if (!p || p.contractYears !== 1 || p.nextSalary !== undefined) return null;
  const next = { ...p, age: p.age + 1 };
  const r = relationsOf(s);
  // The front office pays a bit more for someone it likes.
  const salary = Math.round((askingSalary(next) * (0.9 + r.front / 500)) / 10_000) * 10_000;
  return { salary, years: newContractYears(next) };
};

/** When the extension talk happens: halfway through your last year. */
export const EXTENSION_GAME = 41;

export const acceptExtension = (s: CareerState): CareerState => {
  const offer = extensionOffer(s);
  const p = s.league.players[s.meId];
  const t = myTeam(s);
  if (!offer || !p || !t) return s;
  return {
    ...s,
    extensionAnswered: s.league.gmLegacy.seasons,
    relations: { ...relationsOf(s), front: clamp(relationsOf(s).front + 5, 0, 100) },
    league: { ...s.league, players: { ...s.league.players, [s.meId]: { ...p, contractYears: 1 + offer.years, nextSalary: offer.salary } } },
    feed: [{ day: s.league.gamesPlayed, text: `Extensão assinada com o ${t.name}: ${offer.years} anos, ${money(offer.salary)} por ano.` }, ...s.feed].slice(0, 40),
  };
};

export const declineExtension = (s: CareerState): CareerState => ({
  ...s,
  extensionAnswered: s.league.gmLegacy.seasons,
  relations: { ...relationsOf(s), front: clamp(relationsOf(s).front - 3, 0, 100) },
  feed: [{ day: s.league.gamesPlayed, text: 'Você recusou a extensão: vai para o mercado no fim da temporada.' }, ...s.feed].slice(0, 40),
});

/** Your deal runs out this summer (no extension signed). */
export const contractEnding = (s: CareerState): boolean => {
  const p = s.league.players[s.meId];
  return !!p && p.contractYears === 1 && p.nextSalary === undefined;
};

/** Payroll next season, without you. */
const payrollWithout = (t: Team, s: CareerState) =>
  t.roster.reduce((sum, id) => (id === s.meId ? sum : sum + (s.league.players[id]?.salary ?? 0)), 0);

/**
 * The market at the end of your deal: your own team (it can always pay you --
 * Bird rights) and the three teams that want you most, where "want" is room
 * under the tax and a hole your game fills. The agent ranks them by what you
 * value: money, minutes, a ring.
 */
export const freeAgencyOffers = (s: CareerState): ContractOffer[] => {
  const p = s.league.players[s.meId];
  const mine = myTeam(s);
  if (!p || !mine) return [];
  const next = { ...p, age: p.age + 1 };
  const ask = askingSalary(next);
  const years = newContractYears(next);
  const strength = (t: Team) => {
    const ids = getRotationWeights(t, s.league.players).ids.slice(0, 8);
    return ids.reduce((sum, id) => sum + (s.league.players[id]?.ovr ?? 70), 0) / Math.max(1, ids.length);
  };
  const strengths = s.league.teams.map(strength).sort((a, b) => a - b);
  const contenderOf = (t: Team) => strengths.findIndex((x) => x >= strength(t)) / Math.max(1, strengths.length - 1);
  const slotOn = (t: Team) => getRotationWeights({ ...t, roster: t.id === mine.id ? t.roster : [...t.roster, s.meId] }, s.league.players).ids.indexOf(s.meId);
  const relations = relationsOf(s);
  const offerFor = (t: Team, own: boolean): ContractOffer => {
    const slot = slotOn(t);
    const room = 190_000_000 - payrollWithout(t, s);
    // Your team pays what the front office thinks of you; a suitor with room pays up to win you.
    const factor = own ? 0.88 + relations.front / 420 : clamp(0.92 + room / 400_000_000, 0.85, 1.12);
    const salary = Math.max(1_150_000, Math.round((ask * factor) / 10_000) * 10_000);
    const contender = contenderOf(t);
    const roleScore = slot < 0 ? 0 : slot < 5 ? 1 : slot < 7 ? 0.65 : 0.35;
    const agentScore = (salary / Math.max(1, ask)) * 0.45 + roleScore * 0.35 + contender * 0.2;
    const note = own
      ? 'Renovar onde você já está.'
      : contender >= 0.8 ? 'Brigam pelo título.' : roleScore >= 1 ? 'Te querem como titular.' : room > 30_000_000 ? 'Têm espaço na folha.' : 'Interesse firme.';
    return { teamId: t.id, salary, years, slot, roleLabel: roleForSlot(slot), contender, agentScore, note };
  };
  const suitors = s.league.teams
    .filter((t) => t.id !== mine.id && payrollWithout(t, s) + ask <= 200_000_000)
    .map((t) => offerFor(t, false))
    .sort((a, b) => b.agentScore - a.agentScore)
    .slice(0, 3);
  return [offerFor(mine, true), ...suitors];
};

/** The agent's pick among the offers, and his one-line reason. */
export const agentPick = (offers: ContractOffer[]): { teamId: string; why: string } | null => {
  const best = [...offers].sort((a, b) => b.agentScore - a.agentScore)[0];
  if (!best) return null;
  const why = best.slot >= 0 && best.slot < 5
    ? 'É onde você joga de titular com o melhor dinheiro.'
    : best.contender >= 0.8 ? 'Você chega a um candidato ao título sem perder muito dinheiro.' : 'É a melhor soma de dinheiro e minutos.';
  return { teamId: best.teamId, why };
};

/**
 * Sign: the deal is written before the summer runs, as the league's own
 * contracts are -- one year past the summer tick, the new money as
 * nextSalary -- and you move to the new team now, so its offseason plans
 * already count you.
 */
export const signOffer = (s: CareerState, offer: ContractOffer): CareerState => {
  const p = s.league.players[s.meId];
  const mine = myTeam(s);
  const to = s.league.teams.find((t) => t.id === offer.teamId);
  if (!p || !mine || !to) return s;
  const moving = to.id !== mine.id;
  const teams = moving
    ? s.league.teams.map((t) => (t.id === mine.id ? { ...t, roster: t.roster.filter((id) => id !== s.meId), starters: undefined }
      : t.id === to.id ? { ...t, roster: [...t.roster, s.meId] } : t))
    : s.league.teams;
  return {
    ...s,
    offers: undefined,
    league: {
      ...s.league,
      teams,
      players: { ...s.league.players, [s.meId]: { ...p, contractYears: 1 + offer.years, nextSalary: offer.salary, birdTeamId: undefined } },
    },
    trust: moving ? 50 : s.trust,
    relations: moving ? { locker: 50, front: 55 } : { ...relationsOf(s), front: clamp(relationsOf(s).front + 4, 0, 100) },
    feed: [{ day: 0, text: moving
      ? `Você assinou com o ${to.name}: ${offer.years} anos, ${money(offer.salary)} por ano.`
      : `Você renovou com o ${to.name}: ${offer.years} anos, ${money(offer.salary)} por ano.` }, ...s.feed].slice(0, 40),
  };
};
