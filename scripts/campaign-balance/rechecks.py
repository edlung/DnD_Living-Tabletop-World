"""Record the before/after and fresh-seed trials for the encounters changed on 2026-11-22."""
import argparse
import json
from pathlib import Path
from collate import batch

CHANGES = {
    "hollowmere": ["willow-ford-ambush", "cellar-rats", "sunken-mill", "sunken-bell"],
    "clockwork-carnival": ["rubezh-step"], "last-orbit": ["hull-walk"],
    "mountain-wedding": ["last-touch"], "marrow-crown": ["throat-follower", "seam-nest"],
    "salt-widows": ["widows-line-hunt"],
}


def capture(root, output):
    results = []
    for slug, changed in CHANGES.items():
        before = batch(root / "paired-before", slug, 32)
        after = batch(root / "final", slug, 32)
        for encounter in changed:
            native = slug == "hollowmere"
            seed, number = (3000, 96) if native else (5000, 48)
            path = root / "holdout-native" if native else root / "holdout" / encounter
            holdout = batch(path, slug, number, seed)
            for key in after:
                if key[0] != encounter:
                    continue
                row = {"campaign": slug, "key": encounter, "edition": key[1], "party": after[key]["party"]}
                for name, rolls, start in [("before", before, 0), ("after", after, 0), ("holdout", holdout, seed)]:
                    r = rolls[key]
                    assert r["party"] == row["party"]
                    row[name] = dict(start=start, **{k: r[k] for k in ["foes", "trials", "results", "rounds", "zero", "dice"]})
                results.append(row)
    data = dict(baseline="3c8856506a1d", same_rules_and_tactics=True, encounters=10, editions=results)
    (output / "rechecks.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    capture(args.input, args.output)
