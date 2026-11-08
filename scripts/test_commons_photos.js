// PLANO-FOTOS-ERAS fase 4, the test before deciding: how many of the top 60 of
// three eras (2003-04, 2008-09, 2012-13) have a freely licensed photo FROM
// THAT TIME on Wikimedia Commons? Read-only queries to the Commons API, no
// image is downloaded. A player counts when one of "Category:<name> in <year>"
// exists with files, for the season's two years and the one after.
//
//   node scripts/test_commons_photos.js
// Writes scripts/fixtures/commons_test.json with the per-player result.
const fs = require('fs');
const path = require('path');

const ERAS = [
    { id: 'pistons-upset-2003-04', years: [2003, 2004, 2005] },
    { id: 'kobe-gasol-2008-09', years: [2008, 2009, 2010] },
    { id: 'threepeat-2012-13', years: [2012, 2013, 2014] },
];
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'nba-gm-mobile photo coverage test (local script)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const query = async (titles) => {
    const url = `${API}?action=query&format=json&prop=categoryinfo&titles=${encodeURIComponent(titles.join('|'))}`;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': UA } });
            if (res.ok) return await res.json();
        } catch { /* retry */ }
        await sleep(1500);
    }
    return null;
};

(async () => {
    const out = {};
    for (const era of ERAS) {
        const players = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'eras', era.id, 'players.json'), 'utf8'));
        const top = Object.values(players).sort((a, b) => b.ovr - a.ovr).slice(0, 60);
        let found = 0;
        let anyCategory = 0;
        const rows = [];
        for (const p of top) {
            const titles = [...era.years.map((y) => `Category:${p.name} in ${y}`), `Category:${p.name}`];
            const json = await query(titles);
            const pages = Object.values(json?.query?.pages ?? {});
            const files = (t) => {
                const pg = pages.find((x) => x.title === t);
                return pg && !('missing' in pg) ? (pg.categoryinfo?.files ?? 0) : 0;
            };
            const yearFiles = era.years.reduce((n, y) => n + files(`Category:${p.name} in ${y}`), 0);
            const main = files(`Category:${p.name}`);
            if (yearFiles > 0) found++;
            if (main > 0 || yearFiles > 0) anyCategory++;
            rows.push({ name: p.name, ovr: p.ovr, yearFiles, mainFiles: main });
            await sleep(250);
        }
        out[era.id] = { found, anyCategory, total: top.length, rows };
        console.log(`${era.id}: ${found}/${top.length} com foto do ano (${Math.round((100 * found) / top.length)}%), ${anyCategory}/${top.length} com alguma foto no Commons`);
    }
    fs.writeFileSync(path.join(__dirname, 'fixtures', 'commons_test.json'), JSON.stringify(out, null, 1) + '\n');
})();
