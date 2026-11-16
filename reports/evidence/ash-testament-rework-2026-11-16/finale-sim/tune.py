#!/usr/bin/env python3
"""Lever search for results-tuned.md. python3 tune.py search|final [runs]  (from repo root)."""
import itertools
import json
import sys
from dataclasses import replace
from multiprocessing import Pool

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import planks_sim as P

ROOT = "campaigns/collection-2026/ash-testament"
HERE = __file__.rsplit("/", 1)[0]
# rulings from finding 3 are always on: drag from next turn, no point -> hold, turned «Взять» lost
BASE = P.Readings(grab_then_drag_same_turn=False, hold_without_point="stay")


SCHED = ((2, 4, 6), (2, 3, 5), (2, 3, 4), (2, 2, 4))


def readings(a, b, c, d, e, g=0, h=0, i=0, sc=0, tw=0, b2=0, h2=0):
    """a..e: coordinator levers; g: Efim 3 cells; h: column advances 0/4/6 a round; i: Заслон not vs «Взять»."""
    return replace(BASE, die_on_fall=2 if a else 99, vet_hold_with_ruma=bool(b), column_reinforce=bool(c),
                   xbow_adv_alone=bool(d), kondrat_leave_hp=20 if e else 27, efim_speed=3 if g else 4,
                   col_speed=(0, 4, 6, 5, 3)[h], zaslon_vs_grab=not i, col_schedule=SCHED[sc],
                   tower_col=(18, 17)[tw], vet_hold_with_column=bool(b2),
                   col_speed_by_gap=((), (4, 5, 5), (4, 5, 6), (5, 6, 6), (5, 5, 5))[h2])


def job(args):
    key, tname, n, pol, runs, seed = args
    rd = readings(*key)
    o = P.summarize(P.batch(n, P.TABLES[tname], pol, rd, runs, seed, ROOT))
    return [list(key), tname, n, pol.name, o]


def main():
    mode = sys.argv[1]
    runs = int(sys.argv[2]) if len(sys.argv) > 2 else 200
    jobs, seed = [], 500
    if mode == "search":
        keys = list(itertools.product((0, 1), repeat=5))
    if mode == "search2":
        keys = [(1, b, c, 0, 0, g, h, i) for b in (0, 1) for c in (0, 1) for g in (0, 1) for h in (0, 1, 2)
                for i in (0, 1)]
    if mode == "search3":
        keys = [(1, b, c, 0, 0, 1, h, 0, sc) for b in (0, 1) for c in (0, 1) for h in (1, 3, 4)
                for sc in (0, 1, 2)]
    if mode == "search4":
        keys = [(1, b, b, 0, 0, 1, 1, 0, sc, tw) for b in (0, 1) for (sc, tw) in ((1, 1), (3, 0), (3, 1))]
    if mode == "search5":
        keys = [(1, 1, 1, d, 0, 1, 1, 0, 1, 0, b2) for d in (0, 1) for b2 in (0, 1)] + \
               [(1, 1, 1, d, 0, 1, 1, 0, 2, 0, b2) for d in (0, 1) for b2 in (1,)]
    if mode == "search6":
        keys = [(1, b, b, 0, 0, 1, 1, 0, 1, 0, 0, h2) for b in (0, 1) for h2 in (1, 2)]
    if mode.startswith("search"):
        for k in keys:
            for t in ("осторожный", "средний", "торопливый", "худший"):
                for n in (5, 8):
                    jobs.append((k, t, n, P.Policy(), runs, seed)); seed += 1
    else:
        keys = [tuple(map(int, s)) for s in sys.argv[3].split(",")]
        # tuples may be 5 or 8 digits
        for k in keys:
            for t in ("осторожный", "средний", "средний-Б", "торопливый", "худший"):
                for n in (5, 6, 7, 8):
                    jobs.append((k, t, n, P.Policy(), runs, seed)); seed += 1
            for t in ("осторожный", "средний", "торопливый"):
                for n in (5, 8):
                    jobs.append((k, t, n, P.Policy(name="ignore"), runs, seed)); seed += 1
                    jobs.append((k, t, n, P.Policy(name="kondrat", route="spine"), runs, seed)); seed += 1
    with Pool() as pool:
        out = pool.map(job, jobs)
    json.dump(out, open(f"{HERE}/tune-{mode}.json", "w"), ensure_ascii=False)
    print("done", len(out))


if __name__ == "__main__":
    main()
