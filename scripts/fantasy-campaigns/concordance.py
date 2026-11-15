"""Compare final source prose with all native packages and local books, without a browser."""

import hashlib
import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "campaigns/fantasy-2026"
EVIDENCE = ROOT / "reports/evidence/fantasy-ten-2026-11-08"


class HtmlText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def normalize(value):
    return re.sub(r"\s+", " ", value).strip()


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)


def html_text(path):
    parser = HtmlText()
    parser.feed(path.read_text())
    return normalize(" ".join(parser.parts))


def verify(path, haystack, fields):
    missing = [key for key, value in fields if normalize(value) not in haystack]
    return {
        "file": str(path.relative_to(ROOT)),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "expectedFields": len(fields),
        "matchedFields": len(fields) - len(missing),
        "missingFields": missing,
    }


def add(fields, label, obj, keys):
    for key in keys:
        fields.extend((f"{label}.{key}[{i}]", value) for i, value in enumerate(strings(obj[key])))


rows = []
failures = []
for directory in sorted(p for p in BASE.iterdir() if (p / "source/world.json").is_file()):
    source = {p.stem: json.loads(p.read_text()) for p in (directory / "source").glob("*.json")}
    world, cast = source["world"], source["cast"]
    sessions = [s for i in range(1, 5) for s in source[f"sessions-{i}"]]
    core, books = [], []
    for session in sessions:
        fields = []
        add(fields, f"session{session['number']}", session,
            ["goal", "readAloud", "dmNote", "spotlight", "consequences", "ending"])
        for i, scene in enumerate(session["scenes"]):
            add(fields, f"session{session['number']}.scene{i + 1}", scene,
                ["title", "play", "choices", "check", "failForward"])
        core.extend(fields)
        path = directory / f"session-{session['number']}.html"
        books.append(verify(path, html_text(path), fields))
    dm = []
    add(dm, "world", world,
        ["pitch", "setting", "tone", "opening", "truth", "themes", "boundaries", "tableGuidance", "endings"])
    for npc in cast["npcs"]:
        add(dm, npc["key"], npc, ["name", "look", "public", "want", "secret", "knows", "boundary", "reveal"])
    for location in world["locations"]:
        add(dm, location["key"], location, ["name", "description"])
    for handout in source["handouts"]:
        add(dm, handout["key"], handout, ["title", "unlock"])
        path = directory / "handouts" / f"{handout['key']}.html"
        books.append(verify(path, html_text(path), [(handout["key"] + ".text", handout["text"])]))
    path = directory / "index.html"
    books.append(verify(path, html_text(path), dm))
    core.extend(dm)
    for handout in source["handouts"]:
        add(core, handout["key"], handout, ["text"])
    for clue in source["clues"]:
        add(core, clue["key"], clue, ["appearance", "statement", "discovery", "fallback"])
    maps = []
    for encounter in source["encounters"]:
        add(maps, encounter["key"], encounter,
            ["title", "trigger", "objective", "foeDescription", "tactics", "peaceful", "scaling", "terrain"])
    path = directory / "maps.html"
    books.append(verify(path, html_text(path), maps))
    core.extend(maps)
    player = []
    add(player, "world", world, ["pitch", "setting", "opening", "tableGuidance", "themes", "boundaries"])
    for hero in cast["heroes"]:
        add(player, hero["key"], hero, ["name", "role", "look", "hook", "bond", "personalQuestion", "spotlight"])
    path = directory / "players.html"
    books.append(verify(path, html_text(path), player))
    packages = []
    for path in [directory / "package.json", *sorted((directory / "variants").glob("*.json"))]:
        packages.append(verify(path, normalize(" ".join(strings(json.loads(path.read_text())))), core))
    rows.append({"slug": directory.name, "packages": packages, "books": books})
    failures.extend(result for result in packages + books if result["missingFields"])

data = {
    "capturedAt": datetime.now(timezone.utc).isoformat(),
    "method": "Raw final source strings, whitespace normalized, checked in recursive package text and parsed HTML text. Structural IDs remain unchanged. Optional hero profiles are checked in the player book; smaller packages intentionally omit extra seats. This checks content retention, not story quality or authorization.",
    "packageFiles": sum(len(row["packages"]) for row in rows),
    "bookFiles": sum(len(row["books"]) for row in rows),
    "failures": failures,
    "campaigns": rows,
}
EVIDENCE.mkdir(parents=True, exist_ok=True)
(EVIDENCE / "concordance.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({key: data[key] for key in ["packageFiles", "bookFiles", "failures"]}, ensure_ascii=False))
if failures:
    raise SystemExit(1)
