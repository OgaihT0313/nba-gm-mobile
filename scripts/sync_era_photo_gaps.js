// Fill the eras' photo gaps (PLANO-FOTOS-ERAS.md): the NBA's CDN answers a
// missing headshot with a generic grey silhouette (always the same 4,937-byte
// 260x190 file), and most players before ~2005 get it -- 267 of 287 in
// 1979-80, Jason Kidd and Tim Hardaway in 1995-96.
//   1. Find the silhouettes: every player whose photo is the NBA's "latest"
//      (team-season photos are always real) is checked once.
//   2. Look each one up on ESPN (search by name, NBA athletes only, exact
//      name) and take ESPN's headshot when it exists -- it covers most of the
//      2000s (Kidd, Larry Hughes, Okur), few retirees of the 80s and 90s.
//   3. Whoever is still without a photo is marked "photoMissing": the app
//      draws an avatar for him (PlayerPhoto) instead of the silhouette.
// Answers are cached in scripts/fixtures/photo_gaps_cache.json, so a re-run
// only asks about players it has never seen. Patches the files as text.
//
//   node scripts/sync_era_photo_gaps.js [--dry]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ERAS = path.join(ROOT, 'data', 'eras');
const CACHE_FILE = path.join(__dirname, 'fixtures', 'photo_gaps_cache.json');
const DRY = process.argv.includes('--dry');
const SILHOUETTE_BYTES = 4937;

const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : { silhouette: {}, espn: {}, espnPhoto: {} };
const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (n) => n.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.'’`-]/g, ' ').replace(/\s+/g, ' ').trim();

const pool = async (items, n, fn) => {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } }));
};

const isSilhouette = async (nbaId) => {
  if (nbaId in cache.silhouette) return cache.silhouette[nbaId];
  const res = await fetch(`https://cdn.nba.com/headshots/nba/latest/260x190/${nbaId}.png`);
  const bytes = (await res.arrayBuffer()).byteLength;
  cache.silhouette[nbaId] = res.status !== 200 || bytes === SILHOUETTE_BYTES;
  return cache.silhouette[nbaId];
};

const espnIdFor = async (name) => {
  if (name in cache.espn) return cache.espn[name];
  const res = await fetch(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=8`);
  await sleep(250);
  let id = null;
  try {
    const j = await res.json();
    const hits = (j.results ?? []).flatMap((r) => r.contents ?? [])
      .filter((c) => /~l:46~a:\d+/.test(c.uid ?? '') && norm(c.displayName ?? '') === norm(name));
    // Two NBA players with the exact name: can't tell which, leave him out.
    const ids = [...new Set(hits.map((c) => c.uid.split('a:')[1]))];
    id = ids.length === 1 ? ids[0] : null;
  } catch { id = null; }
  cache.espn[name] = id;
  return id;
};

const espnHasPhoto = async (id) => {
  if (id in cache.espnPhoto) return cache.espnPhoto[id];
  const res = await fetch(`https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`, { method: 'HEAD' });
  cache.espnPhoto[id] = res.status === 200;
  return cache.espnPhoto[id];
};

(async () => {
  const dirs = fs.readdirSync(ERAS).filter((d) => /\d{4}-\d{2}$/.test(d)).sort();
  // Everyone on a "latest" photo, once.
  const people = new Map();
  for (const d of dirs) {
    Object.values(JSON.parse(fs.readFileSync(path.join(ERAS, d, 'players.json'), 'utf8'))).forEach((p) => {
      if (p.nbaId && (!p.photoUrl || p.photoUrl.includes('/latest/'))) people.set(p.nbaId, p.name);
    });
  }
  console.log(`${people.size} jogadores com foto "latest" para conferir`);
  const silhouettes = [];
  await pool([...people.keys()], 6, async (id) => { if (await isSilhouette(id)) silhouettes.push(id); });
  saveCache();
  console.log(`${silhouettes.length} com silhueta; buscando na ESPN...`);
  const found = new Map();
  await pool(silhouettes, 3, async (nbaId) => {
    const id = await espnIdFor(people.get(nbaId));
    if (id && await espnHasPhoto(id)) found.set(nbaId, id);
  });
  saveCache();
  console.log(`ESPN: ${found.size} fotos; ${silhouettes.length - found.size} ficam com avatar`);

  const silSet = new Set(silhouettes);
  const report = [];
  for (const d of dirs) {
    const file = path.join(ERAS, d, 'players.json');
    let text = fs.readFileSync(file, 'utf8');
    const nl = text.includes('\r\n') ? '\r\n' : '\n';
    // A re-run starts from a clean slate for these two markers.
    text = text.replace(/\r?\n[ \t]*"photoMissing": true,/g, '');
    const players = JSON.parse(text);
    let espn = 0, avatar = 0, total = 0;
    for (const p of Object.values(players)) {
      total++;
      if (!silSet.has(p.nbaId) || (p.photoUrl && !p.photoUrl.includes('/latest/'))) continue;
      const line = new RegExp(`([ \\t]*)"photoUrl": "https://cdn\\.nba\\.com/headshots/nba/latest/1040x760/${p.nbaId}\\.png",`);
      const m = line.exec(text);
      if (!m) continue;
      const pad = m[1];
      const espnId = found.get(p.nbaId);
      const out = espnId
        ? `${pad}"photoUrl": "https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png",`
        : `${m[0]}${nl}${pad}"photoMissing": true,`;
      if (espnId) espn++; else avatar++;
      text = text.slice(0, m.index) + out + text.slice(m.index + m[0].length);
    }
    JSON.parse(text);
    if (!DRY) fs.writeFileSync(file, text);
    report.push(`${d} | ${total} jogadores | ${espn} com foto da ESPN | ${avatar} com avatar`);
  }
  report.forEach((l) => console.log(l));
})();
