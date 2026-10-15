# DM table tools (`src/dm/`)

Stage 310 parts B and C: the DM acting for an absent player and the DM history (ADR 0033 §6–7;
contract `docs/STAGE_310_DESIGN.md` §B–C). A security boundary for Gate 06: nothing here may reach
a player or a lower perspective, and nothing here adds authority.

| File                                                      | Role                                                                                                                                                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dm-routes.ts`                                            | `POST …/dm/substitutions` (the DM's reason, before the command) and `GET …/dm/history?perspective=DM[&before=n]`. ADR 0009 order: 401, 400, then 404 for anyone who is not this campaign's DM, then 403 for a lower perspective. |
| `history.ts`                                              | The history page: authoring commits and player commands the DM issued for a character that had a player then, newest first, 20 per page; status from canonical state; undo availability from `previewUndo` (a dry decision).     |
| `substitution-store.ts`, `postgres-substitution-store.ts` | The reasons (migration 0009): append-only, one per command ID within a campaign, `duplicate`/`conflict` answered against the stored row.                                                                                         |

- The canonical record is the stored command with the DM as issuer. A reason is descriptive: it is
  attached to a listed command only when recorded for the same character, and a reason whose
  command was never stored is never shown.
- Never decide legality here: the World Engine decides every command; undo availability comes
  from `previewUndo` (`@ltw/domain`), the engine's own authorization and decision of `UndoCommand`
  against the snapshot, never by committing. Undo itself uses the existing routes.
- Both history computations are memoized per campaign history (the snapshot's frozen event
  list), because the live signal compares the DM's `dm/history` view every second.
- Never log a note or a character; log the reason code and the outcome only.
- Tests: `substitution-routes.test.ts` (check order, 404 for non-DMs, validation, idempotency,
  roster, before-the-command, no echo, nothing changes for any perspective, logs),
  `history-routes.test.ts` (check order, cross-campaign 404, listing, blockers equal to the undo
  route's, status after undo, paging, a fresh app over the same stores), `stand-in.test.ts` (no new
  authority: a player cannot act for another character; the DM's End turn cannot pass an open
  reaction window; the DM's commands are the DM's), `dm-live.test.ts` (a reason signals nobody,
  its command signals its readers), `dm.integration.test.ts` (PostgreSQL rows and a restart).
  Support: `testing/dm-table.ts`.
