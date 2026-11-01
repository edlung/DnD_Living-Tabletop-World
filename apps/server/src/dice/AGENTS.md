# Dice on the server (`src/dice/`, Stage 510)

ADR 0040. `world-rolls.ts` reads the World Engine's dice back from events (sides from the weapon,
the monster's stat block or the slice's spells); `roll-routes.ts` serves the feed (per-perspective
whitelist), table rolls and the DM's check requests; `table-rolls.ts` rolls with `node:crypto` and the
sheet's bonus from `@ltw/rules`; `table-store.ts` / `postgres-table-store.ts` keep them (migration
0025, append-only rolls, a request answered once). Never put a target, DC or clue in a roll a player
sees. Tests: `roll-routes.test.ts`, `world-rolls.test.ts`, `table-store.integration.test.ts`; the live
inventory covers `rolls` and `check-requests` (`src/live/inventory.ts`).
