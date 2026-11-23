"""Print one campaign's prose as numbered, addressable fields for rewriting.

Usage: python3 -B scripts/campaign-text/dump.py <campaign> [--part world|cast|clues|handouts|sessions|
pocket|brief|all] [--evening N]
<campaign> is the path under campaigns/, e.g. dark-fantasy-2026/ash-tithe or acorn-express.
Each line is `<file>#<path> [<words>w] <text>`; the address is what apply.py takes.
`--part brief` prints what a writer keeps at hand: the world's frame, places, heroes and the cast's
look and manner. `--evening N` prints one evening only, with the table guide's notes for it.
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
    'pocket': ('pocket',),
}
BRIEF_WORLD = ('title', 'genre', 'audience', 'setting', 'tone', 'worldName', 'boundaries', 'themes')
BRIEF_PERSON = ('name', 'age', 'role', 'look', 'voice', 'public')


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


def brief(src: Path):
    world = json.loads((src / 'world.json').read_text('utf-8'))
    for k in BRIEF_WORLD:
        if k in world:
            print(f'world.json#.{k} {world[k]}')
    for i, loc in enumerate(world.get('locations', [])):
        print(f'world.json#.locations[{i}] {loc["name"]} — {loc["description"]}')
    cast = json.loads((src / 'cast.json').read_text('utf-8'))
    for group in ('heroes', 'npcs'):
        for i, x in enumerate(cast.get(group, [])):
            print(f'cast.json#.{group}[{i}] ' + ' | '.join(str(x[k]) for k in BRIEF_PERSON if k in x))


def evening(src: Path, number: int):
    for p in sorted(src.glob('*.json')):
        if not re.fullmatch(r'(?:sessions|act)-\d+\.json', p.name):
            continue
        for i, ev in enumerate(json.loads(p.read_text('utf-8'))):
            if ev.get('number') == number:
                print(f'\n## {p.name} — вечер {number}')
                for path, text in lines(ev, f'[{i}]'):
                    print(f'{p.name}#{path} [{words(text)}w] {text}')
    guide = src / 'table-guide.json'
    if guide.exists():
        for i, note in enumerate(json.loads(guide.read_text('utf-8'))):
            if note.get('session') == number:
                print(f'table-guide.json#[{i}] {note["title"]}: {note["text"]}')


def main():
    args = sys.argv[1:]
    part = 'all'
    if '--part' in args:
        i = args.index('--part'); part = args[i + 1]; del args[i:i + 2]
    src = ROOT / 'campaigns' / args[0] / 'source'
    if '--evening' in args:
        i = args.index('--evening')
        evening(src, int(args[i + 1]))
        return
    if part == 'brief':
        brief(src)
        return
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
