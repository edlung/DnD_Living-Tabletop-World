# UI-kit processing

`cli.ts` turns GPT originals into the shipped UI kit (`apps/web/src/assets/ui-kit/`) and writes
provenance to `apps/web/src/assets/ui-kit.manifest.json`. `recipes.ts` maps each original to its
output and recipe; `pixels.ts` holds the mechanical operations (black-to-alpha, glyph slicing,
seamless wrapping). Processing never draws or retouches; it only cuts, keys, wraps and encodes.

The art tools use the root `sharp` devDependency, pinned exactly to 0.34.4 so the shipped files
rebuild byte for byte from the owner's originals; the server's runtime `sharp` (`apps/server`) is
upgraded separately. Under sharp 0.35.5 every WebP rebuilds identically, but 13 glyph PNGs get a
different deflate stream with the same pixels (2026-10-30). Move the root pin only together with
a rebuild the owner approves.
