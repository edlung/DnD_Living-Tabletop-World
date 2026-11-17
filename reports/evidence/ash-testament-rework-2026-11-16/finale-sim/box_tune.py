#!/usr/bin/env python3
"""Search over the box draft's free numbers. python3 box_tune.py search|variants|final [runs] (repo root)."""
import itertools
import json
import sys
from dataclasses import replace
from multiprocessing import Pool

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import planks_sim as P
import box_sim as B

ROOT = "campaigns/collection-2026/ash-testament"
HERE = __file__.rsplit("/", 1)[0]
TABLES = ("осторожный", "средний", "торопливый", "худший")


def job(a):
    label, rules, t, n, runs, seed = a
    o = B.summarize(B.batch(n, P.TABLES[t], P.Policy(route="spine"), rules, runs, seed, ROOT))
    return [label, t, n, o]


def main():
    mode = sys.argv[1]
    runs = int(sys.argv[2]) if len(sys.argv) > 2 else 200
    jobs, seed = [], 20000
    rules = {}
    if mode == "search":
        for N, dm, k, r1 in itertools.product((10, 12, 14), ("1d8+1", "1d6"), (1, 2, 3), (True, False)):
            rules[f"N{N} {dm} +{k}{'' if r1 else ' r1-'}"] = B.BoxRules(integ=N, dmg=dm, douse=k, xbow_round1=r1)
    elif mode == "search2":
        for N, dm, k, z in itertools.product((10, 12, 14), ("1d8+1", "1d6"), (1, 2, 3), (1, 2)):
            rules[f"N{N} {dm} +{k} З{z}"] = B.BoxRules(integ=N, dmg=dm, douse=k, xbow_round1=False, zaslon_total=z)
        sizes = (5, 8)
        sizes = (5, 8)
    elif mode == "variants":
        base = B.BoxRules(**json.loads(sys.argv[3]))
        rules = {"chosen": base,
                 "Взять против КБ несущего": replace(base, grab_vs_carrier=True),
                 "Платон берёт ящик": replace(base, platon_takes=True),
                 "передача даёт вторые 3 клетки": replace(base, relay=True),
                 "несущий сам в Заслоне": replace(base, carrier_zaslon=True),
                 "Заслон у каждого героя (как сейчас)": replace(base, zaslon_total=99),
                 "стрелки бьют и в раунде 1": replace(base, xbow_round1=True),
                 "пакет у Пелагеи": replace(base, packet="Пелагея"),
                 "носитель пакета бежит к вехе": replace(base, packet_run=True)}
        sizes = (5, 8)
    elif mode == "final2":
        base = B.BoxRules(**json.loads(sys.argv[3]))
        rules = {"as written": base, "без бонуса укладки": replace(base, kit_douse=False),
                 "гонец с пакетом": replace(base, packet_run=True),
                 "пакет у Пелагеи": replace(base, packet="Пелагея")}
        sizes = (5, 6, 7, 8)
    else:
        rules = {"final": B.BoxRules(**json.loads(sys.argv[3]))}
        sizes = (5, 6, 7, 8)
    for lab, r in rules.items():
        for t in TABLES:
            for n in sizes:
                jobs.append((lab, r, t, n, runs, seed)); seed += 1
    with Pool() as pool:
        out = pool.map(job, jobs)
    json.dump(out, open(f"{HERE}/box-{mode}.json", "w"), ensure_ascii=False)  # final2 -> box-final2.json
    print("done", len(out))


if __name__ == "__main__":
    main()
