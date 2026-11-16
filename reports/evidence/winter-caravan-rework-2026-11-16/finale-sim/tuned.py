#!/usr/bin/env python3
"""Search the smallest rule-lever set that meets the coordinator's targets (see results-tuned.md)."""
import sys, json, itertools, statistics, random, zlib
import sim
from sim import G1, G2, G3, G4, K

TARGET = {  # (kind, learned): (lo, hi) for «Вся упряжь» %
    ('thrifty', True): (75, 95), ('thrifty', False): (45, 70),
    ('average', True): (35, 60), ('average', False): (15, 40),
    ('wasteful', True): (0, 20), ('wasteful', False): (0, 20),
}


def plan_space(start, exploit=False):
    learned = start['learned']
    opts = dict(
        pass_=[False, True] if learned else [False],
        otrog=[0, 1, 2] if (learned and start['fire'] > 0) else [0],
        sledge=[False, True],
        leave_slow=[False, True] if (start['weak'] or start['frost']) else [False],
        rearguard=[False, True],
        gamble=[0.01, 0.5] if len(sim.RULES['pack_dist']) > 1 else [0.01],
        cargo=[True, False],
        lead_spare=[True, False] if sim.RULES['people_only'] else [True],
    )
    for combo in itertools.product(*opts.values()):
        d = dict(zip(opts.keys(), combo))
        d['pass'] = d.pop('pass_')
        d['carry_slow'] = True; d['escort'] = 0; d['decoy'] = False
        yield d


sim.plan_space = plan_space
_choose = sim.choose_plan
sim.choose_plan = lambda start, rd, exploit=False, seeds=(11, 12, 13, 14): _choose(start, rd, exploit, seeds)


def summarize(rs):
    s = sim.summarize(rs)
    dl = [d for r in rs for d, l in zip(r['decisions'], r['live']) if l]
    s['decisions_live_turn'] = round(statistics.mean(dl), 2) if dl else 0
    s['live_turns'] = round(statistics.mean(sum(r['live']) for r in rs), 2)
    s['zero_live'] = round(100 * sum(1 for d in dl if d == 0) / max(1, len(dl)), 1)
    for g in ('Г1', 'Г2'):
        sub = [r for r in rs if r['white'] == g]
        s['VU_' + g] = round(100 * sum(1 for r in sub if r['ending'] == 'Вся упряжь') / len(sub), 1) if sub else None
    return s


RULINGS = dict(sim.MAIN_READINGS, hero_hit_counts=True, down_rides=True)
if len(sys.argv) > 4: RULINGS.update(json.loads(sys.argv[4]))


def evaluate(rules, n, sizes=(6, 7, 8)):
    sim.RULES.update(rules)
    sim.MAIN_READINGS.update(RULINGS)
    out = {}
    for kind in ('thrifty', 'average', 'wasteful'):
        for learned in (True, False):
            for h in sizes:
                rs = sim.cell(kind, h, learned, n, sim.MAIN_READINGS)
                out[(kind, learned, h)] = summarize(rs)
    return out


def score(out):
    miss = 0.0
    for (kind, learned, h), v in out.items():
        lo, hi = TARGET[(kind, learned)]
        x = v['endings']['Вся упряжь']
        miss += max(0, lo - x) + max(0, x - hi)
        if kind == 'wasteful':
            a, b = v['endings']['Через перевал'], v['endings']['Склон взял своё']
            miss += max(0, 15 - min(a, b))
        miss += 20 * max(0, 1 - v['decisions_live_turn'])
    return round(miss, 1)


BASE = dict(fire_die=False, fire_pass='same', size_bonus=False, hold_gorlo=True, run_only=False, noise_from=G4, pack_dist=(3,), people_only=False, otrog_max=2, mule_zhelob=2, walker_zhelob=2, gorlo_from7=False)

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'search'
    if mode == 'search':
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 60
        rows = []
        grid = dict(noise_from=[G4, G3], pack_dist=[(3,), (2, 3, 4, 5), (1, 2, 3, 4, 5, 6)], otrog_max=[2, 1],
                    gorlo_from7=[False, True], mule_zhelob=[2, 1])
        for combo in itertools.product(*grid.values()):
            r = dict(BASE); r.update(dict(zip(grid.keys(), combo))); r['run_only'] = True; r['people_only'] = True
            out = evaluate(r, n, sizes=(6,))
            sc = score(out)
            rows.append((sc, {k: v for k, v in r.items()}, {f"{k[0]}|{int(k[1])}": (v['endings']['Вся упряжь'], v['endings']['Через перевал'], v['endings']['Склон взял своё'], v['decisions_live_turn']) for k, v in out.items()}))
            print(sc, combo, rows[-1][2], file=sys.stderr, flush=True)
        rows.sort(key=lambda x: x[0])
        json.dump([(a, {k: (list(v) if isinstance(v, tuple) else v) for k, v in b.items()}, c) for a, b, c in rows], sys.stdout, ensure_ascii=False, indent=1)
    else:
        rules = json.loads(sys.argv[2])
        if 'pack_dist' in rules: rules['pack_dist'] = tuple(rules['pack_dist'])
        n = int(sys.argv[3]) if len(sys.argv) > 3 else 400
        r = dict(BASE); r.update(rules)
        out = evaluate(r, n)
        print(json.dumps({'rules': {k: (list(v) if isinstance(v, tuple) else v) for k, v in r.items()}, 'score': score(out),
                          'cells': {f"{k[0]}|{'learned' if k[1] else 'unlearned'}|{k[2]}": v for k, v in out.items()}}, ensure_ascii=False, indent=1))
