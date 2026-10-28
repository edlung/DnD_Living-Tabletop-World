# DM table tools (`src/dm/`)

Stage 310 parts B and C: the DM acting for an absent player and the DM history (ADR 0033 §6–7;
contract `docs/STAGE_310_DESIGN.md` §B–C). A security boundary for Gate 06: nothing here may reach
a player or a lower perspective, and nothing here adds authority.

| File                                                      | Role                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dm-routes.ts`                                            | `POST …/dm/substitutions` (the DM's reason, before the command) and `GET …/dm/history?perspective=DM[&before=n]`. ADR 0009 order: 401, 400, then 404 for anyone who is not this campaign's DM, then 403 for a lower perspective.                                                                                    |
| `history.ts`                                              | The history page: authoring commits, player commands the DM issued for a character that had a player then, and the DM's time and weather commands from the table (ADR 0033 amendment of 2026-10-28), newest first, 20 per page; status from canonical state; undo availability from `previewUndo` (a dry decision). |
| `substitution-store.ts`, `postgres-substitution-store.ts` | The reasons (migration 0009): append-only, one per command ID within a campaign, `duplicate`/`conflict` answered against the stored row.                                                                                                                                                                            |

- The canonical record is the stored command with the DM as issuer. A reason is descriptive: it is
  attached to a listed command only when recorded for the same character, and a reason whose
  command was never stored is never shown.
- A blocker that is a player's own action (a player command a player issued) carries `player`
  (the character and the command as submitted), so the DM confirms before undoing it; the
  player is told through `GET …/undone-actions` (`http/routes/undone-routes.ts`, the requester's
  own commands only; `undone-actions.test.ts`).
- Never decide legality here: the World Engine decides every command; undo availability comes
  from `previewUndo` (`@ltw/domain`), the engine's own authorization and decision of `UndoCommand`
  against the snapshot, never by committing. Undo itself uses the existing routes.
- Both history computations are memoized per campaign history (the snapshot's frozen event
  list), because the live signal compares the DM's `dm/history` view every second.
- One entry never fails the page: a dry decision that throws answers that entry
  `UNDO_NOT_SUPPORTED` with no blockers and is logged (`dm history undo not decided`) by command
  ID, type and error name, never the error's message. A 500 here would also close the DM's live
  stream (`gone`), since the DM perspective fingerprints this page.
- Never log a note or a character; log the reason code and the outcome only.
- Tests: `substitution-routes.test.ts` (check order, 404 for non-DMs, validation, idempotency,
  roster, before-the-command, no echo, nothing changes for any perspective, logs),
  `history-routes.test.ts` (check order, cross-campaign 404, listing, blockers equal to the undo
  route's, status after undo, paging, a fresh app over the same stores), `history-world.test.ts` (time and weather entries
  without the seed's clock, undo blocked by a named later command at any place, weather restored to
  the earlier value, a player's attempt forbidden and never listed, a change not recorded left out
  and logged), `history-preview.test.ts`
  (an NPC created and edited by one commit is undoable while the DM's stream follows; a throwing
  dry decision is one entry's, logged without world content), `stand-in.test.ts` (no new
  authority: a player cannot act for another character; the DM's End turn cannot pass an open
  reaction window; the DM's commands are the DM's), `dm-live.test.ts` (a reason signals nobody,
  its command signals its readers), `dm.integration.test.ts` (PostgreSQL rows and a restart, a day change listed and undone after one).
  Support: `testing/dm-table.ts`.
