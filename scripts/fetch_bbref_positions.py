"""Real positions, heights and weights for the eras, from Basketball-Reference.

The eras came out of nba_api's generic "Guard / Forward / Center", so every
guard was an SG, every forward an SF, and nobody was a PG or a PF (the
1984-85 Lakers: Magic Johnson SG, Kurt Rambis SF). Heights were the position's
average (196 / 201 / 211 cm). Basketball-Reference has the real thing:
  - the position a player played THAT season (leagues/NBA_<year>_advanced),
  - height and weight (the players index, one page per letter).

Writes scripts/fixtures/bbref_positions.json, read by scripts/sync_era_positions.js.
Pages are cached in .bbref-cache/ (git-ignored), so a re-run only asks for what
is missing. One request every ~3.5 s, under the site's limit.

    python scripts/fetch_bbref_positions.py

Needs curl_cffi (pip install --user curl_cffi): the site refuses plain HTTP
clients; curl_cffi presents itself as a regular Chrome.
"""
import html
import json
import os
import re
import string
import sys
import time

from curl_cffi import requests

ROOT = os.path.join(os.path.dirname(__file__), '..')
CACHE = os.path.join(ROOT, '.bbref-cache')
OUT = os.path.join(os.path.dirname(__file__), 'fixtures', 'bbref_positions.json')
BASE = 'https://www.basketball-reference.com'
FIRST, LAST = 1980, 2020  # season END years: 1979-80 .. 2019-20, the eras' range

os.makedirs(CACHE, exist_ok=True)
last_request = 0.0


def page(path: str) -> str:
    global last_request
    name = path.strip('/').replace('/', '_') or 'index'
    cached = os.path.join(CACHE, name)
    if os.path.exists(cached):
        with open(cached, encoding='utf-8') as f:
            return f.read()
    wait = 3.6 - (time.time() - last_request)
    if wait > 0:
        time.sleep(wait)
    r = requests.get(BASE + path, impersonate='chrome', timeout=60)
    last_request = time.time()
    if r.status_code != 200:
        raise RuntimeError(f'{path}: HTTP {r.status_code}')
    with open(cached, 'w', encoding='utf-8') as f:
        f.write(r.text)
    return r.text


def cell(row: str, stat: str) -> str:
    m = re.search(r'data-stat="' + stat + r'"[^>]*>(.*?)</t[dh]>', row, re.S)
    return html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip() if m else ''


def player_id(row: str) -> str:
    m = re.search(r'data-append-csv="([^"]+)"', row)
    return m.group(1) if m else ''


def table_rows(text: str, table_id: str) -> list:
    # Some tables ship inside an HTML comment; take the table either way.
    m = re.search(r'<table[^>]*id="' + table_id + r'".*?</table>', text.replace('<!--', '').replace('-->', ''), re.S)
    if not m:
        return []
    # The players index never closes its <tbody>: read to the end of the table.
    body = re.search(r'<tbody[^>]*>(.*?)(?:</tbody>|</table>)', m.group(0), re.S)
    return re.findall(r'<tr[^>]*>(.*?)</tr>', body.group(1), re.S) if body else []


def inches(ht: str):
    m = re.match(r'(\d+)-(\d+)', ht)
    return int(m.group(1)) * 12 + int(m.group(2)) if m else None


seasons = {}
for year in range(FIRST, LAST + 1):
    rows = []
    for r in table_rows(page(f'/leagues/NBA_{year}_advanced.html'), 'advanced'):
        name = cell(r, 'name_display') or cell(r, 'player')
        if not name:
            continue
        rows.append({
            'id': player_id(r),
            'name': name,
            'pos': cell(r, 'pos'),
            'team': cell(r, 'team_name_abbr') or cell(r, 'team_id'),
            'mp': cell(r, 'mp'),
        })
    seasons[str(year)] = rows
    print(f'{year}: {len(rows)}', flush=True)

people = {}
for letter in string.ascii_lowercase:
    try:
        text = page(f'/players/{letter}/')
    except RuntimeError as e:  # a letter with no players
        print(e, flush=True)
        continue
    for r in table_rows(text, 'players'):
        pid = player_id(r)
        if not pid:
            continue
        ht = inches(cell(r, 'height'))
        wt = cell(r, 'weight')
        people[pid] = {
            'name': cell(r, 'name_display').rstrip('*') or cell(r, 'player').rstrip('*'),
            'from': cell(r, 'year_min'),
            'to': cell(r, 'year_max'),
            'pos': cell(r, 'pos'),
            'cm': round(ht * 2.54) if ht else None,
            'kg': round(int(wt) * 0.4536) if wt.isdigit() else None,
        }
    print(f'{letter}: {len(people)} players so far', flush=True)

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump({'source': BASE, 'seasons': seasons, 'players': people}, f, ensure_ascii=False, separators=(',', ':'))
print(f'wrote {OUT}: {sum(len(v) for v in seasons.values())} player-seasons, {len(people)} players')
sys.exit(0)
