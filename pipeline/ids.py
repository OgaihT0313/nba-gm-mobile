"""The app's player ids and the era data on disk."""
from __future__ import annotations

import glob
import json
import os
import re
import unicodedata

from bbref import ROOT

ERAS_DIR = os.path.join(ROOT, 'data', 'eras')

# Letters NFKD doesn't take apart.
_EXTRA = str.maketrans({'ø': 'o', 'Ø': 'O', 'ð': 'd', 'Ð': 'D', 'ß': 'ss', 'æ': 'ae', 'Æ': 'AE', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ı': 'i'})


def app_id(name: str) -> str:
    """'Shaquille O'Neal' -> shaquille_o_neal, 'Nikola Jokić' -> nikola_jokic (the rule data/ uses)."""
    s = unicodedata.normalize('NFKD', name.translate(_EXTRA))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9]+', '_', s.lower())
    return s.strip('_')


_SUFFIX = {'jr', 'sr', 'ii', 'iii', 'iv', 'v'}


def match_key(name_or_id: str) -> str:
    """Looser than app_id, for pairing the same man across sources: no Jr./Sr./II, and
    initials run together ('J.R. Smith', 'JR Smith' -> jr_smith; 'Marcus Morris Sr.' -> marcus_morris)."""
    parts = [p for p in app_id(name_or_id).split('_') if p]
    while len(parts) > 2 and parts[-1] in _SUFFIX:
        parts.pop()
    merged: list[str] = []
    for p in parts:
        if len(p) == 1 and merged and len(merged[-1]) <= 2 and merged[-1].isalpha() and len(merged) == 1:
            merged[-1] += p
        else:
            merged.append(p)
    return '_'.join(merged)


def index_by_key(players: dict[str, dict]) -> dict[str, str]:
    """match_key -> app id, for the players a file already has."""
    out: dict[str, str] = {}
    for pid, p in players.items():
        out.setdefault(match_key(p.get('name', pid)), pid)
    return out


def load_json(path: str):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def write_json(path: str, data, indent: int | None = 2) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)
        f.write('\n')


def eras() -> list[dict]:
    """Every era folder with its season's END year, oldest first."""
    out = []
    for d in glob.glob(os.path.join(ERAS_DIR, '*')):
        if not os.path.isdir(d):
            continue
        m = re.search(r'(\d{4})-(\d{2})$', os.path.basename(d))
        if not m:
            continue
        out.append({'id': os.path.basename(d), 'dir': d, 'end': int(m.group(1)) + 1})
    return sorted(out, key=lambda e: e['end'])


def era_for(end_year: int) -> dict | None:
    return next((e for e in eras() if e['end'] == end_year), None)


def all_known_players() -> dict[str, dict]:
    """Every player the data already has, newest record wins: era folders oldest to newest, then the live league."""
    known: dict[str, dict] = {}
    for e in eras():
        for pid, p in load_json(os.path.join(e['dir'], 'players.json')).items():
            known[pid] = p
    for pid, p in load_json(os.path.join(ROOT, 'data', 'players.json')).items():
        known[pid] = p
    return known
