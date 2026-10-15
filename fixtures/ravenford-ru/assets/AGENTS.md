# Curated Ravenford pictures (GPT-made)

Every file here was made by an OpenAI image model through Codex CLI on the owner's ChatGPT
subscription, in the owner's concept style (ADR 0034, ADR 0035). `manifest.json` lists each file's
entity IDs, variant, label, purpose (`image`, `figure`, `battle-map`), canonical reference
(`derivedFrom`), SHA-256 of the file and of the GPT original, the exact prompt and the concept
references. The seed imports them through real commands as DM-approved assets.

- Never edit or retouch these files and never add hand-made pictures. To change one, generate a new
  original with the image model, rebuild with
  `node scripts/curated-set/cli.ts <originals-dir> <generation-manifest.json> fixtures/ravenford-ru/assets`,
  and re-check identity against the canonical reference (`reports/STAGE_330_IDENTITY.md`).
- Pictures show nothing an investigation must earn (no clues the players have not found).
- Binary files: read `manifest.json`, not the images.
