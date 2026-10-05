# Stage 230 — DM World Authoring UX

- Date: 2026-10-05 (Europe/Oslo).
- Status: **COMPLETE**. Stage 240 is not authorized or started.
- Work order: `work-orders/OPUS_STAGE_230.md`.
- Starting revision: `78279cb` (Stage 220 committed).
- Model exception: the owner told this session (Claude Sonnet 5.5) to proceed
  instead of Opus 5.5/HIGH. Later model/gate requirements are unchanged.
- Technical decision: `docs/adr/0029-dm-authoring-ux.md`. Two UX choices were put to the
  owner and taken as recommended: editable name/description/location/testimony/willingness,
  and a single explicit confirm button.

## Delivered

- DM-only "Add to the world" panel (`apps/web/src/authoring/`): words → assistant
  proposal → stored proposal with the server's preview → edit → confirm or cancel.
- Preview shows plain-language commands, risk with reasons, blocking issues, warnings
  (each must be accepted), notes, the server's resolution options, and the events a
  commit would record.
- Editing stores a new revision; the preview is recomputed and acknowledgements reset.
- Stale (`409`) and refused submissions show a fixed message, reload the latest revision,
  and never appear as committed. An interrupted response reloads instead of guessing.
- After a commit the NPC is a native world entity in the DM's and the player's scenes.
- Safe undo (one button) and undo refused with named blockers, each with an explicit
  "Undo … first" action.
- Secrecy: the panel and its state exist only in the DM perspective; the Player View and a
  player's session hold no preview, proposal, or private account.
- No server, rules, contract, or authoring-pipeline code changed. The browser-test server
  uses the deterministic offline interpreter for `reasoning` (no external provider).
- Fix: the shared client's `post` kept collapsing refusals to "interrupted"; it now keeps
  the HTTP status.

## Validation gate

| Gate item                                      | Evidence                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Tomas preview, edit, confirm                   | `authoring-flow.spec.ts` (revision 1 → 2, recomputed preview, confirmed, native NPC)    |
| Cancel                                         | `authoring-rejections.spec.ts` (blocking proposal discarded; Mira unchanged)            |
| Valid native entity visibility                 | DM scene and player scene show him; no private account in the player's DOM or responses |
| Invalid and stale rejection                    | forced commit of a blocking proposal refused; stale confirmation refused, reloaded      |
| Scoped knowledge in Player View                | DM's character preview and the player's page contain no preview or private account      |
| Safe and unsafe undo                           | `authoring-undo.spec.ts` (safe unit undo; `UNDO_UNSAFE` with blocker, then succeeds)    |
| Authoring atomicity and continuity regressions | full `pnpm test` / `pnpm test:integration` pass; those packages are unedited            |

## Commands (final tree)

| Check                   | Result                                                 |
| ----------------------- | ------------------------------------------------------ |
| `pnpm validate`         | PASS (exit 0): format, lint, typecheck, context-budget |
| `pnpm test`             | PASS, 161 files / 1,553 tests                          |
| `pnpm test:integration` | PASS, 20 files / 77 tests                              |
| `pnpm test:e2e`         | PASS, 37 Chromium journeys                             |
| context-budget          | 563 active files; zero over 500 or 700 lines           |

Bundle: `assets/index-CG7lCGno.js` SHA-256
`5de1de92920d25c7ff5fd88f3e10c1949edab57c03f2169edb1a0f8a25a6e2dc`;
`assets/index-CDTB2acu.css` SHA-256
`df6b3ffa479865237cbbee4fdabfb657c7d2f967ebe539b8ad77db03c6fd56f6`.

## Limitations

The browser tests use the offline interpreter, not a live model; live AI runs were not
performed. Only NPC proposals are editable in the form; other shapes are re-described.
Cancel discards the screen's copy (no cancel route; the draft stays DM working data).
The proposal list is not browsable, so a reload of the page loses an unfinished draft.
Asset approval for the new NPC's image, and multi-NPC proposals, are not in this UI.
Narrow-screen layout was not manually reviewed. Hosted CI was not run remotely.

Stage 230 is complete. Stop here; Stage 240 requires explicit owner authorization.
