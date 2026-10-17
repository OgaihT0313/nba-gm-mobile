// The moments of a game you play (PLANO-CARREIRA.md, fase 2): the possessions
// where the ball -- or the decision -- is yours. The rest of the game is the
// watched game as the GM sees it; these few stop the clock and ask.
//
// A moment is a READ (what the defense is giving you) and three or four
// options. Every option has a chance from your attribute against the man
// guarding you (a real player on the other team), and the one the read points
// to gets a bonus: choosing well is visible, not a coin flip. What it is worth
// is measured against the average choice, so the team's score only moves by
// how much better (or worse) than average you decided -- the engine's expected
// points already contain a player of your rating making average decisions.
// check_career measures it: the good robot against the random one, +1 to +2
// points a game.
import type { Player, PlayerAttributes, Team } from '../../types';
import { getPlayerAttributes } from '../../constants';
import { getRotationWeights } from '../simulationService';

type AttrKey = keyof PlayerAttributes;
type Rng = () => number;

export type MomentKind = 'ball' | 'offball' | 'defense';

export interface MomentOption {
  id: string;
  label: string;
  detail: string;
  /** Your attribute this lives on, and the defender's it runs into. */
  mine: AttrKey;
  theirs: AttrKey;
  /** Chance at even attributes, before the read's bonus. */
  base: number;
  /** Points if it works (for a defensive option: points it takes off them). */
  pts: number;
  /** Your points (a pass scores for a teammate) and whether it's your assist. */
  mePts: boolean;
  assist?: boolean;
  steal?: boolean;
  /** On defense, a gamble that misses gives them an easy two. */
  missCost?: number;
}

export interface Moment {
  id: string;
  quarter: number;
  /** Seconds into the quarter the moment comes up. */
  at: number;
  kind: MomentKind;
  read: string;
  /** The option the read points to. */
  best: string;
  /** The option the read argues against hardest. */
  worst: string;
  defenderId: string;
  defenderName: string;
  options: MomentOption[];
}

export interface MomentResult {
  momentId: string;
  optionId: string;
  success: boolean;
  /** Chose what the read pointed to / against. */
  good: boolean;
  bad: boolean;
  /** Your box score from it. */
  pts: number;
  ast: number;
  stl: number;
  /** Points over the average choice for your team, and taken off theirs. */
  teamDelta: number;
  oppDelta: number;
  /** Your points over what the average choice would have given you. */
  meDelta: number;
  text: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** How much the read adds to the option it points to. */
export const READ_BONUS = 0.17;
/** Chance per attribute point over the defender's. */
const PER_POINT = 0.011;

/* ------------------------------------------------------------------ */
/* The options                                                          */
/* ------------------------------------------------------------------ */

const O = {
  three: { id: 'three', label: 'Arremessar de três', detail: 'Pega e chuta.', mine: 'shooting', theirs: 'perimeterD', base: 0.36, pts: 3, mePts: true },
  pullup: { id: 'pullup', label: 'Arremesso de meia distância', detail: 'Um drible e sobe.', mine: 'shooting', theirs: 'perimeterD', base: 0.44, pts: 2, mePts: true },
  drive: { id: 'drive', label: 'Infiltrar', detail: 'Ataca a cesta.', mine: 'finishing', theirs: 'interiorD', base: 0.52, pts: 2, mePts: true },
  pass: { id: 'pass', label: 'Passar para o livre', detail: 'Acha quem sobrou.', mine: 'playmaking', theirs: 'perimeterD', base: 0.5, pts: 2, mePts: false, assist: true },
  post: { id: 'post', label: 'Jogar de costas', detail: 'Posiciona e gira.', mine: 'finishing', theirs: 'interiorD', base: 0.48, pts: 2, mePts: true },
  hold: { id: 'hold', label: 'Segurar e reiniciar', detail: 'Gasta o relógio e arma de novo.', mine: 'playmaking', theirs: 'perimeterD', base: 0.38, pts: 2, mePts: false },
  cut: { id: 'cut', label: 'Cortar para a cesta', detail: 'Pelas costas do marcador.', mine: 'athleticism', theirs: 'perimeterD', base: 0.46, pts: 2, mePts: true },
  corner: { id: 'corner', label: 'Abrir na zona morta', detail: 'Espaça e espera o passe.', mine: 'shooting', theirs: 'perimeterD', base: 0.34, pts: 3, mePts: true },
  screen: { id: 'screen', label: 'Bloquear para o companheiro', detail: 'Abre o caminho do seu armador.', mine: 'athleticism', theirs: 'interiorD', base: 0.47, pts: 2, mePts: false },
  crash: { id: 'crash', label: 'Atacar o rebote', detail: 'Entra no garrafão no arremesso.', mine: 'rebounding', theirs: 'rebounding', base: 0.3, pts: 2, mePts: true },
  deny: { id: 'deny', label: 'Antecipar o passe', detail: 'Arrisca o roubo.', mine: 'perimeterD', theirs: 'playmaking', base: 0.3, pts: 2, mePts: false, steal: true, missCost: 2 },
  stay: { id: 'stay', label: 'Ficar no seu homem', detail: 'Defesa sólida, sem aposta.', mine: 'perimeterD', theirs: 'shooting', base: 0.5, pts: 1, mePts: false },
  help: { id: 'help', label: 'Fechar o garrafão', detail: 'Ajuda no pivô deles.', mine: 'interiorD', theirs: 'finishing', base: 0.42, pts: 2, mePts: false, missCost: 1 },
  contest: { id: 'contest', label: 'Contestar o arremesso', detail: 'Mão na cara do chutador.', mine: 'perimeterD', theirs: 'shooting', base: 0.42, pts: 2, mePts: false },
} satisfies Record<string, MomentOption>;

interface Situation {
  kind: MomentKind;
  read: (def: string) => string;
  options: MomentOption[];
  best: string;
  worst: string;
  /** Who gets this read more: a style that lives on these attributes. */
  leans?: AttrKey[];
}

const SITUATIONS: Situation[] = [
  { kind: 'ball', read: (d) => `${d} passa por baixo do corta-luz e te dá espaço atrás da linha.`, options: [O.three, O.drive, O.pass, O.hold], best: 'three', worst: 'hold', leans: ['shooting'] },
  { kind: 'ball', read: (d) => `${d} cola em você na linha de três. O caminho para a cesta está aberto.`, options: [O.three, O.drive, O.pullup, O.pass], best: 'drive', worst: 'three', leans: ['finishing', 'athleticism'] },
  { kind: 'ball', read: () => 'A ajuda fecha o garrafão quando você ataca. Um companheiro sobra na ponta.', options: [O.drive, O.pass, O.pullup, O.hold], best: 'pass', worst: 'drive', leans: ['playmaking'] },
  { kind: 'ball', read: (d) => `Troca na marcação: ${d} fica com você na meia distância, lento para sair.`, options: [O.pullup, O.three, O.drive, O.pass], best: 'pullup', worst: 'pass', leans: ['shooting', 'finishing'] },
  { kind: 'ball', read: (d) => `Você recebe no poste baixo com ${d} nas costas, menor que você.`, options: [O.post, O.pass, O.pullup, O.hold], best: 'post', worst: 'hold', leans: ['finishing', 'rebounding'] },
  { kind: 'ball', read: () => 'Fim do relógio de posse: 5 segundos e a defesa bem posicionada.', options: [O.pullup, O.three, O.drive, O.pass], best: 'drive', worst: 'pass' },
  { kind: 'offball', read: (d) => `${d} vira a cabeça para acompanhar a bola. As costas dele ficam livres.`, options: [O.cut, O.corner, O.screen, O.crash], best: 'cut', worst: 'crash', leans: ['athleticism'] },
  { kind: 'offball', read: () => 'O armador ataca pelo meio e a defesa afunila. A zona morta esvazia.', options: [O.corner, O.cut, O.screen, O.crash], best: 'corner', worst: 'cut', leans: ['shooting'] },
  { kind: 'offball', read: (d) => `${d} pressiona alto o seu armador. Um bloqueio solta ele.`, options: [O.screen, O.cut, O.corner, O.crash], best: 'screen', worst: 'corner' },
  { kind: 'offball', read: () => 'Arremesso longo do companheiro, e o pivô deles saiu para contestar.', options: [O.crash, O.corner, O.cut, O.screen], best: 'crash', worst: 'corner', leans: ['rebounding'] },
  { kind: 'defense', read: (d) => `${d} vai receber de costas, e o passe vem lento.`, options: [O.deny, O.stay, O.help], best: 'deny', worst: 'help', leans: ['perimeterD'] },
  { kind: 'defense', read: () => 'O pivô deles domina o garrafão. O seu homem é um mau arremessador.', options: [O.help, O.stay, O.deny], best: 'help', worst: 'deny', leans: ['interiorD'] },
  { kind: 'defense', read: (d) => `${d} é o melhor chutador deles e sai do bloqueio para arremessar.`, options: [O.contest, O.help, O.deny], best: 'contest', worst: 'help' },
];

/* ------------------------------------------------------------------ */
/* Building a game's moments                                            */
/* ------------------------------------------------------------------ */

/** How many moments a game asks of you, by your role (0 = star ... 4 = out of it). */
export const momentsForRole = (rank: number): number => [7, 6, 5, 4, 2][clamp(rank, 0, 4)];

/** The man guarding you: their player at your position, the best of them. */
const defenderFor = (me: Player, opp: Team, players: { [id: string]: Player }): Player | undefined => {
  const rotation = getRotationWeights(opp, players).ids.map((id) => players[id]).filter(Boolean);
  return rotation.find((p) => p.pos === me.pos) ?? rotation.find((p) => (p.positions ?? []).includes(me.pos)) ?? rotation[0];
};

const firstName = (name: string) => name.split(' ')[0];

/**
 * Tonight's moments. Spread over the four quarters at times when you are
 * likely to be on the floor (the screen skips one that comes while you sit).
 */
export const buildMoments = (
  me: Player, opp: Team, players: { [id: string]: Player }, roleRank: number, rng: Rng = Math.random,
): Moment[] => {
  const n = momentsForRole(roleRank);
  const def = defenderFor(me, opp, players);
  const a = getPlayerAttributes(me);
  const out: Moment[] = [];
  // Situations weighted toward what you are: a shooter is left open more, a
  // big gets the post. Defense comes up about one time in four.
  const pick = (): Situation => {
    const weights = SITUATIONS.map((s) => {
      let w = s.kind === 'defense' ? 0.55 : s.kind === 'offball' ? 0.8 : 1;
      (s.leans ?? []).forEach((k) => { w *= 1 + Math.max(0, a[k] - 72) / 25; });
      return w;
    });
    let r = rng() * weights.reduce((x, y) => x + y, 0);
    for (let i = 0; i < SITUATIONS.length; i++) { r -= weights[i]; if (r <= 0) return SITUATIONS[i]; }
    return SITUATIONS[0];
  };
  for (let i = 0; i < n; i++) {
    // Even across the game, the last one late in the fourth.
    const quarter = Math.min(4, 1 + Math.floor((i * 4) / n));
    const at = 90 + rng() * 540;
    const s = pick();
    out.push({
      id: `m${i}`,
      quarter,
      at: i === n - 1 && n > 2 ? 560 + rng() * 120 : at,
      kind: s.kind,
      read: s.read(def ? firstName(def.name) : 'O marcador'),
      best: s.best,
      worst: s.worst,
      defenderId: def?.id ?? '',
      defenderName: def?.name ?? 'o marcador',
      options: s.options,
    });
  }
  return out.sort((x, y) => x.quarter - y.quarter || x.at - y.at);
};

/* ------------------------------------------------------------------ */
/* Resolving one                                                        */
/* ------------------------------------------------------------------ */

/** The chance this option works for you, against this defender, on this read. */
export const chanceOf = (m: Moment, o: MomentOption, me: Player, def: Player | undefined): number => {
  const mine = getPlayerAttributes(me)[o.mine];
  const theirs = def ? getPlayerAttributes(def)[o.theirs] : 75;
  const read = o.id === m.best ? READ_BONUS : o.id === m.worst ? -READ_BONUS * 0.6 : 0;
  return clamp(o.base + (mine - theirs) * PER_POINT + read, 0.08, 0.88);
};

/** What an option is worth to your team on average (defense: points saved). */
const valueOf = (m: Moment, o: MomentOption, me: Player, def: Player | undefined) => {
  const p = chanceOf(m, o, me, def);
  return p * o.pts - (1 - p) * (o.missCost ?? 0);
};

/** The average choice's worth: what the engine already counts a player for. */
export const averageValue = (m: Moment, me: Player, def: Player | undefined) =>
  m.options.reduce((s, o) => s + valueOf(m, o, me, def), 0) / m.options.length;

const averageMine = (m: Moment, me: Player, def: Player | undefined) =>
  m.options.reduce((s, o) => s + (o.mePts ? chanceOf(m, o, me, def) * o.pts : 0), 0) / m.options.length;

export const resolveMoment = (
  m: Moment, optionId: string, me: Player, players: { [id: string]: Player }, rng: Rng = Math.random,
): MomentResult => {
  const o = m.options.find((x) => x.id === optionId) ?? m.options[0];
  const def = players[m.defenderId];
  const success = rng() < chanceOf(m, o, me, def);
  const avg = averageValue(m, me, def);
  const isDef = m.kind === 'defense';
  const value = success ? o.pts : -(o.missCost ?? 0);
  const pts = success && o.mePts ? o.pts : 0;
  const ast = success && o.assist ? 1 : 0;
  const stl = success && o.steal ? 1 : 0;
  const teamDelta = isDef ? 0 : value - avg;
  const oppDelta = isDef ? -(value - avg) : 0;
  const meDelta = pts - averageMine(m, me, def);
  const defName = firstName(m.defenderName);
  let text: string;
  if (isDef) {
    text = success
      ? (o.steal ? 'Roubo! Você leu o passe.' : 'Parada. Eles saem sem nada.')
      : (o.missCost ? `${defName} castiga a aposta: cesta fácil deles.` : 'Eles pontuam mesmo assim.');
  } else if (success) {
    text = o.assist ? 'Passe certo, cesta do companheiro.' : o.mePts ? `Cesta de ${o.pts}!` : 'O bloqueio funciona: cesta do time.';
  } else {
    text = o.mePts ? `${defName} contesta e a bola não cai.` : 'Não sai nada da jogada.';
  }
  return {
    momentId: m.id, optionId: o.id, success,
    good: o.id === m.best, bad: o.id === m.worst,
    pts, ast, stl, teamDelta, oppDelta, meDelta, text,
  };
};

/**
 * How the court plays a decided moment out (WatchGameScreen restages the next
 * trip with it): which set, who shoots, from where, and whether it falls.
 * On defense it is THEIR trip, their man shooting, falling when you failed.
 */
export interface MomentStage {
  onDefense: boolean;
  shooter: 'me' | 'mate' | 'their';
  play: 'pick_roll' | 'pindown' | 'post_up' | 'iso';
  shotKind: 2 | 3;
  made: boolean;
  points: number;
  /** You get the assist when it falls. */
  assist: boolean;
}

export const stageOf = (m: Moment, r: MomentResult): MomentStage => {
  if (m.kind === 'defense') {
    return { onDefense: true, shooter: 'their', play: 'iso', shotKind: 2, made: !r.success, points: 2, assist: false };
  }
  switch (r.optionId) {
    case 'three':
    case 'corner':
      return { onDefense: false, shooter: 'me', play: 'pindown', shotKind: 3, made: r.success, points: 3, assist: false };
    case 'post':
      return { onDefense: false, shooter: 'me', play: 'post_up', shotKind: 2, made: r.success, points: 2, assist: false };
    case 'pullup':
    case 'drive':
    case 'cut':
    case 'crash':
      return { onDefense: false, shooter: 'me', play: 'iso', shotKind: 2, made: r.success, points: 2, assist: false };
    case 'pass':
      return { onDefense: false, shooter: 'mate', play: 'pick_roll', shotKind: 2, made: r.success, points: 2, assist: true };
    default: // screen, hold: a teammate finishes the trip you set up
      return { onDefense: false, shooter: 'mate', play: 'pick_roll', shotKind: 2, made: r.success, points: 2, assist: false };
  }
};

/** The coach notices how you decide, more than whether it fell. */
export const trustFromMoments = (results: MomentResult[]): number =>
  results.reduce((t, r) => t + (r.good ? 0.45 : r.bad ? -0.4 : 0) + (r.success ? 0.12 : -0.05), 0);

/** Tonight's moments, summed into what the season box score adds to you. */
export const momentTotals = (results: MomentResult[]) => ({
  pts: results.reduce((s, r) => s + r.meDelta, 0),
  ast: results.reduce((s, r) => s + r.ast, 0) * 0.5,
  stl: results.reduce((s, r) => s + r.stl, 0),
});
