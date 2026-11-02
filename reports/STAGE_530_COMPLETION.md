# Stage 530 completion — rests, levels and the Missing Caravan's ending

Work order `work-orders/STAGE_530.md`; ADR 0040 and ADR 0025 amendments of 2026-11-01; 2026-11-01.

## What changed

- Rules: `rest.ts` (Hit Point Dice, spending one, the long rest, a milestone level) by SRD 5.2.1;
  checked against the 5.2 text: a long rest gives back all spent dice (the plan's "half" is
  corrected), a spent die heals at least 1.
- Contracts: `HIT_DIE_SIDES`, the sheet's `hitDiceSpent`, `derived.hitDice`, the rest requests and
  views; quests: `shown-to`, `after` on it, `completion`, `QuestCompleted`, `QuestView.status`.
- Server: `src/rest/rest-routes.ts` (rest, end, hit die, level) through the World Engine by the
  table's system actor with idempotent command IDs; `PostgresRestStore` (migration 0026); `withBody`
  shared from `http/request-context.ts`; the live inventory covers `rest`.
- Quest projection: milestones that wait for another resolve in order; the party's evidence shown to
  an NPC; completion. Ravenford's quest (EN, RU) ends with `guild-told`; the scripted playthrough
  shows Mira the caravan evidence after the return.
- Client: the DM's Rest card; the short rest's banner (top centre on a wide screen, beside the rail
  under the place's card below 1280 px, above the tab bar on a phone, never under the side panel);
  Hit Point Dice and the DM's level in the sheet; the Journal's quests; RU dictionary.
- The knowledge card's "Recorded at" shows a local date and time (layout audit's raw-timestamp).

## Verification

- Unit 3514 passed (new: rest rules 7, rest routes 7, quest completion 1; scenario EN/RU reaches
  `QuestCompleted`).
- Integration 354 passed on PostgreSQL (new: the rest store, two starts at once keep one open).
- Browser: `rest.spec.ts` 7 passed (the DM's short rest and the player's die, live; long rest and a
  level; the Journal's quest; Russian; axe at phone, tablet, desktop with the banner and the dice).
- Layout audit at 1440, 768, 390, 320, dark and light: no errors; the raw timestamp fixed; the
  banner's overlaps found by looking (place card at 800 px, side panel, phone top bar) fixed and
  re-checked.
- Full browser suite: 215 passed (7.2 min, two workers), after rebuilding the libraries the
  workshop journeys load from their builds (tests/e2e/AGENTS.md).
- Lint, typecheck, Prettier and the context budget clean.

## Adversarial notes

- A player cannot rest the party, end a rest, level anyone, or spend another character's die (403);
  a die is never rolled for a refused spend; a retried request never rests twice; a fight interrupts.
- A private record shown to Mira does not advance the party's quest (unit test).
- Found in this pass and fixed: a spent die's log entry took the client's request ID as its own,
  so a request naming another roll's ID would heal and then fail to log; the entry's ID is now the
  server's (route test).
- Not modelled: exhaustion, subclass features at new levels, new spells learned (the DM's to add).
