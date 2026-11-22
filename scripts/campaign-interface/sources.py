"""Read campaign packages and Russian fixture seeds without mutating the game state."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]
CAMPAIGNS = ROOT / "campaigns"
THEMES = ROOT / "apps/web/src/visual/campaign-themes"
MATERIALS = ROOT / "apps/web/public/table-materials"
OUT = CAMPAIGNS / "interface"


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def optional(path, default):
    return read(path) if path.is_file() else default


def pictures(folder):
    """Match only an explicit reference to the entity. A group scene is not a portrait."""
    result = {}
    for entry in optional(folder / "manifest.json", {}).get("assets", []):
        if entry.get("variant", "reference") != "reference":
            continue
        file = folder / (entry.get("runtimeFile") or entry["file"])
        assert file.is_file(), file
        if entry.get("id"):
            result[entry["id"]] = file
        subjects = entry.get("entityIds", entry.get("subjects", []))
        if len(subjects) == 1 or entry.get("kind") == "token" or "entityIds" in entry:
            for key in subjects:
                result.setdefault(key, file)
    return result


def authored(pack):
    src = pack / "source"
    base = read(pack / "package.json")
    variants = [read(f) for f in sorted((pack / "variants").glob("*.json"))]
    entities = {}
    holders = {}
    catalog = {}
    for edition in [base, *variants]:
        known = {e["key"] for e in edition["entities"]}
        assert set(edition["party"]) <= known, pack
        assert all(p["holder"] in known and p["item"] in known for p in edition["possessions"]), pack
        for e in edition["entities"]:
            entities.setdefault(e["key"], e)
        for p in edition["possessions"]:
            holders.setdefault(p["item"], set()).add(p["holder"])
            if p.get("catalog"):
                catalog[p["item"]] = p["catalog"]
    cast = read(src / "cast.json")
    items = optional(src / "items.json", [])
    notes = {v["key"]: v for v in [*cast["heroes"], *cast["npcs"], *items]}
    for item in items:
        if item["key"] not in entities:
            entities[item["key"]] = {**item, "kind": "item"}
    handouts = read(src / "handouts.json")
    links = {"Книга ведущего": pack / ("guide.html" if (pack / "guide.html").is_file() else "index.html"),
             "Материалы игроков": pack / "players.html", "Карты": pack / "maps.html"}
    for label, filename in [("Жетоны", "tokens.html"), ("Раздатки", "handouts.html")]:
        if (pack / filename).is_file():
            links[label] = pack / filename
    art = pictures(pack / "assets")
    # Some named beings have an illustration of their whole living home.
    if pack.name in {"lighthouse", "acorn-express"}:
        for entry in read(pack / "assets/manifest.json")["assets"]:
            for key in entry.get("subjects", []):
                if key in {"omb", "berest"}:
                    art.setdefault(key, pack / "assets" / entry["runtimeFile"])
    portraits = pack / "illustrations" / "cast.json"
    for image in optional(portraits, {}).get("cards", []):
        for key in image["subjects"]:
            art[key] = portraits.parent / image["file"]
    catalog_dir = ROOT / "apps/web/src/assets/ui-kit/catalog/items"
    for key, catalog_id in catalog.items():
        file = catalog_dir / (catalog_id + ".webp")
        if file.is_file():
            art.setdefault(key, file)
    return dict(entities=entities, holders=holders, notes=notes, art=art, handouts=handouts,
                clues=read(src / "clues.json"), quests=base["quests"], encounters=base["encounters"],
                sessions=base["situations"], links=links, handout_dir=pack / "handouts",
                variants=len(variants), cover=art.get("cover") or pack / "illustrations/opening.webp")


def builtin(slug):
    folder = ROOT / "fixtures" / (slug + "-ru")
    commands = [c for f in sorted(folder.glob("*-seed.json")) for c in read(f)["commands"]]
    entities = {c["entityId"]: {**c, "key": c["entityId"]} for c in commands if c["type"] == "CreateEntity"}
    holders = {}
    clues = []
    hero_index = 0
    for c in commands:
        if c["type"] in {"SetCharacterSheet", "SetStatBlock"}:
            entities[c["entityId"]].update({k: c[k] for k in ("sheet", "statBlock") if k in c})
        if c["type"] == "GrantItem":
            item, holder = c.get("itemId"), c.get("holderId")
            if item and holder:
                holders.setdefault(item, set()).add(holder)
        if c["type"] == "CreateCharacter":
            hero_index += 1
            key = f"seed-party-{hero_index:04}"
            entities[key] = dict(kind="character", key=key, name=c["name"], description="",
                                 sheet={"classes": [{"classId": c["choices"]["classId"], "level": 1}]})
        if c["type"] == "AddClue":
            clues.append(c)
    art = pictures((ROOT / "fixtures/hollowmere/assets") if slug == "hollowmere" else folder / "assets")
    for c in commands:
        if c["type"] == "GrantItem":
            path = ROOT / "apps/web/src/assets/ui-kit/catalog/items" / ((c.get("catalogId") or "") + ".webp")
            if c.get("catalogId") == "srd-silver-piece":
                path = ROOT / "apps/web/src/assets/ui-kit/catalog/kinds/kind-coins.webp"
            if path.is_file():
                art.setdefault(c["itemId"], path)
    return dict(entities=entities, holders=holders, notes={}, art=art, handouts=[], clues=clues,
                quests=read(folder / "quests.json")["quests"], encounters=read(folder / "encounters.json")["encounters"],
                sessions=[], links={"Памятка ведущего": ROOT / "docs/BUILTIN_ADVENTURES_DM_RU.md"},
                handout_dir=folder, variants=0, cover=art.get("fenlands") or art.get("ravenford"))
