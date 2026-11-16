#!/usr/bin/env python3
"""Informed table (walks the spine, ignores the boat) on the edited text and two column-speed fixes."""
import json
import sys
from multiprocessing import Pool

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import planks_sim as P
from tune import readings

ROOT = "campaigns/collection-2026/ash-testament"
HERE = __file__.rsplit("/", 1)[0]
VARS = {"as written (5, Рума 4)": readings(1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1),
        "fix: 6, Рума 5": readings(1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 3),
        "fix: 5 always": readings(1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 4)}


def job(a):
    v, t, n, route, seed = a
    o = P.summarize(P.batch(n, P.TABLES[t], P.Policy(route=route), VARS[v], 400, seed, ROOT))
    return [v, t, n, route, o]


if __name__ == "__main__":
    jobs, seed = [], 7000
    for v in VARS:
        for route in ("spine", "safe"):
            if v.startswith("as") and route == "safe":
                continue
            for t in ("осторожный", "средний", "средний-Б", "торопливый", "худший"):
                for n in (5, 6, 7, 8):
                    jobs.append((v, t, n, route, seed)); seed += 1
    with Pool() as pool:
        out = pool.map(job, jobs)
    json.dump(out, open(f"{HERE}/spine.json", "w"), ensure_ascii=False)
    print("done", len(out))
