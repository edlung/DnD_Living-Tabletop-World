#!/usr/bin/env python3
"""Read-only structural checks for the isolated Ravenford graphics packet."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

JOBS = (
    "00_BRIEF", "10_SAMPLES", "20_WORLD", "30_VARIANTS", "40_CHRONICLE",
    "50_UI_KIT", "60_EXPLORATION", "70_COMBAT", "80_DM",
)
STATUSES = ("PLANNED", "DRAFT", "READY_FOR_REVIEW", "READY_FOR_HANDOFF", "RETIRED")
VIEWS = ("UNRESOLVED", "DESIGN_ONLY", "PLAYER_IF_PERMITTED", "DM_ONLY")
STAGES = {150, 160, 170, 200, 210, 220, 230}
INITIAL_IDS = {
    "location-market-square", "location-golden-stag-inn", "location-orins-alchemy",
    "location-merchant-guild", "location-north-gate", "location-old-trade-road",
    "location-caravan-site", "character-elowen", "character-mira", "character-orin",
    "character-thorne", "character-tomas-example", "character-goblin-raider",
    "character-goblin-shaman", "clue-broken-wagon-wheel", "clue-goblin-weapon",
    "clue-strange-symbol", "clue-tracks", "clue-burned-cargo",
}


def validate(root):
    errors = []
    def require(condition, message):
        if not condition:
            errors.append(message)

    base = root / "design/ravenford"
    required = [
        "AGENTS.md", "EFFORT_MATRIX.md", "docs/AI_CONTEXT_MAP.md",
        "docs/UI_GRAPHICS_PLAN.md", "docs/graphics/AGENTS.md",
        "docs/graphics/README.md", "docs/graphics/TECHNICAL_SPEC.md",
        "docs/graphics/ACCEPTANCE.md", "docs/graphics/START_PROMPT.md",
        "docs/graphics/DECISIONS.md", "work-orders/sol-graphics/AGENTS.md",
        "work-orders/sol-graphics/README.md", "design/ravenford/AGENTS.md",
        "design/ravenford/README.md", "design/ravenford/asset-register.json",
    ]
    required += [f"work-orders/sol-graphics/SOL_GFX_{job}.md" for job in JOBS]
    required += [f"docs/graphics/templates/{name}.md"
                 for name in ("VISUAL_BRIEF", "QA_REPORT", "HANDOFF")]
    for name in required:
        require((root / name).is_file(), f"Missing package file: {name}")

    markdown = [root / "docs/UI_GRAPHICS_PLAN.md"]
    for folder in ("docs/graphics", "work-orders/sol-graphics", "design/ravenford"):
        markdown.extend((root / folder).rglob("*.md"))
    link_count = 0
    for doc in markdown:
        if not doc.is_file():
            continue
        for target in re.findall(r"\]\(([^)]+)\)", doc.read_text()):
            if target.startswith(("https://", "http://", "#", "mailto:")):
                continue
            path = target.split("#", 1)[0]
            if path:
                link_count += 1
                require((doc.parent / path).exists(),
                        f"Broken local link in {doc.relative_to(root)}: {target}")

    def output_file(value, label):
        if not isinstance(value, str) or not value:
            errors.append(f"{label}: missing relative output path")
            return None
        relative = Path(value)
        path = (base / relative).resolve()
        if relative.is_absolute() or ".." in relative.parts or not path.is_relative_to(base.resolve()):
            errors.append(f"{label}: path must remain under design/ravenford")
            return None
        require(path.is_file(), f"{label}: output file is missing")
        return path if path.is_file() else None

    registry = base / "asset-register.json"
    try:
        data = json.loads(registry.read_text())
    except (OSError, ValueError) as exc:
        errors.append(f"Cannot read asset register: {type(exc).__name__}")
        return errors, 0, link_count
    if not isinstance(data, dict):
        return errors + ["Register must be an object"], 0, link_count
    require(data.get("register_version") == 1, "Unsupported register version")
    require(data.get("purpose") == "DESIGN_ONLY", "Register purpose must be DESIGN_ONLY")
    assets = data.get("assets")
    if not isinstance(assets, list):
        return errors + ["assets must be a list"], 0, link_count
    ids = set()
    parents = []
    for index, asset in enumerate(assets):
        if not isinstance(asset, dict):
            errors.append(f"Asset row {index} must be an object")
            continue
        key = asset.get("asset_id")
        valid_id = isinstance(key, str) and bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", key))
        label = key if valid_id else f"row {index}"
        require(valid_id, f"{label}: invalid asset_id")
        if valid_id:
            require(key not in ids, f"{label}: duplicate asset_id")
            ids.add(key)
        require(asset.get("status") in STATUSES, f"{label}: invalid status")
        require(asset.get("intended_view") in VIEWS, f"{label}: invalid intended_view")
        require(asset.get("kind") in ("location", "character", "clue", "ui", "variant", "chronicle"),
                f"{label}: invalid kind")
        require(isinstance(asset.get("label"), str) and bool(asset.get("label")),
                f"{label}: display label required")
        canonical = asset.get("canonical_entity_id")
        require(canonical is None or (isinstance(canonical, str) and bool(canonical)),
                f"{label}: canonical_entity_id must be null or a verified ID string")
        stages = asset.get("consumer_stages")
        require(isinstance(stages, list) and bool(stages)
                and all(type(stage) is int and stage in STAGES for stage in stages),
                f"{label}: invalid consumer_stages")
        parent = asset.get("parent_asset_id")
        if parent is not None:
            require(isinstance(parent, str) and bool(parent) and parent != key,
                    f"{label}: invalid parent_asset_id")
            if isinstance(parent, str):
                parents.append((label, parent))
        deliveries = asset.get("deliverables")
        if not isinstance(deliveries, list):
            errors.append(f"{label}: deliverables must be a list")
            continue
        ready = asset.get("status") == "READY_FOR_HANDOFF"
        if ready:
            require(bool(deliveries), f"{label}: ready asset has no deliverables")
            require(asset.get("intended_view") != "UNRESOLVED",
                    f"{label}: ready asset has unresolved intended_view")
            provenance = asset.get("provenance")
            require(isinstance(provenance, dict) and bool(provenance.get("source"))
                    and bool(provenance.get("permission_note")),
                    f"{label}: ready asset needs provenance and permission note")
            output_file(asset.get("qa_report"), f"{label} QA")
        for delivery in deliveries:
            if not isinstance(delivery, dict):
                errors.append(f"{label}: delivery must be an object")
                continue
            file = output_file(delivery.get("path"), label)
            for dimension in ("width", "height"):
                require(type(delivery.get(dimension)) is int and delivery[dimension] > 0,
                        f"{label}: positive {dimension} required")
            require(delivery.get("format") in ("svg", "png", "webp", "jpg", "jpeg", "avif"),
                    f"{label}: unsupported or missing delivery format")
            digest = delivery.get("sha256")
            require(isinstance(digest, str) and bool(re.fullmatch(r"[0-9a-f]{64}", digest)),
                    f"{label}: SHA-256 required")
            if file:
                require(hashlib.sha256(file.read_bytes()).hexdigest() == digest,
                        f"{label}: delivery hash mismatch")
    require(INITIAL_IDS <= ids, "Initial Ravenford inventory rows were removed")
    for label, parent in parents:
        require(parent in ids, f"{label}: parent asset is missing")
    families = data.get("ui_families")
    if not isinstance(families, list):
        errors.append("ui_families must be a list")
    else:
        family_ids = set()
        for family in families:
            if not isinstance(family, dict):
                errors.append("UI family must be an object")
                continue
            key = family.get("family_id")
            require(isinstance(key, str) and bool(key) and key not in family_ids,
                    "UI family IDs must be nonempty and unique")
            if isinstance(key, str):
                family_ids.add(key)
            require(family.get("status") in STATUSES, f"UI family {key}: invalid status")
            if family.get("status") == "READY_FOR_HANDOFF":
                output_file(family.get("evidence"), f"UI family {key} evidence")
    return errors, len(assets), link_count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args()
    errors, assets, links = validate(args.root.resolve())
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    print(f"Graphics packet: {assets} asset rows; {links} local links; {len(errors)} errors.")
    if not errors:
        print("Structural checks only; artwork, rights, runtime behavior, and owner decisions remain separate.")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
