// Every franchise's logo for every era season (1979-80 .. 2019-20), from
// thebasketballdatabase.com (TeamLogos/<CODE>-<season end year>.png.png),
// bundled into the app so the game never hotlinks a small site:
//   assets/era-logos/<hash>.png    -- each distinct image once (logos repeat for years),
//                                     its white background cleared (clearBackground)
//   src/eraLogos.ts                -- franchise-year -> image, with require()s Metro can bundle
// The site's code for a franchise changes with its history (SEA, NJN, VAN,
// KCK, SDC, CHH, NOH, NOK); src/eraIdentity.ts holds that table and this
// script reads it from there (logoCode), so both stay one source.
//
//   node scripts/fetch_era_logos.js
// Team logos are the NBA's and its teams' marks, used here the same way the
// app already uses the current ones from the NBA's CDN.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'era-logos');
const MAP_FILE = path.join(ROOT, 'src', 'eraLogos.ts');
const CACHE = path.join(ROOT, '.bbref-cache', 'logos');
const FIRST = 1980;
const LAST = 2020;
const IDS = ['atl', 'bkn', 'bos', 'cha', 'chi', 'cle', 'dal', 'den', 'det', 'gsw', 'hou', 'ind', 'lac', 'lal', 'mem',
  'mia', 'mil', 'min', 'nop', 'nyk', 'okc', 'orl', 'phi', 'phx', 'por', 'sac', 'sas', 'tor', 'uta', 'was'];

// Same rule as src/eraIdentity.ts logoCode (kept in sync by hand: a script
// can't import the app's TS without a build step).
const logoCode = (id, year) => {
  if (id === 'okc' && year <= 2008) return 'SEA';
  if (id === 'bkn' && year <= 2012) return 'NJN';
  if (id === 'mem' && year <= 2001) return 'VAN';
  if (id === 'sac' && year <= 1985) return 'KCK';
  if (id === 'lac' && year <= 1984) return 'SDC';
  if (id === 'cha' && year <= 2002) return 'CHH';
  if (id === 'nop' && (year === 2006 || year === 2007)) return 'NOK';
  if (id === 'nop' && year <= 2013) return 'NOH';
  return id.toUpperCase();
};

// The site files some years under an older code of the same franchise.
const ALT = { gsw: 'GOS', phi: 'PHL', sas: 'SAN', uta: 'UTH' };

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const get = async (code, year) => {
  const cached = path.join(CACHE, `${code}-${year}.png`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  const missing = `${cached}.missing`;
  if (fs.existsSync(missing)) return null;
  const res = await fetch(`https://www.thebasketballdatabase.com/TeamLogos/${code}-${year}.png.png`, { headers: { 'User-Agent': 'Mozilla/5.0 (nba-gm-mobile era logos)' } });
  await sleep(350);
  const type = res.headers.get('content-type') ?? '';
  if (res.status !== 200 || !type.startsWith('image/')) { fs.writeFileSync(missing, ''); return null; }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(cached, buf);
  return buf;
};

// The site's logos sit on an opaque white square, a white box on the app's
// dark screens. Clear the white that reaches the image's edge (flood fill from
// the border over light pixels), so the white inside a logo -- the Bulls'
// eyes, letters, a ball's seams -- stays. The light fill and the two rings of
// pixels around it are un-blended from white (color-to-alpha), so the logo's
// anti-aliased outline fades out instead of keeping a pale halo.
const LIGHT = 200;
const RINGS = 2;
const KEYLINE = 3; // px, on the site's 125 px images
const clearBackground = (buf) => {
  const png = PNG.sync.read(buf);
  const { width: w, height: h, data } = png;
  const minC = (i) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const light = (i) => data[i * 4 + 3] > 0 && minC(i) >= LIGHT;
  const reached = new Uint8Array(w * h);
  const queue = [];
  for (let x = 0; x < w; x++) queue.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) queue.push(y * w, y * w + w - 1);
  let front = [];
  while (queue.length) {
    const i = queue.pop();
    if (reached[i] || !light(i)) continue;
    reached[i] = 1;
    front.push(i);
    const x = i % w;
    if (x > 0) queue.push(i - 1);
    if (x < w - 1) queue.push(i + 1);
    if (i >= w) queue.push(i - w);
    if (i < w * (h - 1)) queue.push(i + w);
  }
  const unblend = (i) => {
    const a = Math.max(...[0, 1, 2].map((c) => 255 - data[i * 4 + c])) / 255;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = a === 0 ? 0 : Math.round(255 - (255 - data[i * 4 + c]) / a);
    data[i * 4 + 3] = Math.round(data[i * 4 + 3] * a);
  };
  [...front].forEach(unblend);
  for (let r = 0; r < RINGS; r++) {
    const next = [];
    front.forEach((i) => {
      const x = i % w;
      [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w].forEach((j) => {
        if (j < 0 || j >= w * h || reached[j]) return;
        reached[j] = 1;
        next.push(j);
        unblend(j);
      });
    });
    front = next;
  }
  // Without the white square a black or navy logo (Blazers, Spurs, the Jazz)
  // vanishes on the dark theme: a thin white keyline around the crest, like a
  // sticker, keeps its shape. On the light theme it is white on white.
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  const R = Math.ceil(KEYLINE);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = data[i * 4 + 3] / 255;
      if (a === 1) continue;
      let d = Infinity;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && solid[yy * w + xx]) d = Math.min(d, Math.hypot(dx, dy));
        }
      }
      const k = Math.max(0, Math.min(1, KEYLINE + 0.5 - d));
      if (k === 0) continue;
      const out = a + k * (1 - a);
      for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round((data[i * 4 + c] * a + 255 * k * (1 - a)) / out);
      data[i * 4 + 3] = Math.round(out * 255);
    }
  }
  return PNG.sync.write(png);
};

(async () => {
  const keyToHash = {};
  const files = new Set();
  let missing = 0;
  for (const id of IDS) {
    for (let year = FIRST; year <= LAST; year++) {
      const buf = (await get(logoCode(id, year), year)) ?? (ALT[id] ? await get(ALT[id], year) : null);
      if (!buf) { missing++; continue; }
      const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
      const file = path.join(OUT_DIR, `${hash}.png`);
      if (!files.has(hash)) { fs.writeFileSync(file, clearBackground(buf)); files.add(hash); }
      keyToHash[`${id}-${year}`] = hash;
    }
    process.stdout.write(`${id} `);
  }
  const hashes = [...files].sort();
  const lines = [
    '// Generated by scripts/fetch_era_logos.js -- do not edit by hand.',
    '// Each franchise\'s logo for each era season (key: "<id>-<season end year>"),',
    '// from thebasketballdatabase.com, bundled. Read through src/eraIdentity.ts.',
    '/* eslint-disable */',
    'const IMAGES: number[] = [',
    ...hashes.map((h) => `  require('../assets/era-logos/${h}.png'),`),
    '];',
    `const INDEX: Record<string, number> = ${JSON.stringify(Object.fromEntries(Object.entries(keyToHash).map(([k, h]) => [k, hashes.indexOf(h)])))};`,
    'export const eraLogo = (id: string, year: number): number | undefined => {',
    '  const i = INDEX[`${id}-${year}`];',
    '  return i === undefined ? undefined : IMAGES[i];',
    '};',
    '',
  ];
  fs.writeFileSync(MAP_FILE, lines.join('\n'));
  console.log(`\n${Object.keys(keyToHash).length} franquia-temporadas, ${hashes.length} imagens distintas, ${missing} sem logo no site`);
})();
