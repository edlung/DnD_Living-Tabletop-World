"""Check the books, game material and offline DM reference without a database or an API."""
from base64 import b64encode
from collections import Counter
from hashlib import sha256
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from sources import CAMPAIGNS, MATERIALS, OUT, ROOT, THEMES, authored, builtin, read


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key == "id":
                self.ids.add(value)
            if (tag, key) in {("a", "href"), ("img", "src"), ("link", "href")}:
                self.urls.append(value)


def check_links(file, counts, check_anchors=False):
    parser = References()
    parser.feed(file.read_text())
    for url in parser.urls:
        if url.startswith("data:"):
            continue
        target = urlsplit(url)
        if target.scheme:
            continue
        if target.path:
            assert (file.parent / unquote(target.path)).is_file(), (file, url)
            counts["local_links"] += 1
        elif target.fragment and check_anchors:
            assert target.fragment in parser.ids, (file, url)
    counts["html_pages"] += 1


def same_hash(file, digest):
    assert sha256(file.read_bytes()).hexdigest() == digest, file


def check_book(source, theme, counts):
    pack = source.parent
    shelf = ROOT / "fixtures/campaign-library" / pack.name
    offline = pack / "assets/table-editions"
    for variant in read(shelf / "library.json")["variants"]:
        edition = shelf / variant["file"]
        assert (offline / edition.name).read_bytes() == edition.read_bytes(), (pack, edition)
    portable = References()
    portable.feed((offline / "gallery.html").read_text())
    for path in portable.urls:
        assert (offline / unquote(path)).resolve().is_relative_to(pack), (pack, path)
    title = read(pack / "package.json")["world"]["name"]
    assert title in theme["names"], pack
    dm = unescape((pack / ("guide.html" if (pack / "guide.html").is_file() else "index.html")).read_text())
    public = unescape((pack / "players.html").read_text())
    world, cast = read(source / "world.json"), read(source / "cast.json")
    secrets = world["truth"] + [c["secret"] for c in cast["npcs"]]
    assert all(s not in public for s in secrets if len(s) > 18), pack
    notes = read(source / "table-guide.json")
    assert notes and "data-dm-branches" not in public, pack
    chapters = [s for file in sorted([*source.glob("act-*.json"), *source.glob("sessions-*.json")]) for s in read(file)]
    assert {s["number"] for s in chapters} == set(range(1, len(chapters) + 1)), pack
    clues = {c["key"] for c in read(source / "clues.json")}
    counts.update(campaign_books=1, sessions=len(chapters), detours=len(notes))
    for note in notes:
        assert note["text"] in dm and note["text"] not in public, pack
        assert 1 <= note["session"] <= len(chapters), pack
    for s in chapters:
        number = s["number"]
        file = pack / (f"sessions/{number:02}.html" if (pack / "guide.html").exists() else f"session-{number}.html")
        content = " ".join(unescape(file.read_text()).split())
        assert all(s[k] for k in ("goal", "location", "readAloud", "dmNote", "consequences", "spotlight")), file
        assert len(s["consequences"]) >= 2 and set(s["clues"]) <= clues, file
        for note in notes:
            assert (note["text"] in content) == (note["session"] == number), file
        for scene in s["scenes"]:
            assert len(set(scene["choices"])) >= 2 and scene["check"] and scene["failForward"], file
            for value in [scene["title"], scene["play"], scene["failForward"], *scene["choices"]]:
                assert " ".join(value.split()) in content, file
            if scene.get("readAloud"):
                assert " ".join(scene["readAloud"].split()) in content, file
                assert scene["readAloud"] not in public, file
                counts["scene_read_alouds"] += 1
            counts["scenes"] += 1
    pocket_file = source / "pocket.json"
    if pocket_file.is_file():  # the DM's pocket: in the DM's book, never on the players' page
        pocket = read(pocket_file)
        dm_text = " ".join(dm.split())
        for rumour in pocket["rumours"]:
            assert " ".join(rumour["note"].split()) in dm_text and rumour["note"] not in public, pack
        for person in pocket["people"]:
            assert " ".join(person["knows"].split()) in dm_text, pack
        counts["pockets"] += 1
    manifest = pack / "illustrations/manifest.json"
    if manifest.is_file():
        picture = read(manifest)
        same_hash(manifest.parent / picture["file"], picture["sha256"])
        assert "illustrations/opening.webp" in dm, pack
        counts["opening_images"] += 1
    cards_file = pack / "illustrations/cast.json"
    if cards_file.is_file():
        cards = read(cards_file)["cards"]
        heroes = {v["key"] for v in cast["heroes"]}
        npcs = {v["key"] for v in cast["npcs"]}
        if manifest.is_file():
            assert heroes | npcs <= {k for c in cards for k in c["subjects"]}, pack
        gallery = (OUT / (pack.name + ".html")).read_text()
        for card in cards:
            file = manifest.parent / card["file"]
            same_hash(file, card["sha256"])
            encoded = b64encode(file.read_bytes()).decode()
            in_public = encoded in public or ("illustrations/" + card["file"]) in public
            assert in_public == bool(heroes.intersection(card["subjects"])), file
            if npcs.intersection(card["subjects"]):
                assert "illustrations/" + card["file"] in dm, file
            assert card["file"] in gallery, file
            counts["card_images"] += 1
    for f in pack.rglob("*.html"):
        check_links(f, counts)


def main():
    counts = Counter()
    catalogue = read(THEMES / "catalog.json")
    themes = {t["id"]: t for t in catalogue}
    assert len(themes) == len(catalogue) and len({n for t in catalogue for n in t["names"]}) == sum(len(t["names"]) for t in catalogue)
    evidence = ROOT / "reports/evidence/campaign-editorial-2026-11-22"
    materials = read(evidence / "material-provenance.json")
    assert set(themes) == {e["id"] for e in materials} == {f.stem for f in MATERIALS.glob("*.webp")}
    assert len({e["sha256"] for e in materials}) == len(themes)
    css = (THEMES / "materials.css").read_text()
    for e in materials:
        same_hash(MATERIALS / e["file"], e["sha256"])
        assert f"/table-materials/{e['file']}" in css
        check_links(OUT / (e["id"] + ".html"), counts, True)
    check_links(OUT / "index.html", counts, True)
    packs = [f.parent for f in CAMPAIGNS.glob("**/source/world.json")]
    for src in packs:
        check_book(src, themes[src.parent.name], counts)
    sets = [authored(src.parent) for src in packs] + [builtin(key) for key in ("ravenford", "hollowmere")]
    for data in sets:
        for key, entity in data["entities"].items():
            if entity["kind"] in {"character", "npc", "item"}:
                assert key in data["art"] and data["art"][key].is_file(), (key, entity["name"])
                counts[entity["kind"] + "_cards"] += 1
    print(dict(counts), "themes", len(themes))


if __name__ == "__main__":
    main()
