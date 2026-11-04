# Dice on the server (`src/dice/`, Stage 510)

ADR 0040. `world-rolls.ts` reads the World Engine's dice back from events (sides from the weapon,
the monster's stat block or the slice's spells); `roll-routes.ts` serves the feed (per-perspective
whitelist), table rolls and the DM's check requests; `table-rolls.ts` rolls with `node:crypto` and the
sheet's bonus from `@ltw/rules`; `table-store.ts` / `postgres-table-store.ts` keep them (migration
0025, append-only rolls, a request answered once). Never put a target, DC or clue in a roll a player
sees. Tests: `roll-routes.test.ts`, `world-rolls.test.ts`, `table-store.integration.test.ts`; the live
inventory covers `rolls` and `check-requests` (`src/live/inventory.ts`).

Stage 530: the DM's open short rests live beside the rolls (`RestStore` in `table-store.ts`,
`PostgresRestStore`, migration 0026, one open per campaign); the routes are `src/rest/rest-routes.ts`
(ADR 0040 amendment). Test: `rest-store.integration.test.ts`.

Stage 640c (ADR 0046 §6): Heroic Inspiration on a table check. `reroll.ts` says which roll a
character may roll again (`rerollable`: its latest, a check, nothing of its rolled since, held
inspiration) and serves `POST …/rolls/:rollId/reroll` (the lower d20 again, `rerollCheck` in
`table-rolls.ts`; the inspiration spent by the World Engine's `SpendInspiration`); the feed names the
viewer's `rerollable` roll and marks a replaced one `rerolled`. `roll-access.ts` holds who may see a
roll, roll for a character and enter faces, and the client's entry, shared by both route files.
Migration 0033 links a reroll to the roll it replaces (`reroll_of`, one per roll) and keeps the mode
a check was rolled in (`check_mode`). Tests: `reroll.test.ts`, `table-store.integration.test.ts`;
journey `tests/e2e/dice-reroll.spec.ts`.
