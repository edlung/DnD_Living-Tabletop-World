# UI-kit processing

`cli.ts` turns GPT originals into the shipped UI kit (`apps/web/src/assets/ui-kit/`) and writes
provenance to `apps/web/src/assets/ui-kit.manifest.json`. `recipes.ts` maps each original to its
output and recipe; `pixels.ts` holds the mechanical operations (black-to-alpha, glyph slicing,
seamless wrapping). Processing never draws or retouches; it only cuts, keys, wraps and encodes.

The shipped files rebuild byte for byte from the owner's originals with the root `sharp`
devDependency, pinned exactly (0.35.5, the same version as the server's in `apps/server`). Another
sharp version can encode the same pixels to other bytes: the move from 0.34.4 re-encoded 13 glyph
PNGs (2026-10-31, owner-approved). Change the pin only together with a rebuild the owner approves.
