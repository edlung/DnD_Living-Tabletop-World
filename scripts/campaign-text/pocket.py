"""Write a campaign's DM pocket (docs/CAMPAIGN_TEXT_STANDARD.md §7) after checking it.

Usage: python3 -B scripts/campaign-text/pocket.py <campaign> <draft.json> [--check]
<campaign> is the path under campaigns/ (dark-fantasy-2026/ash-tithe, acorn-express) or
builtin/ravenford-ru, builtin/hollowmere-ru. The draft is `{rumours, places, people}`; it becomes
`source/pocket.json` (a built-in adventure's pocket lives beside its pages in
scripts/adventures/books/). Refused: wrong counts or lengths, a truth other than
true/false/partial, a passer-by who is already in the cast, a place the world already has, rules
words in what the players hear, internal keys, latin words. --check only reports.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit import KEBAB, LATIN_OK, LATIN_WORD, ROOT, TERMS, collect_keys, strings  # noqa: E402
import depth  # noqa: E402

BUILT_IN = {'builtin/ravenford-ru': ROOT / 'fixtures/ravenford-ru',
            'builtin/hollowmere-ru': ROOT / 'fixtures/hollowmere-ru'}


def main():
    args = sys.argv[1:]
    check = '--check' in args
    camp, draft_path = [a for a in args if a != '--check']
    src = BUILT_IN.get(camp, ROOT / 'campaigns' / camp / 'source')
    files = [src / 'book.json'] if camp in BUILT_IN else sorted(src.glob('*.json'))
    data = {p: json.loads(p.read_text('utf-8')) for p in files if p.name != 'pocket.json'}
    pocket = json.loads(Path(draft_path).read_text('utf-8'))
    cast, places = depth.campaign_names(data)
    problems = depth.pocket_problems(pocket, cast, places)
    keys: set[str] = set()
    for v in data.values():
        collect_keys(v, keys)
    for path, _field, text in strings(pocket):
        for rule, rx, _rep, desc in TERMS:
            if re.search(rx, text):
                problems.append(f'{path}: {desc}')
        for m in KEBAB.finditer(text):
            problems.append(f'{path}: внутренний ключ или латиница «{m.group(0)}»')
        for m in LATIN_WORD.finditer(text):
            if m.group(0) not in LATIN_OK and not KEBAB.fullmatch(m.group(0)):
                problems.append(f'{path}: латинское слово «{m.group(0)}»')
        if '  ' in text or re.search(r'(?<=\s)-(?=\s)', text):
            problems.append(f'{path}: двойной пробел или дефис вместо тире')
        if len(text) > 1800:
            problems.append(f'{path}: {len(text)} знаков, предел 1800')
    for line in problems:
        print('ERROR', line)
    if problems:
        print(f'not written: {len(problems)} problems')
        sys.exit(1)
    target = depth.pocket_file(camp, src)
    if check:
        print(f'ok: {target.relative_to(ROOT)} would be written')
        return
    target.write_text(json.dumps(pocket, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    subprocess.run(['npx', 'prettier', '--write', str(target)], cwd=ROOT, check=True,
                   stdout=subprocess.DEVNULL)
    n = {part: len(pocket[part]) for part in depth.POCKET_COUNTS}
    print(f'written {target.relative_to(ROOT)}: {n["rumours"]} rumours, {n["places"]} places, '
          f'{n["people"]} people')


if __name__ == '__main__':
    main()
