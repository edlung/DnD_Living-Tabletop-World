"""Roll every authored route with continuous resources and isolated seeds."""
import argparse
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import sys
from tempfile import mkdtemp

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def main():
    os.chdir(ROOT)
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('campaigns', nargs='*')
    args.add_argument('--out', type=Path)
    args.add_argument('--seeds', type=int, default=32)
    args.add_argument('--start', type=int, default=0)
    args.add_argument('--itineraries', type=Path, default=HERE/'itineraries.json')
    args.add_argument('--tactical-only', action='store_true')
    opt = args.parse_args()
    out = (opt.out or Path(mkdtemp(prefix='ltw-endurance-'))).resolve()
    out.mkdir(parents=True, exist_ok=True)
    routes = json.loads(opt.itineraries.read_text())
    chosen = sorted(set(opt.campaigns or routes))
    if set(chosen)-routes.keys() or opt.seeds <= 0 or opt.start < 0:
        args.error('unknown campaign or invalid seed range')
    def worker(group):
        subprocess.run(['node', '--conditions=@ltw/source', HERE/'run.mjs','--out',out,
                        '--seeds',str(opt.seeds),'--start',str(opt.start),'--itineraries',opt.itineraries,
                        *group],check=True)
    workers=min(3,len(chosen))
    print('Saving routes in',out,flush=True)
    with ThreadPoolExecutor(workers) as pool:
        list(pool.map(worker,[chosen[i::workers] for i in range(workers)]))
    if opt.tactical_only:
        return
    for slug in chosen:
        if (out/(slug+'.entries.gz')).exists():
            subprocess.run([sys.executable, HERE/'special.py', str(out), slug],check=True,
                           env=dict(os.environ,PYTHONHASHSEED='0',PYTHONDONTWRITEBYTECODE='1'))
    subprocess.run([sys.executable, HERE/'summary.py',str(out),str(opt.start),str(opt.seeds),*chosen],check=True)


if __name__=='__main__':
    main()
