# Gate 03 — Retest 2: FAIL

## Review header

- **Review ID:** ASTRA-GATE-03-RETEST-2
- **Stage/Gate:** Stages 80–90 / Gate 03, Reaction Integrity
- **Commit/Build:** `b38cbbcb6dcf340a5ab207a3fb2f4a8dac9f2750`; tested at `37523d19d24a9ca829cb8c20efeab5a860ea38d9`. HEAD adds only README status, the handoff and remediation report; implementation is identical.
- **Date:** 2026-10-04
- **Reviewer model:** GPT-6 (Codex), independent review context. Astra/MAX was requested; the exact runtime variant and effort were not exposed for independent verification.
- **Inputs:** `handoffs/ASTRA_GATE_03_REQUEST.md`, `remediation/OPUS_GATE_03_REMEDIATION.md` (Remediation for Retest 2), [initial report](ASTRA_GATE_03_REPORT.md) and [Retest 1](ASTRA_GATE_03_RETEST_1.md). Remediation claims were independently checked.
- **Surfaces tested:** Combat/reaction decisions, outside-encounter spells, undo, concurrency, replay and effective-command re-decision, knowledge/memory/encounter projections, authenticated HTTP handlers, PostgreSQL reload, and compatibility with events genuinely written by the previous reviewed revision.
- **Overall result:** FAIL
- **Required surfaces unavailable:** None within the current backend scope. HTTP probes use actual Fastify handlers through `inject()` with PostgreSQL. Later surfaces are recorded below.
- **Owner-approved dispositions:** ADR 0015 excludes gridless entities from in-combat Detect Magic; outside-combat room behavior remains. ADR 0016 §6 exclusions remain. No disposition accepts either new finding.

## Retest decision

**G03-H04's unsafe-undo reproduction is closed, and G03-H01–H03 remain closed in the exercised scenarios. Two new High findings block the gate:** G03-H05 breaks loading of legitimate previous-version history; G03-H06 exposes a hidden reaction window through an outside-encounter Healing Word response.

The full suites pass: **915 unit tests and 42 integration tests**. Independent evidence contains **54 state cases, 31 HTTP/PostgreSQL cases and two historical-compatibility cases**. The latter use an isolated archive of revision `88d8137401451dd6a6d6703217bf53e273a2ede4` to write real events through the old engine and HTTP API, then load the same database with the current implementation. No event was fabricated or rewritten.

Authority remains `ARCHITECTURE_INVARIANTS.md`, ADRs 0006–0007, 0009, 0011–0013 and 0015–0016, including their accepted amendments, and `docs/GATE_COVERAGE.md`. Only this report and its new evidence were added; production code, tests and prior review artifacts were preserved.

## Previous findings and adjacent fixes

| Finding / boundary                               | Independent result                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G03-H01 — invalid window reopening**           | Remains closed. Death, Incapacitated and time changes block reopening atomically. Countered, declined, DM-closed and failed-Counterspell closures, reverse-order recovery, unrelated knowledge, both reopening/status race orders and PostgreSQL reload pass.                                                                                                                                                                      |
| **G03-H02 — missed attack loses target defense** | Original reproduction remains closed. AC and Prone-target misses retain the sheet dependency; reverse-order undo and re-decision pass. Original AC scenario also passes after database reload.                                                                                                                                                                                                                                     |
| **G03-H03 — Detect Magic range leak**            | Remains closed. Independent 30/35/50-ft cases cover immediate, declined, DM-closed and countered casts. Gridless entities remain excluded in combat and become discoverable after it ends. Authenticated PLAYER/PARTY knowledge and PLAYER memory checks pass after reload.                                                                                                                                                        |
| **G03-H04 — outside-caster target premises**     | Original finding closed. Hunter's Mark and Healing Word reject undo of target creation, revival, placement and caster placement, both without combat and during a fight excluding the caster. All 16 variants name the dependent cast, preserve state and recover in reverse order; repeated through HTTP/PostgreSQL. Additional state controls cover caster participation, real healing from 1 to 9 HP, and a full-health target. |
| **Spell isolation without an open window**       | Hunter's Mark, Healing Word and Detect Magic have matching premises, non-ID outcomes and discovered clue IDs in equivalent no-fight / outside-caster worlds. **This does not extend to an open window: G03-H06 below.**                                                                                                                                                                                                            |
| **Adjacent authoring / negative results**        | Post-combat stat-block edits and repeated examination/sensing remain protected. Undoing an unreached magic clue is now blocked for another location, combat range and gridless exclusion, with safe recovery; the other-location case also passes PostgreSQL reload. **The new representation breaks older streams: G03-H05 below.**                                                                                               |

## Blocking findings

### [G03-H05] Replacing a stored premise variant makes legitimate previous-version campaigns unloadable

- **Severity:** High
- **Invariant:** 12 — **WORLD HISTORY IS RECONSTRUCTABLE**. Violates ADR 0006's append-only reconstruction contract and ADR 0007's explicit requirement to upcast breaking event-payload changes. `packages/domain/src/kernel/AGENTS.md:27` also requires a new schema version and upcasting.
- **Category:** Events / Timeline / State
- **Preconditions:** A persisted campaign contains a valid version-1 `PremisesRecorded` event with a `placement` premise, emitted by the Retest 1 implementation for Detect Magic with an unreached magic-bearing entity.
- **Steps to reproduce:**
  1. Run revision `88d8137401451dd6a6d6703217bf53e273a2ede4` against a migrated throwaway PostgreSQL database and seed Ravenford.
  2. Through authenticated HTTP commands, create item `legacy-far-charm` at `north-gate` and add magic clue `legacy-far-magic` to it. Elowen remains elsewhere.
  3. As Elowen's player, cast Detect Magic. It succeeds. Restart the old engine: the stream loads and the encounter GET returns HTTP 200.
  4. Open the same database with the current implementation. Load the campaign, GET `/campaigns/ravenford/encounter?perspective=PLAYER`, and submit an ordinary DM `AddKnowledge` command.
- **Expected behavior:** Existing accepted history remains readable without resetting or rewriting it. Current reads and commands work after version-aware compatibility handling.
- **Actual behavior:** `parseRecordedEvent` and `WorldEngine.load` throw `ZodError` at `payload.premises[3].kind`: `placement` is no longer a valid discriminator. Both GET and the DM command return HTTP 500 / `INTERNAL`. The stream remains at version 106 with 106 events; rejection did not corrupt or erase the stored rows. A fresh-current database with the equivalent `unreached` event returns HTTP 200 for both operations and advances to version 107.
- **Evidence:** [Compatibility recipe](evidence/gate-03/retest-2/COMPATIBILITY_PROBES.md), [results](evidence/gate-03/retest-2/compatibility-results.json), keys `H05-upgrade-from-retest-1` and `H05-fresh-current-control`. The old accepted cast is `http:player-elowen:legacy-3`; its failing premise event is sequence **104**, ID `00000000-0000-4000-8000-000000000072`, **schemaVersion 1**. The evidence records the genuine event, old-reader success, new-reader failure and fresh-current control.
- **Cause/boundary:** `packages/domain/src/investigation/events.ts:97–104` replaces the `placement` branch with `unreached`; the old fold and footprint cases were also removed. `packages/domain/src/kernel/events.ts:50` still sets version 1, and `parseRecordedEvent` at lines 233–238 applies only the current schema. `PostgresEventStore.loadStream` validates every stored event through that parser. No legacy decoder/upcaster bridges this change.
- **Impact:** A supported spell cast under the previous revision can prevent the entire campaign from being read or changed after upgrade. This is High rather than unrecoverable corruption: the rows remain intact and the old reader demonstrably understands them.
- **Suggested remediation direction:** Preserve the meaning and readability of historical events across schema, fold, footprints, replay and undo. Introduce the required version/compatibility path; do not reset campaign data, rewrite accepted events or invent clue identities that the old event did not contain.
- **Regression test required:** **Yes** — `retest1_placement_premise_survives_current_reader`. Have the real previous writer create a persisted fixture, then verify current reload, as-of reconstruction, commands and safe undo. Include compensated old casts and a fresh-current control; current-writer/current-reader round trips alone miss this failure.

### [G03-H06] Outside-encounter Healing Word reveals whether a hidden reaction window is open

- **Severity:** High
- **Invariant:** 5 — **NO KNOWLEDGE LEAKAGE**. Violates ADR 0016 §4 and “Outsiders cannot probe,” ADR 0015's outside-caster isolation amendment, and the handoff's explicit prohibition on revealing the existence of a fight or window to a non-participant.
- **Category:** Knowledge / Rules / Permission
- **Relationship to remediation:** Newly identified adjacent participation boundary, separate from the repaired H04 undo exploit. This report does not claim the pause guard was introduced by this remediation.
- **Preconditions:** Elowen is controlled by the player, present on the Old Trade Road, and excluded from the encounter. Shaman and a Counterspell-capable character, Seren, participate. The Shaman is at full health, 21/21, in every comparison.
- **Steps to reproduce:**
  1. As DM, create Seren at the road with a copy of Elowen's sheet. Place the normal ambush entities and start combat with the goblins and Seren, excluding Elowen. Use the recipe's scripted initiative so the Shaman acts first.
  2. As DM, have the Shaman cast Ashen Bolt at Seren, opening her reaction window. Restart the engine.
  3. As Elowen's player, GET the encounter: it returns `encounter: null`.
  4. Submit `CastSpell { combatantId: "elowen-starwhisper", spellId: "healing-word", targetId: "goblin-shaman" }`.
  5. Compare the same player command in equivalent worlds with no encounter, and with the encounter but no open window.
- **Expected behavior:** A player whose character is not a combatant cannot distinguish the hidden encounter/window through command status, reason or effects. The window's dependency protection must also remain intact.
- **Actual behavior:** With no fight and with a fight but no window, Healing Word returns HTTP **200 / accepted**, reporting zero healing. With the hidden window open, it returns HTTP **422 / `REACTION_PENDING`**, message “A reaction is pending.” The player's encounter projection remains null. The rejected probe is atomic and spends no resources; it exposes the hidden condition directly.
- **Controls:** Hunter's Mark and Detect Magic remain accepted across all three encounter states. Healing Elowen herself is accepted while the same hidden window is open. Every tested case reloads successfully and passes replay, structural/window validation and effective-command re-decision: those checks do not detect the disclosure.
- **Evidence:** [HTTP/PostgreSQL recipe](evidence/gate-03/retest-2/HTTP_POSTGRES_PROBES.md), [results](evidence/gate-03/retest-2/http-postgres-results.json), keys `H06-*`. The failing player command is `http:player-elowen:r2-10` in `H06-fight-open-window-healing-word`; matching no-fight and no-window controls return accepted at `r2-8` and `r2-9`. All use actual authenticated handlers and separate databases.
- **Cause/boundary:** `pausedCombat` correctly bypasses the early pause for a non-participant (`packages/domain/src/kernel/decide/reaction-pause.ts:35–38`). Healing produces a target stat-block write (`packages/combat/src/spells.ts:109–125`), even at full health. The later `pausedByChanges` guard, at `reaction-pause.ts:42–53`, intersects that write with hidden window dependencies and returns the visible `REACTION_PENDING` refusal without preserving non-participant isolation.
- **Impact:** An authorized player can probe a known creature to learn the existence of a fight's reaction window despite the encounter and window being hidden from that player. This is a concrete disclosure of protected combat metadata, not a speculative timing channel.
- **Suggested remediation direction:** Reconcile outside-caster legality, protected target writes and the player-visible result contract. Preserve both pause integrity and non-interference. Merely hiding the error text leaves the accepted/rejected distinction; merely bypassing the pause permits changing suspended-spell dependencies. If the supported cross-boundary interaction requires a different visibility rule, obtain an explicit owner-approved ADR rather than silently weakening it.
- **Regression test required:** **Yes** — `outsider_healing_does_not_reveal_hidden_reaction_window`. Compare authenticated results for no encounter / encounter without window / encounter with window, with identical visible caster/target state. Cover full-health and injured targets, combatant and non-combatant targets, all three outside-combat spells, fresh-process reload, and unchanged pause dependencies after any accepted command.

## Validation and reproducible artifacts

| Validation                                                                  | Result                                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                 | PASS — 77 files, 915 tests                                                                           |
| `pnpm test:integration`                                                     | PASS — 9 files, 42 PostgreSQL tests                                                                  |
| `pnpm lint`, `pnpm typecheck`, `pnpm build`                                 | PASS                                                                                                 |
| `pnpm context-budget`                                                       | PASS — 264 active files; none over 500/700 lines                                                     |
| `pnpm format:check`                                                         | PASS after formatting the new review artifacts                                                       |
| [State recipe](evidence/gate-03/retest-2/STATE_PROBES.md)                   | 54 cases passed, including original failures, H04 variants/recovery and adjacent fixes               |
| [HTTP/PostgreSQL recipe](evidence/gate-03/retest-2/HTTP_POSTGRES_PROBES.md) | 31 cases completed; H04 fixes confirmed and H06 reproduced with controls                             |
| [Compatibility recipe](evidence/gate-03/retest-2/COMPATIBILITY_PROBES.md)   | Two cases completed; genuine old history fails in the current reader, fresh-current control succeeds |

[Results index](evidence/gate-03/retest-2/results.json) links the exact revisions and machine-readable evidence. All three recipes were executed from their final Markdown form. Vulnerability assertions intentionally confirm the observed failures; successful recipe execution does **not** mean the gate passes. Each database was created for its probe and dropped afterward. No development database reset, deployment or full CI-wrapper run was performed. Dependencies were installed only in the isolated historical snapshot, using the offline locked cache.

## Coverage ledger and future obligations

| Due surface                                                                      | Evidence / disposition                                                                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Eligibility, expiry, stale/late/repeated answers, Reaction/slot spending         | Complete reaction/rules suites pass                                                                                        |
| Concurrent responses/close, duplicate and multiple candidates, both race orders  | Existing two-engine unit/PostgreSQL suites pass; independent reopening/status race cases pass                              |
| Ordering, idempotency, replay, as-of history and restart                         | Current-version suites and independent replay/re-decision pass; **old-version persisted reload fails as H05**              |
| Open-window undo, closed-window reopening, related/unrelated authoring           | Independent H01 matrix and recovery pass                                                                                   |
| Stage 80 attacks, movement, spells, conditions and death saves                   | Full suites pass; H02 and H04 original reproductions closed                                                                |
| Detect Magic acquisition and negative premises                                   | Range/completion matrix, gridless control and authenticated knowledge/memory checks pass; unreached clue undo is protected |
| Non-participant encounter and window isolation                                   | No-window spell controls pass; **Healing Word during a hidden window fails as H06**                                        |
| Prior Gate 01/02 scope, permission, context, memory and contradiction boundaries | Complete prior regression suites rerun; their fresh-stream success does not waive H05 or H06                               |

Future surfaces remain **NOT YET IN SCOPE**, not passed:

| Surface                                                                                          | Introduction / next review                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI contexts, proposals, authoring validation, confirmation, continuity, provenance and safe undo | Stages 100–120 / Gate 04                                                                                                                          |
| Runtime NPC dialogue/actions and supplied-context isolation                                      | Stage 130 / Gate 04                                                                                                                               |
| Relevance ranking                                                                                | Stage 140 / Gate 05 integration                                                                                                                   |
| Asset identity, metadata, lineage and historical visual state                                    | Stages 150–160 / Gate 05                                                                                                                          |
| Chronicle/flashback retrieval                                                                    | Stage 170 / Gate 05                                                                                                                               |
| Complete backend Ravenford integration                                                           | Stage 180 / Gate 05, reviewed at Stage 190                                                                                                        |
| Real UI consumers, stale prompts and perspective changes                                         | Stages 200–230, combat UX at 220 / introducing-stage boundary/E2E regressions and Stage 250 release evidence; reopen affected gates when required |
| Other/monster reactions, chains, outside-combat windows and timers                               | Unscheduled ADR 0016 exclusions / first gate after introduction                                                                                   |
| Production authentication                                                                        | Its own ADR before deployment / Gate 05 at the latest, per handoff                                                                                |

## Final summary

- **Findings:** 0 Critical, **2 High**, 0 Medium, 0 Low.
- **Exact blockers:** **G03-H05 and G03-H06**; neither has an owner-approved exception.
- **Previously reported failures:** G03-H01–H04 pass their independent reproduction checks; the two newly identified boundaries remain blocking.
- **Invariants exercised:** 1, 4–6, 7–12, 13 and 20 through current-gate and prior regression suites. New findings violate **12** and **5** respectively.
- **Residual risk:** Fresh-stream round trips do not prove historical compatibility. Replay/re-decision and structural checks can all succeed while a command result leaks hidden state. Finite tests do not exhaust mixed encounter/non-encounter interactions.

Return to **Opus/MAX** for failing regressions and remediation, then request **Astra/MAX Retest 3** targeting `reviews/ASTRA_GATE_03_RETEST_3.md`. Preserve this report and all earlier evidence. **Stage 100 remains blocked.** No implementation fixes or later-stage work were performed; review stops here.

FAIL
