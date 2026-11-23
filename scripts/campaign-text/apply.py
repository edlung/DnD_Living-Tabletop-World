"""Apply rewritten prose to one campaign's sources, with the text standard's checks.

Usage: python3 -B scripts/campaign-text/apply.py <campaign> <patch.json> [--force]
patch.json: {"sessions-1.json#[0].readAloud": "новый текст", ...} — addresses as dump.py prints.
Existing string fields are replaced; one new field may be added: a scene's read-aloud
(`sessions-1.json#[0].scenes[2].readAloud`), placed before its `play`. Errors (refused): rules
shorthand (СЛ, DC, КБ, HP, NPC), internal keys, mechanics in player text, a scene read-aloud out of
its bounds or echoing the evening's read-aloud (depth.py). Warnings: a name, «title» or number of
the old text missing from the new one, and lengths below the standard. --force applies despite
warnings.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit import AGENCY, LATIN_OK, LATIN_WORD, READ_ALOUD_MECHANICS, ROOT, collect_keys  # noqa: E402
import depth  # noqa: E402

MINIMUM = {'opening': 200, 'readAloud': 110, 'ending': 45, 'end': 45, 'appearance': 18, 'play': 100,
           'voice': 12}
PLAYER = {'opening', 'readAloud', 'appearance', 'pitch', 'setting'}
LIMITED = {'play', 'readAloud', 'ending', 'end', 'check', 'failForward', 'dmNote', 'appearance'}
BANNED = [(r'\bСЛ\b', 'СЛ → Сл'), (r'\bDC\b', 'DC → Сл'), (r'\bКБ\b', 'КБ → КД'),
          (r'(?<![\w-])HP(?![\w-])', 'HP → хиты'), (r'(?<![\w-])NPC(?![\w-])', 'NPC → НИП'),
          (r'(?<![\w-])AC(?![\w-])', 'AC → КД'), (r'\bВосприяти', 'Восприятие → Внимательность'),
          (r'\(Расследовани', 'Расследование → Анализ'), (r'(?<=\d)к(?=\d)', '1к6 → 1d6')]
TOKEN = re.compile(r'\[(\d+)\]|\.([^.\[]+)')
NEW_SCENE_FIELD = re.compile(r'^\[\d+\]\.scenes\[\d+\]\.readAloud$')


def words(s: str) -> int:
    return len(re.findall(r'\w+', s))


def walk(obj, path: str):
    parent, last = None, None
    cur = obj
    for m in TOKEN.finditer(path):
        parent = cur
        last = int(m.group(1)) if m.group(1) is not None else m.group(2)
        cur = cur[last]
    return parent, last, cur


def add_scene_read_aloud(scene: dict, text: str) -> None:
    """A scene's read-aloud goes before its `play`, where the DM's eye starts."""
    items = [(k, v) for k, v in scene.items() if k != 'readAloud']
    scene.clear()
    for k, v in items:
        if k == 'play':
            scene['readAloud'] = text
        scene[k] = v
    scene.setdefault('readAloud', text)


def field_of(path: str) -> str:
    m = list(TOKEN.finditer(path))[-1]
    return m.group(2) or ''


def names_in(text: str, names: set[str]) -> set[str]:
    return {n for n in names if n in text}


def main():
    args = sys.argv[1:]
    force = '--force' in args
    args = [a for a in args if a != '--force']
    camp, patch_path = args
    src = ROOT / 'campaigns' / camp / 'source'
    patch = json.loads(Path(patch_path).read_text('utf-8'))
    data = {p.name: json.loads(p.read_text('utf-8')) for p in src.glob('*.json')}
    keys: set[str] = set()
    for v in data.values():
        collect_keys(v, keys)
    keys = {k for k in keys if '-' in k}
    people: set[str] = set()
    for v in data.values():
        if isinstance(v, dict):
            for group in ('heroes', 'npcs'):
                for x in v.get(group, []):
                    first = x.get('name', '').split()[0] if x.get('name') else ''
                    if len(first) > 2:
                        people.add(first)
    errors, warnings, touched = [], [], set()
    scenes: list[tuple[str, str]] = []
    for addr, new in patch.items():
        fname, _, path = addr.partition('#')
        if fname not in data:
            errors.append(f'{addr}: no such file'); continue
        try:
            parent, last, old = walk(data[fname], path)
        except KeyError:
            if not (NEW_SCENE_FIELD.match(path) and fname.startswith(('sessions', 'act'))):
                errors.append(f'{addr}: no such field'); continue
            parent, last, old = walk(data[fname], path.rsplit('.', 1)[0])[2], 'readAloud', ''
        except (IndexError, TypeError):
            errors.append(f'{addr}: no such field'); continue
        if not isinstance(old, str) or not isinstance(new, str) or not new.strip():
            errors.append(f'{addr}: not a text field or empty'); continue
        new = new.strip()
        if '  ' not in old and '\n' not in old:
            new = re.sub(r'[ \t]+', ' ', new)  # prose; laid-out handouts keep their spacing
        field = field_of(path)
        for rx, msg in BANNED:
            if re.search(rx, new):
                errors.append(f'{addr}: {msg}')
        for k in keys:
            if re.search(r'(?<![\w-])' + re.escape(k) + r'(?![\w-])', new):
                errors.append(f'{addr}: internal key {k}')
        for m in LATIN_WORD.finditer(new):
            if m.group(0) not in LATIN_OK:
                warnings.append(f'{addr}: latin word {m.group(0)}')
        if field in PLAYER and fname.startswith(('sessions', 'act', 'world', 'clues')):
            m = READ_ALOUD_MECHANICS.search(new)
            if m and field != 'setting':
                errors.append(f'{addr}: rules word in player text: {m.group(0)}')
        lost = names_in(old, people) - names_in(new, people)
        if lost:
            warnings.append(f'{addr}: names gone: {", ".join(sorted(lost))}')
        titles = set(re.findall(r'«[^«»]{3,60}»', old)) - set(re.findall(r'«[^«»]{3,60}»', new))
        titles = {t for t in titles if not re.search(r'[.!?,]', t)}
        if titles and field not in PLAYER:
            warnings.append(f'{addr}: titles gone: {", ".join(sorted(titles))}')
        nums = set(re.findall(r'\d+', old)) - set(re.findall(r'\d+', new))
        if nums and field in ('play', 'check', 'failForward', 'dmNote', 'then', 'tactics', 'scaling'):
            warnings.append(f'{addr}: numbers gone: {", ".join(sorted(nums))}')
        minimum = MINIMUM.get(field)
        if fname == 'world.json' and '.locations[' in path and field == 'description':
            minimum = 30
        if fname.startswith('handouts') and field == 'text':
            minimum = 60
        if NEW_SCENE_FIELD.match(path):
            minimum = None  # bounds of its own, checked below
        if minimum and words(new) < minimum:
            warnings.append(f'{addr}: {words(new)} words, standard minimum {minimum}')
        if len(new) > 3800:
            errors.append(f'{addr}: {len(new)} characters, package limit 4000')
        if field in LIMITED and len(new) > max(1800, len(old)):
            errors.append(f'{addr}: {len(new)} characters, series limit 1800')
        if field == 'voice' and len(new) > 200:
            errors.append(f'{addr}: voice {len(new)} characters, manner limit 200')
        if NEW_SCENE_FIELD.match(path):
            m = AGENCY.search(re.sub(r'«[^»]*»', '', new))
            if m:
                errors.append(f'{addr}: decides for the heroes: {m.group(0)}')
            n = words(new)
            if not depth.SCENE_TARGET[0] <= n <= depth.SCENE_TARGET[1]:
                warnings.append(f'{addr}: {n} words, scene read-aloud target 60–120')
            scenes.append((fname, path))
        if NEW_SCENE_FIELD.match(path) and 'readAloud' not in parent:
            add_scene_read_aloud(parent, new)
        else:
            parent[last] = new
        touched.add(fname)
    for fname, path in scenes:  # after the whole patch: the evening may be rewritten too
        evening = walk(data[fname], path.split('.scenes')[0])[2]
        scene = walk(data[fname], path.rsplit('.', 1)[0])[2]
        for rule, detail in depth.scene_problems(scene.get('readAloud'), evening.get('readAloud', '')):
            errors.append(f'{fname}#{path}: {rule}: {detail}')
    for line in errors:
        print('ERROR', line)
    for line in warnings:
        print('WARN ', line)
    if errors or (warnings and not force):
        print(f'not applied: {len(errors)} errors, {len(warnings)} warnings'
              + ('' if errors else ' (rerun with --force if each warning is intended)'))
        sys.exit(1)
    paths = []
    for fname in sorted(touched):
        p = src / fname
        p.write_text(json.dumps(data[fname], ensure_ascii=False, indent=2) + '\n', 'utf-8')
        paths.append(str(p))
    if paths:
        subprocess.run(['npx', 'prettier', '--write', *paths], cwd=ROOT, check=True,
                       stdout=subprocess.DEVNULL)
    print(f'applied {len(patch)} fields in {len(touched)} files')


if __name__ == '__main__':
    main()
