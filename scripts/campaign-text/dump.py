"""Print one campaign's prose as numbered, addressable fields for rewriting.

Usage: python3 -B scripts/campaign-text/dump.py <campaign> [--part world|cast|clues|handouts|sessions|all]
<campaign> is the path under campaigns/, e.g. dark-fantasy-2026/ash-tithe or acorn-express.
Each line is `<file>#<path> [<words>w] <text>`; the address is what apply.py takes.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit import ROOT, is_reference  # noqa: E402

SKIP = {'art', 'srd', 'layout', 'scale', 'x', 'y', 'miles', 'road'}
PARTS = {
    'world': ('world', 'table', 'world-map'),
    'cast': ('cast',),
    'clues': ('clues', 'items', 'case'),
    'handouts': ('handouts', 'encounters'),
    'sessions': ('sessions', 'act'),
}


def words(s: str) -> int:
    return len(re.findall(r'\w+', s))


def lines(obj, path=''):
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from lines(v, f'{path}[{i}]')
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k in SKIP:
                continue
            if is_reference(k) and k not in ('key', 'location', 'participants', 'clues', 'handouts'):
                continue
            if isinstance(v, list) and v and all(isinstance(x, str) for x in v) and is_reference(k):
                yield f'{path}.{k}', ', '.join(v)
                continue
            yield from lines(v, f'{path}.{k}')
    elif obj is not None and not isinstance(obj, bool):
        yield path, str(obj)


def main():
    args = sys.argv[1:]
    part = 'all'
    if '--part' in args:
        i = args.index('--part'); part = args[i + 1]; del args[i:i + 2]
    src = ROOT / 'campaigns' / args[0] / 'source'
    stems = None if part == 'all' else PARTS[part]
    for p in sorted(src.glob('*.json')):
        stem = re.sub(r'-\d+$', '', p.stem)
        if stems and stem not in stems and stem.split('-')[0] not in stems:
            continue
        print(f'\n## {p.name}')
        for path, text in lines(json.loads(p.read_text('utf-8'))):
            print(f'{p.name}#{path} [{words(text)}w] {text}')


if __name__ == '__main__':
    main()
