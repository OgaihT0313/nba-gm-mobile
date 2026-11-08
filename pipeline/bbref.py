"""Reading saved Basketball-Reference pages.

This pipeline never downloads anything. Basketball-Reference (and stats.nba.com)
refuse automated clients, and getting around that means pretending to be a
browser -- which this project does not do. The pages are saved by hand from a
browser (Ctrl+S, "Web page, HTML only") into a folder, and read from there:

    .bbref-cache/<path with / turned into _>     e.g. leagues_NBA_2021_advanced.html

The folder can be changed with the BBREF_PAGES environment variable. A page
that isn't there raises MissingPage with the URL to save, so a run tells you
exactly what it still needs (see pipeline/README.md).

Only the standard library: the tables are regular enough for regular expressions.
"""
from __future__ import annotations

import html as htmllib
import os
import re
from dataclasses import dataclass, field

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
BASE = 'https://www.basketball-reference.com'


def pages_dir() -> str:
    return os.environ.get('BBREF_PAGES') or os.path.join(ROOT, '.bbref-cache')


class MissingPage(Exception):
    def __init__(self, path: str):
        self.path = path
        self.url = BASE + path
        self.file = os.path.join(pages_dir(), file_name(path))
        super().__init__(f'Página não salva: abra {self.url} no navegador e salve como {self.file}')


def file_name(path: str) -> str:
    return path.strip('/').replace('/', '_') or 'index'


def page(path: str) -> str:
    f = os.path.join(pages_dir(), file_name(path))
    if not os.path.exists(f):
        raise MissingPage(path)
    with open(f, encoding='utf-8', errors='replace') as fh:
        return fh.read()


def has_page(path: str) -> bool:
    return os.path.exists(os.path.join(pages_dir(), file_name(path)))


# --- tables --------------------------------------------------------------------

_ROW = re.compile(r'<tr[^>]*>(.*?)</tr>', re.S)
_CELL = re.compile(r'<t[dh]([^>]*)data-stat="([^"]+)"([^>]*)>(.*?)</t[dh]>', re.S)
_TAG = re.compile(r'<[^>]+>')


def table_html(doc: str, table_id: str) -> str | None:
    """The <table id=...> element, also when Basketball-Reference ships it inside an HTML comment."""
    m = re.search(r'<table[^>]*id="%s"[^>]*>(.*?)</table>' % re.escape(table_id), doc, re.S)
    return m.group(1) if m else None


def rows(table: str) -> list[dict]:
    """Every data row as {data-stat: text}, plus '_id' (data-append-csv) when present."""
    out = []
    for r in _ROW.findall(table):
        cells = _CELL.findall(r)
        if not cells:
            continue
        row: dict = {}
        for pre, stat, post, inner in cells:
            row[stat] = htmllib.unescape(_TAG.sub('', inner)).strip()
            attrs = pre + post
            m = re.search(r'data-append-csv="([^"]+)"', attrs)
            if m:
                row['_id'] = m.group(1)
        out.append(row)
    return out


def num(v: str | None, default: float | None = None) -> float | None:
    if v is None:
        return default
    v = v.strip().replace(',', '')
    if not v:
        return default
    try:
        return float(v)
    except ValueError:
        return default


# --- the advanced stats page -----------------------------------------------------

@dataclass
class Season:
    """One player's regular season: his totals, and the teams he played for, in order."""
    bbref_id: str
    name: str
    age: int
    pos: str
    g: int
    mp: float
    stats: dict
    teams: list[str] = field(default_factory=list)


MULTI = re.compile(r'^(TOT|\dTM)$')


def advanced(year: int) -> dict[str, Season]:
    """leagues/NBA_<year>_advanced (year = the season's END year): the regular season only."""
    doc = page(f'/leagues/NBA_{year}_advanced.html')
    table = table_html(doc, 'advanced') or table_html(doc, 'advanced_stats')
    if table is None:
        raise ValueError(f'NBA_{year}_advanced: tabela "advanced" não encontrada')
    out: dict[str, Season] = {}
    for r in rows(table):
        pid = r.get('_id')
        name = r.get('name_display') or r.get('player')
        team = r.get('team_name_abbr') or r.get('team_id')
        if not pid or not name or not team or team == 'Tm':
            continue
        name = name.rstrip('*').strip()
        stats = {k: num(v) for k, v in r.items() if not k.startswith('_')}
        if pid not in out:
            out[pid] = Season(pid, name, int(num(r.get('age'), 0) or 0), r.get('pos', ''), int(num(r.get('games'), 0) or num(r.get('g'), 0) or 0),
                              num(r.get('mp'), 0) or 0, stats)
        s = out[pid]
        if MULTI.match(team):
            # The season total comes first; the per-team rows follow in the order he played.
            s.stats, s.g, s.mp, s.pos = stats, int(num(r.get('games'), 0) or num(r.get('g'), 0) or 0), num(r.get('mp'), 0) or 0, r.get('pos', '') or s.pos
        else:
            s.teams.append(team)
    return out


# Basketball-Reference team codes -> the app's ids (today's franchise, as data/eras uses).
TEAM_ID = {
    'ATL': 'atl', 'BOS': 'bos', 'BRK': 'bkn', 'NJN': 'bkn', 'NYN': 'bkn', 'CHA': 'cha', 'CHO': 'cha', 'CHB': 'cha',
    'CHH': 'cha', 'CHI': 'chi', 'CLE': 'cle', 'DAL': 'dal', 'DEN': 'den', 'DET': 'det', 'GSW': 'gsw', 'HOU': 'hou',
    'IND': 'ind', 'LAC': 'lac', 'SDC': 'lac', 'LAL': 'lal', 'MEM': 'mem', 'VAN': 'mem', 'MIA': 'mia', 'MIL': 'mil',
    'MIN': 'min', 'NOP': 'nop', 'NOH': 'nop', 'NOK': 'nop', 'NYK': 'nyk', 'OKC': 'okc', 'SEA': 'okc', 'ORL': 'orl',
    'PHI': 'phi', 'PHO': 'phx', 'POR': 'por', 'SAC': 'sac', 'KCK': 'sac', 'SAS': 'sas', 'TOR': 'tor', 'UTA': 'uta',
    'WAS': 'was', 'WSB': 'was',
}


def team_id(code: str, year: int) -> str:
    """The app id. Charlotte's 'CHH'/'CHA' before 2002-03 is the Hornets franchise that became nop... but the
    eras keep it as 'cha' until the move (eraHistoryService relocates it), so the code maps straight to cha."""
    return TEAM_ID.get(code, code.lower())
