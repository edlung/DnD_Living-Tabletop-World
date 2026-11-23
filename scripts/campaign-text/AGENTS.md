# Campaign text tools

The standard is `docs/CAMPAIGN_TEXT_STANDARD.md` (owner request 2026-11-23). These tools read and
write only prose string values of `campaigns/**/source/*.json`; reference fields (keys, ids,
links) are never touched. Generated packages and HTML are rebuilt by each series' own builder.

- `audit.py [slug]` — read-only findings: rules shorthand, internal keys, latin words, rules words
  in player text, texts below the standard's minimum, scenes without NPC dialogue. Exits 1 while
  anything is left. `exceptions.json` names the texts kept short or laid out on purpose (forms,
  charts, picture-card captions, battle setups), each with its reason; add one only with a reason.
- `fix_terms.py [--dry] [slug]` — deterministic rules-word and key fixes; run prettier after it.
- `dump.py <series>/<slug> [--part …]` — a campaign's prose as addressed lines.
- `apply.py <series>/<slug> <patch.json> [--force]` — replace addressed texts with checks.
