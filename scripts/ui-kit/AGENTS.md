# UI-kit processing

`cli.ts` turns GPT originals into the shipped UI kit (`apps/web/src/assets/ui-kit/`) and writes
provenance to `apps/web/src/assets/ui-kit.manifest.json`. `recipes.ts` maps each original to its
output and recipe; `pixels.ts` holds the mechanical operations (black-to-alpha, glyph slicing,
seamless wrapping). Processing never draws or retouches; it only cuts, keys, wraps and encodes.
