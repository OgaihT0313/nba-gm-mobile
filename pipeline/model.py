"""From a season's stats to the app's player ratings.

Rebuilt in 2026-11 after the original pipeline (nba-gm-simulator/pipeline, never
committed) was lost. Its documented rules (ROADMAP item 6, "Eras no modelo do
Basketball-Reference") are kept:
  - OVR / off / def from BPM / OBPM / DBPM, regressed toward the mean by minutes,
    with the previous season counting at half weight;
  - the OVR mapped onto the era's own distribution (rank -> the era's scale);
  - usage and true shooting regressed toward the league by minutes.
The numbers in PARAMS are not the original's (they were lost too): they are fit
by pipeline/calibrate.py against the ratings the eras already have, which the
original produced -- calibrate.py prints how close the rebuilt model gets.
"""
from __future__ import annotations

import math
import random

from stats import quantile_map, predict

PARAMS = {
    # Minutes of league-average play every player starts with (shrinkage), and that average.
    'bpm_k': 600.0, 'bpm_mean': -2.0, 'prior_weight': 0.5,
    'obpm_k': 600.0, 'obpm_mean': -1.5, 'dbpm_k': 600.0, 'dbpm_mean': -0.5,
    'usg_k': 100.0, 'usg_mean': 19.0, 'ts_k': 300.0, 'ts_mean': 0.54,
    # off/def = a + b * regressed (O|D)BPM, fit by calibrate.py.
    'off': [73.0, 2.4], 'def': [73.0, 2.6],
    # Below this many minutes the attributes stay at the flat default the eras use.
    'attr_min_mp': 250.0, 'attr_flat': 66,
    # Attribute = coefficients . [1, features...] (calibrate.py), clamped 40-99.
    'attrs': {},
}

ATTR_FEATURES = ['ts_pct', 'fg3a_per_fga_pct', 'fta_per_fga_pct', 'orb_pct', 'drb_pct', 'trb_pct', 'ast_pct',
                 'stl_pct', 'blk_pct', 'tov_pct', 'usg_pct', 'obpm', 'dbpm']
ATTRS = ['shooting', 'finishing', 'playmaking', 'perimeterD', 'interiorD', 'rebounding', 'athleticism']


def shrink(value: float | None, mp: float, k: float, mean: float, prior: float | None = None, prior_mp: float = 0.0,
           prior_weight: float = 0.5) -> float:
    """(value*mp + prior*prior_mp*w + mean*k) / (mp + prior_mp*w + k)."""
    v = value if value is not None else mean
    pm = prior_mp * prior_weight if prior is not None else 0.0
    return (v * mp + (prior if prior is not None else 0.0) * pm + mean * k) / (mp + pm + k)


def features(stats: dict) -> list[float]:
    return [1.0] + [float(stats.get(f) or 0.0) for f in ATTR_FEATURES]


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def ratings(season_rows: list[dict], reference_ovr: list[float], params: dict = PARAMS) -> list[dict]:
    """season_rows: [{mp, stats, prior_stats?, prior_mp?}] for one season. reference_ovr: the scale to map
    the OVR onto (an era's existing OVRs, or the nearest era's). Returns ovr/off/def/usage/ts/attributes."""
    p = params
    score = []
    for r in season_rows:
        s, ps = r['stats'], r.get('prior_stats') or {}
        score.append(shrink(s.get('bpm'), r['mp'], p['bpm_k'], p['bpm_mean'], ps.get('bpm'), r.get('prior_mp', 0.0), p['prior_weight']))
    ovr = [round(v) for v in quantile_map(score, reference_ovr)]
    out = []
    for r, o in zip(season_rows, ovr):
        s, ps, mp, pmp = r['stats'], r.get('prior_stats') or {}, r['mp'], r.get('prior_mp', 0.0)
        ob = shrink(s.get('obpm'), mp, p['obpm_k'], p['obpm_mean'], ps.get('obpm'), pmp, p['prior_weight'])
        db = shrink(s.get('dbpm'), mp, p['dbpm_k'], p['dbpm_mean'], ps.get('dbpm'), pmp, p['prior_weight'])
        rec = {
            'ovr': int(o),
            'off': int(round(clamp(p['off'][0] + p['off'][1] * ob, 40, 99))),
            'def': int(round(clamp(p['def'][0] + p['def'][1] * db, 40, 99))),
            'usage': round(shrink(s.get('usg_pct'), mp, p['usg_k'], p['usg_mean']), 1),
            'ts': round(shrink(s.get('ts_pct'), mp, p['ts_k'], p['ts_mean']), 3),
        }
        if mp < p['attr_min_mp'] or not p['attrs']:
            rec['attributes'] = {a: p['attr_flat'] for a in ATTRS}
        else:
            f = features(s)
            rec['attributes'] = {a: int(round(clamp(predict(p['attrs'][a], f), 40, 99))) for a in ATTRS}
        out.append(rec)
    return out


def potential(age: int, ovr: int) -> str:
    """The eras' grades by age: A or B (the better young players A) to 23, C to 29, D from 30."""
    if age <= 23:
        return 'A' if ovr >= 75 or age <= 20 else 'B'
    return 'C' if age <= 29 else 'D'


def salary(ovr: int, rng: random.Random) -> int:
    """The synthetic salary on today's cap scale: roughly exponential in OVR (fit by calibrate.py's
    salary table), +-10%, rounded to the thousand. Max ~$53M."""
    base = 2_000_000 * math.exp(0.105 * (ovr - 65))
    return int(round(clamp(base * rng.uniform(0.9, 1.1), 1_100_000, 53_000_000) / 1000) * 1000)
