"""Rebuild local, Russian-language GM reference and its public theme usage examples."""
from table_art import table_art
from portable import build_portable
from collections import Counter
from html import escape
from os.path import relpath
from sources import CAMPAIGNS, ROOT, THEMES, MATERIALS, OUT, authored, builtin, read

GROUPS = {"character": "Герои", "npc": "Персонажи ведущего", "item": "Предметы",
          "creature": "Существа", "location": "Места", "feature": "Детали мира"}
LABELS = {"fighter": "воин", "wizard": "волшебник", "rogue": "плут", "ranger": "следопыт",
          "bard": "бард", "cleric": "жрец", "druid": "друид", "paladin": "паладин",
          "sorcerer": "чародей", "warlock": "колдун", "monk": "монах", "barbarian": "варвар"}
SERIES = {"family": "Семейные приключения", "collection-2026": "Авторская коллекция",
          "fantasy-2026": "Фэнтези", "dark-fantasy-2026": "Тёмное фэнтези",
          "noir-2026": "Нуар", "mixed-ages-2026": "За разновозрастным столом", "builtin": "Встроенные приключения"}
TYPE = {"story": "Cormorant Garamond · Alegreya", "monument": "Cormorant Garamond · системный гротеск",
        "folio": "Alegreya · системный гротеск", "instrument": "Системный моноширинный · системный гротеск"}


def url(path):
    return escape(relpath(path, OUT), quote=True)


def link(path, label):
    assert path.is_file(), path
    return f'<a href="{url(path)}">{escape(label)}</a>'


def paragraph(value):
    return f"<p>{escape(value)}</p>" if isinstance(value, str) and value else ""


def page(title, body, theme=None):
    attrs = ""
    if theme:
        tile = url(MATERIALS / (theme["id"] + ".webp"))
        attrs = f' class="{theme["lettering"]}" style="--accent:{theme["accent"]};--tile:url({tile})"'
    return (f'<!doctype html>\n<html lang="ru"><meta charset="utf-8"><meta name="viewport" '
            f'content="width=device-width,initial-scale=1"><title>{escape(title)} · Материалы стола</title>'
            f'<link rel="stylesheet" href="reference.css"><body{attrs}><main>{body}</main></body></html>\n')


def facts(entity):
    sheet = entity.get("sheet") or entity.get("statBlock") or {}
    fields = [f'{LABELS.get(c["classId"], c["classId"])} {c["level"]}' for c in sheet.get("classes", [])]
    hp = sheet.get("hitPoints")
    hp = hp.get("max") if isinstance(hp, dict) else hp
    for text, val in [("ОЗ", hp), ("КД", sheet.get("armorClass"))]:
        if isinstance(val, (int, float)):
            fields.append(f"{text} {val}")
    if isinstance(sheet.get("speedFt"), (int, float)):
        fields.append(f'Скорость {sheet["speedFt"]} фт')
    return " · ".join(fields)


RULE_NAMES = {"longbow": "Длинный лук", "longsword": "Длинный меч", "handaxe": "Ручной топор",
              "light-crossbow": "Лёгкий арбалет", "shortbow": "Короткий лук", "rapier": "Рапира",
              "dagger": "Кинжал", "mace": "Булава", "warhammer": "Боевой молот", "quarterstaff": "Боевой посох",
              "healing-word": "Лечащее слово", "detect-magic": "Обнаружение магии", "misty-step": "Туманный шаг",
              "hunters-mark": "Метка охотника", "fireball": "Огненный шар", "counterspell": "Контрзаклинание"}


def rules_details(sheet):
    rows = []
    spells = [spell for group in sheet.get("spellcasting", []) for spell in group["spells"]]
    for label, group, keys in [("Оружие", "weapons", sheet.get("weapons", [])), ("Заклинания", "spells", spells)]:
        words = []
        for key in dict.fromkeys(keys):
            name = RULE_NAMES.get(key, key)
            image = ROOT / "apps/web/src/assets/ui-kit/catalog" / group / (key + ".webp")
            words.append(link(image, name) if image.is_file() else escape(name))
        if words:
            rows.append(f'<p><b>{label}</b> · ' + ", ".join(words) + "</p>")
    if not rows:
        return ""
    return "<details><summary>Оружие и заклинания</summary>" + "".join(rows) + "</details>"


def card(data, entity):
    key = entity["key"]
    note = data["notes"].get(key, {})
    name = entity["name"]
    pic = data["art"].get(note.get("art")) or data["art"].get(key)
    kind = entity["kind"]
    initials = "".join(w[0] for w in name.split()[:2] if w and w[0].isalpha())
    visual = (f'<img loading="lazy" src="{url(pic)}" alt="">' if pic else
              f'<span class="stamp" aria-hidden="true">{escape(initials)}</span>')
    if note.get("look"):
        lines = [note.get(k) for k in ("role", "look", "public", "hook", "voice")]
    else:
        lines = [note.get("description") or entity.get("description"), note.get("use"), note.get("limit")]
    summary = "".join(paragraph(v) for v in dict.fromkeys(lines))
    owners = [data["entities"][owner]["name"] for owner in sorted(data["holders"].get(key, set()))
              if owner in data["entities"]]
    if key in data["figures"]:
        summary += '<p>' + link(data["figures"][key], "Открыть фигурку для поля") + '</p>'
    summary += rules_details(entity.get("sheet", {}))
    meta = facts(entity)
    if owners:
        summary += paragraph("Владелец по комплекту: " + ", ".join(owners))
    return (f'<article class="entry {escape(kind)}">{visual}<div><h3>{escape(name)}</h3>'
            f'<small>{escape(meta)}</small>{summary}</div></article>')


def section(key, title, body, count):
    return (f'<section id="{key}"><h2>{escape(title)} <small>{count}</small></h2>{body}</section>'
            if count else "")


def reference_rows(rows):
    return '<ul class="rows">' + "".join(f'<li>{r}</li>' for r in rows) + '</ul>'


def build_detail(theme, data):
    slug, name = theme["id"], theme["names"][0]
    entities = list(data["entities"].values())
    kinds = list(dict.fromkeys([*GROUPS, *(e["kind"] for e in entities)]))
    sections = {}
    quantities = {}
    atlas = data['atlas']
    rows = [link(path, data['entities'].get(key, {}).get('name', key))
            for key, path in data['grounds'].items()]
    edition_links = ' · '.join(link(path, label) for label, path in data['editions'].items())
    assets = (f'<a href="{url(atlas)}"><img class="atlas" loading="lazy" src="{url(atlas)}" '
              f'alt="Карта кампании · {escape(name)}"></a><h3>Карты боя</h3>' + reference_rows(rows))
    if edition_links:
        assets += '<details><summary>Пакеты для импорта по составу группы</summary><p>' + edition_links + '</p></details>'
    sections['table-maps'] = ('Карты для стола', section('table-maps', 'Карты для стола', assets, len(rows) + 1))
    for kind in kinds:
        entries = [e for e in entities if e["kind"] == kind]
        if entries:
            title = GROUPS.get(kind, {"faction": "Фракции", "object": "Объекты"}.get(kind, kind))
            body = '<div class="cards">' + "\n".join(card(data, e) for e in entries) + '</div>'
            sections[kind] = (title, section(kind, title, body, len(entries)))
            quantities[kind] = len(entries)
    for key, title in [("clues", "Улики"), ("handouts", "Раздатки"), ("quests", "Задания"),
                       ("encounters", "Встречи"), ("sessions", "Игровые ситуации")]:
        rows = []
        for row in data[key]:
            name_value = row.get("title") or row.get("name") or row.get("statement") or row.get("clueId") or row.get("key")
            if not name_value:
                name_value = data["entities"].get(row.get("entityId"), {}).get("name", "Улика")
            body = escape(str(name_value))
            if key == "handouts":
                filename = row["key"] + ".html"
                target = data["handout_dir"] / filename
                if target.is_file():
                    body = link(target, name_value)
                body += paragraph(row.get("task") or row.get("text"))
            elif key == "clues":
                body += paragraph(row.get("appearance") or row.get("fallback"))
            elif key == "encounters":
                body += paragraph(row.get("trigger") or row.get("summary"))
            elif key == "quests":
                body += paragraph(row.get("activation", {}).get("summary"))
            rows.append(body)
        if rows:
            sections[key] = (title, section(key, title, reference_rows(rows), len(rows)))
            quantities[key] = len(rows)
    dice = '<div class="dice-examples">' + "".join(
        f'<div><div class="face {key}"><b>20</b></div><span>{label}</span></div>'
        for key, label in [("dark", "Обсидиан игрока"), ("light", "Слоновая кость ведущего")]) + '</div>'
    lead = (f'<a href="index.html">← Все кампании</a><header><p class="kicker">Справочник ведущего · содержит тайны</p>'
            f'<h1>{escape(name)}</h1><div class="links">{"".join(link(f, l) for l, f in data["links"].items())}</div></header>'
            f'<section class="specimen"><div><h2>Оформление стола</h2><p>{TYPE[theme["lettering"]]}</p>'
            f'<p class="sample">Чаща, ёж и маяк · 1 2 3 4 5 6 7 8 9 0</p>'
            f'{link(MATERIALS / (slug + ".webp"), "Открыть орнамент")}</div>{dice}</section>')
    menu = ''.join(f'<a href="#{k}">{escape(v[0])}</a>' for k, v in sections.items())
    body = lead + f'<nav aria-label="Разделы кампании">{menu}</nav>' + "\n".join(s[1] for s in sections.values())
    (OUT / (slug + ".html")).write_text(page(name, body, theme))
    return quantities


def main():
    themes = read(THEMES / "catalog.json")
    packs = {f.parent.parent.name: f.parent.parent for f in CAMPAIGNS.glob("**/source/world.json")}
    assert set(packs) | {"ravenford", "hollowmere"} == {t["id"] for t in themes}
    group_cards = {k: [] for k in SERIES}
    totals = Counter()
    for theme in themes:
        slug = theme["id"]
        pack = packs.get(slug)
        group = (pack.parent.name if pack.parent != CAMPAIGNS else "family") if pack else "builtin"
        data = authored(pack) if pack else builtin(slug)
        data.update(table_art(slug))
        if pack:
            build_portable(pack, theme, data)
        for key, image in data["references"].items():
            data["art"].setdefault(key, image)
        amounts = build_detail(theme, data)
        totals.update(amounts)
        totals["variants"] += data["variants"]
        tile = url(MATERIALS / (slug + ".webp"))
        group_cards[group].append(f'<a class="cover" href="{slug}.html" style="--accent:{theme["accent"]};'
                                  f'--tile:url({tile})"><span aria-hidden="true"></span><strong>'
                                  f'{escape(theme["names"][0])}</strong></a>')
    menu = "".join(f'<a href="#{k}">{v}</a>' for k, v in SERIES.items())
    lead = ('<header><p class="kicker">Настольная библиотека · для ведущего</p><h1>Материалы кампаний</h1>'
            '<p>Выберите стол, чтобы открыть его оформление, карточки и материалы к игре. Страницы содержат тайны.</p>'
            f'</header><nav aria-label="Серии">{menu}</nav>')
    body = lead + "\n".join(section(k, SERIES[k], '<div class="shelf">' + ''.join(cards) + '</div>', len(cards))
                           for k, cards in group_cards.items())
    (OUT / "index.html").write_text(page("Материалы кампаний", body))
    print(len(themes), dict(totals))


if __name__ == "__main__":
    main()
