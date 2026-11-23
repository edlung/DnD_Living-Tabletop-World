"""Depth rules of the text standard (docs/CAMPAIGN_TEXT_STANDARD.md §5–7, owner request 2026-11-23).

A read-aloud for every scene, the DM's pocket for improvisation, formulas that do not repeat
inside a campaign and narrative prose that no other campaign repeats. `audit.py` reports these
findings with its own; `apply.py` and `pocket.py` refuse a patch that breaks them.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORD = re.compile(r'[\wЀ-ӿ]+')
EVENING_FILE = re.compile(r'(?:sessions|act)-\d+\.json$')

SCENE_BOUNDS = (50, 130)  # refused outside; the standard's target is 60–120
SCENE_TARGET = (60, 120)
POCKET_COUNTS = {'rumours': (8, 12), 'places': (5, 6), 'people': (5, 6)}
POCKET_FIELDS = {
    'rumours': {'text': (8, 60), 'truth': None, 'note': (6, 70)},
    'places': {'name': (1, 8), 'text': (35, 80)},
    'people': {'name': (1, 6), 'look': (5, 45), 'line': (4, 45), 'knows': (5, 50)},
}
# What the players hear from the pocket: no rules words there.
POCKET_SPOKEN = {('rumours', 'text'), ('places', 'text'), ('people', 'look'), ('people', 'line')}
TRUTHS = ('true', 'false', 'partial')
BUILT_IN_POCKETS = {
    'builtin/ravenford-ru': ROOT / 'scripts/adventures/books/ravenford-pocket.json',
    'builtin/hollowmere-ru': ROOT / 'scripts/adventures/books/hollowmere-pocket.json',
}

# Formulas a campaign may use, but not in every evening.
ASK_EACH = re.compile(
    r'\b(?:[Сс]просите|[Пп]опросите|[Пп]редложите)\s+(?:у\s+)?(?:каждого|каждую|всех|игроков)\b'
    r'|\b[Пп]усть\s+каждый\b')
SMELL = re.compile(r'\b[Пп]ахн(?:ет|ут|ло)\b')
NARRATIVE = {'readAloud', 'opening', 'ending', 'end', 'play', 'description', 'appearance', 'text',
             'look', 'line', 'knows', 'note', 'pitch', 'setting', 'public', 'voice'}


def words(text: str) -> int:
    return len(WORD.findall(text))


def tokens(text: str) -> list[str]:
    return [w.lower().replace('ё', 'е') for w in WORD.findall(text)]


def grams(text: str, n: int) -> set[tuple[str, ...]]:
    t = tokens(text)
    return {tuple(t[i:i + n]) for i in range(len(t) - n + 1)}


def opening_pair(text: str) -> str:
    return ' '.join(tokens(text)[:2])


def evenings(data: dict[Path, object]):
    """(file, index, evening) of every evening in a campaign's sources, in file order."""
    for p in sorted(data, key=lambda q: (q.name.split('-')[0], int(re.sub(r'\D', '', q.stem) or 0))):
        if EVENING_FILE.fullmatch(p.name) and isinstance(data[p], list):
            for i, evening in enumerate(data[p]):
                if isinstance(evening, dict):
                    yield p, i, evening


def scene_problems(read_aloud: str | None, evening_read_aloud: str) -> list[tuple[str, str]]:
    """What is wrong with one scene's read-aloud: (rule, detail) pairs; empty when it is fine."""
    if not isinstance(read_aloud, str) or not read_aloud.strip():
        return [('scene-no-read-aloud', 'сцена без текста для чтения вслух')]
    out = []
    n = words(read_aloud)
    if n < SCENE_BOUNDS[0]:
        out.append(('short-scene-readAloud', f'{n} слов, минимум {SCENE_BOUNDS[0]}'))
    if n > SCENE_BOUNDS[1]:
        out.append(('long-scene-readAloud', f'{n} слов, предел {SCENE_BOUNDS[1]}'))
    echo = grams(read_aloud, 5) & grams(evening_read_aloud or '', 5)
    if echo:
        out.append(('scene-read-aloud-echo', 'повтор вступления вечера: ' + ' '.join(min(echo))))
    return out


def scene_findings(data: dict[Path, object]):
    """Every scene has its own read-aloud, of a breath's length, that does not echo the evening's
    or another scene's words."""
    seen: dict[tuple[str, ...], str] = {}
    for p, i, evening in evenings(data):
        for j, scene in enumerate(evening.get('scenes', [])):
            path = f'[{i}].scenes[{j}].readAloud'
            text = scene.get('readAloud')
            for rule, detail in scene_problems(text, evening.get('readAloud', '')):
                yield rule, p, path, detail
            if not isinstance(text, str):
                continue
            for g in sorted(grams(text, 8)):
                other = seen.setdefault(g, f'{p.name}{path}')
                if other != f'{p.name}{path}':
                    yield 'scene-read-aloud-repeat', p, path, f'как в {other}: ' + ' '.join(g)
                    break


def formula_findings(data: dict[Path, object]):
    """Formulas varied inside a campaign: scene read-alouds do not open alike, smells are not
    every read-aloud's first sense, and not every ending asks each player the same question."""
    alouds, endings, scene_alouds = [], [], []
    for p, i, evening in evenings(data):
        if isinstance(evening.get('readAloud'), str):
            alouds.append((p, f'[{i}].readAloud', evening['readAloud']))
        for j, scene in enumerate(evening.get('scenes', [])):
            if isinstance(scene.get('readAloud'), str):
                item = (p, f'[{i}].scenes[{j}].readAloud', scene['readAloud'])
                alouds.append(item)
                scene_alouds.append(item)
        for field in ('ending', 'end'):
            if isinstance(evening.get(field), str):
                endings.append((p, f'[{i}].{field}', evening[field]))
    if not alouds:
        return
    pairs = Counter(opening_pair(t) for _, _, t in scene_alouds)
    cap = 3 if len(scene_alouds) <= 32 else 4
    for p, path, text in scene_alouds:
        pair = opening_pair(text)
        if pairs[pair] > cap:
            yield 'formula-opening', p, path, f'«{pair}…» открывает {pairs[pair]} сцен (предел {cap})'
    smelly = [x for x in alouds if SMELL.search(x[2])]
    if len(smelly) > 0.4 * len(alouds):
        p, path, _ = smelly[-1]
        yield ('formula-smell', p, path,
               f'«пахнет» в {len(smelly)} из {len(alouds)} текстов для чтения (предел 40%)')
    first = [x for x in alouds if re.match(r'\W*[Пп]ахн', x[2])]
    for p, path, _ in first[2:]:
        yield 'formula-smell', p, path, 'текст снова начинается с «Пахнет»'
    asking = [x for x in endings if ASK_EACH.search(x[2])]
    cap = max(2, round(len(endings) / 3))
    for p, path, _ in asking[cap:]:
        yield ('formula-ending-ask', p, path,
               f'«спросите каждого» в {len(asking)} из {len(endings)} завершений (предел {cap})')
    ends = Counter(opening_pair(t) for _, _, t in endings)
    for p, path, text in endings:
        if ends[opening_pair(text)] > 2:
            yield 'formula-ending-opening', p, path, f'«{opening_pair(text)}…» открывает 3+ завершения'


def pocket_problems(pocket: object, cast_names: set[str], place_names: set[str]) -> list[str]:
    """What is wrong with a DM's pocket; empty when it meets the standard (§7)."""
    if not isinstance(pocket, dict) or set(pocket) != set(POCKET_COUNTS):
        return ['карман — объект ровно с полями rumours, places, people']
    out = []
    from audit import READ_ALOUD_MECHANICS  # audit imports this module first
    for part, (lo, hi) in POCKET_COUNTS.items():
        items = pocket[part]
        if not isinstance(items, list) or not lo <= len(items) <= hi:
            out.append(f'{part}: нужно {lo}–{hi} записей')
            continue
        for k, item in enumerate(items):
            at = f'{part}[{k}]'
            spec = POCKET_FIELDS[part]
            if not isinstance(item, dict) or set(item) != set(spec):
                out.append(f'{at}: поля ровно {", ".join(spec)}')
                continue
            for field, bounds in spec.items():
                value = item[field]
                if not isinstance(value, str) or not value.strip():
                    out.append(f'{at}.{field}: пустая строка')
                    continue
                if bounds and not bounds[0] <= words(value) <= bounds[1]:
                    out.append(f'{at}.{field}: {words(value)} слов, нужно {bounds[0]}–{bounds[1]}')
                if (part, field) in POCKET_SPOKEN:
                    m = READ_ALOUD_MECHANICS.search(value)
                    if m:
                        out.append(f'{at}.{field}: слово правил «{m.group(0)}» в тексте для игроков')
            if part == 'rumours' and item.get('truth') not in TRUTHS:
                out.append(f'{at}.truth: одно из {", ".join(TRUTHS)}')
            if part == 'people':
                if not re.search(r'«[^»]{6,}»', item.get('line', '')):
                    out.append(f'{at}.line: реплика в «ёлочках»')
                first = (item.get('name') or ' ').split()[0]
                if first in cast_names:
                    out.append(f'{at}.name: {first} уже есть среди героев и НИП — нужен прохожий')
            if part == 'places' and item.get('name', '').strip() in place_names:
                out.append(f'{at}.name: это место уже описано в мире — нужно второстепенное')
    if isinstance(pocket.get('rumours'), list):
        kinds = Counter(r.get('truth') for r in pocket['rumours'] if isinstance(r, dict))
        for kind in TRUTHS:
            if kinds[kind] == 0:
                out.append(f'rumours: нет ни одного слуха с truth «{kind}»')
    return out


def campaign_names(data: dict[Path, object]) -> tuple[set[str], set[str]]:
    """First names of the cast and names of the world's places, which a pocket must not reuse."""
    cast, places = set(), set()
    for p, obj in data.items():
        if p.name == 'cast.json' and isinstance(obj, dict):
            for group in ('heroes', 'npcs'):
                for x in obj.get(group, []):
                    if x.get('name'):
                        cast.add(x['name'].split()[0])
        if p.name == 'world.json' and isinstance(obj, dict):
            places |= {loc.get('name', '') for loc in obj.get('locations', [])}
        if p.name == 'book.json' and isinstance(obj, dict):  # a built-in adventure's book
            cast |= {x['name'].split()[0] for x in obj.get('people', []) if x.get('name')}
    return cast, places


def pocket_file(camp: str, src: Path) -> Path:
    return BUILT_IN_POCKETS.get(camp, src / 'pocket.json')


def pocket_findings(camp: str, src: Path, data: dict[Path, object]):
    file = pocket_file(camp, src)
    if not file.exists():
        yield 'pocket-missing', file, '', 'нет кармана ведущего'
        return
    cast, places = campaign_names(data)
    for problem in pocket_problems(json.loads(file.read_text('utf-8')), cast, places):
        yield 'pocket-shape', file, '', problem


def cross_campaign_findings(texts: dict[str, list[tuple[str, str]]], n: int = 12):
    """12-word sequences of narrative prose that two campaigns share (`texts`: camp → [(where,
    text)]). A sequence of numbers or a laid-out form is not prose and is skipped."""
    owner: dict[tuple[str, ...], tuple[str, str]] = {}
    found = defaultdict(set)
    for camp in sorted(texts):
        for where, text in texts[camp]:
            for g in grams(text, n):
                if sum(1 for w in g if w.isalpha()) < 8:
                    continue
                first = owner.setdefault(g, (camp, where))
                if first[0] != camp and g not in found[(camp, first[0])]:
                    found[(camp, first[0])].add(g)
                    yield camp, where, f'как в {first[0]} ({first[1]}): ' + ' '.join(g)
