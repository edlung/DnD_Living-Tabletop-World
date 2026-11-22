"""The GM can copy a series to another computer and open its maps and figures offline."""
from html import escape
from os.path import relpath
from urllib.parse import quote


def build_portable(pack, theme, data):
    folder = pack / "assets/table-editions"
    folder.mkdir(parents=True, exist_ok=True)

    def target(path):
        assert path.is_file() and path.is_relative_to(pack), path
        return quote(relpath(path, folder))

    def card(label, path):
        href = target(path)
        return (f'<a class="card" href="{href}"><img src="{href}" loading="lazy" alt="">'
                f'<span>{escape(label)}</span></a>')

    def section(label, cards):
        return (f'<section><h2>{label}</h2><div class="grid">{"".join(cards)}</div></section>'
                if cards else '')

    def name(key):
        return data["entities"].get(key, {}).get("name", key)

    book = data["links"]["Книга ведущего"]
    editions = ' · '.join(f'<a href="{target(folder / path.name)}" download>{escape(label)}</a>'
                          for label, path in data["editions"].items())
    groups = {"Герои": [], "Персонажи ведущего": [], "Противники": []}
    for key, path in data["figures"].items():
        kind = data["entities"].get(key, {}).get("kind")
        group = {"character": "Герои", "npc": "Персонажи ведущего"}.get(kind, "Противники")
        groups[group].append(card(name(key), path))
    sections = [section(title, pieces) for title, pieces in groups.items()]
    title = escape(theme["names"][0])
    atlas = target(data["atlas"])
    grounds = section("Поля боя", [card(name(k), p) for k, p in data["grounds"].items()])
    html = (f'<!doctype html><html lang="ru"><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} · Карты и фигурки</title>'
            '<style>*{box-sizing:border-box}body{background:#171b20;color:#ebe5d6;font:17px/1.5 system-ui;'
            'max-width:74rem;margin:auto;padding:clamp(1rem,4vw,3rem)}a{color:inherit}h1,h2{line-height:1.2}'
            '.atlas{width:100%;max-height:65vh;object-fit:contain}.grid{display:grid;gap:1rem;'
            'grid-template-columns:repeat(auto-fill,minmax(min(100%,10rem),1fr))}.card{display:grid;'
            'grid-template-rows:10rem auto;gap:.4rem;padding:.55rem;background:#30373c;'
            'border-radius:.4rem}.card img{width:100%;height:100%;object-fit:contain}section{margin-block:2rem}'
            'h1{border-bottom:3px solid var(--accent);padding-bottom:.4em}a:focus-visible{outline:3px solid var(--accent)}'
            f'</style><body style="--accent:{escape(theme["accent"])}"><main>'
            f'<a href="{target(book)}">← Книга ведущего</a><h1>{title}</h1><p>Карты и фигурки ведущего</p>'
            f'<h2>Игровой комплект</h2><p>{editions}</p><h2>Карта кампании</h2>'
            f'<a href="{atlas}"><img class="atlas" src="{atlas}" alt="Карта кампании"></a>'
            + grounds + ''.join(sections) + '</main></body></html>\n')
    (folder / "gallery.html").write_text(html, encoding="utf-8")
