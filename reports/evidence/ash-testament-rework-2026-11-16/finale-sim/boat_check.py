#!/usr/bin/env python3
"""Fix test: near the boat the holder drags in the same turn (edited text otherwise)."""
import json
import sys
from dataclasses import replace
from multiprocessing import Pool

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import planks_sim as P
from tune import readings

ROOT = "campaigns/collection-2026/ash-testament"
HERE = __file__.rsplit("/", 1)[0]
BASE = readings(1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1)


def job(a):
    k, t, n, route, seed = a
    rd = replace(BASE, boat_same_turn=k)
    o = P.summarize(P.batch(n, P.TABLES[t], P.Policy(route=route), rd, 400, seed, ROOT))
    return [k, t, n, route, o]


if __name__ == "__main__":
    jobs, seed = [], 8000
    for k in (3, 6):
        for route in ("spine", "safe"):
            for t in ("средний", "торопливый"):
                for n in (5, 6, 7, 8):
                    jobs.append((k, t, n, route, seed)); seed += 1
    with Pool() as pool:
        out = pool.map(job, jobs)
    json.dump(out, open(f"{HERE}/boat.json", "w"), ensure_ascii=False)
