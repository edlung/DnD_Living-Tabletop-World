# Stage 180 Completion Report — Full Ravenford Integration

- Work order: `work-orders/OPUS_STAGE_180.md`
- Builder: Claude Opus 5.5 (matrix: MAX)
- Implementation revision: `e9c05ad46c15863b124b20fc4dd217f654f29777` (branch `main`)
- Formal gate: **Astra Gate 05** (the Stage 190 full red team). Handoff: `handoffs/ASTRA_GATE_05_REQUEST.md`; required output: `reviews/ASTRA_GATE_05_REPORT.md`.
- Status: **AWAITING_ASTRA_REVIEW**. Stage 200 must not start until Gate 05 passes.

## Decisions

| ADR                                               | Content                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0025](../docs/adr/0025-ravenford-integration.md) | Owner decisions of 2026-10-04: (1) Stage 180 implements the Missing Caravan quest as a projection, settling the open allocation; (2) it activates on the party's own record or memory about the caravan, not the public rumor, and advances by the party's own milestones; (3) the party, its members, and the DM read it. Also: the semantics ledger (§1) and the scenario suite (§3). |
| Amendments                                        | [0024](../docs/adr/0024-chronicle.md) (an arrival is suggested where the party stood once the instant was over). `docs/IMPLEMENTATION_PREREQUISITES.md` gets a note that the quest allocation is settled; the UX allocation stays open.                                                                                                                                                 |

## Delivered

- **Scenario suite** (`apps/server/src/scenario/`; support in `apps/server/src/testing/scenario/`). The DM, the player, and an outsider play the whole slice over the real HTTP app with their persona tokens:
  1. arrival and Mira (context, Talk, ask);
  2. the caravan site (10 examinations resolved by Rules) and a hypothesis;
  3. Orin (shown the symbol; his account; Insight);
  4. Thorne and the contradiction;
  5. Tomas: the DM's words → proposal → edit → confirmed commit → image approved → profile refined → met by the player → performed by the DM;
  6. the road ambush: an attack with cover, damage, and Slowed; the Shaman's Binding Hex countered; a late answer refused; a move; Fireball; the end;
  7. the return (Mira warmer);
  8. Day 2;
  9. the suggested memories;
  10. Chapter I and its flashbacks;
  11. the quest log.

  Gate 04's secrets are planted, and every response the player received is checked against what the player may never see.

- **Semantics ledger** (`ledger.ts`). It covers all 19 minimum commands and 26 minimum events of `RAVENFORD_SPEC.md`, plus the asset request. Each has its accepted equivalent, its ADR, and an executable check. The test reads the spec, so a missing name fails. None is required-but-unavailable.
- **Quest projection** (`packages/domain/src/quest/`, `GET /campaigns/:c/quests`; definitions in `fixtures/ravenford/quests.json`, `LTW_QUESTS_FILE`):
  - `QuestActivated` and `QuestUpdated` transitions with world times and source events;
  - only the party's own history counts;
  - stored nowhere, and read by no decision.
- **A correction the integration found.** A suggested arrival used the place first entered, so the engine refused it. The draft now uses where the party stood once the instant was over. Regression tests were written first.

## Validation gate evidence — "Full vertical-slice integration suite and relevant prior regression suites pass"

| Item              | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The slice         | `ravenford.test.ts` (17 tests): every stretch of the spec checked against the route responses and recorded canon. At the end, `checkWorldIntegrity`, the re-decision oracle (`redecideEffective` with the rules' skill modifier and the combat engine), and replay from stored JSON all agree.                                                                                                                                                                                                                                                                          |
| No leak           | Every player response of the session is free of the mystery's truth, the DM's notes, Orin's secret, untold NPC records, and Gate 04's planted markers (27 markers).                                                                                                                                                                                                                                                                                                                                                                                                     |
| Ledger            | `ravenford-ledger.test.ts` (48 tests): every Ravenford name has an executable path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Acceptance        | `ravenford-acceptance.test.ts` (7 tests):<br>• direct and indirect questioning of 4 NPCs, with traces holding no truth or DM sources, and DM surfaces closed to the player;<br>• Mira cannot tell what she does not know;<br>• "Orin is dead" stays a proposal, and a liar provider's prose changes nothing;<br>• invalid Counterspells are refused;<br>• `SPEAKER_NOT_ALIVE` warns, and commit waits for acknowledgement;<br>• Tomas is undone after the DM undoes or retracts the 3 named blockers, with oracle and integrity checks;<br>• IGNORE resolves the spell. |
| PostgreSQL        | `ravenford.integration.test.ts`: the whole slice on the production stores. A restarted engine has identical canon, oracle, and replay results, and the player views (quests, Chronicle, knowledge, a past scene, Tomas's presentation and image bytes) are byte-identical.                                                                                                                                                                                                                                                                                              |
| Quests            | `quest.test.ts`: activation by Mira, not the rumor; undo removes milestones; private records do not count; visibility; nothing recorded. `quest-survival.test.ts`: no "survived" milestone if the party died; no return counted from before the fight.                                                                                                                                                                                                                                                                                                                  |
| Prior regressions | Every earlier suite, including Gates 01–04 regressions, in the run below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**Mutation checks:** 12 of 12 injected defects detected, one at a time:

- the public rumor activating the quest;
- NPC memories activating it;
- a return with no ambush first;
- anyone reading the quest;
- sequences shown to players;
- undone events counted;
- the dead surviving;
- the original suggestion defect;
- an arrival in a region only passed through;
- the party seeing every record;
- no asset hold on undo;
- the generic route accepting chapters.

Three were first undetected, by a test-subset gap or a missing boundary case, and are covered now.

## Validation

`pnpm validate:ci-local` exited 0 on the tree committed as `e9c05ad` (`NODE_ENV=test`, docker-compose PostgreSQL). It ran:

- frozen install, format, lint, typecheck;
- context budget: 465 files, none over the limits;
- unit tests: 145 files, 1476 tests passed;
- clean build;
- migrate twice;
- seed twice;
- integration tests: 18 files, 67 tests passed.

## Residual risks and notes

- **AI has never run against the live API.** No key is configured, and the local providers answered every AI request.
- **The suites are deterministic by design** (scripted checks, middle combat dice). The production server rolls cryptographic dice.
- **Carried forward:**
  - images are placeholders;
  - one asset worker per process;
  - no timeout on proposal locks;
  - full replay per view, with no cache;
  - no seasons;
  - Chronicle hedging is lexical;
  - suggestions are heuristic;
  - development authentication only.
- **The UI is not built** (Stages 200–240). The Player Acceptance UI flows and the open UX allocation belong to their planning.
