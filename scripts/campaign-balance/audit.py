"""Roll the shipped encounters and their authored objectives locally, then verify coverage."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

sys.dont_write_bytecode = True
from collate import NATIVE, SHELF, collect
from finales import FINALES
from tables import write_tables

HERE = Path(__file__).resolve().parent
NODE = ["node", "--conditions=@ltw/source"]


def main():
    os.chdir(HERE.parents[1])
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="save the batches and editions.jsonl here")
    parser.add_argument("campaigns", nargs="*", help="campaign slugs, default all")
    args = parser.parse_args()
    output = (args.out or Path(tempfile.mkdtemp(prefix="ltw-campaign-balance-"))).resolve()
    slugs = sorted([p.parent.name for p in SHELF.glob("*/library.json")] + list(NATIVE))
    if set(args.campaigns) - set(slugs):
        parser.error("unknown campaign " + str(set(args.campaigns) - set(slugs)))
    selected = sorted(set(args.campaigns or slugs))
    print(f"Saving rolls in {output}", flush=True)
    if "hollowmere" in selected:
        subprocess.run([*NODE, HERE / "starts.mjs"], check=True)
    for mode, runs, directory in [("book", 32, "final"), ("pressure", 6, "pressure")]:
        def roll(group):
            subprocess.run([*NODE, HERE / "run.mjs", "--mode", mode, "--seeds", str(runs),
                            "--out", output / directory, *group], check=True)
        workers = min(3, len(selected))
        groups = [selected[i::workers] for i in range(workers)]
        with ThreadPoolExecutor(workers) as pool:
            list(pool.map(roll, groups))
    for slug in selected:
        if slug in FINALES:
            subprocess.run([sys.executable, HERE / "finales.py", "--out", output / "special", slug],
                           check=True, env=dict(os.environ, PYTHONHASHSEED="0", PYTHONDONTWRITEBYTECODE="1"))
    write_tables(collect(output, output, selected), output)


if __name__ == "__main__":
    main()
