# Stage 50 Completion Report — Context Engine

- Work order: `work-orders/OPUS_STAGE_050.md`
- Builder: Claude Opus 5.5 (matrix: HIGH)
- Implementation revision: `958c592f521b6c9f27106b9f81186c301173e5e0` (branch `main`)
- Formal gate: none at Stage 50. Entity-context leakage paths are reviewed at Gate 02 (after Stage 60; `docs/GATE_COVERAGE.md`).
- Status: **COMPLETE — awaiting owner authorization for Stage 60**

## Decisions

| ADR                                                     | Decision                                                                                              | Approval                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [0012](../docs/adr/0012-context-engine.md)              | Acting character, perception, selectable entities, visible-state whitelist, actions, relevance        | Approved as written by the owner on 2026-10-03, before implementation |
| [0004 amendment](../docs/adr/0004-module-boundaries.md) | New pure package `@ltw/context -> rules, domain, contracts`; server may depend on it; clients may not | Technical; follows from ADR 0012                                      |

## Delivered

- **Contracts** (`packages/contracts/src/context/`): the Critical Context Contract. It covers the entity reference (name only when known), visible state, and actions with `legal`, `reason`, `resolution`, `relevance`, `cost`, and `hints`.
- **`@ltw/context`** (pure):
  - Perception: the current location, its parent and child locations, and the entities placed here.
  - Selectable entities: those perceived or known. Anything else is "not found", indistinguishable from a nonexistent entity.
  - Whitelisted visible state: HP only for the acting character and party members; status only for present entities.
  - The slice action catalog, with legality from `@ltw/rules` on the canonical sheet. Spells prefer a slot-free cast, then the lowest available slot. Outside combat, range is not tracked (`RANGE_NOT_TRACKED`).
  - "Ask about" topics, drawn only from entities the perspective knows (at most 5).
  - Deterministic relevance, computed only from visible records, memories, and perception.
- **HTTP:** `GET /campaigns/:campaignId/entities/:entityId/context?perspective=PLAYER|CHARACTER:<id>`.
  - Perspectives without an acting character get 403, decided before the entity is looked up.
  - Every not-found case gets the same uniform 404.
  - The DM's preview of a character returns exactly what that character's player sees.
- **Supporting exports:**
  - domain: `knownEntityIds`, `visibleRecords`, `controlledCharacter`
  - rules: `isIncapacitated`

## Validation gate evidence — "Context contracts and permission-aware projections pass"

| Item                                         | Evidence                                                                                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract shape (Mira, RAVENFORD_SPEC)        | `packages/context/src/entity-context.test.ts`: exact ranked action list: Talk, Trade, Ask about Ravenford, Inspect; costs and hints; self and party HP                                              |
| "Ask about missing X" only after it is known | Same file: the topic is absent before a PARTY `UNKNOWN` record exists and ranked high after it                                                                                                      |
| Legality and reasons from rules              | `legality.test.ts`: free vs slot cost, `NO_SLOT`, `NOT_KNOWN`, `NO_WEAPON`, `INCAPACITATED`, `ACTOR_DEAD`, `NO_CHARACTER_SHEET`, `TARGET_DEAD`; absent target is `NOT_PRESENT` even when it is dead |
| Perception                                   | `perception.test.ts`: here, parent, child locations; not siblings, not contents of the parent or children; follows movement; unplaced actor perceives nothing                                       |
| Permission-aware projection                  | `leakage.test.ts`: forbidden-marker crawl over every entity, both in Market Square and at the caravan site (evidence perceived by kind only, no names)                                              |
| Noninterference                              | Same file: a WORLD_TRUTH secret, an NPC question, a DM note, an NPC memory, an absent NPC's death and move, Mira's sheet, and a hidden NPC leave every Elowen context unchanged                     |
| HTTP                                         | `apps/server/src/http/context-routes.test.ts`: 200 body, DM preview equality, marker crawl, uniform 404, 403 for DM/PARTY/PUBLIC/NPC, ADR 0009 check order                                          |
| Determinism                                  | Independent replays produce byte-identical contexts                                                                                                                                                 |

Mutation checks were each detected: dead-before-presence ordering, open questions read from canonical knowledge, HP shown to everyone, status for absent entities, topics from all entities, and perceiving the parent location's contents. The last one survived at first and was killed by an added test.

## Commands and results (Node 25.8.1, pnpm 11.11.0, PostgreSQL 18)

| Command                                                                                         | Result                                                    |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm validate:ci-local`                                                                        | PASS                                                      |
| `pnpm test`                                                                                     | PASS — 35 files, 592 tests                                |
| `pnpm test:integration`                                                                         | PASS — 4 files, 17 tests                                  |
| `pnpm context-budget`                                                                           | PASS — 147 files, 0 over 500 lines                        |
| Built server on the seeded PostgreSQL database, `curl` of Mira's context and the Strange Symbol | 200 with the expected context; 404 for the unknown symbol |

## Assumptions and limitations

- No canonical battlefield positions exist yet. Range and `moveRequiredFt` reach the context with combat at Stage 80. Until then, ranged actions on present targets carry `RANGE_NOT_TRACKED`.
- Actions are descriptors only. Executing them starts at Stage 60 (investigation and conversation) and later stages. Trade is an attempt; no economy exists.
- Concealment and disguises are not modeled. A perceived entity shows its ID and kind, so an entity whose identity must stay secret needs an opaque ID (ADR 0008). The caravan-site evidence uses descriptive IDs. That reveals only what is visibly there, never what it means.
- The AI relevance ranker is Stage 140. It may refine relevance only from the same scoped inputs.
