"""Fit pipeline/model.py's PARAMS against the ratings the eras already have.

For every season whose advanced page is saved (and whose previous season's is
too, for the prior-season blend), the rebuilt model rates the era's players and
is compared with the ratings the original pipeline wrote. Prints the fit and
writes pipeline/params.json, which build_season.py reads.

    python pipeline/calibrate.py
"""
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bbref
import ids
import model
from stats import lstsq, mae, mean, pearson, spearman

PARAMS_FILE = os.path.join(os.path.dirname(__file__), 'params.json')


def season_pairs(year: int):
    """[(row for model.ratings, existing player)] for one era, players present in both."""
    try:
        cur = bbref.advanced(year)
    except bbref.MissingPage:
        return []
    era = ids.era_for(year)
    if not era:
        return []
    prev = {}
    if bbref.has_page(f'/leagues/NBA_{year - 1}_advanced.html'):
        prev = {s.bbref_id: s for s in bbref.advanced(year - 1).values()}
    players = ids.load_json(os.path.join(era['dir'], 'players.json'))
    idx = ids.index_by_key(players)
    out = []
    for s in cur.values():
        pid = idx.get(ids.match_key(s.name))
        if not pid:
            continue
        pr = prev.get(s.bbref_id)
        row = {'mp': s.mp, 'stats': s.stats, 'prior_stats': pr.stats if pr else None, 'prior_mp': pr.mp if pr else 0.0}
        out.append((row, players[pid]))
    return out


def evaluate(data, params):
    """Mean Spearman and MAE of the OVR across seasons, with each era's own scale."""
    rs, maes = [], []
    for year, pairs in data.items():
        rows = [r for r, _ in pairs]
        ref = [p['ovr'] for _, p in pairs]
        got = model.ratings(rows, ref, params)
        rs.append(spearman([g['ovr'] for g in got], ref))
        maes.append(mae([g['ovr'] for g in got], ref))
    return mean(rs), mean(maes)


def main():
    years = [y for y in range(1980, 2026) if bbref.has_page(f'/leagues/NBA_{y}_advanced.html') and ids.era_for(y)]
    data = {y: season_pairs(y) for y in years}
    data = {y: p for y, p in data.items() if p}
    print(f'Temporadas com página salva e era: {len(data)} ({min(data)}-{max(data)})')
    params = json.loads(json.dumps(model.PARAMS))

    # 1. The OVR: shrinkage and the prior-season weight, by grid.
    best = None
    for k in (2500, 3500, 5000, 7000, 10000):
        for m in (-8.0, -6.0, -4.5, -3.5):
            for w in (0.25, 0.5, 0.75):
                params.update(bpm_k=k, bpm_mean=m, prior_weight=w)
                r, e = evaluate(data, params)
                if best is None or r > best[0]:
                    best = (r, e, k, m, w)
    r, e, k, m, w = best
    params.update(bpm_k=k, bpm_mean=m, prior_weight=w)
    print(f'OVR: Spearman médio {r:.3f}, erro médio {e:.2f} pontos (k={k}, média {m}, peso da temporada anterior {w})')

    allp = [(row, p) for pairs in data.values() for row, p in pairs]
    big = [(row, p) for row, p in allp if row['mp'] >= 500]

    # 2. off / def: shrinkage by grid, then the line.
    for key, stat in (('off', 'obpm'), ('def', 'dbpm')):
        bestl = None
        for k in (200, 400, 600, 900):
            for m in (-2.0, -1.0, 0.0):
                xs = [model.shrink(row['stats'].get(stat), row['mp'], k, m, (row.get('prior_stats') or {}).get(stat), row['prior_mp'], w) for row, _ in allp]
                ys = [p[key] for _, p in allp]
                coef = lstsq([[1.0, x] for x in xs], ys)
                err = mae([coef[0] + coef[1] * x for x in xs], ys)
                if bestl is None or err < bestl[0]:
                    bestl = (err, k, m, coef, pearson(xs, ys))
        err, k2, m2, coef, rr = bestl
        params[f'{stat}_k'], params[f'{stat}_mean'], params[key] = k2, m2, [round(coef[0], 3), round(coef[1], 3)]
        print(f'{key}: r {rr:.3f}, erro médio {err:.2f} (k={k2}, média {m2}, {coef[0]:.1f} + {coef[1]:.2f} x {stat})')

    # 3. usage and true shooting.
    for key, stat, ks, ms in (('usage', 'usg_pct', (50, 75, 100, 150), (15.0, 16.0, 17.0, 18.0)),
                              ('ts', 'ts_pct', (10, 25, 50, 100, 150), (0.52, 0.53, 0.54, 0.55, 0.56))):
        bestu = None
        for k in ks:
            for m in ms:
                xs = [model.shrink(row['stats'].get(stat), row['mp'], k, m) for row, _ in allp if p_has(row, stat)]
                ys = [p[key] for row, p in allp if p_has(row, stat)]
                err = mae(xs, ys)
                if bestu is None or err < bestu[0]:
                    bestu = (err, k, m)
        err, k3, m3 = bestu
        params[{'usage': 'usg', 'ts': 'ts'}[key] + '_k'], params[{'usage': 'usg', 'ts': 'ts'}[key] + '_mean'] = k3, m3
        print(f'{key}: erro médio {err:.3f} (k={k3}, média {m3})')

    # 4. Attributes: one linear model each, on players with real minutes.
    with_attrs = [(row, p) for row, p in big if len(set(p['attributes'].values())) > 1]
    params['attrs'] = {}
    for a in model.ATTRS:
        X = [model.features(row['stats']) for row, _ in with_attrs]
        y = [p['attributes'][a] for _, p in with_attrs]
        coef = lstsq(X, y, ridge=1.0)
        params['attrs'][a] = [round(c, 4) for c in coef]
        pred = [sum(c * v for c, v in zip(coef, x)) for x in X]
        print(f'  {a}: r {pearson(pred, y):.3f}, erro médio {mae(pred, y):.2f}')

    # 5. Salary curve: log(salary) on OVR, across all eras on disk.
    pts = []
    for e in ids.eras():
        for p in ids.load_json(os.path.join(e['dir'], 'players.json')).values():
            if p.get('salary'):
                pts.append((p['ovr'], math.log(p['salary'])))
    coef = lstsq([[1.0, o] for o, _ in pts], [s for _, s in pts])
    print(f'salário: e^({coef[0]:.3f} + {coef[1]:.4f} x OVR)  (OVR 75 -> ${math.exp(coef[0] + coef[1] * 75) / 1e6:.1f}M, 90 -> ${math.exp(coef[0] + coef[1] * 90) / 1e6:.1f}M)')
    params['salary'] = [round(coef[0], 4), round(coef[1], 5)]

    with open(PARAMS_FILE, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(params, f, indent=2)
        f.write('\n')
    print(f'Gravado {os.path.relpath(PARAMS_FILE, bbref.ROOT)}')


def p_has(row, stat):
    return row['stats'].get(stat) is not None


if __name__ == '__main__':
    main()
