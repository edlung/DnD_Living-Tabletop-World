"""Search over one-line table-rule variants (levers a-i) for the gate battle. Run: python3 tune.py"""
import itertools, json, sys, zlib, os
from multiprocessing import Pool
import gate_sim as g

LEVERS = {
 'a': dict(tear_row=10, tear_once=True),          # tear only rows 11-12 or at threshold, one try per round
 'b': dict(thr=20, thr_round=4),                  # threshold 20, not before round 4
 'c': dict(prone_no_block=True),                  # a downed hero no longer holds his stair
 'd': dict(lever_d=True),                         # Ворота 0-1: Сайр on row 2, refill every round from r2
 'e': dict(lever_e=True),                         # refill rounds 3, 5, 7 at every gate value
 'f': dict(lever_f=True),                         # guards on the stair flanks, hit stair heroes from r1
 'g': dict(lever_g=True),                         # volleys on G11-J12 in r2 and r4 unless Жаровня silent
 'h': dict(lever_h=True),                         # neighbours enter in r3 if portcullis up, take 1/round
 'i': dict(port_round=3),                         # portcullis not before round 3
 'j': dict(lever_j=True),
 'n': dict(port_round=4),                         # portcullis not before round 4
 'm': dict(lever_m=True),                         # neighbours from r3 (portcullis up) fight outside: refill goes on, they take 1/round
 'k': dict(lever_k=True),
 'p': dict(lever_p=True),                         # 7-8 players: refill every round from round 3
 'q': dict(),                                     # dawn: Борук's peaceful silencing of Жаровня holds in battle («ворота»)
 'r': dict(),                                     # dawn: stretcher-bearers also when Мейра's column left («ворота»)                         # waves by gate: 4-5 r3 only; 2-3 r3/5/7; 0-1 every round from r2 (all to F)                         # Ворота 0: Сайр does not start moving in round 1
}
TARGET = {'понемногу': (75, 90), 'ворота': (85, 95), 'бросил низ': (45, 70)}

def rd_for(combo):
    rd = dict(g.BASE_RD)
    for k in combo: rd.update(LEVERS[k])
    return rd

def dawn(t, gate0, combo=''):
    d = dict(g.TABLES[t])
    if t == 'ворота' and 'q' in combo: d['zharovnya_silent'] = True
    if t == 'ворота' and 'r' in combo: d['market'] = 1          # stretchers only; Рынок stays breached
    if gate0: d['gates'] = 0
    return d

def job(args):
    combo, t, n, gate0, runs = args
    dw = dawn(t, gate0, combo)
    seed = zlib.crc32(f"{combo}|{t}|{n}|{gate0}".encode())
    r = g.run_cell(n, dw, rd_for(combo), g.policy(dw), runs, seed)
    r.update(combo=combo, table=t, gate0=gate0)
    return r

def win(r): return 100 * sum(v for k, v in r['outcomes'].items() if 'Венец' in k) / r['runs']

def score(cells):
    pen = 0; notes = []
    by = {(c['table'], c['gate0'], c['n']): c for c in cells}
    for t, (lo, hi) in TARGET.items():
        for n in sorted({c['n'] for c in cells}):
            c = by[(t, False, n)]; w = win(c)
            pen += max(0, lo - w, w - hi)
            pen += 10 * max(0, 4 - c['mean_rounds'], c['mean_rounds'] - 7)
            hp = c['happened']
            pen += 20 * max(0, 0.3 - max(hp.get('refill', 0), hp.get('side', 0)))
            pen += 10 * max(0, 0.3 - hp.get('volley', 0))
            if g.TABLES[t]['alliance']: pen += 10 * max(0, 0.3 - hp.get('nb', 0))
            z = by.get((t, True, n))
            if z: pen += max(0, win(z) - (w - 5))          # Ворота 0 must be at least 5 points harder
    reach_u = any(c['outcomes'].get('Уход по Камышовой', 0) for c in cells if not c['gate0'])
    reach_p = any(c['outcomes'].get('Пощада', 0) for c in cells if not c['gate0'])
    pen += 0 if reach_u else 25
    pen += 0 if reach_p else 25
    return round(pen, 1)

def run_combos(combos, sizes, runs, gate0_sizes):
    tasks = [(c, t, n, False, runs) for c in combos for t in TARGET for n in sizes]
    tasks += [(c, t, n, True, runs) for c in combos for t in TARGET for n in gate0_sizes]
    with Pool(4) as p: res = p.map(job, tasks, chunksize=1)
    out = {}
    for r in res: out.setdefault(r['combo'], []).append(r)
    return out

if __name__ == '__main__':
    stage = sys.argv[1] if len(sys.argv) > 1 else 'search'
    here = os.path.dirname(os.path.abspath(__file__))
    if stage == 'search':
        pool = sys.argv[2] if len(sys.argv) > 2 else 'defghij'
        combos = ['abc' + ''.join(x) for k in range(0, len(pool) + 1) for x in itertools.combinations(pool, k)]
        combos = [c for c in combos if not ('h' in c and 'm' in c) and not ('k' in c and ('d' in c or 'e' in c))]
        res = run_combos(combos, (6,), int(os.environ.get('RUNS', 50)), (6,))
        ranked = sorted(((score(v), k) for k, v in res.items()))
        json.dump({k: v for k, v in res.items()}, open(os.path.join(here, 'tune_search_' + pool + '.json'), 'w'), ensure_ascii=False)
        for sc, k in ranked[:15]:
            print(sc, k, [(c['table'], c['gate0'], round(win(c)), c['mean_rounds'], c['happened']) for c in res[k]])
    elif stage == 'mid':
        combos = sys.argv[2].split(',')
        res = run_combos(combos, (6,), 200, (6,))
        json.dump(res, open(os.path.join(here, 'tune_mid.json'), 'w'), ensure_ascii=False)
        for sc, k in sorted((score(v), k) for k, v in res.items()):
            print(sc, k, [(c['table'], c['gate0'], round(win(c)), c['mean_rounds'], c['happened']) for c in res[k]])
    else:
        combos = sys.argv[2].split(',')
        res = run_combos(combos, (6, 7, 8), 400, (6, 7, 8))
        json.dump(res, open(os.path.join(here, 'tune_final.json'), 'w'), ensure_ascii=False, indent=1)
        for k, v in res.items(): print(score(v), k)
