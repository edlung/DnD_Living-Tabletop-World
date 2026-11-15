# Client pictures (GPT-made UI kit)

Every picture here was made by an OpenAI image model (owner decision of 2026-10-15, ADR 0034); none
is drawn by hand or by code. `ui-kit.manifest.json` records each file's prompt, reference concepts,
channel, date, the GPT original's SHA-256 and the mechanical processing recipe.

- Do not edit, retouch or add pictures by hand. New or changed pictures: generate with the image
  model (Codex CLI on the owner's ChatGPT subscription), keep the original outside the repository,
  add its recipe to `scripts/ui-kit/recipes.ts`, and rebuild with
  `node scripts/ui-kit/cli.ts <originals-dir> <prompts.json> apps/web/src/assets [name ...]`.
- Catalog art: `catalog/spells/`, `catalog/weapons/`, `catalog/items/` (Ravenford items and `srd-*` items), `catalog/monsters/` (SRD stat blocks), `catalog/kinds/` (schools, creature types, item looks, `class-*`, `species-*`); the names live in `visual/ui-kit-names.ts` and `visual/srd-art-names.ts`, style in `docs/design/ravenford-art-bible.md` §10.
- `ui-kit/glyphs/*.png` are white alpha masks: render with CSS `mask-image` + `currentColor`.
- UI-kit pictures state nothing about the world. Never use one in place of an approved world image
  (places, people, objects come from the asset API); see `docs/STAGE_320_DESIGN.md` §4.
- Binary files: do not load them into context; read the manifest instead.
- A new folder or glob in `visual/ui-kit.ts` keeps the literal shape of the others: on the dev
  server `vite.config.ts` writes each glob out as its URL map from the manifest (one module
  request per picture on every page load slowed every browser journey) and stops on a glob it
  does not recognise. A picture added while the dev server runs shows after a restart.
