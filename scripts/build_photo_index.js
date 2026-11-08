// PLANO-FOTOS-ERAS fase 2: the index of every official team-season headshot
// that exists, so the photo can follow the save (a player traded, a save that
// walks from 2015-16 to 2020-21). Built from the HEAD-request cache that
// sync_era_photos.js keeps (scripts/fixtures/photo_probe.json), so it needs no
// network: a pair the cache never asked about is simply absent.
//
//   data/photos.json: { "<nbaId>": [[startYear, nbaTeamId], ...] }, years ascending
//
//   node scripts/build_photo_index.js
const fs = require('fs');
const path = require('path');

const probe = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'photo_probe.json'), 'utf8'));
const URL_RE = /\/headshots\/nba\/(\d+)\/(\d{4})\/1040x760\/(\d+)\.png$/;

const index = {};
let pairs = 0;
for (const [url, ok] of Object.entries(probe)) {
    if (ok !== true) continue;
    const m = URL_RE.exec(url);
    if (!m) continue;
    const [, teamId, year, nbaId] = m;
    (index[nbaId] = index[nbaId] || []).push([Number(year), Number(teamId)]);
    pairs++;
}
const sorted = {};
Object.keys(index).sort((a, b) => Number(a) - Number(b)).forEach((id) => {
    sorted[id] = index[id].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
});
fs.writeFileSync(path.join(__dirname, '..', 'data', 'photos.json'), JSON.stringify(sorted) + '\n');
console.log(`${Object.keys(sorted).length} jogadores, ${pairs} fotos por time e temporada`);
