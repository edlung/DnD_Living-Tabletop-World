"""Read-only audit of campaign prose against the D&D text standard (docs/CAMPAIGN_TEXT_STANDARD.md).

Usage: python3 -B scripts/campaign-text/audit.py [--json OUT] [--samples N] [slug-filter]
Walks every `campaigns/**/source/*.json` plus the built-in Russian adventures, reads string values
by field, and reports rule hits per campaign. Reference fields (keys, ids, links) are skipped.
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Fields that hold identifiers or references, never prose.
REFERENCE_FIELDS = {
    'key', 'slug', 'startLocation', 'location', 'parent', 'subjects', 'clues', 'participants',
    'handouts', 'witnesses', 'npc', 'culprit', 'archetype', 'status', 'weather', 'type', 'art',
    'srd', 'holder', 'layout', 'region', 'encounter', 'classId', 'species', 'from', 'to',
    'attackIds', 'engine', 'hero', 'language', 'id', 'ref', 'kind', 'icon', 'audience', 'size', 'level',
    'props', 'person', 'people', 'clue', 'attributedTo', 'informant', 'subject', 'place',
    'encounters', 'looseEncounters', 'roll', 'skill', '$comment', 'terrainKind',
    'stakes', 'scale',
}


IDENTIFIER = re.compile(r'[a-z][a-z0-9-]*')


def is_reference(field: str, value: str | None = None) -> bool:
    """A reference field, or a bare identifier or enum value (`grassland`, `wound`) anywhere."""
    if value is not None and IDENTIFIER.fullmatch(value):
        return True
    return field in REFERENCE_FIELDS or field.endswith(('Id', 'Ids'))
# Text the players hear or hold.
PLAYER_FIELDS = {'readAloud', 'opening', 'pitch', 'setting', 'text', 'appearance', 'ending'}

PLACEHOLDER = '\u0000'
SKILL_CONTEXT = r'(?:\(|Сл\b|СЛ\b|провер|[Мм]удрост|[Ии]нтеллект|броск|спасброс)'

# (rule id, regex, replacement or None, description)
TERMS: list[tuple[str, str, str | None, str]] = [
    ('ac-kb', r'\bКБ\b', 'КД', 'Класс доспеха пишется «КД»'),
    ('dc-caps', r'\bСЛ(?=\s?\d)', 'Сл', 'Сложность пишется «Сл 12»'),
    ('dc-caps-word', r'\bСЛ\b', 'Сл', 'Сложность пишется «Сл»'),
    ('dc-latin', r'\bDC\s?(?=\d)', 'Сл ', 'латинское DC в русском тексте'),
    ('hp-latin', r'(?<![\w-])HP(?![\w-])', None, 'латинское HP в русском тексте — «хиты»'),
    ('perception', r'\bВосприяти[еяю]\b', None, 'навык Perception — «Внимательность»'),
    ('investigation', r'\bРасследовани[еяю]\b(?=\s*(?:\)|Сл|СЛ|,|\d))', None,
     'навык Investigation — «Анализ»'),
    ('animal', r'Обращени[еяю] с животными', None, 'навык — «Уход за животными»'),
    ('arcana', r'\b(?:Тайная магия|Аркан[аы]?)\b', None, 'навык Arcana — «Магия»'),
    ('insight', r'\bИнтуици[яи]\b(?=\s*(?:\)|Сл|СЛ|,|\d))', None, 'навык Insight — «Проницательность»'),
    ('stamina', r'\bВыносливост[ьи]\b(?=\s*(?:\)|\(|Сл|СЛ|,|\d))', None,
     'характеристика — «Телосложение»'),
    ('save-hyphen', r'[Сс]пас-брос', None, '«спасбросок» пишется слитно'),
    ('dice-cyr', r'(?<=\d)к(?=(?:4|6|8|10|12|20|100)\b)', 'd', 'кости пишутся как в правилах: 1d6'),
    ('dice-cyr-bare', r'(?<![\w\d])к(?=(?:4|6|8|10|12|20|100)\b)', 'd', 'кости пишутся «d20»'),
    ('rest-prolonged', r'продолжительн\w+ отдых\w*', None, 'в правилах приложения — «долгий отдых»'),
    ('npc-latin', r'(?<![\w-])NPC(?![\w-])', None, '«НИП» или «персонаж ведущего»'),
]

READ_ALOUD_MECHANICS = re.compile(
    r'\b(?:Сл|СЛ|КД|КБ)\b|\bпроверк\w*|\bспасброс\w*|\bхит(?:ов|а|ы)?\b|\bбросо?к\w*|\bбросьте\b'
    r'|\bинициатив\w*|\bпреимуществ\w*|\bпомех\w*|\bраунд\w*|\bклетк\w*',
    re.I)
AGENCY = re.compile(
    r'\b[Вв]ы\s+(?:решаете|понимаете,|понимаете|чувствуете|боитесь|хотите|соглашаетесь|бросаетесь|'
    r'достаёте|нападаете|кричите|не можете|не в силах|невольно|улыбаетесь|вздрагиваете|'
    r'успокаиваетесь|радуетесь|сжимаете|отступаете|киваете|узнаёте в нём|вспоминаете)\b')
ABBREV = re.compile(r'(?<![\w.])(?:в|веч)\.\s?(?=\d)')
LATIN_WORD = re.compile(r'(?<![\w/#.@-])[A-Za-z][A-Za-z]{2,}(?![\w/.@-])')
KEBAB = re.compile(r'(?<![\w/#.@-])[a-z][a-z0-9]*(?:-[a-z0-9]+)+(?![\w/.@-])')
MINIMUM = {'opening': 200, 'readAloud': 110, 'ending': 45, 'end': 45, 'appearance': 18, 'play': 100,
           'voice': 12}
LATIN_OK = {'d20', 'd12', 'd10', 'd8', 'd6', 'd4', 'd100', 'XP', 'ImageGen', 'SRD'}


def words(s: str) -> int:
    return len(re.findall(r'[\wЀ-ӿ]+', s))


def sources() -> list[tuple[str, Path]]:
    out = []
    for dp, dn, fn in os.walk(ROOT / 'campaigns'):
        if dp.endswith('/source'):
            camp = str(Path(dp).parent.relative_to(ROOT / 'campaigns'))
            out.append((camp, Path(dp)))
    for name in ('ravenford-ru', 'hollowmere-ru'):
        p = ROOT / 'fixtures' / name
        if p.exists():
            out.append((f'builtin/{name}', p))
    return sorted(out)


def strings(obj, path='', field=''):
    if isinstance(obj, str):
        if not is_reference(field, obj):
            yield path, field, obj
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from strings(v, f'{path}[{i}]', field)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if not is_reference(k):
                yield from strings(v, f'{path}.{k}', k)


def collect_keys(obj, acc: set[str]):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == 'key' and isinstance(v, str):
                acc.add(v)
            collect_keys(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            collect_keys(v, acc)


EXCEPTIONS = json.loads((Path(__file__).parent / 'exceptions.json').read_text('utf-8'))

import depth  # noqa: E402  (its rules use the regexes above)
import story  # noqa: E402  (the third round: forks, lines, epilogues, twists)


def audit(filter_: str | None = None, samples: int = 3):
    hits: dict[str, Counter] = defaultdict(Counter)
    examples: dict[str, list] = defaultdict(list)
    narrative: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for camp, d in sources():
        if filter_ and filter_ not in camp:
            continue
        files = sorted(p for p in d.rglob('*.json') if 'node_modules' not in p.parts)
        if camp.startswith('builtin/'):
            files = [p for p in files if p.name == 'book.json']
        data = {}
        for p in files:
            try:
                data[p] = json.loads(p.read_text('utf-8'))
            except Exception:
                continue
        keys: set[str] = set()
        for v in data.values():
            collect_keys(v, keys)
        keys = {k for k in keys if '-' in k}

        allowed = EXCEPTIONS.get(camp, {})

        def add(rule, p, path, text, m):
            if f'{p.name}{path}' in allowed and rule in ('double-space',):
                return
            hits[camp][rule] += 1
            if len(examples[rule]) < samples * 40:
                a = max(0, m.start() - 50) if m else 0
                examples[rule].append(
                    (camp, f'{p.name}{path}', text[a:(m.end() + 50) if m else 160]))

        for p, obj in data.items():
            for path, field, s in strings(obj):
                for rule, rx, _rep, _desc in TERMS:
                    for m in re.finditer(rx, s):
                        add(rule, p, path, s, m)
                for m in ABBREV.finditer(s):
                    add('abbrev-evening', p, path, s, m)
                for m in KEBAB.finditer(s):
                    add('raw-key' if m.group(0) in keys else 'kebab-latin', p, path, s, m)
                for m in LATIN_WORD.finditer(s):
                    w = m.group(0)
                    if w in LATIN_OK or KEBAB.fullmatch(w):
                        continue
                    add('latin-word', p, path, s, m)
                if '  ' in s:
                    add('double-space', p, path, s, re.search('  ', s))
                if re.search(r'(?<=\s)-(?=\s)', s):
                    add('hyphen-dash', p, path, s, re.search(r'(?<=\s)-(?=\s)', s))
                minimum = MINIMUM.get(field)
                if p.name == 'world.json' and '.locations[' in path and field == 'description':
                    minimum = 30
                if p.name.startswith('handouts') and field == 'text':
                    minimum = 60
                if field == 'readAloud' and '.scenes[' in path:
                    minimum = None  # a scene's read-aloud has its own bounds (depth.py)
                if field in depth.NARRATIVE:
                    narrative[camp].append((f'{p.name}{path}', s))
                excepted = f'{p.name}{path}' in allowed
                if minimum and not excepted and p.name != 'table-routes.json' and words(s) < minimum:
                    hits[camp][f'short-{field}'] += 1
                    if len(examples[f'short-{field}']) < 2000:
                        examples[f'short-{field}'].append((camp, f'{p.name}{path}', f'{words(s)} слов'))
                if field == 'play' and not excepted and len(re.findall(r'«[^»]{12,}»', s)) < 2:
                    hits[camp]['play-no-dialogue'] += 1
                    if len(examples['play-no-dialogue']) < 2000:
                        examples['play-no-dialogue'].append((camp, f'{p.name}{path}', s[:120]))
                unquoted = re.sub(r'«[^»]*»', '', s)
                if field in ('readAloud', 'opening', 'pitch'):
                    m = READ_ALOUD_MECHANICS.search(unquoted)
                    if m:
                        add('player-mechanics', p, path, s, m)
                if field in ('readAloud', 'opening'):
                    m = AGENCY.search(unquoted)
                    if m:
                        add('player-agency', p, path, s, m)

        def deep(rule, p, path, detail):
            if f'{p.name}{path}' in allowed and rule in allowed.get('$depth', []):
                return
            hits[camp][rule] += 1
            if len(examples[rule]) < samples * 40:
                examples[rule].append((camp, f'{p.name}{path}', detail))

        by_name = {p: v for p, v in data.items() if p.parent == d}
        if not camp.startswith('builtin/'):
            for finding in depth.scene_findings(by_name):
                deep(*finding)
            for finding in depth.formula_findings(by_name):
                deep(*finding)
        for finding in depth.pocket_findings(camp, d, by_name):
            deep(*finding)
        if not camp.startswith('builtin/'):
            named = {q.name: v for q, v in by_name.items()}
            for rule, name, path, detail in story.story_findings(named):
                deep(rule, d / name, path, detail)
        pocket = depth.pocket_file(camp, d)
        if camp.startswith('builtin/') and pocket.exists():
            for path, field, s in strings(json.loads(pocket.read_text('utf-8'))):
                if field in depth.NARRATIVE:
                    narrative[camp].append((f'{pocket.name}{path}', s))
    for camp, where, detail in depth.cross_campaign_findings(narrative):
        hits[camp]['cross-campaign-12-words'] += 1
        if len(examples['cross-campaign-12-words']) < samples * 40:
            examples['cross-campaign-12-words'].append((camp, where, detail))
    return hits, examples


def depth_summary(filter_: str | None = None) -> str:
    """Scene read-alouds written, in the target length, and pockets present (information only)."""
    scenes = written = target = pockets = camps = 0
    for camp, d in sources():
        if filter_ and filter_ not in camp:
            continue
        camps += 1
        pockets += depth.pocket_file(camp, d).exists()
        if camp.startswith('builtin/'):
            continue
        data = {p: json.loads(p.read_text('utf-8')) for p in d.glob('*.json')}
        for _, _, evening in depth.evenings(data):
            for scene in evening.get('scenes', []):
                scenes += 1
                text = scene.get('readAloud')
                if isinstance(text, str) and text.strip():
                    written += 1
                    lo, hi = depth.SCENE_TARGET
                    target += lo <= depth.words(text) <= hi
    return (f'scene read-alouds: {written} of {scenes} scenes, {target} within '
            f'{depth.SCENE_TARGET[0]}–{depth.SCENE_TARGET[1]} words; pockets: {pockets} of {camps}')


def main():
    args = sys.argv[1:]
    out = None
    samples = 3
    if '--json' in args:
        i = args.index('--json'); out = args[i + 1]; del args[i:i + 2]
    if '--samples' in args:
        i = args.index('--samples'); samples = int(args[i + 1]); del args[i:i + 2]
    hits, examples = audit(args[0] if args else None, samples)
    total = Counter()
    for c in hits.values():
        total.update(c)
    print('rule totals:')
    for r, n in total.most_common():
        print(f'  {n:6d}  {r}')
    print('\nper campaign (top rules):')
    for camp in sorted(hits):
        print(f'  {camp}: ' + ', '.join(f'{r}={n}' for r, n in hits[camp].most_common(6)))
    print('\n' + depth_summary(args[0] if args else None))
    if out:
        Path(out).write_text(json.dumps({'hits': hits, 'examples': examples}, ensure_ascii=False,
                                        indent=1), 'utf-8')
    sys.exit(1 if total else 0)


if __name__ == '__main__':
    main()
