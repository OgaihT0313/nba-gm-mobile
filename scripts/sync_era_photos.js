// Gives every era player the official headshot closest to that era, instead
// of the latest one (PLANO-FOTOS-ERAS.md, phases 1 and 3).
//
// The NBA serves a photo per team and season at
//   cdn.nba.com/headshots/nba/{teamId}/{year}/1040x760/{nbaId}.png
// (year = the season's first year), but only from 2015-16 on. So:
//   - eras from 2015-16 on: the photo of his team that season; failing that,
//     the nearest season with his era team, then the nearest with any team;
//   - earlier eras: if he played on past 2015 his "latest" photo is from the
//     end of his career, so he gets the EARLIEST team-season photo there is
//     (the closest to the era), his era team's first;
//   - anyone else keeps "latest", which for a player retired before 2015 is
//     already a classic photo in that era's uniform.
// Where the photo still ends up 2+ seasons away from the era, the player is
// marked `photoOffEra` and the app gives the face an era treatment (sepia,
// grain, a card frame) -- the fallback chosen for the faces with no photo of
// their own time.
//
// Which (season, team) pairs to try comes from the data itself: the era rosters
// from 2015-16 on plus the current league (2025-26). Every URL is checked with
// a HEAD request once (cached in scripts/fixtures/photo_probe.json, so a re-run
// only asks about new pairs).
//
//   node scripts/sync_era_photos.js [--dry]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ERAS = path.join(ROOT, 'data', 'eras');
const CACHE_FILE = path.join(__dirname, 'fixtures', 'photo_probe.json');
const DRY = process.argv.includes('--dry');
const FIRST_SEASON_PHOTOS = 2015;
const CURRENT_SEASON = 2025;
const OFF_ERA_GAP = 2;

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const eol = (f) => (fs.readFileSync(f, 'utf8').includes('\r\n') ? '\r\n' : '\n');
const asList = (j) => (Array.isArray(j) ? j : Object.values(j));
const nbaTeamId = (team) => {
    const m = /\/logos\/nba\/(\d+)\//.exec(team.logoUrl || '');
    if (!m) throw new Error(`Sem id da NBA no logoUrl de ${team.id}`);
    return Number(m[1]);
};
const photoUrl = (year, teamId, nbaId) => `https://cdn.nba.com/headshots/nba/${teamId}/${year}/1040x760/${nbaId}.png`;

// --- the league, season by season ---------------------------------------------
// [{ dir, year, players (raw json), list, teamOf: playerId -> nbaTeamId }]
const loadSeason = (dir, year) => {
    const playersFile = path.join(dir, 'players.json');
    const raw = readJson(playersFile);
    const teamOf = {};
    asList(readJson(path.join(dir, 'teams.json'))).forEach((t) => {
        const id = nbaTeamId(t);
        (t.roster || []).forEach((pid) => { teamOf[pid] = id; });
    });
    return { dir, year, playersFile, raw, list: asList(raw), teamOf };
};

const eras = fs.readdirSync(ERAS)
    .filter((d) => fs.statSync(path.join(ERAS, d)).isDirectory())
    .map((d) => {
        const m = /(\d{4})-\d{2}$/.exec(d);
        if (!m) throw new Error(`Era sem ano no nome: ${d}`);
        return loadSeason(path.join(ERAS, d), Number(m[1]));
    })
    .sort((a, b) => a.year - b.year);
const current = loadSeason(path.join(ROOT, 'data'), CURRENT_SEASON);

// Every (season, team) a player is known to have played from 2015 on.
const known = new Map(); // nbaId -> [{ year, team }]
for (const s of [...eras, current]) {
    if (s.year < FIRST_SEASON_PHOTOS) continue;
    s.list.forEach((p) => {
        const team = s.teamOf[p.id];
        if (!p.nbaId || !team) return;
        const list = known.get(p.nbaId) || [];
        if (!list.some((k) => k.year === s.year && k.team === team)) list.push({ year: s.year, team });
        known.set(p.nbaId, list);
    });
}

// --- probing --------------------------------------------------------------------
const cache = fs.existsSync(CACHE_FILE) ? readJson(CACHE_FILE) : {};
const exists = async (url) => {
    if (url in cache) return cache[url];
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0 (nba-gm-mobile photo sync)' } });
            if (res.status === 200 || res.status === 403 || res.status === 404) {
                cache[url] = res.status === 200;
                return cache[url];
            }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
    return false; // not cached: asked again next run
};

const pool = async (items, n, fn) => {
    let i = 0;
    const worker = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
    await Promise.all(Array.from({ length: n }, worker));
};

// The first pair (in the given order) whose photo exists.
const firstExisting = async (nbaId, pairs) => {
    for (const { year, team } of pairs) {
        if (await exists(photoUrl(year, team, nbaId))) return { year, team };
    }
    return null;
};

const choose = async (p, era) => {
    const pairs = known.get(p.nbaId) || [];
    if (!pairs.length) return null;
    const eraTeam = era.teamOf[p.id];
    if (era.year >= FIRST_SEASON_PHOTOS) {
        // Phase 1: that season on his team, then nearest with that team, then nearest at all.
        const near = (list) => [...list].sort((a, b) => Math.abs(a.year - era.year) - Math.abs(b.year - era.year) || a.year - b.year);
        const exact = eraTeam ? [{ year: era.year, team: eraTeam }] : [];
        return firstExisting(p.nbaId, [
            ...exact,
            ...near(pairs.filter((k) => k.team === eraTeam && k.year !== era.year)),
            ...near(pairs.filter((k) => k.team !== eraTeam)),
        ]);
    }
    // Phase 3: the earliest photo there is, his era team's first.
    const early = (list) => [...list].sort((a, b) => a.year - b.year);
    return firstExisting(p.nbaId, [
        ...early(pairs.filter((k) => k.team === eraTeam)),
        ...early(pairs.filter((k) => k.team !== eraTeam)),
    ]);
};

// Written as a text patch on the file, not a re-serialization: the pipeline
// (Python) writes `25.0` where JSON.stringify writes `25`, and CRLF line ends,
// so a round trip would rewrite thousands of lines nobody changed. Only the
// photoUrl line moves, with photoYear / photoOffEra right after it (photoUrl is
// never a player's last field, so the commas hold).
const patchText = (era) => {
    let text = fs.readFileSync(era.playersFile, 'utf8');
    const nl = eol(era.playersFile);
    text = text.replace(/\r?\n[ \t]*"photo(Year|OffEra)": [^,\r\n]+,/g, '');
    era.list.forEach((p) => {
        if (!p.nbaId || (p.photoUrl === undefined && !p.photoOffEra)) return;
        const line = new RegExp(`([ \\t]*)"photoUrl": "https://cdn\\.nba\\.com/headshots/nba/[^"]*/${p.nbaId}\\.png",`);
        // A player without a photoUrl line gets one right after his nbaId.
        const m = line.exec(text) ?? new RegExp(`([ \t]*)"nbaId": ${p.nbaId},`).exec(text);
        if (!m) throw new Error(`photoUrl de ${p.id} não encontrado em ${era.playersFile}`);
        const pad = m[1];
        let out = m[0].includes('"nbaId"') ? `${m[0]}${nl}` : '';
        if (p.photoUrl !== undefined) out += `${pad}"photoUrl": "${p.photoUrl}",`;
        else out = out.slice(0, -nl.length);
        if (p.photoYear !== undefined) out += `${nl}${pad}"photoYear": ${p.photoYear},`;
        if (p.photoOffEra) out += `${nl}${pad}"photoOffEra": true,`;
        text = text.slice(0, m.index) + out + text.slice(m.index + m[0].length);
    });
    JSON.parse(text); // still valid
    return text;
};

(async () => {
    const report = [];
    for (const era of eras) {
        let exact = 0;
        let near = 0;
        let off = 0;
        const top = new Set([...era.list].sort((a, b) => b.ovr - a.ovr).slice(0, 60).map((p) => p.id));
        let topOff = 0;
        await pool(era.list, 6, async (p) => {
            if (!p.nbaId) return;
            const pick = await choose(p, era);
            delete p.photoOffEra;
            delete p.photoYear;
            if (pick) {
                p.photoUrl = photoUrl(pick.year, pick.team, p.nbaId);
                p.photoYear = pick.year;
                if (pick.year === era.year) exact++; else near++;
            }
            // No team-season photo: whatever he had stays (the "latest" one, or
            // none at all for the few the app shows through ESPN by espnId).
            // Still from the end of a career that went on past 2015: the year of
            // that latest photo is unknown, but it is far from this era.
            const lastKnown = Math.max(0, ...(known.get(p.nbaId) || []).map((k) => k.year));
            const year = p.photoYear ?? (lastKnown || null);
            if (year !== null && year - era.year >= OFF_ERA_GAP) {
                p.photoOffEra = true;
                off++;
                if (top.has(p.id)) topOff++;
            }
        });
        report.push({ era: path.basename(era.dir), year: era.year, players: era.list.length, exact, near, off, topOff });
        if (!DRY) fs.writeFileSync(era.playersFile, patchText(era));
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
        process.stdout.write('.');
    }
    console.log('\n\nera | jogadores | foto da temporada exata | foto oficial de outra temporada | fora da época (tratamento) | fora da época no top 60');
    report.forEach((r) => console.log(`${r.era} | ${r.players} | ${r.exact} | ${r.near} | ${r.off} | ${r.topOff}`));
    console.log(`\nURLs consultadas (cache): ${Object.keys(cache).length}, existentes: ${Object.values(cache).filter(Boolean).length}${DRY ? '  (--dry: nada gravado)' : ''}`);
})();
