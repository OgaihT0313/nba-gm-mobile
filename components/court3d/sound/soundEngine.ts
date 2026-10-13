// The watched game's sound, synthesized live (no samples): the floor, the rim,
// the whistle and buzzer, and a crowd that lives under all of it and swells
// with what happens. Built on the Web Audio API -- react-native-audio-api on
// the phone, the browser's own on the web (see audioContext.ts) -- so every
// bounce, squeak and clank comes out a little different, and the crowd
// follows the game instead of a loop restarting.
//
// Recipes adapted from a Gemini prototype (dribble thud, filtered-noise
// swish, three-partial rim ring, two-tone whistle with a "pea" wobble).
import { createAudioContext } from './audioContext';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ctx = any;

/** Base crowd level: a murmur under the game. */
const CROWD_BASE = 0.07;

export interface SoundEngine {
  dribble: () => void;
  squeak: () => void;
  swish: () => void;
  rim: () => void;
  dunk: () => void;
  whistle: () => void;
  buzzer: () => void;
  /** 0-1: how loud the building gets, held for `holdS` seconds, then settles. */
  crowd: (level: number, holdS?: number) => void;
  /** Silence everything while the app is in the background, and bring it back. */
  pause: () => void;
  resume: () => void;
  close: () => void;
}

const noop: SoundEngine = {
  dribble: () => {}, squeak: () => {}, swish: () => {}, rim: () => {}, dunk: () => {},
  whistle: () => {}, buzzer: () => {}, crowd: () => {}, pause: () => {}, resume: () => {}, close: () => {},
};

const jitter = (v: number, pct: number) => v * (1 + (Math.random() * 2 - 1) * pct);

export const createSoundEngine = (): SoundEngine => {
  let ctx: Ctx = null;
  try { ctx = createAudioContext(); } catch { ctx = null; }
  if (!ctx) return noop;

  const out = ctx.destination;
  // Everything goes through one master, a touch under full scale so a dunk
  // over a roaring crowd never clips.
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(out);

  const noiseBuffer = (seconds: number, shape?: (t: number) => number) => {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (shape ? shape(i / n) : 1);
    return buf;
  };

  // --- The crowd: looping band-limited noise, gain riding on top. ---
  const crowdGain = ctx.createGain();
  crowdGain.gain.value = CROWD_BASE;
  try {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(3);
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 520;
    band.Q.value = 0.9;
    // A second, lower band: the room's rumble under the voices.
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 260;
    src.connect(band);
    src.connect(low);
    band.connect(crowdGain);
    low.connect(crowdGain);
    crowdGain.connect(master);
    src.start();
  } catch { /* no crowd bed, the rest still plays */ }

  // Paused by the app (backgrounded): no sound may wake the context until the
  // app comes back -- the crowd bed loops forever otherwise, screen off or not.
  let paused = false;
  const resume = () => { if (paused) return; try { if (ctx.state === 'suspended') ctx.resume(); } catch { /* ignore */ } };

  const tone = (type: string, f0: number, f1: number, dur: number, vol: number, at = 0) => {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  };

  const burst = (dur: number, filterType: string, f0: number, f1: number, q: number, vol: number, shape?: (t: number) => number) => {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur, shape);
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.05, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur);
  };

  const engine: SoundEngine = {
    dribble: () => {
      resume();
      // The ball on hardwood: a dropping thud plus a short slap.
      tone('triangle', jitter(140, 0.08), 42, 0.11, jitter(0.5, 0.15));
      tone('sine', jitter(320, 0.08), 110, 0.045, 0.25);
    },
    squeak: () => {
      resume();
      // Rubber on varnish: a fast, wobbling chirp high up.
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const g = ctx.createGain();
      const f = jitter(2300, 0.2);
      const dur = jitter(0.09, 0.3);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 1.25, t + dur);
      lfo.frequency.value = 90;
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(o.frequency);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 6;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(jitter(0.07, 0.3), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(bp);
      bp.connect(g);
      g.connect(master);
      o.start(t); lfo.start(t);
      o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
    },
    swish: () => {
      resume();
      // Net friction: a sweep of filtered noise, falling.
      burst(0.28, 'bandpass', jitter(1800, 0.1), 750, 3.5, 0.75, (x) => Math.sin(x * Math.PI));
    },
    rim: () => {
      resume();
      // Steel rim: three inharmonic partials ringing down.
      [640, 890, 1420].forEach((f, i) => tone('sine', jitter(f, 0.02), jitter(f, 0.02), 0.18 + i * 0.07, 0.32 / (i + 1)));
      tone('triangle', 180, 90, 0.08, 0.18);
    },
    dunk: () => {
      resume();
      engine.rim();
      // The stanchion shudders: a low, falling growl.
      tone('sawtooth', 95, 30, 0.38, 0.55);
    },
    whistle: () => {
      resume();
      const t = ctx.currentTime;
      const dur = 0.45;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.32, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      g.connect(master);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 28;
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain);
      [2600, 2780].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        if (i === 0) lfoGain.connect(o.frequency);
        o.connect(g);
        o.start(t);
        o.stop(t + dur);
      });
      lfo.start(t);
      lfo.stop(t + dur);
    },
    buzzer: () => {
      resume();
      [185, 230].forEach((f) => tone('sawtooth', f, f, 0.85, 0.28));
    },
    crowd: (level, holdS = 1.6) => {
      resume();
      const t = ctx.currentTime;
      const peak = CROWD_BASE + (0.9 - CROWD_BASE) * Math.max(0, Math.min(1, level));
      try {
        crowdGain.gain.cancelScheduledValues(t);
        crowdGain.gain.setValueAtTime(crowdGain.gain.value, t);
        crowdGain.gain.linearRampToValueAtTime(peak, t + 0.25);
        crowdGain.gain.setValueAtTime(peak, t + 0.25 + holdS * 0.4);
        crowdGain.gain.exponentialRampToValueAtTime(CROWD_BASE, t + 0.25 + holdS);
      } catch { /* ignore */ }
    },
    pause: () => { paused = true; try { ctx.suspend(); } catch { /* ignore */ } },
    resume: () => { paused = false; resume(); },
    close: () => { try { ctx.close(); } catch { /* ignore */ } },
  };
  return engine;
};
