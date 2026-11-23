"""Mechanical D&D-terminology fixes in campaign sources (docs/CAMPAIGN_TEXT_STANDARD.md §1–2).

Usage: python3 -B scripts/campaign-text/fix_terms.py [--dry] [slug-filter]
Rewrites only prose string values of `campaigns/**/source/*.json` (reference fields are skipped),
then the caller runs prettier on the changed files. Prints a count per rule and the files.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit import ROOT, is_reference  # noqa: E402

COUNT = Counter()


def plural_hits(n: int) -> str:
    n100, n10 = n % 100, n % 10
    if 11 <= n100 <= 14:
        return 'хитов'
    if n10 == 1:
        return 'хит'
    if 2 <= n10 <= 4:
        return 'хита'
    return 'хитов'


def sub(rule, rx, rep, s, flags=0):
    new, n = re.subn(rx, rep, s, flags=flags)
    COUNT[rule] += n
    return new


PERCEPTION = {'е': 'ь', 'я': 'и', 'ю': 'и', 'ем': 'ью', 'и': 'и'}
ANALYSIS = {'е': '', 'я': 'а', 'ю': 'у', 'ем': 'ом', 'и': 'е'}
SKILL_AFTER = r'(?=\s*(?:\)|,|;|:|\s+или\b|\s*/|\s+(?:Сл|СЛ|DC)\b|\s+\d|\s*—|\s+на\b|\s+и\b|\s+либо\b|\.))'


# «DM» in Russian text is «ведущий», in the case the sentence needs (docs/CAMPAIGN_TEXT_STANDARD.md §1).
VERB = r'[а-яё]+(?:ет|ит|ют|ят|ёт|ут|ется|ится|ал|ил|ел|ял)'
DM_GENITIVE = (
    r'(решени[юяеи]м?|подтверждени[еяю]м?|удобства|заметки|памятка|подготовка|подготовкой|обменов|'
    r'руки|голосом|усмотрени[юе]|выбор[уа]?|команд[аыеу]|записи|разрешени[еяю]м?|согласи[яюе]|'
    r'внимани[ея]|реплик[иа]|вопрос[аы]?|вариант[ыа]?|текст[аы]?|сторон[ыа]|прав[оа]|книг[аеиу]|'
    r'экран[ау]?|помощник[аи]?|истин[аыеу]|объявлени[яюе]|услови[яюе]|действи[яюе]|слов[ауо]?)')
DM_INSTRUMENTAL = r'(согласован[аоы]?|подтвержден[аоы]?|подтверждённ\w+|одобренн\w+|утверждённ\w+|объявленн\w+|разрешаем\w+|описанн\w+|согласованн\w+|договорённ\w+|начат\w*)'


def fix_dm(s: str) -> str:
    if 'DM' not in s:
        return s
    s = re.sub(r'\bDM-истин([аеуыо]й?)\b', r'истин\1 ведущего', s)
    s = re.sub(r'\bDM-(\w+)', r'\1 ведущего', s)
    s = re.sub(r'\bс\s+DM\b', 'с ведущим', s)
    s = re.sub(DM_GENITIVE + r'\s+DM\b', r'\1 ведущего', s)
    s = re.sub(DM_INSTRUMENTAL + r'\s+DM\b', r'\1 ведущим', s)
    s = re.sub(r'\b(переданн\w+|передать|сообщить|сказать|отдать|показать|написать)\s+DM\b', r'\1 ведущему', s)
    s = re.sub(r'\b(один|отдельный|только|если|когда|пока|и|или)\s+DM\b', r'\1 ведущий', s)
    s = re.sub(r'(^|[.!?]\s+|«)DM\b', lambda m: m.group(1) + 'Ведущий', s)
    s = re.sub(r'\bDM\b(?=\s+(?:не\s+)?' + VERB + r'\b)', 'ведущий', s)
    s = re.sub(r'(' + VERB + r')\s+DM\b', r'\1 ведущий', s)
    s = re.sub(r'([;:,—]\s+|\b(?:а|но|затем|потом|тогда)\s+)DM\b', r'\1ведущий', s)
    n = len(re.findall(r'\bDM\b', s))
    if n:
        COUNT['dm-left'] += n
    return s


def fix(s: str, names: dict[str, str]) -> str:
    before = len(re.findall(r'\bDM\b', s))
    s = fix_dm(s)
    COUNT['dm-latin'] += before - len(re.findall(r'\bDM\b', s))
    s = sub('dc-latin', r'\bDC\s?(\d)', r'Сл \1', s)
    s = sub('dc-caps', r'\bСЛ\b', 'Сл', s)
    s = sub('ac-kb', r'\bКБ\b', 'КД', s)
    s = sub('save-hyphen', r'([Сс])пас-брос', r'\1пасброс', s)
    s = sub('dice-cyr', r'(?<![\w])(\d*)к(4|6|8|10|12|20|100)\b', r'\1d\2', s)
    s = sub('npc-latin', r'(?<![\w-])NPC(?![\w-])', 'НИП', s)
    s = sub('abbrev-evening', r'(?<![\w.])в\.\s?(?=\d)', 'вечер ', s)
    # Skills, in rule context only (brackets, a difficulty, a list of skills).
    s = sub('perception', r'\b([Вв])осприяти(ем|е|я|ю|и)\b' + SKILL_AFTER,
            lambda m: ('В' if m.group(1) == 'В' else 'в') + 'нимательност' + PERCEPTION[m.group(2)], s)
    s = sub('perception', r'(\(|·\s|\bили\s)([Вв])осприяти(е|я)\b',
            lambda m: m.group(1) + ('В' if m.group(2) == 'В' else 'в') + 'нимательност'
            + PERCEPTION[m.group(3)], s)
    s = sub('investigation', r'(\(|·\s|\bили\s|^|\.\s|;\s)([Рр])асследовани(ем|е|я|ю|и)\b' + SKILL_AFTER,
            lambda m: m.group(1) + ('А' if m.group(2) == 'Р' else 'а') + 'нализ' + ANALYSIS[m.group(3)], s)
    s = sub('investigation', r'\bРасследовани(ем|е|я|ю|и)\b(?=\s+(?:Сл|DC)\b)',
            lambda m: 'Анализ' + ANALYSIS[m.group(1)], s)
    s = sub('animal', r'[Оо]бращени(е|я|ю|ем) с животными',
            lambda m: {'е': 'Уход', 'я': 'Ухода', 'ю': 'Уходу', 'ем': 'Уходом'}[m.group(1)] + ' за животными', s)
    s = sub('stamina', r'\bВыносливост(ь|и)\b(?=\s*(?:\)|\(|Сл\b|,))',
            lambda m: 'Телосложени' + ('е' if m.group(1) == 'ь' else 'я'), s)
    # Hit points.
    s = sub('hp-latin', r'(\d+)\s*HP\b', lambda m: f'{m.group(1)} {plural_hits(int(m.group(1)))}', s)
    s = sub('hp-health', r'(\d+) здоровья\b', lambda m: f'{m.group(1)} {plural_hits(int(m.group(1)))}', s)
    s = sub('hp-list', r'(?<=\d/)(\d+) хита?\b', r'\1 хитов', s)
    s = sub('ac-defence', r'\b([Зз])ащита(\s+у\s+всех)?\s+(\d+)\b', lambda m: f'КД{m.group(2) or ""} {m.group(3)}', s)
    s = sub('ac-latin', r'(?<![\w-])AC\s?(?=\d)', 'КД ', s)
    s = sub('hp-latin', r'\b(половин\w*|ниже|меньше|больше|нет|без)\s+HP\b', r'\1 хитов', s)
    s = sub('hp-latin', r'\b(?:0|нул[ьея]\w*)\s+HP\b', '0 хитов', s)
    s = sub('hp-latin', r'(?<![\w-])HP(?![\w-])', 'хиты', s)
    # Internal keys in prose: say the name the DM will say at the table.
    for key, title in names.items():
        if key not in s:
            continue
        pat = re.compile(r'(?<![\w-])' + re.escape(key) + r'(?![\w-])')

        def rep(m: re.Match) -> str:
            before = s[max(0, m.start() - 90):m.start()]
            COUNT['raw-key'] += 1
            return title if title.strip('«»') not in before else ''
        s = pat.sub(rep, s)
    # Leftovers of removed keys: «Title» () / ( ) / (, X).
    s = re.sub(r'\s*\(\s*\)', '', s)
    s = re.sub(r'\(\s*,\s*', '(', s)
    s = re.sub(r',\s*\)', ')', s)
    s = re.sub(r'\(\s*(улика|раздатка|встреча|место)\s*\)', '', s)
    s = re.sub(r'`(«[^»`]+»)`', r'\1', s)
    s = re.sub(r'»\s*\(«[^»()]+»\)', '»', s)
    return s


def entity_names(data: dict[Path, object]) -> dict[str, str]:
    names: dict[str, str] = {}

    def add(o, label):
        k = o.get('key') if isinstance(o, dict) else None
        if not isinstance(k, str) or '-' not in k:
            return
        t = o.get('title') or o.get('name')
        if isinstance(t, str) and t.strip():
            names.setdefault(k, f'«{t}»' if label else t)

    for p, obj in data.items():
        stem = p.stem.split('-')[0]
        if stem == 'world' and isinstance(obj, dict):
            for loc in obj.get('locations', []):
                add(loc, False)
        elif stem == 'cast' and isinstance(obj, dict):
            for x in obj.get('heroes', []) + obj.get('npcs', []):
                add(x, False)
        elif isinstance(obj, list):
            for x in obj:
                add(x, stem in ('clues', 'handouts', 'encounters', 'items', 'sessions', 'act'))
    return names


def rewrite(obj, names, field=''):
    if isinstance(obj, str):
        return obj if is_reference(field, obj) else fix(obj, names)
    if isinstance(obj, list):
        return [rewrite(v, names, field) for v in obj]
    if isinstance(obj, dict):
        return {k: (v if is_reference(k) else rewrite(v, names, k))
                for k, v in obj.items()}
    return obj


def main():
    args = sys.argv[1:]
    dry = '--dry' in args
    args = [a for a in args if a != '--dry']
    changed = []
    for src in sorted((ROOT / 'campaigns').rglob('source')):
        camp = str(src.parent.relative_to(ROOT / 'campaigns'))
        if args and args[0] not in camp:
            continue
        files = sorted(src.glob('*.json'))
        data = {p: json.loads(p.read_text('utf-8')) for p in files}
        names = entity_names(data)
        for p, obj in data.items():
            new = rewrite(obj, names)
            if new != obj:
                changed.append(str(p.relative_to(ROOT)))
                if not dry:
                    p.write_text(json.dumps(new, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    for r, n in COUNT.most_common():
        print(f'{n:6d}  {r}')
    print(f'{len(changed)} files changed')
    for path in changed:
        print(path)


if __name__ == '__main__':
    main()
