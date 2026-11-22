"""Replay all published party losses, validate the ending and write one row per party."""
import argparse
from pathlib import Path
import os
import subprocess
import sys
from tempfile import mkdtemp

HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path)
    options = parser.parse_args()
    out = (options.out or Path(mkdtemp(prefix='ltw-defeats-'))).resolve()
    os.chdir(HERE.parents[1])
    for script in ('replay.mjs', 'table-check.mjs'):
        subprocess.run(['node', '--conditions=@ltw/source', HERE/script, out], check=True)
    subprocess.run([sys.executable, HERE/'cases.py', out], check=True)


if __name__ == '__main__':
    main()
