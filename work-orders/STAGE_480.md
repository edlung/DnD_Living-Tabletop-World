# Work Order — Stage 480: Item catalog pictures

Authority: owner «Берем реализацию всего» (2026-10-31); art channel as ADR 0034/0035 (all art by an OpenAI image model through
Codex CLI on the owner's ChatGPT subscription; originals in `~/Documents/living-tabletop-world-art/`).

## Deliver

1. A picture per catalog item ID (30), keyed by the catalog ID, in the UI kit (`apps/web/src/assets/ui-kit/catalog/items/`),
   provenance in `ui-kit.manifest.json`; the Items sheet shows it, and falls back to the neutral glyph when there is none.
2. Generator `~/Documents/living-tabletop-world-art/items-2026-10-31/items.py` (prompts per item, same style as the UI kit),
   recipes `scripts/ui-kit/recipes.ts` (`item-<id>` → `catalog/items/<id>.webp`).

## Status 2026-10-31

Client support and the recipes are done. **Generation is blocked**: every Codex image request failed with "You've hit your
usage limit … try again at Nov 4th, 2026 7:36 AM" (ChatGPT subscription quota). No picture was made, no other provider was
used (all art by GPT). To finish: from Nov 4, run `python3 items.py --workers 2` in the art folder, copy the PNGs as
`item-<id>.png` into an originals folder, then `node scripts/ui-kit/cli.ts <originals> <prompts.json> apps/web/src/assets`
(prompt keys `item-<id>`), review the pictures, rebuild, commit.
