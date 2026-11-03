# The DM's editors (`src/editors/`)

The routes beside the generic commands route that the DM's editors without AI need
(docs/adr/0058-campaign-content.md §1). Every change is a World Engine command whose ID is the DM's
own (`httpCommandId`), so the DM's history lists it and undoes it.

| Concern                                                   | File                   |
| --------------------------------------------------------- | ---------------------- |
| A story object: made, then given or left (two commands)   | `object-routes.ts`     |
| A creature's or an NPC's stat block, read for its numbers | `stat-block-routes.ts` |

Rules:

- The ADR 0009 order: 401, 400, then 404 outside the campaign and 403 for a player.
- Command IDs follow from the request (`requestId`): a retry makes a thing once.
- Tests: `editor-routes.test.ts`.
