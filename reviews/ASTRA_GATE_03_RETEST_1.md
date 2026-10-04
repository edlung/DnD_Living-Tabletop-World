# Gate 03 — Retest 1: FAIL

## Review header

- **Review ID:** ASTRA-GATE-03-RETEST-1
- **Stage/Gate:** Stages 80–90 / Gate 03, Reaction Integrity
- **Commit/Build:** `88d8137401451dd6a6d6703217bf53e273a2ede4`; tested at `c395d22f23488793b015523a410f90aec3c69b8e`. HEAD adds only README status, the updated handoff, and remediation report; implementation is identical.
- **Date:** 2026-10-04
- **Reviewer model:** GPT-6 (Codex), independent review context. Astra/MAX was requested; the exact runtime variant and effort were not exposed for independent verification.
- **Prior report:** [Gate 03 initial report](ASTRA_GATE_03_REPORT.md), preserved with its evidence.
- **Remediation reviewed:** `remediation/OPUS_GATE_03_REMEDIATION.md`; claims independently checked against the implementation and executable behavior.
- **Surfaces tested:** Reaction/combat commands, undo, effective-command re-decision, replay, concurrency, negative examination/sensing results, player knowledge/memory/encounter reads, authenticated HTTP handlers, PostgreSQL and fresh-engine reload.
- **Overall result:** FAIL
- **Required surfaces unavailable:** None in the current backend scope. HTTP probes use actual Fastify handlers through `inject()` with PostgreSQL, not a separately listening server. Future obligations appear below.
- **Owner-approved dispositions:** ADR 0015's Gate 03 amendment excludes entities without battlefield squares from in-combat Detect Magic; the outside-combat room behavior remains. ADR 0016 §6 exclusions remain unchanged. No exception accepts G03-H04.

## Retest decision

**The three original reproductions now behave safely, but a new High finding, G03-H04, blocks the gate.** The remaining issue is an adjacent gap in the G03-H02 premise boundary: a caster who does not participate in an active encounter loses the dependencies on its actual spell target. Undo can then remove that target while leaving Hunter's Mark canonical.

The complete existing suites pass: **887 unit tests and 36 integration tests**. Independent evidence adds **32 state scenarios and seven HTTP/PostgreSQL scenarios**, including the new failure in three variants and matching no-encounter controls. Findings and controls survive independent replay/reload checks; the unsafe cases fail the effective-command re-decision oracle.

Authority remains `ARCHITECTURE_INVARIANTS.md`, ADRs 0006–0007, 0009, 0011–0013 and 0015–0016, including the remediation amendments, and `docs/GATE_COVERAGE.md`. No production code or existing tests were changed during review.

## Disposition of the original findings

| Finding                                          | Independent retest result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G03-H01 — invalid window reopening**           | **Original finding closed.** Caster death, caster Incapacitated, and advancing world time block unsafe reopening with `UNDO_UNSAFE`, the exact blocker, and unchanged state. Tested countered, declined, DM-closed and failed-Counterspell/proceeded closures. Explicitly undoing the blocker first reopens a valid window; unrelated knowledge does not block. Both forced race orders between reopening and a status edit preserve the boundary: the second command receives `REACTION_PENDING` or `UNDO_UNSAFE`. Original HTTP reproduction rejects after restart and recovers safely. |
| **G03-H02 — missed attack loses target defense** | **Original attack reproduction closed; related boundary still fails as G03-H04.** AC 30 and Prone-target misses block undo of the determining sheet edit, and reverse-order recovery agrees with re-decision. The original AC case remains blocked after PostgreSQL reload. Target-status and skipped-dead turn-order regressions also pass in the full suite. The broader claim that every out-of-combat target premise is now protected is disproved below.                                                                                                                             |
| **G03-H03 — Detect Magic range leak**            | **Original finding closed.** Independent 30/35/50-ft cases enforce the radius for immediate casting, candidate decline and DM close. A successful Counterspell reveals nothing, including at 30 ft. A gridless item is excluded during the encounter and sensed after it ends. On PostgreSQL, near evidence appears in PLAYER/PARTY knowledge and PLAYER memories; far and gridless markers stay absent after reload, for immediate and suspended casts.                                                                                                                                  |

The adjacent remediation also holds in the exercised cases: stat-block authoring after `EndCombat` blocks undo of the end; repeated inspection and repeated Detect Magic block undo of the first discovery and recover in reverse order. Existing regressions for moved casters, moved magic-bearing entities, and the prior Gate 01/02 boundaries pass. These results do not waive the new target-premise failure.

## Blocking finding

### [G03-H04] An unrelated active encounter removes target dependencies from out-of-encounter spells

- **Severity:** High
- **Invariants:** 1 — WORLD ENGINE IS AUTHORITY; 12 — WORLD HISTORY IS RECONSTRUCTABLE. Violates ADR 0006 §8, ADR 0007's complete-premise contract, and ADR 0015's remediation amendment requiring an outside-combat spell to record its target's vitals.
- **Category:** Rollback / State / Rules
- **Relationship to prior review:** Adjacent, still-unfixed part of the G03-H02 missing-premise class. This is a new reproducible finding, not a claim that the original AC-miss fix failed.
- **Preconditions:** A campaign has an active encounter, but the controlled caster and the target are not participants. This is a supported state: the player's encounter projection is `null`, while legal outside-encounter spells can still be cast.
- **Steps to reproduce:**
  1. Start the Ravenford ambush using its usual placements and combatants **except Elowen**. She remains present on the Old Trade Road but is not a combatant.
  2. As DM, create NPC `r1-bystander` at `old-trade-road`, recording its creation command ID.
  3. As Elowen's player, submit `CastSpell { combatantId: "elowen-starwhisper", spellId: "hunters-mark", targetId: "r1-bystander" }`. The command is accepted.
  4. Restart the engine, then as DM undo the NPC's creation while leaving the cast effective.
  5. Reload from PostgreSQL and inspect canonical character concentration, entity existence, and effective-command re-decision.
- **Expected behavior:** Step 4 returns `UNDO_UNSAFE` with the accepted cast as a blocker and makes no change. A spell that was legal only because its target existed, was alive and was perceived must retain those dependencies regardless of another encounter's existence. Undoing the dependent cast first permits safe reversal.
- **Actual behavior:** Undo returns HTTP 200 / `accepted`. After reload, `state.entities.has("r1-bystander")` is false, but Elowen retains `concentration: { spellId: "hunters-mark", targetId: "r1-bystander" }`. The cast remains effective. Ordinary replay reproduces this state, and both structural and reaction-window checks report no violations; re-decision correctly reports that the cast would no longer be accepted.
- **Adjacent variants:** The same gap lets DM undo the target's placement, leaving it unplaced, or undo its revival, leaving it dead beneath the accepted cast. All three variants reproduce through authenticated HTTP handlers and persist after restart. In otherwise equivalent no-encounter controls, each undo correctly returns `UNDO_UNSAFE`.
- **Evidence:** [State results](evidence/gate-03/retest-1/state-results.json), keys `H04-unrelated-fight-{existence,status,placement}` and `H04-no-fight-*`; [HTTP/PostgreSQL results](evidence/gate-03/retest-1/http-postgres-results.json), keys `H04-*`. The existence case records creation `http:dm-ravenford:r1-7`, cast `http:player-elowen:r1-8`, and accepted undo `http:dm-ravenford:r1-9`. Re-decision of the cast reports `no longer accepted: ILLEGAL_ACTION`; the status variant reports `TARGET_DEAD`.
- **Cause/boundary:** `packages/combat/src/spells.ts:106` adds the target's `vitals` premise only when the campaign has no encounter. Lines 112 and 131 use the same `!encounter` condition for the target's `perceived` premise. However, the planner correctly treats the caster as outside the encounter when `plan.record` is null. `combatPremiseList` in `packages/combat/src/refusal.ts:45` records the unrelated encounter's combatants, not this spell's actual target. The two interpretations of “in combat” disagree, dropping the target's existence, status and placement dependencies.
- **Impact:** Safe-undo guarantees depend on whether a different group is fighting. Authorized undo can leave a canonical spell referring to a deleted entity, or preserve a cast whose target was not alive/present under current canon. The stale state survives restart; it is not a projection-only or logging defect.
- **Suggested remediation direction:** Derive spell premises from the same caster/target participation and perception decisions used by legality. Always protect the actual target's required vitals and perception, including when `state.encounter` exists but the caster has no combatant record. Audit Healing Word and other outside-encounter paths for the same predicate mismatch; those additional spell variants are required audit targets, not claimed reproductions here. Preserve the supported outside-combat behavior and unrelated-encounter isolation.
- **Regression test required:** **Yes** — `outside_encounter_cast_retains_target_premises_during_another_fight`. Cover target creation, revival, placement and caster placement; compare no-encounter, caster-in-encounter and caster-outside-encounter states; verify atomic `UNDO_UNSAFE` with the dependent cast named, explicit reverse-order recovery, replay/re-decision agreement and HTTP/PostgreSQL reload. Include Hunter's Mark and applicable Healing Word cases. Add non-participant casting to randomized authoring/undo coverage.

## Validation and reproducible artifacts

- [Results index](evidence/gate-03/retest-1/results.json): exact revisions, command results, dispositions and limitations.
- [State recipe](evidence/gate-03/retest-1/STATE_PROBES.md): 32 scenarios; no database required.
- [HTTP/PostgreSQL recipe](evidence/gate-03/retest-1/HTTP_POSTGRES_PROBES.md): seven scenarios, each in its own throwaway database, with fresh-engine reloads.

Run the commands printed at the top of each recipe from the repository root. The H04 assertions deliberately reproduce vulnerable behavior; successful recipe execution is evidence for this **FAIL**, not a passing gate. Both recipes were executed from their final Markdown form. Existing development data was not reset.

| Validation                                  | Result                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm test`                                 | PASS — 76 files, 887 tests                                                                 |
| `pnpm test:integration`                     | PASS — 9 files, 36 tests on PostgreSQL                                                     |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | PASS                                                                                       |
| `pnpm context-budget`                       | PASS — 263 active files, none over 500/700 lines                                           |
| `pnpm format:check`                         | PASS after formatting the new review artifacts                                             |
| Independent state recipe                    | 32 scenarios completed; original fixes and controls pass, H04 reproduced in three variants |
| Independent HTTP/PostgreSQL recipe          | Seven scenarios completed; original fixes and H04 persistence independently confirmed      |

The complete CI wrapper, dependency reinstall, development-database reset and deployment were not performed. The executed suites cover the current backend gate; production authentication, a real UI and later AI surfaces are not certified.

## Coverage ledger and future obligations

| Due surface                                                                       | Evidence / disposition                                                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Eligibility, expiry, stale/late/repeated responses, Reaction and slot spending    | Full reaction/rules suites rerun; original guarantees hold in tested cases                                                 |
| Concurrent answer/close, duplicate candidate, two candidates, both winning orders | Existing two-engine unit/PostgreSQL race suites pass; independent reopening/status race covers the remediation boundary    |
| Ordering, entropy, idempotency, replay, as-of history and restart                 | Existing suites pass; independent recipes check persisted reload and replay. H04 still violates effective-command legality |
| Open-window undo, closed-window reopening, related/unrelated authoring            | Independent H01 matrix, recovery and races pass                                                                            |
| Stage 80 combat, movement, attacks, spells, conditions and death saves            | Full combat suites rerun; original H02 repaired, H04 blocks the adjacent casting boundary                                  |
| Detect Magic and acquisition through immediate/suspended completion               | Independent radius/completion matrix, gridless control and authenticated knowledge/memory reads pass                       |
| Adjacent stat-block authoring and negative examination/sensing premises           | Independent authoring/repeat-discovery cases and new deterministic/randomized suites pass in exercised cases               |
| Prior Gate 01/02 scope, permission, context, memory and contradiction regressions | Full unit/integration suites rerun; no additional regression observed in those tests                                       |

Future surfaces remain **NOT YET IN SCOPE**, not passed:

| Surface                                                                                          | Introduction / next review                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI contexts, proposals, authoring validation, confirmation, continuity, provenance and safe undo | Stages 100–120 / Gate 04                                                                                                                          |
| Runtime NPC dialogue/actions and supplied-context isolation                                      | Stage 130 / Gate 04                                                                                                                               |
| Relevance ranking                                                                                | Stage 140 / Gate 05 integration                                                                                                                   |
| Asset identity, metadata, lineage and historical visual state                                    | Stages 150–160 / Gate 05                                                                                                                          |
| Chronicle/flashback retrieval                                                                    | Stage 170 / Gate 05                                                                                                                               |
| Complete backend Ravenford integration                                                           | Stage 180 / Gate 05, reviewed at Stage 190                                                                                                        |
| Real UI consumers, stale action/reaction prompts and perspective changes                         | Stages 200–230, combat UX at 220 / introducing-stage boundary/E2E regressions and Stage 250 release evidence; reopen affected gates when required |
| Other/monster reactions, chains, out-of-combat windows and timers                                | Unscheduled ADR 0016 exclusions / first gate after introduction                                                                                   |
| Production authentication                                                                        | Its own ADR before deployment / Gate 05 at the latest, per handoff                                                                                |

## Final summary

- **Original repros:** G03-H01, G03-H02 and G03-H03 now pass their independent checks. G03-H02's broader premise family remains incomplete, recorded separately as G03-H04.
- **New findings:** 0 Critical, **1 High**, 0 Medium, 0 Low.
- **Exact blocker:** **G03-H04**; no owner-approved disposition accepts it.
- **Invariants exercised:** 1, 4–6, 7–12, 13 and 20 through the current gate and prior regression suites. The new finding violates 1 and 12.
- **Residual risk:** Finite tests do not exhaust mixed encounter/non-encounter activity. Structural validation and replay equality both miss the demonstrated orphaned spell target; the effective-command oracle detects it only when the scenario is generated.

Return to Opus/MAX remediation with a failing regression first, then a new Astra/MAX retest request targeting `reviews/ASTRA_GATE_03_RETEST_2.md`. Preserve both this report and the initial report. **Stage 100 remains blocked.** No fixes or later-stage implementation were performed; review stops here.

FAIL
