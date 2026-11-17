#!/usr/bin/env python3
"""k1/k2 test of the proposed key rule on top of sim_final.py (round-2 text). Appends to results-final.md."""
import os, sys, random
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim_final as S
RUNS = int(sys.argv[1]) if len(sys.argv) > 1 else 400
random.seed(20261117)
out = ["", "## Test of the key fix (k1: Зенон leaves with the key at the end of round 4; k2: round 5)", "",
       "Base: F1 reading of round-2 text. Without the key the squad may read only the text of the leader behind it",
       "(the ПД holder's) or stay silent, so the ending = the holder's ending. Greedy fight: escort deputies, then Зенон;",
       "«чистый»: guard deputies on the bench, everyone else on Зенон.", ""]
for kn, z, kr in (("k1", 4, None), ("k2", 5, None), ("k3", 6, "notaken")):
    R = dict(close="presence", sq="holder", zlimit=z, keyrule=kr)
    out += [f"### {kn} (round {z}{'; key only if no deputy was taken' if kr else ''})", "",
            "| table | N | greedy Генералу / Белый / Площадь | key greedy | forced greedy | pure-General | pure-White | pure-Square | key pure |",
            "|---|---|---|---|---|---|---|---|---|"]
    for t in S.TABLES:
        for n in (6, 7, 8):
            g = S.run_cell(t, n, S.greedy_for(t), R, RUNS); r = g["runs"]
            pr = {}; kp = 0
            for E in ("General", "White", "Square"):
                c = S.run_cell(t, n, S.Policy(E, fight="stall", stay=(E == "Square")), R, RUNS)
                pr[E] = c["res"][E] / r; kp += c["fstat"]["key"]
            out.append(f"| {t} | {n} | {100*g['res']['General']//r} / {100*g['res']['White']//r} / {100*g['res']['Square']//r} | "
                       f"{100*g['fstat']['key']//r}% | {100*g['forced']//r}% | {100*pr['General']:.0f}% | {100*pr['White']:.0f}% | {100*pr['Square']:.0f}% | {100*kp//(3*r)}% |")
    out.append("")
txt = "\n".join(out) + "\n"
print(txt)
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "k-test.md"), "w") as f: f.write(txt)
