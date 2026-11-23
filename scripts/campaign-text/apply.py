"""Apply rewritten prose to one campaign's sources, with the text standard's checks.

Usage: python3 -B scripts/campaign-text/apply.py <campaign> <patch.json> [--force]
patch.json: {"sessions-1.json#[0].readAloud": "новый текст", ...} — addresses as dump.py prints.
Only existing string fields are replaced. Errors (refused): rules shorthand (СЛ, DC, КБ, HP, NPC),
internal keys, mechanics in player text. Warnings: a name, «title» or number of the old text
missing from the new one, and lengths below the standard. --force applies despite warnings.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit import LATIN_OK, LATIN_WORD, READ_ALOUD_MECHANICS, ROOT, collect_keys  # noqa: E402

MINIMUM = {'opening': 200, 'readAloud': 110, 'ending': 45, 'end': 45, 'appearance': 18, 'play': 100,
           'voice': 12}
PLAYER = {'opening', 'readAloud', 'appearance', 'pitch', 'setting'}
BANNED = [(r'\bСЛ\b', 'СЛ → Сл'), (r'\bDC\b', 'DC → Сл'), (r'\bКБ\b', 'КБ → КД'),
          (r'(?<![\w-])HP(?![\w-])', 'HP → хиты'), (r'(?<![\w-])NPC(?![\w-])', 'NPC → НИП'),
          (r'(?<![\w-])AC(?![\w-])', 'AC → КД'), (r'\bВосприяти', 'Восприятие → Внимательность'),
          (r'\(Расследовани', 'Расследование → Анализ'), (r'(?<=\d)к(?=\d)', '1к6 → 1d6')]
TOKEN = re.compile(r'\[(\d+)\]|\.([^.\[]+)')


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
    for addr, new in patch.items():
        fname, _, path = addr.partition('#')
        if fname not in data:
            errors.append(f'{addr}: no such file'); continue
        try:
            parent, last, old = walk(data[fname], path)
        except (KeyError, IndexError, TypeError):
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
        if minimum and words(new) < minimum:
            warnings.append(f'{addr}: {words(new)} words, standard minimum {minimum}')
        if len(new) > 3800:
            errors.append(f'{addr}: {len(new)} characters, package limit 4000')
        if field == 'voice' and len(new) > 200:
            errors.append(f'{addr}: voice {len(new)} characters, manner limit 200')
        parent[last] = new
        touched.add(fname)
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
