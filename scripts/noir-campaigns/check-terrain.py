"""Compare saved SVG cells, authored terrain labels and all native party variants."""

import json
import re
import sys
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[2]
COLLECTION = ROOT / "campaigns/noir-2026"
EVIDENCE = ROOT / "reports/evidence/noir-ten-2026-11-08/terrain-parity.json"
NS = {"svg": "http://www.w3.org/2000/svg"}


def labels(text):
    return set(re.findall(r"\b[A-N](?:1[0-2]|[1-9])\b", text))


def native_labels(cells):
    return {f"{chr(65 + cell['x'])}{cell['y'] + 1}" for cell in cells}


rows = []
errors = []
for source_path in sorted(COLLECTION.glob("*/source/encounters.json")):
    campaign = source_path.parent.parent
    variants = {
        size: json.loads((campaign / f"variants/{size}-players.json").read_text())
        for size in range(3, 9)
    }
    for encounter in json.loads(source_path.read_text()):
        key = encounter["key"]
        svg = ElementTree.parse(campaign / f"maps/{key}.svg").getroot()
        texts = svg.findall("svg:text", NS)
        columns = {t.text: float(t.attrib["x"]) for t in texts if t.text.isalpha()}
        lines = {t.text: float(t.attrib["y"]) for t in texts if t.text.isdigit()}

        def svg_labels(fill):
            found = set()
            for rect in svg.findall("svg:rect", NS):
                if rect.attrib.get("fill") != fill:
                    continue
                x = float(rect.attrib["x"]) + float(rect.attrib["width"]) / 2
                y = float(rect.attrib["y"]) + float(rect.attrib["height"]) / 2
                col = min(columns, key=lambda c: abs(columns[c] - x))
                row = min(lines, key=lambda r: abs(lines[r] - y))
                found.add(col + row)
            return found

        difficult_svg = svg_labels("#dbc9a0")
        cover_svg = svg_labels("#34677a")
        parts = encounter["terrain"].split("Половинное укрытие", 1)
        if len(parts) != 2:
            errors.append(f"{campaign.name}/{key}: missing distinct terrain/cover legend")
            continue
        for size, package in variants.items():
            battle = next(e for e in package["encounters"] if e["key"] == key)["battlefield"]
            checks = [
                len(columns) == battle["width"],
                len(lines) == battle["height"],
                difficult_svg == native_labels(battle["difficult"]) == labels(parts[0]),
                cover_svg == native_labels(battle["cover"]) == labels(parts[1]),
                all(cell["level"] == "half" for cell in battle["cover"]),
            ]
            if not all(checks):
                errors.append(f"{campaign.name}/{key}/{size}: SVG/source/package mismatch")
        rows.append({"slug": campaign.name, "encounter": key, "variantsChecked": len(variants)})

result = {"encounters": len(rows), "variantChecks": sum(r["variantsChecked"] for r in rows),
          "errors": errors, "rows": rows}
EVIDENCE.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({k: v for k, v in result.items() if k != "rows"}, ensure_ascii=False))
sys.exit(bool(errors))
