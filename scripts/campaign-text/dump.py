"""Print one campaign's prose as numbered, addressable fields for rewriting.

Usage: python3 -B scripts/campaign-text/dump.py <campaign> [--part world|cast|clues|handouts|sessions|
pocket|brief|story|story:N-M|all] [--evening N]
<campaign> is the path under campaigns/, e.g. dark-fantasy-2026/ash-tithe or acorn-express.
Each line is `<file>#<path> [<words>w] <text>`; the address is what apply.py takes.
`--part brief` prints what a writer keeps at hand: the world's frame, places, heroes and the cast's
look and manner. `--part story` (or `story:5-8`) prints what the third round's writer needs: truth,
endings, the cast's wants and secrets, every scene's play and choices with its address. `--evening N` prints one evening only, with the table guide's notes for it.
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


def story(src: Path, evenings_wanted: set[int] | None = None):
    """What a writer of the third round keeps at hand (docs/CAMPAIGN_TEXT_STANDARD.md §9–12): the
    world's frame and truth, its endings, the cast with what each wants and hides, and every scene's
    play and choices with the address its forks go to. Read-alouds and handouts are left out."""
    world = json.loads((src / 'world.json').read_text('utf-8'))
    if evenings_wanted is None:
        for k in ('title', 'genre', 'audience', 'tone', 'setting'):
            if k in world:
                print(f'{k}: {world[k]}')
        for i, t in enumerate(world.get('truth', [])):
            print(f'truth[{i}]: {t}')
        for e in world.get('endings', []) or []:
            print('ending «' + e.get('title', '') + '»: ' + ' | '.join(
                str(e[k]) for k in ('requires', 'condition', 'outcome', 'result', 'cost') if k in e))
        cast = json.loads((src / 'cast.json').read_text('utf-8'))
        for h in cast.get('heroes', []):
            print(f'hero {h.get("name")}: {h.get("role", "")} {h.get("archetype", "")}')
        for n in cast.get('npcs', []):
            bits = [f'{k}={n[k]}' for k in ('age', 'location') if k in n]
            print(f'npc {n["key"]} «{n["name"]}» {" ".join(bits)}')
            for k in ('look', 'public', 'want', 'secret', 'voice', 'boundary', 'reveal', 'offer', 'change'):
                if n.get(k):
                    print(f'   {k}: {n[k]}')
            for fact in n.get('knows', []):
                print(f'   knows: {fact}')
        for loc in world.get('locations', []):
            print(f'place {loc["key"]} «{loc["name"]}»')
    data = {p.name: json.loads(p.read_text('utf-8')) for p in src.glob('*.json')}
    for name in sorted(data, key=lambda n: (n.split('-')[0], int(re.sub(r'\D', '', n) or 0))):
        if not re.fullmatch(r'(?:sessions|act)-\d+\.json', name):
            continue
        for i, ev in enumerate(data[name]):
            if evenings_wanted is not None and ev.get('number') not in evenings_wanted:
                continue
            print(f'\n## вечер {ev.get("number")} «{ev.get("title")}» @{ev.get("location")} '
                  f'people={",".join(ev.get("participants", []))}')
            print(f'goal: {ev.get("goal", "")}')
            for c in ev.get('consequences', []):
                print(f'if: {c.get("if")} → {c.get("then")}')
            print(f'ending: {ev.get("ending") or ev.get("end") or ""}')
            for j, sc in enumerate(ev.get('scenes', [])):
                print(f'\n### {name}#[{i}].scenes[{j}] «{sc.get("title")}»'
                      + (' (aftermath)' if sc.get('dmAftermath') else ''))
                print(f'play: {sc.get("play", "")}')
                for k, ch in enumerate(sc.get('choices', [])):
                    done = ' [fork written]' if k < len(sc.get('forks') or []) else ''
                    print(f'choice {k}: {ch}{done}')


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
    if part == 'story':
        story(src)
        return
    if part.startswith('story:'):  # story:1-4 — those evenings only
        lo, _, hi = part[6:].partition('-')
        story(src, set(range(int(lo), int(hi or lo) + 1)))
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
