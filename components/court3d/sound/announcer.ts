// The arena announcer: short lines in Brazilian Portuguese at the moments
// that matter -- the tip, a three, a dunk, a lead change late, the end of a
// period -- spoken by the device's own text-to-speech (expo-speech; the
// browser's speechSynthesis on the web). No recordings to ship, and any name
// in the league can be said.
//
// It talks less than it could on purpose: a line is dropped when the last one
// is still being said, unless it's one that can't be missed (the buzzer, a
// lead change), which cuts in.
import * as Speech from 'expo-speech';

export interface Announcer {
  /** Says `text`; `important` cuts off whatever is being said instead of yielding. */
  say: (text: string, important?: boolean) => void;
  setEnabled: (on: boolean) => void;
  stop: () => void;
}

export const createAnnouncer = (): Announcer => {
  let enabled = true;
  let busyUntil = 0;
  return {
    say: (text, important = false) => {
      if (!enabled || !text) return;
      const now = Date.now();
      if (!important && now < busyUntil) return;
      try {
        if (important) Speech.stop();
        // A rough length for the line, so the next one waits its turn.
        busyUntil = now + 700 + text.length * 70;
        Speech.speak(text, { language: 'pt-BR', rate: 1.1, pitch: 0.92 });
      } catch { /* no voice on this device: the game goes on in silence */ }
    },
    setEnabled: (on) => {
      enabled = on;
      if (!on) { try { Speech.stop(); } catch { /* ignore */ } }
    },
    stop: () => { try { Speech.stop(); } catch { /* ignore */ } },
  };
};

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/** "Shai Gilgeous-Alexander" -> "Gilgeous-Alexander"; suffixes dropped. */
export const spokenName = (name: string) => {
  const parts = name.split(' ').filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(w));
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0] ?? '';
};

const ORDINAL = ['primeiro', 'segundo', 'terceiro', 'quarto'];

/** The lines, so the screen only decides when, not what. */
export const LINES = {
  tipOff: () => pick(['Bola ao alto!', 'Bola ao alto, começa o jogo!']),
  overtime: () => 'Prorrogação!',
  three: (n: string) => pick([`${n}, de três!`, `Bola de três de ${n}!`, `Chuá! ${n} de três!`, `De longe! ${n}!`]),
  dunk: (n: string) => pick([`Enterrada de ${n}!`, `Que enterrada de ${n}!`, `${n} enterra com força!`, `Pra cima dele! ${n}!`]),
  two: (n: string) => pick([`Cesta de ${n}.`, `${n} pontua.`, `${n}, dois pontos.`]),
  leadChange: (team: string) => pick([`Virada! ${team} na frente!`, `Vira o jogo! ${team} passa à frente!`]),
  timeout: (team: string) => `Pedido de tempo, ${team}.`,
  quarterEnd: (q: number) => (q === 2 ? 'Fim do primeiro tempo!' : q <= 4 ? `Fim do ${ORDINAL[q - 1]} quarto.` : 'Fim da prorrogação.'),
  toOvertime: () => 'Empate! Vamos para a prorrogação!',
  final: (winner: string, a: number, b: number) => `Fim de jogo! Vitória do ${winner}, ${a} a ${b}!`,
};
