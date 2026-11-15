# Evidence: Last Orbit rework, 2026-11-14

Report: `../../LAST_ORBIT_REWORK_2026-11-14.md`.

- `sonnet-ledger.jsonl`: every Sonnet 5.5 request that completed (14 rows, $3.92), including the
  evening-4 answer rejected as truncated (`sonnet-session-4-truncated.json`). Three session requests
  streaming beside it were cut off when the old runner stopped on that rejection; they are not in the
  ledger (any partial charge for them is unknown) and were re-requested.
- `sonnet/`: the raw structured answers before Opus editing; `sonnet-run.log` the script output.
- `encounters-sonnet.json`: the fights as Sonnet wrote them, before the engine-tested rosters.
- `previous-source/`: the campaign's `source/` before this rework.
- `engine-playthrough.jsonl`: packages for 5–8 players, three seeds each, through the audit harness
  (`../campaign-playability-2026-11-09/measurements/playthrough.ts`).
- `browser-journey.log`: Workshop import, activation, DM and player entry, sheet, a fight started.
- `screens/`: the app screens, book pages at 1440 and 390 px, contact sheets of all 46 illustrations.

Art originals, prompts and references: `~/Documents/living-tabletop-world-art/last-orbit-2026-11-14/`.
