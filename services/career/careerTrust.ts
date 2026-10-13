// What the coach thinks of you, and what you do about it.
//
// Trust (0-100) is the career's one lever on playing time. It becomes
// Team.favor -- OVR points the coach adds to you when he orders his rotation
// (simulationService.effectiveOvr) -- so it decides whether you start, come
// off the bench or sit, without making the team itself any better or worse.
// It moves with what you do on the floor against what a player of your rating
// should do in those minutes, a little with winning, and drifts back toward
// neutral when nothing happens: a coach forgets.
import type { Player, PlayerAttributes, Team } from '../../types';
import { getRotationWeights } from '../simulationService';
import type { CareerGame, CareerState } from './careerTypes';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Trust 0 -> -8 OVR in the coach's eyes, 100 -> +8. */
export const FAVOR_SPAN = 8;
export const favorFor = (trust: number) => ((clamp(trust, 0, 100) - 50) / 50) * FAVOR_SPAN;

/** Where a rookie starts with his coach: a top pick is somebody's plan. */
export const initialTrust = (pick: number | null) => (pick === null ? 38 : pick <= 5 ? 62 : pick <= 14 ? 54 : 46);

const team = (s: CareerState): Team | undefined => s.league.teams.find((t) => t.roster.includes(s.meId));

export interface Role {
  label: string;
  /** 0 = best: star, starter, sixth man, rotation, out of it. */
  rank: number;
  /** Index in the coach's minutes order (0 = most), -1 = not in it. */
  slot: number;
}

/** Your team's rotation order tonight, the coach's trust in you included. */
export const getRotationWeightsFor = (s: CareerState): string[] => {
  const t = team(s);
  if (!t) return [];
  return getRotationWeights({ ...t, favor: { [s.meId]: favorFor(s.trust) } }, s.league.players).ids;
};

/** Your place in the rotation tonight, with the coach's current trust in it. */
export const roleOf = (s: CareerState): Role => {
  const t = team(s);
  const p = s.league.players[s.meId];
  if (!t || !p) return { label: 'Sem time', rank: 5, slot: -1 };
  if (t.playerAbsences?.[s.meId]) return { label: 'Lesionado', rank: 4, slot: -1 };
  const { ids } = getRotationWeights({ ...t, favor: { [s.meId]: favorFor(s.trust) } }, s.league.players);
  const slot = ids.indexOf(s.meId);
  if (slot < 0) return { label: 'Fora da rotação', rank: 4, slot };
  if (slot === 0 && p.ovr >= 82) return { label: 'Estrela', rank: 0, slot };
  if (slot < 5) return { label: 'Titular', rank: 1, slot };
  if (slot === 5) return { label: 'Sexto homem', rank: 2, slot };
  return { label: 'Rotação', rank: 3, slot };
};

/** A season's role, from the minutes he actually got. */
export const roleFromMinutes = (mpg: number, ovr: number) =>
  (mpg >= 32 && ovr >= 84 ? 'Estrela' : mpg >= 26 ? 'Titular' : mpg >= 8 ? 'Reserva' : 'Fora da rotação');

/** A night's worth, one number: Hollinger's game score without the shooting splits. */
export const gameScore = (l: NonNullable<CareerGame['line']>) =>
  l.pts + 0.4 * l.reb + 0.7 * l.ast + l.stl + 0.7 * l.blk - l.tov;

/** What a player of this rating should put up in these minutes (measured in
 *  scripts/check_career.ts over whole seasons of the league). */
// Per minute, measured across the league's own box scores (2026-10-13):
// 0.49 at 72, 0.58 at 80, 0.65 at 84, 0.75 at 88, 0.90 at 92 -- steeper at the top.
export const expectedGameScore = (ovr: number, min: number) =>
  min * Math.max(0.35, 0.49 + (ovr - 72) * 0.0145 + Math.max(0, ovr - 84) * 0.01);

/** Trust after one of your team's games. */
export const afterGame = (s: CareerState, line: CareerGame['line'], won: boolean): number => {
  const p = s.league.players[s.meId];
  let t = s.trust;
  if (line && p && line.min > 0) {
    const over = gameScore(line) - expectedGameScore(p.ovr, line.min);
    t += clamp(over / 4, -1.6, 1.6) + (won ? 0.3 : -0.15);
  } else {
    // Out of the rotation: the coach sees you in practice, slowly.
    t += s.training === 'film' ? 0.25 : 0.08;
  }
  // Memory fades toward neutral.
  t += (50 - t) * 0.015;
  return clamp(t, 0, 100);
};

/* ------------------------------------------------------------------ */
/* Training                                                             */
/* ------------------------------------------------------------------ */

/** Days between training weeks. */
export const TRAINING_DAYS = 7;

export const TRAINING_META: Record<CareerState['training'], { label: string; blurb: string }> = {
  shooting: { label: 'Arremesso', blurb: 'Ganha pontos de evolução. No fim da temporada, a evolução puxa para o ataque.' },
  defense: { label: 'Defesa', blurb: 'Ganha pontos de evolução. No fim da temporada, a evolução puxa para a defesa.' },
  physical: { label: 'Físico', blurb: 'Ganha pontos de evolução e segura o desgaste do corpo com a idade.' },
  film: { label: 'Vídeo e tática', blurb: 'Sem pontos, mas o técnico nota: a confiança dele sobe.' },
  rest: { label: 'Descanso', blurb: 'Recupera o desgaste acumulado e reduz o risco de lesão.' },
};

/** One week of training, applied every TRAINING_DAYS days of the season. */
export const applyWeeklyTraining = (s: CareerState): CareerState => {
  const p = s.league.players[s.meId];
  const base = { ...s, lastTrainingDay: s.league.gamesPlayed };
  if (!p) return base;
  // A good week on the floor counts too: games well above what's expected.
  const week = s.games.filter((g) => g.day > s.lastTrainingDay);
  const standout = week.filter((g) => g.line && gameScore(g.line) - expectedGameScore(p.ovr, g.line.min) >= 7).length;
  if (s.training === 'film') return { ...base, trust: clamp(s.trust + 1.5, 0, 100), devPoints: s.devPoints + standout };
  if (s.training === 'rest') {
    const rested = { ...p, load: Math.max(0, (p.load ?? 0) - 15) };
    return { ...base, devPoints: s.devPoints + standout, league: { ...s.league, players: { ...s.league.players, [s.meId]: rested } } };
  }
  const young = p.age <= 23 ? 1 : 0;
  return { ...base, devPoints: s.devPoints + 1 + young + standout };
};

/* ------------------------------------------------------------------ */
/* Development points                                                   */
/* ------------------------------------------------------------------ */
// Points buy attribute points; attribute points add up into the ratings the
// engine plays (off/def, then OVR) on the same scale the yearly progression
// uses (an OVR point is ~1.5 off+def). Expensive at the top, and nothing past
// the ceiling his talent set at creation.

type AttrKey = keyof PlayerAttributes;
const OFF_ATTRS: AttrKey[] = ['shooting', 'finishing', 'playmaking'];
const DEF_ATTRS: AttrKey[] = ['perimeterD', 'interiorD', 'rebounding'];
/** Attribute points per off/def point. */
const ATTR_PER_RATING = 4;

export const pointCost = (attr: number) => 1 + Math.floor(Math.max(0, attr - 70) / 6);

export const canSpend = (s: CareerState, key: AttrKey): { ok: boolean; reason?: string } => {
  const p = s.league.players[s.meId];
  if (!p?.attributes) return { ok: false };
  if (p.ovr >= s.ceiling) return { ok: false, reason: 'No teto do seu talento por enquanto.' };
  if (p.attributes[key] >= 95) return { ok: false, reason: 'No máximo.' };
  if (s.devPoints < pointCost(p.attributes[key])) return { ok: false, reason: 'Pontos insuficientes.' };
  return { ok: true };
};

const sumSpent = (spent: CareerState['spent'], keys: AttrKey[]) => keys.reduce((n, k) => n + (spent[k] ?? 0), 0);

export const spendPoint = (s: CareerState, key: AttrKey): CareerState => {
  if (!canSpend(s, key).ok) return s;
  const p = s.league.players[s.meId]!;
  const cost = pointCost(p.attributes![key]);
  const spent = { ...s.spent, [key]: (s.spent[key] ?? 0) + 1 };
  // Off/def move when a block of attribute points fills up; athleticism feeds both.
  const ath = spent.athleticism ?? 0;
  const offNow = Math.floor((sumSpent(spent, OFF_ATTRS) + Math.floor(ath / 2)) / ATTR_PER_RATING);
  const offWas = Math.floor((sumSpent(s.spent, OFF_ATTRS) + Math.floor((s.spent.athleticism ?? 0) / 2)) / ATTR_PER_RATING);
  const defNow = Math.floor((sumSpent(spent, DEF_ATTRS) + Math.ceil(ath / 2)) / ATTR_PER_RATING);
  const defWas = Math.floor((sumSpent(s.spent, DEF_ATTRS) + Math.ceil((s.spent.athleticism ?? 0) / 2)) / ATTR_PER_RATING);
  const dOff = offNow - offWas;
  const dDef = defNow - defWas;
  const carry = (s.ratingCarry ?? 0) + dOff + dDef;
  const dOvr = Math.floor(carry / 1.5);
  const updated: Player = {
    ...p,
    attributes: { ...p.attributes!, [key]: p.attributes![key] + 1 },
    off: Math.min(99, p.off + dOff),
    def: Math.min(99, p.def + dDef),
    ovr: Math.min(s.ceiling, p.ovr + dOvr),
  };
  return {
    ...s,
    ratingCarry: carry - dOvr * 1.5,
    devPoints: s.devPoints - cost,
    spent,
    league: { ...s.league, players: { ...s.league.players, [s.meId]: updated } },
  };
};

/** The yearly progression can't take him past his ceiling either. */
export const capAtCeiling = (s: CareerState): CareerState => {
  const p = s.league.players[s.meId];
  if (!p || p.ovr <= s.ceiling) return s;
  const over = p.ovr - s.ceiling;
  const capped: Player = { ...p, ovr: s.ceiling, off: Math.max(60, p.off - Math.round(over * 0.75)), def: Math.max(60, p.def - Math.round(over * 0.75)) };
  return { ...s, league: { ...s.league, players: { ...s.league.players, [s.meId]: capped } } };
};
