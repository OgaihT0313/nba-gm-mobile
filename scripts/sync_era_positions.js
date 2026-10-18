// Real positions, heights and weights in every era (data/eras/*/players.json),
// from Basketball-Reference (scripts/fetch_bbref_positions.py ->
// scripts/fixtures/bbref_positions.json).
//
// Why: the eras' positions came from nba_api's generic "Guard / Forward /
// Center", so guards were all SG, forwards all SF, and the 1984-85 Lakers had
// no PG (Magic Johnson read SG) and no PF (Kurt Rambis read SF). Lineups are
// built by position (simulationService.getLineup), so a team without a real
// PG/PF filled those slots with whoever was left. Heights were the position's
// average (196 / 201 / 211 cm) and the 3D bodies were sized from them.
//
// Matching: the player's name in that season's Basketball-Reference table,
// the era team first (historic codes -- KCK, SEA, NJN, CHH, VAN... -- mapped
// to today's franchise), then any row of his that season. Height and weight
// come from the players index by the same id. The file is patched as text:
// only the pos / positions / heightCm / weightKg lines move, the rest stays as
// the pipeline wrote it (CRLF, "25.0").
//
//   node scripts/sync_era_positions.js [--dry]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ERAS = path.join(ROOT, 'data', 'eras');
const SOURCE = path.join(__dirname, 'fixtures', 'bbref_positions.json');
const DRY = process.argv.includes('--dry');
const VALID = new Set(['PG', 'SG', 'SF', 'PF', 'C']);

// Basketball-Reference's team codes over the years -> the app's franchise ids.
const TEAM = {
  ATL: 'atl', BOS: 'bos', NJN: 'bkn', NYN: 'bkn', BRK: 'bkn', CHA: 'cha', CHO: 'cha', CHH: 'nop',
  CHI: 'chi', CLE: 'cle', DAL: 'dal', DEN: 'den', DET: 'det', GSW: 'gsw', HOU: 'hou', IND: 'ind',
  LAC: 'lac', SDC: 'lac', BUF: 'lac', LAL: 'lal', MEM: 'mem', VAN: 'mem', MIA: 'mia', MIL: 'mil',
  MIN: 'min', NOH: 'nop', NOK: 'nop', NOP: 'nop', NYK: 'nyk', OKC: 'okc', SEA: 'okc', ORL: 'orl',
  PHI: 'phi', PHO: 'phx', POR: 'por', SAC: 'sac', KCK: 'sac', SAS: 'sas', TOR: 'tor', UTA: 'uta',
  WAS: 'was', WSB: 'was',
};

// Names the two sources spell differently (nba_api's -> Basketball-Reference's).
const ALIAS = {
  'world free': 'world b free', 'tiny archibald': 'nate archibald', 'fat lever': 'lafayette lever',
  'clifford robinson': 'cliff robinson', 'nene': 'nene hilario', 'mo williams': 'maurice williams',
};

const norm = (name) => {
  let n = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[.'’`]/g, '').replace(/-/g, ' ').replace(/\s+(jr|sr|ii|iii|iv)$/, '').replace(/\s+/g, ' ').trim();
  return ALIAS[n] ?? n;
};

/** Surname + the first three letters of the first name. */
const loose = (name) => {
  const parts = norm(name).split(' ');
  return parts.length > 1 ? `${parts[parts.length - 1]} ${parts[0].slice(0, 3)}` : parts[0];
};

const source = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const people = source.players;

const eol = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

/** Replace (or insert after `afterKey`) a scalar field inside one player's block. */
const setScalar = (block, key, value, afterKey, nl, pad) => {
  const re = new RegExp(`("${key}": )([^,\\r\\n]+)(,?)`);
  if (re.test(block)) return block.replace(re, (m, a, b, c) => `${a}${value}${c}`);
  const after = new RegExp(`(\\n[ \\t]*"${afterKey}": [^\\r\\n]*?,)`);
  if (!after.test(block)) return block;
  return block.replace(after, `$1${nl}${pad}"${key}": ${value},`);
};

const report = [];
let changedFiles = 0;
for (const dir of fs.readdirSync(ERAS)) {
  const m = /(\d{4})-\d{2}$/.exec(dir);
  if (!m) continue;
  const endYear = String(Number(m[1]) + 1);
  // This season first, then the nearest ones: a player who sat the whole
  // year hurt (Mourning 2002-03, Porzingis 2018-19) is on the roster but not
  // in that season's table.
  const yearsByDistance = [0, -1, 1, -2, 2].map((d) => String(Number(endYear) + d));
  const indexFor = (year) => {
    const byName = new Map();
    const byLoose = new Map();
    (source.seasons[year] ?? []).forEach((r) => {
      const k = norm(r.name);
      byName.set(k, [...(byName.get(k) ?? []), r]);
      const lk = loose(r.name);
      byLoose.set(lk, [...(byLoose.get(lk) ?? []), r]);
    });
    return { byName, byLoose };
  };
  const indexes = yearsByDistance.map(indexFor);
  /** Every row of his, the nearest season that has him: exact name, then
   *  surname + first three letters when that is unique ("Dan"/"Danny" Schayes). */
  const findRows = (name) => {
    for (const ix of indexes) {
      const exact = ix.byName.get(norm(name));
      if (exact?.length) return exact;
      const lo = ix.byLoose.get(loose(name));
      if (lo?.length && new Set(lo.map((r) => r.id)).size === 1) return lo;
    }
    return [];
  };

  const file = path.join(ERAS, dir, 'players.json');
  const teamsFile = path.join(ERAS, dir, 'teams.json');
  let text = fs.readFileSync(file, 'utf8');
  const nl = eol(text);
  const players = JSON.parse(text);
  const teamOf = {};
  JSON.parse(fs.readFileSync(teamsFile, 'utf8')).forEach((t) => t.roster.forEach((id) => { teamOf[id] = t.id; }));

  let matched = 0, moved = 0, sized = 0;
  const before = {}; const after = {};
  for (const [id, p] of Object.entries(players)) {
    before[p.pos] = (before[p.pos] ?? 0) + 1;
    const cands = findRows(p.name);
    const team = teamOf[id];
    const row = cands.find((r) => TEAM[r.team] === team) ?? cands.find((r) => r.team === 'TOT' || r.team === '2TM' || r.team === '3TM') ?? cands[0];
    if (!row) { after[p.pos] = (after[p.pos] ?? 0) + 1; continue; }
    matched++;
    const posList = row.pos.split('-').map((s) => s.trim()).filter((s) => VALID.has(s));
    const person = row.id ? people[row.id] : undefined;
    // This player's block in the file: from his key to the next top-level key.
    const start = text.indexOf(`"${id}": {`);
    if (start < 0) continue;
    const end = text.indexOf(`${nl}  }`, start);
    let block = text.slice(start, end);
    const pad = (block.match(/\n([ \t]*)"id":/) ?? [, '    '])[1];
    if (posList.length) {
      if (posList[0] !== p.pos) moved++;
      block = setScalar(block, 'pos', `"${posList[0]}"`, 'name', nl, pad);
      const arr = `[${nl}${posList.map((x) => `${pad}  "${x}"`).join(`,${nl}`)}${nl}${pad}]`;
      block = block.replace(/("positions": )\[[\s\S]*?\]/, `$1${arr}`);
    }
    if (person?.cm) {
      block = setScalar(block, 'heightCm', person.cm, 'ts', nl, pad);
      if (person.kg) block = setScalar(block, 'weightKg', person.kg, 'heightCm', nl, pad);
      sized++;
    }
    text = text.slice(0, start) + block + text.slice(end);
    const np = posList[0] ?? p.pos;
    after[np] = (after[np] ?? 0) + 1;
  }
  JSON.parse(text); // still valid
  const original = fs.readFileSync(file, 'utf8');
  if (!DRY && text !== original) { fs.writeFileSync(file, text); changedFiles++; }
  const total = Object.keys(players).length;
  const fmt = (d) => ['PG', 'SG', 'SF', 'PF', 'C'].map((k) => `${k} ${d[k] ?? 0}`).join(' ');
  report.push(`${dir} | ${matched}/${total} achados, ${moved} mudaram de posição, ${sized} com altura real | antes: ${fmt(before)} | depois: ${fmt(after)}`);
}
report.forEach((l) => console.log(l));
console.log(`\n${changedFiles} arquivos ${DRY ? 'seriam alterados (--dry)' : 'alterados'}`);
