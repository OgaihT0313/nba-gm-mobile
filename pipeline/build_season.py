"""Build one season of data/eras from saved Basketball-Reference pages.

    python pipeline/build_season.py <end_year> --id <era-folder-id>      write data/eras/<id>/
    python pipeline/build_season.py <end_year> --validate                rebuild an existing era and compare

Needs leagues/NBA_<end_year>_advanced (and NBA_<end_year - 1>_advanced for the
prior-season blend, optional). Writes:
  players.json   ratings from pipeline/model.py with pipeline/params.json;
                 nbaId, photo, height, weight, number, skin tone carried over for
                 players the data already knows
  teams.json     the season's rosters (each player on the last team he played
                 for, at most 18 by minutes), names and logos from the data
  offseason_moves.json  in the PREVIOUS era's folder: who is on another team
                 between that season's roster and this one's (the summer replayed;
                 rosters are end of season, so a deadline deal rides along)
The draft class comes from pipeline/build_draft.py (needs the draft page).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bbref
import ids
import model
from stats import mae, mean, spearman

PARAMS_FILE = os.path.join(os.path.dirname(__file__), 'params.json')
MAX_ROSTER = 18
TONES = ['#f1c27d', '#e0ac69', '#c68642', '#b87b61', '#a16e4b', '#8d5524', '#7a4a2a', '#5c3a21', '#d39b76', '#945f3f']
POS_SIZE = {'PG': (188, 86), 'SG': (196, 93), 'SF': (201, 100), 'PF': (206, 108), 'C': (211, 113)}


def load_params() -> dict:
    if os.path.exists(PARAMS_FILE):
        return ids.load_json(PARAMS_FILE)
    return model.PARAMS


def main_pos(pos: str) -> str:
    p = (pos or 'SF').split('-')[0].strip().upper()
    return p if p in POS_SIZE else {'G': 'SG', 'F': 'SF', 'GF': 'SF', 'FC': 'PF'}.get(p, 'SF')


def reference_scale(year: int) -> list[float]:
    """The OVR scale to map onto: the era's own when it exists, the nearest earlier one otherwise."""
    for y in range(year, 1978, -1):
        e = ids.era_for(y)
        if e:
            return [p['ovr'] for p in ids.load_json(os.path.join(e['dir'], 'players.json')).values()]
    return [p['ovr'] for p in ids.load_json(os.path.join(bbref.ROOT, 'data', 'players.json')).values()]


def base_teams(year: int) -> dict[str, dict]:
    """Team records (name, conference, logo, style) from the closest era on disk, then the live league."""
    out: dict[str, dict] = {}
    for p in [os.path.join(bbref.ROOT, 'data', 'teams.json')] + [os.path.join(e['dir'], 'teams.json') for e in ids.eras() if e['end'] <= year]:
        for t in ids.load_json(p):
            out[t['id']] = t
    return out


def season_players(year: int, params: dict, scale: list[float] | None = None):
    """(players dict, final team per id, every team per id, minutes per id) for one season."""
    cur = bbref.advanced(year)
    prev = bbref.advanced(year - 1) if bbref.has_page(f'/leagues/NBA_{year - 1}_advanced.html') else {}
    seasons = [s for s in cur.values() if s.teams and s.mp > 0]
    rows = [{'mp': s.mp, 'stats': s.stats, 'prior_stats': prev[s.bbref_id].stats if s.bbref_id in prev else None,
             'prior_mp': prev[s.bbref_id].mp if s.bbref_id in prev else 0.0} for s in seasons]
    rated = model.ratings(rows, scale or reference_scale(year), params)
    known = ids.all_known_players()
    known_by_key = {ids.match_key(p.get('name', k)): (k, p) for k, p in known.items()}
    players, final_team, all_teams, minutes = {}, {}, {}, {}
    for s, r in zip(seasons, rated):
        k = known_by_key.get(ids.match_key(s.name))
        pid = k[0] if k else ids.app_id(s.name)
        old = k[1] if k else {}
        rng = random.Random(int(hashlib.md5(f'{pid}:{year}'.encode()).hexdigest()[:8], 16))
        pos = main_pos(s.pos)
        size = POS_SIZE[pos]
        team = bbref.team_id(s.teams[-1], year)
        rec = {
            'id': pid, 'name': old.get('name', s.name), 'pos': pos, 'positions': [pos],
            'ovr': r['ovr'], 'off': r['off'], 'def': r['def'], 'attributes': r['attributes'],
            'espnId': old.get('espnId'), 'nbaId': old.get('nbaId'),
            'photoUrl': photo_for(old, team, year), 'age': s.age, 'number': old.get('number', rng.randint(0, 55)),
            'potential': model.potential(s.age, r['ovr']),
            'salary': salary(r['ovr'], params, rng), 'contractYears': rng.randint(1, 5),
            'usage': r['usage'], 'ts': r['ts'],
            'heightCm': old.get('heightCm', size[0]), 'weightKg': old.get('weightKg', size[1]),
            'skinTone': old.get('skinTone') or TONES[rng.randrange(len(TONES))],
        }
        if not rec['nbaId'] and not old.get('photoUrl'):
            rec['photoMissing'] = True
        players[pid] = rec
        final_team[pid] = team
        all_teams[pid] = [bbref.team_id(t, year) for t in s.teams]
        minutes[pid] = s.mp
    return players, final_team, all_teams, minutes


def photo_for(old: dict, team: str, year: int) -> str | None:
    """The photo the data already had; a player new to the data has none (the app draws his initials)."""
    return old.get('photoUrl')


def salary(ovr: int, params: dict, rng: random.Random) -> int:
    import math
    a, b = params.get('salary', [7.216, 0.1159])
    return int(round(min(53_000_000, max(1_100_000, math.exp(a + b * ovr) * rng.uniform(0.9, 1.1))) / 1000) * 1000)


def build_rosters(players, final_team, minutes, teams_base, year):
    rosters: dict[str, list[str]] = {}
    for pid, t in final_team.items():
        rosters.setdefault(t, []).append(pid)
    teams = []
    for tid in sorted(rosters):
        roster = sorted(rosters[tid], key=lambda p: -minutes[p])[:MAX_ROSTER]
        by_ovr = sorted(roster, key=lambda p: -players[p]['ovr'])
        base = dict(teams_base.get(tid, {'id': tid, 'name': tid.upper(), 'conference': 'East', 'logoUrl': '', 'style': 'Balanced'}))
        base.update({'roster': by_ovr, 'coach': base.get('coach') if base.get('coachYear') == year else 'TBD',
                     'sixthMan': sorted(roster, key=lambda p: -minutes[p])[5] if len(roster) > 5 else None})
        base.pop('coachYear', None)
        teams.append(base)
    # Power rank: the top-8 average, best first.
    strength = {t['id']: mean(sorted((players[p]['ovr'] for p in t['roster']), reverse=True)[:8]) for t in teams}
    for i, tid in enumerate(sorted(strength, key=lambda k: -strength[k])):
        next(t for t in teams if t['id'] == tid)['powerRank'] = i + 1
    kept = {p for t in teams for p in t['roster']}
    return teams, {p: v for p, v in players.items() if p in kept}


def offseason_moves(prev_year: int, prev_teams: list[dict], prev_players: dict, cur_team_of: dict[str, str], year: int):
    """Who is on another team: the previous era's rosters against this season's. Era rosters are END of
    season (each player on the last team he played for), so a real deadline deal of the season before
    is already in the previous roster, and this season's is already in this one -- the way the original
    pipeline wrote them (validated: 97-99% of the moves the data has, see README)."""
    names = {p: prev_players[p]['name'] for p in prev_players}
    moves = []
    for t in prev_teams:
        for pid in t['roster']:
            nxt = cur_team_of.get(pid)
            if nxt and nxt != t['id']:
                moves.append({'playerId': pid, 'playerName': names.get(pid, pid), 'fromTeamId': t['id'], 'toTeamId': nxt})
    label = lambda y: f'{y - 1}-{str(y)[2:]}'
    return {'fromSeason': label(prev_year), 'toSeason': label(year), 'moves': moves}


def deadline_moves(year: int, all_teams: dict[str, list[str]], players: dict) -> dict:
    """In-season team changes (trades, and the waived signed elsewhere), in the order they happened.
    Not written: the eras' rosters are end of season, so these are already in them. Kept for E6 (README)."""
    moves = []
    for pid, teams in all_teams.items():
        for a, b in zip(teams, teams[1:]):
            if a != b:
                moves.append({'playerId': pid, 'playerName': players.get(pid, {}).get('name', pid), 'fromTeamId': a, 'toTeamId': b})
    return {'season': f'{year - 1}-{str(year)[2:]}', 'moves': moves}


def validate(year: int, params: dict):
    era = ids.era_for(year)
    real_players = ids.load_json(os.path.join(era['dir'], 'players.json'))
    real_teams = ids.load_json(os.path.join(era['dir'], 'teams.json'))
    players, final_team, all_teams, minutes = season_players(year, params, [p['ovr'] for p in real_players.values()])
    teams, players = build_rosters(players, final_team, minutes, base_teams(year), year)
    real_team_of = {p: t['id'] for t in real_teams for p in t['roster']}
    team_of = {p: t['id'] for t in teams for p in t['roster']}
    both = [p for p in team_of if p in real_team_of]
    same = sum(1 for p in both if team_of[p] == real_team_of[p])
    print(f'{era["id"]}: {len(players)} jogadores gerados, {len(real_players)} nos dados; {len(both)} em comum, '
          f'{same} ({100 * same / max(1, len(both)):.0f}%) no mesmo time')
    common = [p for p in both]
    print(f'  OVR: Spearman {spearman([players[p]["ovr"] for p in common], [real_players[p]["ovr"] for p in common]):.3f}, '
          f'erro médio {mae([players[p]["ovr"] for p in common], [real_players[p]["ovr"] for p in common]):.2f}')
    rank_real = {t['id']: t['powerRank'] for t in real_teams}
    print(f'  força dos times (powerRank): Spearman {spearman([t["powerRank"] for t in teams if t["id"] in rank_real], [rank_real[t["id"]] for t in teams if t["id"] in rank_real]):.3f}')
    # The summer into this season, against the moves the data already has.
    prev = ids.era_for(year - 1)
    if prev and os.path.exists(os.path.join(prev['dir'], 'offseason_moves.json')):
        mv = offseason_moves(year - 1, ids.load_json(os.path.join(prev['dir'], 'teams.json')),
                             ids.load_json(os.path.join(prev['dir'], 'players.json')), team_of, year)
        got = {(m['playerId'], m['fromTeamId'], m['toTeamId']) for m in mv['moves']}
        real = {(m['playerId'], m['fromTeamId'], m['toTeamId']) for m in ids.load_json(os.path.join(prev['dir'], 'offseason_moves.json'))['moves']}
        inter = got & real
        print(f'  transferências do verão {prev["id"]} -> {era["id"]}: {len(got)} geradas, {len(real)} nos dados, '
              f'{len(inter)} iguais ({100 * len(inter) / max(1, len(real)):.0f}% das reais, {100 * len(inter) / max(1, len(got)):.0f}% das geradas)')
    dm = deadline_moves(year, all_teams, players)
    print(f'  mudanças de time no meio da temporada (já embutidas no elenco final): {len(dm["moves"])}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('year', type=int, help='END year of the season (2021 = 2020-21)')
    ap.add_argument('--id', help='era folder to write, e.g. bucks-giannis-2020-21')
    ap.add_argument('--validate', action='store_true', help='rebuild an existing era and compare')
    args = ap.parse_args()
    params = load_params()
    try:
        if args.validate:
            validate(args.year, params)
            return
        if not args.id:
            ap.error('--id é obrigatório para gravar')
        players, final_team, all_teams, minutes = season_players(args.year, params)
        teams, players = build_rosters(players, final_team, minutes, base_teams(args.year), args.year)
        out = os.path.join(ids.ERAS_DIR, args.id)
        ids.write_json(os.path.join(out, 'players.json'), players)
        ids.write_json(os.path.join(out, 'teams.json'), teams)
        if not os.path.exists(os.path.join(out, 'offseason_moves.json')):
            ids.write_json(os.path.join(out, 'offseason_moves.json'), {'fromSeason': f'{args.year - 1}-{str(args.year)[2:]}', 'toSeason': '', 'moves': []})
        prev = ids.era_for(args.year - 1)
        if prev:
            team_of = {p: t['id'] for t in teams for p in t['roster']}
            mv = offseason_moves(args.year - 1, ids.load_json(os.path.join(prev['dir'], 'teams.json')),
                                 ids.load_json(os.path.join(prev['dir'], 'players.json')), team_of, args.year)
            ids.write_json(os.path.join(prev['dir'], 'offseason_moves.json'), mv)
            print(f'{prev["id"]}: {len(mv["moves"])} transferências para {args.id}')
        print(f'{args.id}: {len(players)} jogadores, {len(teams)} times')
    except bbref.MissingPage as e:
        print(e)
        sys.exit(2)


if __name__ == '__main__':
    main()
