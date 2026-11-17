#!/usr/bin/env python3
"""Runs every table of results.md. python3 run_all.py [runs]  (from the repo root)."""
import json
import sys
from dataclasses import replace
from multiprocessing import Pool

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import planks_sim as P

ROOT = "campaigns/collection-2026/ash-testament"
RUNS = int(sys.argv[1]) if len(sys.argv) > 1 else 400


def job(args):
    label, n, tname, pol, rd, seed = args
    res = P.batch(n, P.TABLES[tname], pol, rd, RUNS, seed, ROOT)
    o = P.summarize(res)
    import statistics as st
    for k in ("k_on_efim", "k_blocked_platon", "grabs", "grab_success", "efim_hits_taken", "misty"):
        o[k] = st.mean(r[k] for r in res)
    return label, n, tname, o


def main():
    jobs = []
    seed = 1
    base_pol, base_rd = P.Policy(), P.Readings()
    for t in P.TABLES:
        for n in (5, 6, 7, 8):
            jobs.append((("main", t), n, t, base_pol, base_rd, seed)); seed += 1
    readings = {
        "B1 «Взять» и волок — в разные ходы": replace(base_rd, grab_then_drag_same_turn=False),
        "B2 без точки захвата держащий тащит на запад": replace(base_rd, hold_without_point="west"),
        "B3 Кондрат бьёт героя, если он рядом, а не Ефима": replace(base_rd, kondrat_prefers_efim=False),
        "B4 реакция Кондрата без условия «ветеран в 2 клетках»": replace(base_rd, oa_follows_restriction=False),
        "B5 лежачего Ефима можно вести (нести)": replace(base_rd, carry_fallen=True),
    }
    for lab, rd in readings.items():
        for t in ("средний", "худший"):
            for n in (5, 8):
                jobs.append((("read", lab), n, t, P.Policy(name="kondrat", route="spine"), rd, seed)); seed += 1
    pols = {
        "печатный клин, безопасный путь (база)": P.Policy(),
        "клин по хребту (ряд 3) мимо лодки": P.Policy(route="spine"),
        "всё на Кондрата, по хребту": P.Policy(name="kondrat", route="spine"),
        "плотное кольцо вокруг Ефима": P.Policy(name="ring"),
        "стена поперёк настила": P.Policy(name="blockade"),
        "Ефима не ведут, пока поле не пусто": P.Policy(name="ignore"),
        "без «Туманного шага»": P.Policy(misty=False),
        "расписку не читают": P.Policy(read_receipt=False),
    }
    for lab, pol in pols.items():
        for t in ("осторожный", "средний", "худший"):
            for n in (5, 8):
                jobs.append((("pol", lab), n, t, pol, base_rd, seed)); seed += 1
    with Pool() as pool:
        out = pool.map(job, jobs)
    json.dump([[list(l), n, t, o] for l, n, t, o in out], open(__file__.rsplit("/", 1)[0] + "/raw.json", "w"),
              ensure_ascii=False, indent=0)
    print("done", len(out))


if __name__ == "__main__":
    main()
