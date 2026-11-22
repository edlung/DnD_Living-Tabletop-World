"""Replay the six published table-specific models alongside the current engine's tactical run."""
import argparse
import collections
import json
import os
import random
import subprocess
import sys
from pathlib import Path

FINALES = {
    "ember-crown": "battle-for-the-gate", "ash-testament": "long-planks-ambush",
    "hollow-choir": "six-strokes", "glass-republic": "banner-hall-list",
    "salt-meridian": "chain-rock-battle", "rain-check": "roof-duel",
}


def play(slug, size, count, seed):
    # A fresh process per campaign isolates the different historical modules named sim.
    sys.path.insert(0, str(next(Path("reports/evidence").glob(slug + "-rework-*/finale-sim")).resolve()))
    random.seed(seed)
    if slug == "ember-crown":
        import final_rerun as f
        dawn = f.dawn("понемногу", False)
        rule, over = next(iter(f.READINGS.values()))
        result = f.g.run_cell(size, dawn, rule, dict(f.g.policy(dawn), **over), count, seed)
        return result["outcomes"]
    if slug == "ash-testament":
        import box_tune as f
        # Final box values are part of the campaign's authored equipment card.
        rules = f.B.BoxRules(integ=14, dmg="1d8+1", douse=2, xbow_round1=False,
                             zaslon_total=1, kit_douse=True)
        batch = f.B.batch(size, f.P.TABLES["средний"], f.P.Policy(route="spine"),
                          rules, count, seed, f.ROOT)
        return collections.Counter(r["outcome"] for r in batch)
    if slug == "glass-republic":
        sys.argv = [sys.argv[0], str(count)]
        import sim_final as f
        result = f.run_cell("С «середина»", size, f.greedy_for("С «середина»"),
                            next(iter(f.READINGS.values())), count)
        # The fight saves deputies and may secure a key. Outcome of the subsequent vote is separate.
        return {"Все герои упали": result["fstat"]["allfell"],
                "Захвачен хотя бы один депутат": result["fstat"]["taken"],
                "Взят ключ": result["fstat"]["key"]}
    if slug == "hollow-choir":
        import sim as f
        result = f.cell("middle", size, True, f.V2, count, seed)
        return {k: round(result[k] * count / 100) for k in ("top", "mid", "bad")}
    if slug == "salt-meridian":
        import sim as f
        middle = list(f.TABLES.values())[1]
        cfg = dict(middle, players=size, policy="wait", R_drop="held", R_late="flags_stay",
                   fix="mate", R_aground="spent", reckless=False)
        result = f.summarize(f.cell(cfg, runs=count, seed=seed))
        return {k: round(result[k] * count / 100) for k in ("corr", "half", "closed")}
    if slug == "rain-check":
        import roof2 as f
        cfg = dict(f.MID2, n=size, per_team=1 if size <= 3 else 2 if size < 6 else 3)
        return collections.Counter(f.Sim2(seed + n, cfg, verbose=False).run().ended[1]
                                   for n in range(count))
    raise ValueError(slug)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--seeds", type=int, default=96)
    parser.add_argument("--start", type=int, default=20261122)
    parser.add_argument("slug", nargs="?", choices=list(FINALES))
    args = parser.parse_args()
    args.out.mkdir(exist_ok=True, parents=True)
    if not args.slug:
        for slug in FINALES:
            subprocess.run([sys.executable, __file__, "--out", str(args.out), "--seeds",
                            str(args.seeds), "--start", str(args.start), slug], check=True,
                           env=dict(os.environ, PYTHONHASHSEED="0", PYTHONDONTWRITEBYTECODE="1"))
        return
    slug = args.slug
    lib = json.loads((Path("fixtures/campaign-library") / slug / "library.json").read_text())
    rows = []
    for variant in lib["variants"]:
        outcomes = play(slug, variant["players"], args.seeds, args.start + variant["players"])
        rows.append(dict(edition=variant["id"], trials=args.seeds, outcomes=outcomes))
    (args.out / (slug + ".json")).write_text(json.dumps(dict(key=FINALES[slug], rows=rows),
                                              ensure_ascii=False, indent=2) + "\n")
    print(slug, len(rows), flush=True)


if __name__ == "__main__":
    main()
