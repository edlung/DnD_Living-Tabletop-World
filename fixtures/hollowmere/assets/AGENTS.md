# Curated Hollowmere pictures (GPT-made)

Every file here was made by an OpenAI image model through Codex CLI on the owner's ChatGPT
subscription, in the owner's concept style (ADR 0034, ADR 0035; docs/adr/0058-campaign-content.md
§5). `manifest.json` lists each file's entity IDs (the fixtures' own, opaque where a player meets
the thing unnamed), variant, label, purpose (`image`, `figure`), canonical reference
(`derivedFrom`), SHA-256 of the file and of the GPT original, the exact prompt and the concept
references. A new campaign of the adventure imports them through real commands as DM-approved assets.

- Never edit or retouch these files and never add hand-made pictures. To change one, generate a new
  original with `~/Documents/living-tabletop-world-art/hollowmere-2026-11-04/generate.py` and rebuild
  with `node scripts/curated-set/cli.ts <originals-dir> <generation-manifest.json> fixtures/hollowmere/assets Hollowmere`.
- The Northern Fens picture is the region's map: the pins in `scripts/adventures/hollowmere/travel.ts`
  follow where it draws the places; a new map needs new pins.
- Pictures show nothing an investigation must earn. Binary files: read `manifest.json`, not the images.
