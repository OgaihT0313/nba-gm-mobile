"""The draft class and the real records of a season, from saved pages.

    python pipeline/build_extras.py draft <draft_year>        -> data/eras/<era ending that year>/draft_class.json
    python pipeline/build_extras.py records <end_year>        -> scripts/fixtures/era_records.json (check_eras)

draft: draft/NBA_<draft_year>.html. The 2020 draft goes into the 2019-20 era
       (the class that enters the league between it and 2020-21). First round
       only, like the eras have. Ids are matched to players the data already
       knows, so the rookie keeps one id from his draft night on.
records: leagues/NBA_<end_year>_standings.html, each team's real wins.

NOT YET RUN AGAINST REAL PAGES: none of these were in the cache when this was
written (2026-11). The parsers follow Basketball-Reference's table layout
(data-stat names), and fail loudly if a table isn't found.
"""
from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bbref
import ids

RECORDS = os.path.join(bbref.ROOT, 'scripts', 'fixtures', 'era_records.json')


def draft(draft_year: int) -> dict:
    doc = bbref.page(f'/draft/NBA_{draft_year}.html')
    table = bbref.table_html(doc, 'stats')
    if table is None:
        raise ValueError(f'draft/NBA_{draft_year}: tabela "stats" não encontrada')
    known = {ids.match_key(p.get('name', k)): k for k, p in ids.all_known_players().items()}
    picks = []
    for r in bbref.rows(table):
        pick = bbref.num(r.get('pick_overall'))
        name = (r.get('player') or '').strip()
        if not pick or not name or int(pick) > 30:
            continue
        pid = known.get(ids.match_key(name)) or ids.app_id(name)
        picks.append({'overallPick': int(pick), 'playerId': pid, 'playerName': name})
    if not picks:
        raise ValueError(f'draft/NBA_{draft_year}: nenhuma escolha lida')
    return {'draftYear': draft_year, 'picks': sorted(picks, key=lambda p: p['overallPick'])}


def records(end_year: int) -> dict[str, int]:
    doc = bbref.page(f'/leagues/NBA_{end_year}_standings.html')
    wins: dict[str, int] = {}
    for tid in ('confs_standings_E', 'confs_standings_W', 'divs_standings_E', 'divs_standings_W', 'expanded_standings'):
        table = bbref.table_html(doc, tid)
        if not table:
            continue
        for r in bbref.rows(table):
            name = r.get('team_name') or r.get('team') or ''
            w = bbref.num(r.get('wins'))
            if w is not None and name:
                wins[_team_from_name(name)] = int(w)
        if wins:
            break
    if not wins:
        raise ValueError(f'NBA_{end_year}_standings: classificação não encontrada')
    return wins


def _team_from_name(name: str) -> str:
    """'Milwaukee Bucks*' -> mil, by the names the data's teams carry (today's and the eras')."""
    clean = re.sub(r'[*\(\)\d]', '', name).strip()
    for path in [os.path.join(bbref.ROOT, 'data', 'teams.json')] + [os.path.join(e['dir'], 'teams.json') for e in ids.eras()]:
        for t in ids.load_json(path):
            if t['name'] == clean or t['name'].split()[-1] == clean.split()[-1]:
                return t['id']
    return clean.lower()


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ('draft', 'records'):
        print(__doc__)
        sys.exit(1)
    year = int(sys.argv[2])
    try:
        if sys.argv[1] == 'draft':
            era = ids.era_for(year)
            if not era:
                sys.exit(f'Sem era terminando em {year} para guardar o draft de {year}')
            d = draft(year)
            ids.write_json(os.path.join(era['dir'], 'draft_class.json'), d)
            print(f'{era["id"]}: draft de {year}, {len(d["picks"])} escolhas')
        else:
            era = ids.era_for(year)
            if not era:
                sys.exit(f'Sem era terminando em {year}')
            all_records = ids.load_json(RECORDS)
            all_records[era['id']] = records(year)
            ids.write_json(RECORDS, all_records)
            print(f'{era["id"]}: {len(all_records[era["id"]])} campanhas reais em scripts/fixtures/era_records.json')
    except bbref.MissingPage as e:
        print(e)
        sys.exit(2)


if __name__ == '__main__':
    main()
