"""The story's own preparation (docs/CAMPAIGN_TEXT_STANDARD.md §9–12, owner request 2026-11-27).

What follows each choice of a scene (`forks`), how every person of the cast talks (`voice`) and
what they say in the situations a table brings (`lines`), the epilogue of every ending
(`epilogue`) and the turns of the story with what to plant in which evening (`twists`). All of it
is the DM's text and never goes into a package (a `voice` is the package NPC's manner, as before).

Library: `story_findings(camp, data)` yields (rule, file, path, detail) for `audit.py`.
CLI: python3 -B scripts/campaign-text/story.py <campaign> <patch.json> [--force]
patch.json: {
  "forks":     {"sessions-1.json#[0].scenes[0]": ["…", "…"]},   one text a choice, in order
  "voice":     {"npc-key": "…"},
  "lines":     {"npc-key": [{"when": "…", "say": "… «…»"}]},
  "epilogues": {"Ending title": "…"},
  "twists":    [{"title", "turn", "seeds": [{"session", "text"}], "reveal": {"session", "text"},
                 "after"}]
}
Refused: rules shorthand, internal keys, a fork count unlike the scene's choices, rules words or a
decision for the heroes in an epilogue, a turn planted after it comes out. Warnings (--force to
apply anyway): lengths outside the standard's targets.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit import AGENCY, LATIN_OK, LATIN_WORD, READ_ALOUD_MECHANICS, ROOT, collect_keys  # noqa: E402

WORD = re.compile(r'[\wЀ-ӿ]+')
EVENING_FILE = re.compile(r'(?:sessions|act)-\d+\.json$')
QUOTE = re.compile(r'«[^»]{8,}»')
BANNED = [(r'\bСЛ\b', 'СЛ → Сл'), (r'\bDC\b', 'DC → Сл'), (r'\bКБ\b', 'КБ → КД'),
          (r'(?<![\w-])HP(?![\w-])', 'HP → хиты'), (r'(?<![\w-])NPC(?![\w-])', 'NPC → НИП'),
          (r'(?<![\w-])AC(?![\w-])', 'AC → КД'), (r'\bВосприяти', 'Восприятие → Внимательность'),
          (r'\(Расследовани', 'Расследование → Анализ'), (r'(?<=\d)к(?=\d)', '1к6 → 1d6'),
          (r'(?:^|\s)в\.\s?\d', 'в. 2 → вечер 2')]

# Words (bounds refused by the audit; the standard's targets in docs/CAMPAIGN_TEXT_STANDARD.md).
FORK = (30, 150)
FORK_TARGET = (40, 110)
VOICE = (12, 40)
LINES = (5, 8)
LINE_WHEN = (1, 9)
LINE_SAY = (8, 75)
EPILOGUE = (100, 280)
EPILOGUE_TARGET = (130, 240)
TWISTS = (2, 4)
TWIST_TURN = (10, 80)
TWIST_SEED = (8, 70)
TWIST_REVEAL = (25, 170)
TWIST_AFTER = (15, 120)


def words(text: str) -> int:
    return len(WORD.findall(text))


def evenings(data: dict[str, object]):
    """(file name, index, evening) of every evening of a campaign, by file order."""
    for name in sorted(data, key=lambda n: (n.split('-')[0], int(re.sub(r'\D', '', n) or 0))):
        if EVENING_FILE.fullmatch(name) and isinstance(data[name], list):
            for i, evening in enumerate(data[name]):
                if isinstance(evening, dict):
                    yield name, i, evening


def session_numbers(data: dict[str, object]) -> set[int]:
    return {e['number'] for _, _, e in evenings(data) if isinstance(e.get('number'), int)}


def spoken(text: str) -> str:
    """The text with what people say taken out: rules words may be quoted, not narrated."""
    return re.sub(r'«[^»]*»', '', text)


def fork_problems(scene: dict) -> list[tuple[str, str]]:
    choices = scene.get('choices') or []
    forks = scene.get('forks')
    if not choices:
        return []
    if forks is None:
        return [('fork-missing', f'{len(choices)} выборов без развилок')]
    if not isinstance(forks, list) or len(forks) != len(choices):
        return [('fork-count', f'развилок {len(forks) if isinstance(forks, list) else "?"}, выборов {len(choices)}')]
    out = []
    for k, fork in enumerate(forks):
        if not isinstance(fork, str) or not fork.strip():
            out.append(('fork-empty', f'[{k}] пустая развилка'))
            continue
        n = words(fork)
        if n < FORK[0]:
            out.append(('short-fork', f'[{k}] {n} слов, минимум {FORK[0]}'))
        if n > FORK[1]:
            out.append(('long-fork', f'[{k}] {n} слов, предел {FORK[1]}'))
        if not QUOTE.search(fork):
            out.append(('fork-no-line', f'[{k}] нет ни одной реплики в «ёлочках»'))
    return out


def person_problems(npc: dict) -> list[tuple[str, str]]:
    out = []
    voice = npc.get('voice')
    if not isinstance(voice, str) or not voice.strip():
        out.append(('voice-missing', 'нет манеры речи'))
    else:
        n = words(voice)
        if not VOICE[0] <= n <= VOICE[1]:
            out.append(('voice-length', f'{n} слов, нужно {VOICE[0]}–{VOICE[1]}'))
        if len(voice) > 200:
            out.append(('voice-length', f'{len(voice)} знаков, предел манеры 200'))
    lines = npc.get('lines')
    if not isinstance(lines, list) or not lines:
        out.append(('lines-missing', 'нет готовых реплик'))
        return out
    if not LINES[0] <= len(lines) <= LINES[1]:
        out.append(('lines-count', f'{len(lines)} реплик, нужно {LINES[0]}–{LINES[1]}'))
    seen = set()
    for k, line in enumerate(lines):
        if not isinstance(line, dict) or set(line) != {'when', 'say'}:
            out.append(('lines-shape', f'[{k}] поля ровно when, say'))
            continue
        when, say = line['when'], line['say']
        if not isinstance(when, str) or not LINE_WHEN[0] <= words(when) <= LINE_WHEN[1]:
            out.append(('lines-when', f'[{k}] ситуация в {LINE_WHEN[0]}–{LINE_WHEN[1]} слов'))
        if not isinstance(say, str) or not QUOTE.search(say):
            out.append(('lines-say', f'[{k}] реплика в «ёлочках»'))
            continue
        n = words(say)
        if not LINE_SAY[0] <= n <= LINE_SAY[1]:
            out.append(('lines-say', f'[{k}] {n} слов, нужно {LINE_SAY[0]}–{LINE_SAY[1]}'))
        if when in seen:
            out.append(('lines-when', f'[{k}] ситуация «{when}» повторяется'))
        seen.add(when)
    return out


def epilogue_problems(ending: dict) -> list[tuple[str, str]]:
    text = ending.get('epilogue')
    if not isinstance(text, str) or not text.strip():
        return [('epilogue-missing', f'у финала «{ending.get("title", "?")}» нет эпилога')]
    out = []
    n = words(text)
    if not EPILOGUE[0] <= n <= EPILOGUE[1]:
        out.append(('epilogue-length', f'{n} слов, нужно {EPILOGUE[0]}–{EPILOGUE[1]}'))
    m = READ_ALOUD_MECHANICS.search(spoken(text))
    if m:
        out.append(('epilogue-mechanics', f'слово правил «{m.group(0)}» в тексте для игроков'))
    m = AGENCY.search(spoken(text))
    if m:
        out.append(('epilogue-agency', f'решает за героев: {m.group(0)}'))
    return out


def twist_problems(twists: object, numbers: set[int]) -> list[tuple[str, str]]:
    if not isinstance(twists, list) or not twists:
        return [('twists-missing', 'нет сюжетных поворотов')]
    out = []
    if not TWISTS[0] <= len(twists) <= TWISTS[1]:
        out.append(('twists-count', f'{len(twists)} поворотов, нужно {TWISTS[0]}–{TWISTS[1]}'))
    for k, twist in enumerate(twists):
        at = f'[{k}]'
        if not isinstance(twist, dict) or set(twist) != {'title', 'turn', 'seeds', 'reveal', 'after'}:
            out.append(('twists-shape', f'{at} поля ровно title, turn, seeds, reveal, after'))
            continue
        for field, bounds in (('turn', TWIST_TURN), ('after', TWIST_AFTER)):
            n = words(twist[field]) if isinstance(twist[field], str) else 0
            if not bounds[0] <= n <= bounds[1]:
                out.append(('twists-length', f'{at}.{field}: {n} слов, нужно {bounds[0]}–{bounds[1]}'))
        reveal = twist['reveal']
        if not isinstance(reveal, dict) or set(reveal) != {'session', 'text'}:
            out.append(('twists-shape', f'{at}.reveal: поля ровно session, text'))
            continue
        if reveal['session'] not in numbers:
            out.append(('twists-session', f'{at}.reveal: нет вечера {reveal["session"]}'))
        n = words(reveal['text'])
        if not TWIST_REVEAL[0] <= n <= TWIST_REVEAL[1]:
            out.append(('twists-length', f'{at}.reveal: {n} слов, нужно {TWIST_REVEAL[0]}–{TWIST_REVEAL[1]}'))
        seeds = twist['seeds']
        if not isinstance(seeds, list) or len(seeds) < 2:
            out.append(('twists-seeds', f'{at}: нужно хотя бы два посева'))
            continue
        for j, seed in enumerate(seeds):
            if not isinstance(seed, dict) or set(seed) != {'session', 'text'}:
                out.append(('twists-shape', f'{at}.seeds[{j}]: поля ровно session, text'))
                continue
            if seed['session'] not in numbers:
                out.append(('twists-session', f'{at}.seeds[{j}]: нет вечера {seed["session"]}'))
            elif isinstance(reveal.get('session'), int) and seed['session'] > reveal['session']:
                out.append(('twists-session', f'{at}.seeds[{j}]: посев в вечере {seed["session"]} позже поворота'))
            n = words(seed['text'])
            if not TWIST_SEED[0] <= n <= TWIST_SEED[1]:
                out.append(('twists-length', f'{at}.seeds[{j}]: {n} слов, нужно {TWIST_SEED[0]}–{TWIST_SEED[1]}'))
    return out


def story_findings(data: dict[str, object]):
    """(rule, file name, path, detail) for one campaign's sources, keyed by file name."""
    for name, i, evening in evenings(data):
        for j, scene in enumerate(evening.get('scenes', [])):
            if scene.get('dmAftermath'):
                continue
            for rule, detail in fork_problems(scene):
                yield rule, name, f'[{i}].scenes[{j}].forks', detail
    cast = data.get('cast.json')
    if isinstance(cast, dict):
        for k, npc in enumerate(cast.get('npcs', [])):
            for rule, detail in person_problems(npc):
                yield rule, 'cast.json', f'.npcs[{k}]', f'{npc.get("name", "?")}: {detail}'
    world = data.get('world.json')
    if isinstance(world, dict):
        for k, ending in enumerate(world.get('endings') or []):
            for rule, detail in epilogue_problems(ending):
                yield rule, 'world.json', f'.endings[{k}].epilogue', detail
        for rule, detail in twist_problems(world.get('twists'), session_numbers(data)):
            yield rule, 'world.json', '.twists', detail


def insert_after(obj: dict, after: str, key: str, value) -> None:
    """Sets `key` in a JSON object, a new key placed right after `after` where the DM reads it."""
    if key in obj or after not in obj:
        obj[key] = value
        return
    items = list(obj.items())
    obj.clear()
    for k, v in items:
        obj[k] = v
        if k == after:
            obj[key] = value


TOKEN = re.compile(r'\[(\d+)\]|\.([^.\[]+)')


def walk(obj, path: str):
    for m in TOKEN.finditer(path):
        obj = obj[int(m.group(1))] if m.group(1) is not None else obj[m.group(2)]
    return obj


def prose_problems(text: str, keys: set[str]) -> list[str]:
    out = []
    for rx, msg in BANNED:
        if re.search(rx, text):
            out.append(msg)
    for key in keys:
        if re.search(r'(?<![\w-])' + re.escape(key) + r'(?![\w-])', text):
            out.append(f'internal key {key}')
    for m in LATIN_WORD.finditer(text):
        if m.group(0) not in LATIN_OK:
            out.append(f'latin word {m.group(0)}')
    if '  ' in text:
        out.append('double space')
    if re.search(r'(?<=\s)-(?=\s)', text):
        out.append('hyphen as a dash')
    return out


def tidy(text: str) -> str:
    return re.sub(r'[ \t]+', ' ', text.strip())


def main():
    args = sys.argv[1:]
    force = '--force' in args
    args = [a for a in args if a != '--force']
    camp, patch_path = args
    src = ROOT / 'campaigns' / camp / 'source'
    patch = json.loads(Path(patch_path).read_text('utf-8'))
    unknown = set(patch) - {'forks', 'voice', 'lines', 'epilogues', 'twists'}
    if unknown:
        sys.exit(f'unknown parts: {", ".join(sorted(unknown))}')
    data = {p.name: json.loads(p.read_text('utf-8')) for p in src.glob('*.json')}
    keys: set[str] = set()
    for v in data.values():
        collect_keys(v, keys)
    keys = {k for k in keys if '-' in k}
    errors, warnings, touched = [], [], set()

    def check(where: str, text: str):
        for problem in prose_problems(text, keys):
            errors.append(f'{where}: {problem}')

    for addr, forks in patch.get('forks', {}).items():
        fname, _, path = addr.partition('#')
        try:
            scene = walk(data[fname], path)
        except (KeyError, IndexError, TypeError):
            errors.append(f'{addr}: no such scene'); continue
        if not isinstance(forks, list):
            errors.append(f'{addr}: forks must be a list'); continue
        forks = [tidy(f) for f in forks]
        for k, fork in enumerate(forks):
            check(f'{addr}.forks[{k}]', fork)
        candidate = {**scene, 'forks': forks}
        for rule, detail in fork_problems(candidate):
            (errors if rule in ('fork-count', 'fork-empty', 'fork-no-line') else warnings).append(
                f'{addr}: {rule}: {detail}')
        for k, fork in enumerate(forks):
            n = words(fork)
            if FORK[0] <= n <= FORK[1] and not FORK_TARGET[0] <= n <= FORK_TARGET[1]:
                warnings.append(f'{addr}.forks[{k}]: {n} слов, цель {FORK_TARGET[0]}–{FORK_TARGET[1]}')
        insert_after(scene, 'choices', 'forks', forks)
        touched.add(fname)

    cast = data.get('cast.json', {})
    npcs = {n['key']: n for n in cast.get('npcs', [])}
    for key, voice in patch.get('voice', {}).items():
        if key not in npcs:
            errors.append(f'voice.{key}: no such person'); continue
        voice = tidy(voice)
        check(f'voice.{key}', voice)
        n = words(voice)
        if not VOICE[0] <= n <= VOICE[1] or len(voice) > 200:
            errors.append(f'voice.{key}: {n} слов / {len(voice)} знаков, нужно {VOICE[0]}–{VOICE[1]} слов и до 200 знаков')
        insert_after(npcs[key], 'public', 'voice', voice)
        touched.add('cast.json')
    for key, lines in patch.get('lines', {}).items():
        if key not in npcs:
            errors.append(f'lines.{key}: no such person'); continue
        lines = [{'when': tidy(x.get('when', '')), 'say': tidy(x.get('say', ''))} for x in lines]
        for k, line in enumerate(lines):
            check(f'lines.{key}[{k}]', line['when'] + ' ' + line['say'])
        trial = {**npcs[key], 'lines': lines}
        trial.setdefault('voice', 'x ' * 12)
        for rule, detail in person_problems(trial):
            if rule.startswith('lines'):
                errors.append(f'lines.{key}: {rule}: {detail}')
        npcs[key]['lines'] = lines
        touched.add('cast.json')

    world = data['world.json']
    endings = {e.get('title'): e for e in world.get('endings') or []}
    for title, text in patch.get('epilogues', {}).items():
        if title not in endings:
            errors.append(f'epilogues.{title}: no such ending'); continue
        text = text.strip()
        check(f'epilogues.{title}', text)
        for rule, detail in epilogue_problems({'title': title, 'epilogue': text}):
            (errors if rule != 'epilogue-length' else warnings).append(f'epilogues.{title}: {rule}: {detail}')
        n = words(text)
        if EPILOGUE[0] <= n <= EPILOGUE[1] and not EPILOGUE_TARGET[0] <= n <= EPILOGUE_TARGET[1]:
            warnings.append(f'epilogues.{title}: {n} слов, цель {EPILOGUE_TARGET[0]}–{EPILOGUE_TARGET[1]}')
        ending = endings[title]
        insert_after(ending, 'cost' if 'cost' in ending else 'result', 'epilogue', text)
        touched.add('world.json')
    if 'twists' in patch:
        twists = patch['twists']
        for k, twist in enumerate(twists if isinstance(twists, list) else []):
            for field in ('title', 'turn', 'after'):
                if isinstance(twist.get(field), str):
                    twist[field] = tidy(twist[field])
                    check(f'twists[{k}].{field}', twist[field])
            for part in [twist.get('reveal')] + list(twist.get('seeds') or []):
                if isinstance(part, dict) and isinstance(part.get('text'), str):
                    part['text'] = tidy(part['text'])
                    check(f'twists[{k}]', part['text'])
        for rule, detail in twist_problems(twists, session_numbers(data)):
            (errors if rule != 'twists-length' else warnings).append(f'twists: {rule}: {detail}')
        insert_after(world, 'truth', 'twists', twists)
        touched.add('world.json')

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
    remaining = list(story_findings(data))
    print(f'applied to {len(touched)} files; story findings left in this campaign: {len(remaining)}')


if __name__ == '__main__':
    main()
