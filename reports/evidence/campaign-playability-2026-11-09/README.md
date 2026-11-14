# Evidence: campaign playability audit, 2026-11-09

Report: `../../CAMPAIGN_PLAYABILITY_AUDIT_2026-11-09.md`.

- `matrix.csv` / `matrix.json`: one row per campaign (content counts, art, items, fights, quests, repeat cluster).
- `final-head.jsonl`: engine playthrough of all 319 packages on this checkout (read by key, large).
- `uniqueness-comparison.md`: plot comparison of all 53 campaigns.
- `browser-journey.log`: eight campaigns from Workshop import to a started fight.
- `screens/`: art contact sheets, sample tactical maps, table screens.
- `measurements/`: harness kept as run. `playthrough.ts` needs AUDIT_ROOT and `node --conditions=@ltw/source`.

No provider, database or deployment was touched. Campaign sources were not edited.
