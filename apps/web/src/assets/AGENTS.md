# Client pictures (GPT-made UI kit)

Every picture here was made by an OpenAI image model (owner decision of 2026-10-15, ADR 0034); none
is drawn by hand or by code. `ui-kit.manifest.json` records each file's prompt, reference concepts,
channel, date, the GPT original's SHA-256 and the mechanical processing recipe.

- Do not edit, retouch or add pictures by hand. New or changed pictures: generate with the image
  model (Codex CLI on the owner's ChatGPT subscription), keep the original outside the repository,
  add its recipe to `scripts/ui-kit/recipes.ts`, and rebuild with
  `node scripts/ui-kit/cli.ts <originals-dir> <prompts.json> apps/web/src/assets [name ...]`.
- `ui-kit/glyphs/*.png` are white alpha masks: render with CSS `mask-image` + `currentColor`.
- UI-kit pictures state nothing about the world. Never use one in place of an approved world image
  (places, people, objects come from the asset API); see `docs/STAGE_320_DESIGN.md` §4.
- Binary files: do not load them into context; read the manifest instead.
