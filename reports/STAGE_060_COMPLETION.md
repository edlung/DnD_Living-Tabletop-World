# Stage 60 Completion Report — Investigation Vertical

- Work order: `work-orders/OPUS_STAGE_060.md`
- Builder: Claude Opus 5.5 (matrix: HIGH)
- Implementation revision: `4b18371affab9f5d4b27482fb2b7e3cff4699db7` (branch `main`)
- Formal gate: none at Stage 60. Investigation paths are reviewed at Astra Gate 02 after Stage 70 (`docs/GATE_COVERAGE.md`, Stages 50–60).
- Status: **COMPLETE — awaiting owner authorization for Stage 70**

## Decisions

| ADR                                                                      | Decision                                                                                                                              | Approval                                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0013](../docs/adr/0013-investigation.md)                                | Player commands, DM clues and disclosure, discovery, hypotheses, player outcomes, investigation fixture                               | Approved as written by the owner on 2026-10-03, before implementation. Owner choices: one attempt per check; Detect Magic execution deferred to Stage 80 |
| [0012 amendment](../docs/adr/0012-context-engine.md)                     | `enter_location`, `ALREADY_ATTEMPTED`; perception moved into `@ltw/domain`                                                            | Follows from ADR 0013 §5                                                                                                                                 |
| [0007 amendment](../docs/adr/0007-world-kernel-model-and-event-store.md) | Engine `resolution` (pre-generated IDs, d20) stored with the command; optional `SkillCheckPort`; authorization sees the whole command | Technical                                                                                                                                                |

## Delivered

**Player commands.** Each is issued for the player's own character, or by the DM/system.

| Command          | Effect                                                                                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EnterLocation`  | Move to a perceived or known location                                                                                                                                                           |
| `AskAbout`       | The NPC shares WILLING records about the topic as attributed TESTIMONY/RUMOR, with DM-only `InformationShared` provenance and a CONVERSATION memory                                             |
| `ExamineEntity`  | Inspect, or an Investigation/Perception check: d20 from the engine plus the modifier from `@ltw/rules`, one attempt per character, entity, and method. Reveals EVIDENCE plus a DISCOVERY memory |
| `FormHypothesis` | HYPOTHESIS in the party or character scope, citing only visible records and known entities                                                                                                      |

**DM authoring:**

- `AddClue` (inspect or check, DC 5–30, at most 8 per entity and method)
- `SetDisclosure` (WILLING/GUARDED; SECRET, UNKNOWN, and CONTRADICTION can never be WILLING)

**Engine and domain:**

- New events `ClueAdded`, `DisclosureSet`, `EvidenceExamined`, and `InformationShared`, each with a fact footprint, undo restores, and integrity checks.
- Accepted player commands return a player `outcome` that never contains clue IDs, DCs, or source records.

**Secrecy:**

- Unknown, unperceived, and nonexistent targets get one uniform `ENTITY_NOT_FOUND` / "Not found" with no details.
- A failed check and "nothing here" produce identical events.
- Absent targets are `NOT_PRESENT`, so their status never leaks.
- Destroyed locations can be entered, so their status never leaks either.

**Context Engine:**

- `enter_location`
- `ALREADY_ATTEMPTED` and `NO_CHARACTER_SHEET` on checks
- Legality proven to match World Engine acceptance

**Other components:**

- Server: crypto dice behind the `@ltw/rules` adapter.
- Fixture: `fixtures/ravenford/investigation-seed.json`, with the clue texts approved in ADR 0013.

## Validation gate evidence — "End-to-end investigation path passes without hypothesis→fact promotion"

| Item                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| End-to-end path (domain) | `packages/domain/src/investigation/investigation-path.test.ts`. Mira (two asks), travel to the road and then the perceived site, inspect five entities, five checks, and a competing hypothesis. The goblin hypothesis is byte-identical afterwards. Players created only EVIDENCE, TESTIMONY, and HYPOTHESIS. Every record was assigned exactly once. The party view has no WORLD_TRUTH, DM, or NPC records and no secret markers. A failed check revealed nothing |
| End-to-end path (HTTP)   | `apps/server/src/http/investigation-routes.test.ts`. The same path with the player token: Strange Symbol has no name until inspected; outcomes contain no `clue-`, `dc`, or `resolution`; the PARTY knowledge view keeps both hypotheses as HYPOTHESIS                                                                                                                                                                                                              |
| Command rules            | `authoring`, `examine`, `conversation`, and `movement-and-hypotheses` tests (45). These cover guarded vs. unknown vs. exhausted indistinguishability, uniform not-found, presence, death, incapacitation, and one attempt                                                                                                                                                                                                                                           |
| Context ⇔ engine         | `packages/context/src/command-alignment.test.ts`. Every executable context action is executed and then undone, in Market Square, at the site after checks, Incapacitated, and dead                                                                                                                                                                                                                                                                                  |
| Noninterference          | `packages/context/src/leakage.test.ts`. Adding clues and DCs and changing disclosure leaves every context unchanged                                                                                                                                                                                                                                                                                                                                                 |
| Undo/replay              | `undo-and-replay.test.ts`. Undo restores attempts, revealed clues, records, and memories; a revealing clue cannot be undone; replay never rolls; a retried command ID reports the stored roll                                                                                                                                                                                                                                                                       |
| Property tests           | The `replay.test.ts` randomized sequences now include investigation commands: replay equality, integrity, and undo                                                                                                                                                                                                                                                                                                                                                  |
| PostgreSQL               | `investigation.integration.test.ts`. The resolution survives a restart, replay needs no dice, and a retried command is a duplicate with the same roll                                                                                                                                                                                                                                                                                                               |

Mutation checks, each detected:

- hypothesis created as FACT
- DC ignored
- repeat attempts allowed
- disclosure ignored
- unknown topics allowed
- invisible citations allowed
- any character for any player
- context ignoring attempts
- selectability skipped

## Commands and results (Node 25.8.1, pnpm 11.11.0, PostgreSQL 18)

| Command                  | Result                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `pnpm validate:ci-local` | PASS (format, lint, typecheck, budget, unit, clean build, migrate ×2, seed ×2, integration) |
| `pnpm test`              | PASS — 43 files, 646 tests                                                                  |
| `pnpm test:integration`  | PASS — 5 files, 18 tests                                                                    |
| `pnpm context-budget`    | PASS — 169 files, 0 over 500 lines                                                          |

## Assumptions and limitations

- Travel ignores distance and time; the DM advances the clock. There is no travel graph in the slice.
- Disclosure is policy-only. Trust, motivation, and AI dialogue (Orin's symbol scene) arrive at Stage 130 and must go through the same disclosure gate. Talk, Trade, and Insight remain descriptors.
- Detect Magic execution is deferred to Stage 80, per the owner's choice.
- The engine draws a d20 for a check even when the command is then rejected (for example, a repeat). The roll is discarded and never shown.
- Footprints of player commands do not list the knowledge that made a target known. Undoing such a record after a player acted on it is allowed. This is a known imprecision, and harmless for the slice.
- Contradiction detection between Mira's and Thorne's testimony is Stage 70.
