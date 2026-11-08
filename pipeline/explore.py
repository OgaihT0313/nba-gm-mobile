"""How the existing era ratings relate to the saved Basketball-Reference stats (calibration aid)."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bbref
import ids
from stats import pearson, spearman

ATTRS = ['shooting', 'finishing', 'playmaking', 'perimeterD', 'interiorD', 'rebounding', 'athleticism']
FEATS = ['ts_pct', 'fg3a_per_fga_pct', 'fta_per_fga_pct', 'orb_pct', 'drb_pct', 'trb_pct', 'ast_pct', 'stl_pct',
         'blk_pct', 'tov_pct', 'usg_pct', 'obpm', 'dbpm', 'bpm', 'per', 'ws_per_48']


def pairs(year):
    s = bbref.advanced(year)
    era = ids.era_for(year)
    players = ids.load_json(os.path.join(era['dir'], 'players.json'))
    idx = ids.index_by_key(players)
    out = []
    for x in s.values():
        pid = idx.get(ids.match_key(x.name))
        if pid:
            out.append((x, players[pid]))
    return out


if __name__ == '__main__':
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2019
    ps = pairs(year)
    big = [(x, p) for x, p in ps if x.mp >= 500]
    print(f'{year}: {len(ps)} pares, {len(big)} com 500+ minutos')
    for target in ['ovr', 'off', 'def']:
        line = []
        for f in ['bpm', 'obpm', 'dbpm', 'per', 'ws_per_48']:
            xs = [x.stats.get(f) or 0 for x, _ in big]
            ys = [p[target] for _, p in big]
            line.append(f'{f} {spearman(xs, ys):.2f}')
        print(f'  {target}: ' + ', '.join(line))
    xs = [x.stats.get('usg_pct') or 0 for x, _ in big]
    print('  usage x usg_pct r', round(pearson(xs, [p.get('usage', 0) for _, p in big]), 3),
          ' ts x ts_pct r', round(pearson([x.stats.get('ts_pct') or 0 for x, _ in big], [p.get('ts', 0) for _, p in big]), 3))
    for a in ATTRS:
        best = sorted(((abs(pearson([x.stats.get(f) or 0 for x, _ in big], [p['attributes'][a] for _, p in big])), f) for f in FEATS), reverse=True)[:3]
        print(f'  {a}: ' + ', '.join(f'{f} {r:.2f}' for r, f in best))
    flat = sum(1 for _, p in ps if len(set(p['attributes'].values())) == 1)
    print(f'  atributos todos iguais: {flat} de {len(ps)}')
    for x, p in sorted(big, key=lambda t: -t[1]['ovr'])[:5]:
        print('  ', p['name'], p['ovr'], p['off'], p['def'], p['usage'], p['ts'], '| bpm', x.stats.get('bpm'), 'obpm', x.stats.get('obpm'), 'dbpm', x.stats.get('dbpm'), 'usg', x.stats.get('usg_pct'), 'mp', x.mp)
