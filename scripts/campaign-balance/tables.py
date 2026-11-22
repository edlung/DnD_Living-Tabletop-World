"""A reader's index of the encounters behind editions.jsonl."""
from collections import Counter, defaultdict
from pathlib import Path
import os
import re
from urllib.parse import quote

LABELS = {"win": "цель", "partial": "часть", "missed": "упущена", "defeat": "отряд пал",
          "top": "вышли все или почти все", "mid": "средний исход", "bad": "тяжёлый исход",
          "corr": "коридор", "half": "половина каравана", "closed": "пролив закрыт"}


def excerpt(text, size=108):
    text = " ".join(text.split()).replace("|", " / ")
    first = re.split(r"(?<=[.!?])\s+(?=[А-ЯЁA-Z])", text, maxsplit=1)[0]
    if len(first) <= size:
        return first
    return first[:size - 1].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def counts(rows, mode):
    result = Counter()
    for r in rows:
        result.update(r[mode]["results"])
    return result


def party_range(group):
    slug = group[0]["campaign"]
    metric, label = "win", ""
    if group[0]["objective"].get("model") == "finale":
        metric, label = {
            "ember-crown": ("Венец стоит", "ворота устояли"),
            "ash-testament": ("Донесли", "доставлен ящик"),
            "glass-republic": ("Взят ключ", "получен ключ"),
            "hollow-choir": ("top", "вышли почти все"),
            "rain-check": ("Живым", "исход «Живым»"),
            "salt-meridian": ("corr", "открыт коридор"),
        }[slug]
    hits = [sum(n for k, n in r["objective"]["results"].items() if k.startswith(metric)) for r in group]
    bounds = str(min(hits)) if min(hits) == max(hits) else f"{min(hits)}–{max(hits)}"
    return f"{label + ' ' if label else ''}{bounds} из {group[0]['objective']['trials']}"


def write_tables(rows, folder):
    by_book = defaultdict(lambda: defaultdict(list))
    for r in rows:
        by_book[r["book"]][r["key"]].append(r)
    lines = [
        "# Боевые встречи по кампаниям", "",
        "У каждой встречи указаны цель из книги, число прогонов и их исходы. В обычном бою «цель» "
        "означает, что отряд одолел противников. В спарринге это завершённый учебный обмен, "
        "при эвакуации — выполненное условие спасения. «По составам» показывает минимум и максимум полных успехов "
        "за одну серию для разных составов. В шести особых финалах рядом указано наблюдаемое событие. "
        "«Часть» означает, что выполнена лишь часть задачи. "
        "«Упущена» и «отряд пал» различают истечение срока и потерю боеспособности, когда это различает сценарий.", "",
        "Последняя колонка показывает, в скольких контрольных боях до потери боеспособности сторон "
        "хотя бы один герой опустился до нуля хитов. В этом отдельном опыте по шесть боёв на состав. "
        "В «Стеклянной республике» получение ключа, захват депутата и потеря боеспособности героев "
        "подсчитаны отдельно и могут совпасть в одном прогоне.", "",
        "[Результаты каждого состава и счётчики бросков](editions.jsonl)", "",
    ]
    for title, encounters in sorted(by_book.items()):
        first = next(iter(encounters.values()))[0]
        party = sorted({r["players"] for group in encounters.values() for r in group})
        link = quote(os.path.relpath(Path(first["source"]).resolve(), folder.resolve()), safe="/.-_")
        lines.extend(["## " + title, "", "Игроков " + ", ".join(map(str, party)) +
                      f". [Материал встречи]({link})", "",
                      "| Встреча | Цель по книге | Прогонов | Исходы | По составам | Падение героя в контрольном бою |",
                      "| --- | --- | ---: | --- | --- | ---: |"])
        for group in encounters.values():
            f = group[0]
            outcomes = counts(group, "objective")
            result = " · ".join(f"{LABELS.get(k, k)} {n}" for k, n in outcomes.most_common())
            n = sum(r["objective"]["trials"] for r in group)
            zero = sum(r["pressure"]["zero"] for r in group)
            trials = sum(r["pressure"]["trials"] for r in group)
            intent = excerpt(f["intent"])
            lines.append(f"| {f['title']} | {intent} | {n} | {result} | {party_range(group)} | {zero}/{trials} |")
        lines.append("")
    (folder / "encounters.md").write_text("\n".join(lines))
