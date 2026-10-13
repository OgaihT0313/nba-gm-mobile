// Building the career player: the creation screen's choices become a Player
// the league treats like any prospect (same fields, same scales), plus the
// pieces only the career keeps (his hidden ceiling).
import type { Player, PlayerAttributes } from '../../types';
import type { CareerCreation, CareerStyleId, CombineResult } from './careerTypes';

type AttrKey = keyof PlayerAttributes;

export interface CareerStyle {
  id: CareerStyleId;
  label: string;
  blurb: string;
  /** Positions this style suits; the creation screen offers it for these. */
  positions: CareerCreation['position'][];
  strengths: [AttrKey, AttrKey];
  weakness: AttrKey;
  /** Tilt between offense and defense, in OVR points (+ = offensive). */
  tilt: number;
}

export const CAREER_STYLES: CareerStyle[] = [
  { id: 'shooter', label: 'Arremessador', blurb: 'Mão calibrada de longe. Espaça a quadra e pune quem se descuida.', positions: ['PG', 'SG', 'SF'], strengths: ['shooting', 'playmaking'], weakness: 'interiorD', tilt: 4 },
  { id: 'slasher', label: 'Infiltrador', blurb: 'Ataca a cesta, cava falta, termina no contato.', positions: ['PG', 'SG', 'SF'], strengths: ['finishing', 'athleticism'], weakness: 'shooting', tilt: 3 },
  { id: 'playmaker', label: 'Armador', blurb: 'Lê o jogo antes dos outros. O time joga melhor com a bola na mão dele.', positions: ['PG', 'SG'], strengths: ['playmaking', 'shooting'], weakness: 'rebounding', tilt: 3 },
  { id: 'three_d', label: '3 e defesa', blurb: 'Defende o melhor do outro time e acerta a bola de três da zona morta.', positions: ['SG', 'SF', 'PF'], strengths: ['perimeterD', 'shooting'], weakness: 'playmaking', tilt: -1 },
  { id: 'wing', label: 'Ala completo', blurb: 'Um pouco de tudo, sem buraco no jogo.', positions: ['SG', 'SF', 'PF'], strengths: ['finishing', 'perimeterD'], weakness: 'interiorD', tilt: 0 },
  { id: 'rim_protector', label: 'Protetor de aro', blurb: 'Toco, rebote e corrida para a cesta. Muda o garrafão dos dois lados.', positions: ['PF', 'C'], strengths: ['interiorD', 'rebounding'], weakness: 'shooting', tilt: -4 },
  { id: 'post', label: 'Pivô de garrafão', blurb: 'De costas para a cesta, com o corpo e as mãos boas.', positions: ['PF', 'C'], strengths: ['finishing', 'rebounding'], weakness: 'perimeterD', tilt: 2 },
];

export const styleById = (id: CareerStyleId) => CAREER_STYLES.find((s) => s.id === id) ?? CAREER_STYLES[0];

/** Real height ranges by position, cm (the creation slider's bounds). */
export const HEIGHT_RANGE: Record<CareerCreation['position'], [number, number]> = {
  PG: [180, 198],
  SG: [188, 203],
  SF: [196, 208],
  PF: [201, 213],
  C: [206, 224],
};

/** A body weight that goes with the height (NBA average build). */
export const defaultWeight = (heightCm: number) => Math.round(24.5 * (heightCm / 100) ** 2);

export const SKIN_CHOICES = ['#f1c7a3', '#e0b089', '#c98f66', '#a8714d', '#8a5a3c', '#6b4029', '#4a2c1d'];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const jitter = (r: number) => Math.round((Math.random() * 2 - 1) * r);

/** Where his height sits in the position's range: -1 short, +1 tall. */
const heightNorm = (c: CareerCreation) => {
  const [lo, hi] = HEIGHT_RANGE[c.position];
  return clamp(((c.heightCm - lo) / (hi - lo)) * 2 - 1, -1, 1);
};

/** The attribute breakdown around an OVR: the style's two strengths high, its
 *  weakness low, height trading length for touch and spring. */
export const attributesFor = (c: CareerCreation, ovr: number): PlayerAttributes => {
  const style = styleById(c.style);
  const h = heightNorm(c);
  const base = (k: AttrKey) => {
    let v = ovr;
    if (style.strengths.includes(k)) v += 8;
    if (k === style.weakness) v -= 7;
    if (k === 'rebounding' || k === 'interiorD') v += Math.round(h * 4);
    if (k === 'shooting' || k === 'athleticism') v -= Math.round(h * 3);
    return clamp(v + jitter(2), 55, 92);
  };
  return {
    shooting: base('shooting'),
    finishing: base('finishing'),
    playmaking: base('playmaking'),
    perimeterD: base('perimeterD'),
    interiorD: base('interiorD'),
    rebounding: base('rebounding'),
    athleticism: base('athleticism'),
  };
};

/** A prospect's starting OVR before the combine: a mid-first-round talent. */
export const STARTING_OVR = 69;

/** Hidden potential: the tier the league reads, and the OVR he can grow to. */
export const rollPotential = (): { tier: Player['potential']; ceiling: number } => {
  const r = Math.random();
  if (r < 0.2) return { tier: 'A', ceiling: 89 + Math.floor(Math.random() * 6) };
  if (r < 0.6) return { tier: 'B', ceiling: 84 + Math.floor(Math.random() * 4) };
  if (r < 0.93) return { tier: 'C', ceiling: 79 + Math.floor(Math.random() * 4) };
  return { tier: 'D', ceiling: 75 + Math.floor(Math.random() * 3) };
};

/** The id the career player goes by in the league. */
export const careerPlayerId = (c: CareerCreation) =>
  `career_${`${c.firstName}_${c.lastName}`.toLowerCase().normalize('NFD').replace(/[^a-z_]+/g, '')}`;

/**
 * The career player as a draft prospect. `ovr` is his real rating (the
 * combine's delta already in); the league only ever sees it through a
 * scouting report until he is drafted, like every prospect.
 */
export const buildCareerPlayer = (c: CareerCreation, ovr: number, potential: Player['potential']): Player => {
  const style = styleById(c.style);
  const off = clamp(ovr + Math.round(style.tilt / 2) + jitter(1), 58, 92);
  const def = clamp(ovr - Math.round(style.tilt / 2) + jitter(1), 58, 92);
  return {
    id: careerPlayerId(c),
    name: `${c.firstName} ${c.lastName}`.trim(),
    pos: c.position,
    positions: [c.position],
    ovr,
    off,
    def,
    attributes: attributesFor(c, ovr),
    espnId: null,
    nbaId: null,
    age: 19,
    number: c.number,
    potential,
    salary: 1_050_000,
    contractYears: 3,
    heightCm: c.heightCm,
    weightKg: c.weightKg,
    skinTone: c.skinTone,
    personality: c.personality,
    prospect: true,
  } as Player;
};

/* ------------------------------------------------------------------ */
/* The combine                                                          */
/* ------------------------------------------------------------------ */
// Three tests, each a choice between a safe showing and a risky one, then the
// interview. A good week adds a few points to how good he really is (he
// trained for it) and, more, to how sure the teams are of him; a bad one costs.

export type CombineChoice = 'safe' | 'bold';
export type InterviewTone = 'humble' | 'confident' | 'brash';

/** One test: the safe choice lands most of the time for a middling grade; the
 *  bold one is a coin flip between a standout and a bad day, tilted by his
 *  attribute for it. */
export const runCombineTest = (attr: number, choice: CombineChoice): number => {
  const edge = (attr - 70) / 40; // -0.3 .. +0.5
  if (choice === 'safe') return clamp(Math.round(62 + edge * 20 + (Math.random() - 0.5) * 16), 30, 85);
  const hit = Math.random() < 0.5 + edge;
  return hit ? clamp(Math.round(84 + Math.random() * 14), 70, 99) : clamp(Math.round(35 + Math.random() * 20), 20, 60);
};

export const interviewScore = (tone: InterviewTone): number => {
  if (tone === 'humble') return 70 + Math.round(Math.random() * 10);
  if (tone === 'confident') return 60 + Math.round(Math.random() * 30);
  return Math.random() < 0.4 ? 90 : 35; // brash: some front offices love it
};

export const finishCombine = (shooting: number, athletic: number, interview: number): CombineResult => {
  const avg = shooting * 0.4 + athletic * 0.4 + interview * 0.2;
  // -2 .. +6 OVR: the combine is a stage, not a transformation.
  const ovrDelta = clamp(Math.round((avg - 58) / 6), -2, 6);
  const summary = avg >= 80 ? 'Semana de destaque: seu nome subiu nas listas.'
    : avg >= 65 ? 'Semana sólida: os times saíram com uma boa leitura de você.'
      : avg >= 50 ? 'Semana irregular: alguns times ficaram com dúvidas.'
        : 'Semana ruim: sua cotação caiu.';
  return { shooting, athletic, interview, ovrDelta, summary };
};
