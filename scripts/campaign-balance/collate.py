"""Join actual roll batches to the shipped catalog. An omitted edition or unresolved scene fails."""
import json
from pathlib import Path
from collections import Counter

from finales import FINALES

SHELF = Path("fixtures/campaign-library")
NATIVE = {"ravenford": "Равенфорд", "hollowmere": "Колокола Холлоумира"}


def read(path):
    return json.loads(path.read_text())


def catalog():
    for library in sorted(SHELF.glob("*/library.json")):
        data = read(library)
        slug = library.parent.name
        source = next(Path("campaigns").glob(f"**/{slug}/source/encounters.json"), None)
        goals = {c["key"]: c["objective"] for c in read(source)} if source else {}
        for variant in data["variants"]:
            pkg = read(library.parent / variant["file"])
            for encounter in pkg["encounters"]:
                key, cue = encounter["key"], encounter["trigger"]
                yield dict(campaign=slug, book=data["title"], key=key, title=encounter["title"],
                           edition=variant["id"], players=variant["players"], digest=variant["digest"],
                           intent=goals.get(key, cue.partition("Цель: ")[2] or cue),
                           source=str(source or (library.parent / variant["file"])))
    for slug, name in NATIVE.items():
        path = Path("fixtures") / (slug + "-ru") / "encounters.json"
        for encounter in read(path)["encounters"]:
            for edition in ["4-full", *(f"3-without-{i}" for i in range(1, 5))]:
                yield dict(campaign=slug, book=name, key=encounter["encounterId"],
                           title=encounter["title"], edition=edition, players=int(edition[0]),
                           digest=None, intent=encounter["summary"], source=str(path))


def index(folder, slug, rows):
    found = {}
    for row in rows:
        key = (row["key"], row["edition"])
        if key in found:
            raise ValueError(f"{folder}/{slug}: duplicate {key}")
        found[key] = row
    return found


def batch(folder, slug, counts, start=0):
    data = read(folder / (slug + ".json"))
    if data["slug"] != slug or data["start"] != start or data["count"] != counts:
        raise ValueError(f"{folder}/{slug}: inconsistent series")
    for row in data["rows"]:
        if row["trials"] != counts or sum(row["results"].values()) != counts:
            raise ValueError(f"{folder}/{slug}: incomplete {row['key']}")
        if row["results"].get("limit") or not row["dice"].get("20"):
            raise ValueError(f"{folder}/{slug}: missing dice or unresolved {row['key']}")
    return index(folder, slug, data["rows"])


def collect(root, output, campaign_names=None):
    books = {}
    for item in catalog():
        if campaign_names is None or item["campaign"] in campaign_names:
            books.setdefault(item["campaign"], []).append(item)
    all_rows = []
    for slug, items in sorted(books.items()):
        base = batch(root / "final", slug, 32)
        pressure = batch(root / "pressure", slug, 6)
        if slug in FINALES:
            special = read(root / "special" / (slug + ".json"))
            assert special["key"] == FINALES[slug]
            for row in special["rows"]:
                key = (special["key"], row["edition"])
                assert key not in base and row["trials"] == 96
                if slug == "glass-republic":
                    assert all(0 <= v <= row["trials"] for v in row["outcomes"].values())
                else:
                    assert sum(row["outcomes"].values()) == row["trials"]
                base[key] = dict(trials=row["trials"], results=row["outcomes"], model="finale")
        expected = {(i["key"], i["edition"]) for i in items}
        assert len(expected) == len(items) and expected == base.keys() == pressure.keys(), slug
        for item in items:
            key = (item["key"], item["edition"])
            b, p = base[key], pressure[key]
            assert len(p["party"]) == item["players"]
            if "party" in b:
                assert b["party"] == p["party"] and b["foes"] == p["foes"]
            fields = {"title", "key", "edition", "party", "foes"}
            all_rows.append(dict(
                **item, party=p["party"], foes=p["foes"],
                objective={k: v for k, v in b.items() if k not in fields},
                pressure={k: v for k, v in p.items() if k not in fields},
            ))
    output.mkdir(parents=True, exist_ok=True)
    with (output / "editions.jsonl").open("w") as out:
        for row in all_rows:
            saved = {k: v for k, v in row.items() if k not in {"source", "intent", "book"}}
            print(json.dumps(saved, ensure_ascii=False, separators=(",", ":")), file=out)
    modes = Counter()
    for row in all_rows:
        modes[row["objective"].get("model", "engine")] += row["objective"]["trials"]
        modes["pressure"] += row["pressure"]["trials"]
    print(f"{len(books)} campaigns, {len({(r['campaign'], r['key']) for r in all_rows})} "
          f"encounters, {len(all_rows)} parties/encounters: {dict(modes)}")
    return all_rows
