#!/usr/bin/env python3
"""Rerun of the edited text (commit e1b17ac5) = V1 readings. python3 run_final.py [runs] (repo root)."""
import json
import sys
from multiprocessing import Pool

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import planks_sim as P
from tune import readings

ROOT = "campaigns/collection-2026/ash-testament"
HERE = __file__.rsplit("/", 1)[0]
RUNS = int(sys.argv[1]) if len(sys.argv) > 1 else 400
# V1 as written: second fall kills; Efim 3 cells; column 5 (with Рума 4) after arrival 2/3/5 by Р 0/1/2;
# «Взять» after movement, drag from the next turn, hold without point, turned «Взять» lost.
RD = readings(1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1)


def job(a):
    t, n, pol, seed = a
    o = P.summarize(P.batch(n, P.TABLES[t], pol, RD, RUNS, seed, ROOT))
    return [t, n, pol.name, pol.route, o]


if __name__ == "__main__":
    jobs, seed = [], 9000
    for t in ("осторожный", "средний", "средний-Б", "торопливый", "худший"):
        for n in (5, 6, 7, 8):
            jobs.append((t, n, P.Policy(), seed)); seed += 1
    for t in ("осторожный", "средний", "торопливый"):
        for n in (5, 8):
            for pol in (P.Policy(name="ignore"), P.Policy(name="kondrat", route="spine"),
                        P.Policy(route="spine"), P.Policy(name="ring"), P.Policy(name="blockade")):
                jobs.append((t, n, pol, seed)); seed += 1
    with Pool() as pool:
        out = pool.map(job, jobs)
    json.dump(out, open(f"{HERE}/final.json", "w"), ensure_ascii=False)
    print("done", len(out))
