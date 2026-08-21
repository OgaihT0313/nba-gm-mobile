// One-off generator for the 3D watch-game's placeholder sound effects.
// No real recordings/assets exist for this project yet, so these are
// synthesized from scratch (noise + oscillators, no external samples) —
// self-contained, no licensing question, good enough for v1 game feel.
// Run once with `node scripts/generate_sfx.js`; the .wav output in
// assets/sfx/ is what actually ships, this script isn't part of the app.
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;

function writeWav(filePath, samples) {
  const dataSize = samples.length * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buffer);
}

const envelope = (t, attack, decay) => (t < attack ? t / attack : Math.max(0, 1 - (t - attack) / decay));
const noise = () => Math.random() * 2 - 1;

// RBJ resonant bandpass biquad — turns white noise into a fabric/net-like
// "shh" centered on one frequency instead of full-spectrum hiss.
function bandpass(samples, centerHz, q) {
  const w0 = (2 * Math.PI * centerHz) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = alpha, b1 = 0, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  return out;
}

// Simple one-pole lowpass, cutoff swept per-sample via `cutoffAt(i)` — used
// for the crowd noise bed instead of the fixed-center bandpass above, since a
// crowd swell reads better as a rumble that opens up and settles than as a
// single resonant peak.
function lowpassSwept(samples, cutoffAt) {
  const out = new Float32Array(samples.length);
  let y = 0;
  for (let i = 0; i < samples.length; i++) {
    const w0 = (2 * Math.PI * cutoffAt(i)) / SAMPLE_RATE;
    const a = Math.min(1, w0);
    y += a * (samples[i] - y);
    out[i] = y;
  }
  return out;
}

// Made basket — filtered noise burst, reads as the net "swish" rather than a
// tonal chime.
function genSwish() {
  const dur = 0.28;
  const n = Math.floor(SAMPLE_RATE * dur);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = noise();
  const shaped = bandpass(raw, 3200, 1.1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = shaped[i] * envelope(i / SAMPLE_RATE, 0.01, dur - 0.01) * 0.9;
  return out;
}

// Quarter/game-end buzzer — a handful of odd harmonics of a low fundamental,
// flat sustain then a short tail, the classic gym-buzzer shape.
function genBuzzer() {
  const dur = 0.55;
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float32Array(n);
  const freq = 220;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    for (let h = 1; h <= 6; h++) s += Math.sin(2 * Math.PI * freq * h * t) / h;
    const env = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.05);
    out[i] = s * 0.35 * env;
  }
  return out;
}

// Tip-off whistle — swept high sine with a light warble, like a ref's pea
// whistle.
function genWhistle() {
  const dur = 0.32;
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const freq = 2600 + 900 * Math.sin(t * 14);
    out[i] = Math.sin(2 * Math.PI * freq * t) * envelope(t, 0.02, dur - 0.02) * 0.5;
  }
  return out;
}

// Ball dribble bounce — a quick low-thump pitch sweep, played on a loop
// during idle possession to fill the silence between plays. Reference:
// synthesis idea adapted from a Gemini-generated prototype the user shared
// (Downloads/nba-gm-mobile.zip, web-only Web Audio original — not portable
// code, just the frequency/envelope shape) rather than written from scratch.
function genDribble() {
  const dur = 0.1;
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const freq = 150 - 90 * (t / dur);
    out[i] = Math.sin(2 * Math.PI * freq * t) * envelope(t, 0.005, dur - 0.005) * 0.4;
  }
  return out;
}

// Crowd cheer swell — filtered noise whose lowpass cutoff and gain both rise
// then settle, reading as an arena eruption rather than flat hiss. Played
// alongside the swish on a made three-pointer. Same Gemini-prototype-derived
// synthesis idea as genDribble() above, reimplemented with this file's own
// lowpassSwept() helper instead of Web Audio's BiquadFilterNode.
function genCrowd() {
  const dur = 1.1;
  const n = Math.floor(SAMPLE_RATE * dur);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = noise() * 0.8;
  const cutoffAt = (i) => {
    const t = i / SAMPLE_RATE;
    const rise = Math.min(1, t / 0.35);
    const settle = t > 0.35 ? Math.max(0.4, 1 - (t - 0.35) / dur) : 1;
    return 500 + 900 * rise * settle;
  };
  const shaped = lowpassSwept(raw, cutoffAt);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / (dur - 0.3));
    out[i] = shaped[i] * env * 0.8;
  }
  return out;
}

const outDir = path.join(__dirname, '..', 'assets', 'sfx');
fs.mkdirSync(outDir, { recursive: true });
writeWav(path.join(outDir, 'swish.wav'), genSwish());
writeWav(path.join(outDir, 'buzzer.wav'), genBuzzer());
writeWav(path.join(outDir, 'whistle.wav'), genWhistle());
writeWav(path.join(outDir, 'dribble.wav'), genDribble());
writeWav(path.join(outDir, 'crowd.wav'), genCrowd());
console.log('Generated swish.wav, buzzer.wav, whistle.wav, dribble.wav, crowd.wav in', outDir);
