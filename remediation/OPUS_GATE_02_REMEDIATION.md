# Opus Gate Remediation Report

- Gate: #2 — Contradiction / Knowledge Integrity
- Astra report: `reviews/ASTRA_GATE_02_REPORT.md` (FAIL: G02-H01 High, G02-H02 High)
- Retest number / required output path: 1 — `reviews/ASTRA_GATE_02_RETEST_1.md`
- Revision before remediation: `781dc750cafbd5fa6ec4d3168be6091c1c823ae8` (reviewed code)
- Revision after remediation: `757db1066fc4b8fd14e26244c1e63adbdd0aa281`
- Builder: Claude Opus 5.5, MAX (Critical/High remediation per `EFFORT_MATRIX.md`)
- Status: AWAITING_ASTRA_RETEST

## Finding Remediation

### G02-H01 — Hidden location ancestry influences scoped memory results

- **Severity:** High
- **Violated invariant:** 5 (No knowledge leakage); ADR 0008 uniform absence; the indirect-location retrieval obligation of GATE_COVERAGE row 30.
- **Root cause:**
  - The memory location filter walked the canonical parent chain (`isWithinLocation`) for any location ID a caller supplied.
  - Scoping the memories first did not protect the location graph consulted afterwards.
  - No rule defined which containment a non-DM perspective may use.
- **Owner decision:** ADR 0010 amendment, approved by the owner on 2026-10-03 ("known chain").
  - Non-DM perspectives nest only through chains of locations they know. A hidden target or a hidden link in the chain behaves exactly like a nonexistent location.
  - Containment between two known places counts as known geography. A place whose whereabouts must stay secret stays unknown (ADR 0008).
  - The DM keeps all containment.
- **Regression tests added first** (all failed on `781dc75` before the fix):
  - `packages/domain/src/memory/location-filter.test.ts`, `recall_hidden_parent_matches_absent_without_disclosing_containment`:
    - For PUBLIC, PARTY, PLAYER, and `NPC:mira-vale`, hidden and nonexistent targets answer identically: totals, IDs, scores, and order.
    - A noninterference check across three worlds that differ only in inaccessible ancestry, including a hidden link above a known location.
    - Positive cases: party nesting Market Square ⊂ Ravenford, DM nesting, and nesting after the place becomes known.
  - `apps/server/src/http/gate02-regressions.test.ts`: the reviewer's HTTP reproduction (in-memory), with identical status and body, plus authorized nesting.
  - `apps/server/src/world-engine/gate02-regressions.integration.test.ts`: the same on PostgreSQL, before and after a reload with a fresh engine.
- **Fix:**
  - `knowledge/projection.ts` now holds `isWithinKnownLocation`, the only containment a non-DM read may use. It requires a known target and stops at the first unknown link.
  - `memory/retrieval.ts` builds a perspective-aware `locationMatcher` with it. The DM uses canonical containment.
- **Why this fixes the boundary rather than the symptom:**
  - Containment is now part of the perspective boundary, defined beside the other projection rules and justified by an owner-approved rule. It is not a special case in one route.
  - The randomized `memory/recall-noninterference.property.test.ts` holds two worlds that differ only in hidden data equal across every perspective-scoped read. That covers memory recall with location, entity, and text filters naming hidden IDs, knowledge lists, related records, entity knowledge, and known entities. It fails on 5 of 6 world pairs if the canonical walk is reinstated.
  - Audit of other player-facing reads that consult canonical structure:
    - Knowledge `about`, the memory entity and text filters, and context topics compare only visible data.
    - Perception (Context Engine) uses the current location's parent and children by approved design (ADR 0012); no other read walks canonical structure.
- **Validation evidence:** all of the above pass. Mutation checks: the canonical walk reinstated, or walking through unknown links, are each detected.

### G02-H02 — Undo misses the knowledge/memory prerequisite of player movement

- **Severity:** High
- **Violated invariant:** 1 (World Engine is authority: undo validation); 12 (reconstructable history under ADR 0006 §8 dependency-preserving undo).
- **Root cause:**
  - Player-command validation used a flattened "known" set, built from knowledge, memories, the holder itself, and party members, and discarded which premise made a target legal.
  - The accepted events' footprints therefore carried no knowledge or memory dependency, so undo could not see it.
  - The same omission affected:
    - the `AskAbout` topic;
    - `FormHypothesis` subjects;
    - the sheet that let a character speak (`AskAbout`);
    - the actor and party premises of `FormHypothesis`.
- **Regression tests added first** (all failed on `781dc75` before the fix):
  - `packages/domain/src/investigation/premises.test.ts`, `undo_sole_disclosure_is_blocked_after_enter_location`:
    - Knowledge and memory variants.
    - A rejected undo changes nothing and names exactly the move as blocker.
    - Undoing the move first allows the disclosure undo; the resulting state replays.
  - Adjacent premises in the same file: `AskAbout` topic, `AskAbout` sheet, `FormHypothesis` subject. Two precision cases must stay allowed: a redundant later record, and a record about a perceived place.
  - `apps/server/src/http/gate02-regressions.test.ts` and `apps/server/src/world-engine/gate02-regressions.integration.test.ts`: the reviewer's HTTP reproduction (in-memory; PostgreSQL before and after reload), both variants, reverse order.
- **Fix:**
  - `knowledge/projection.ts`: `knownEntityBases` returns, for each known entity, its earliest premise: self, party member, or the earliest visible record or memory naming it. `knownEntityIds` now derives from it, so known sets and premises cannot diverge.
  - Every accepted player command first records a DM-only, reads-only `PremisesRecorded` event (`investigation/acting.ts`: `target`, `knownPremise`, `premisesEvent`). Its footprint (`kernel/facts.ts`) reads each premise's facts:

    | Premise             | Facts read                                                                    |
    | ------------------- | ----------------------------------------------------------------------------- |
    | Perception          | Target existence and placement, and the actor's placement                     |
    | Knowledge or memory | The record, plus the actor's roster entry if it was visible through the party |
    | Sheet               | The actor's sheet                                                             |
    | Party               | The actor's roster entry                                                      |

  - Covered commands:
    - `EnterLocation`: the destination.
    - `AskAbout`: the sheet, the NPC, the topic, and the party.
    - `ExamineEntity`: the target, plus the sheet for checks.
    - `FormHypothesis`: subjects, plus the party when its scope or a cited record is PARTY.
- **Why this fixes the boundary rather than the symptom:**
  - The dependency is now recorded by the single path every player command uses to establish legality.
  - Undo needed no change: ADR 0006 §8 already blocks undo of anything a still-effective event read. A new player command or legality check inherits the rule (stated in `investigation/AGENTS.md`).
  - Only the premise actually used is recorded: perception first, else the earliest premise. Unrelated or redundant disclosures stay undoable, as the two precision tests check.
  - The randomized `investigation/premises.property.test.ts` (8 seeds) interleaves disclosures through knowledge and memories, moves, hypotheses, and random undos. After every step it asserts that no still-effective player command lost a premise and that every rejected undo changed nothing. It fails on 4 of 8 seeds if the premise reads are removed. `kernel/replay.test.ts` asserts the same invariant over its randomized sequences.
- **Validation evidence:** all of the above pass. Each of these mutations is detected:
  - no premise on `EnterLocation`
  - latest premise instead of earliest
  - knowledge premise not read
  - memory premise not read
  - knowledge preferred over perception
  - `AskAbout` without sheet premise
  - `AskAbout` without topic premise
  - `FormHypothesis` without subject premises

## Full Validation

Node 25.8.1, pnpm 11.11.0, PostgreSQL 18, revision `757db10`.

| Command                                                                                                                  | Result                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm validate:ci-local` (install, format, lint, typecheck, budget, unit, clean build, migrate ×2, seed ×2, integration) | PASS                                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm test`                                                                                                              | PASS — 55 files, 744 tests                                                                                                                                                                                                                                                                                                                                                |
| `pnpm test:integration`                                                                                                  | PASS — 6 files, 22 tests                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm context-budget`                                                                                                    | PASS — 190 active files, 0 over 500 lines                                                                                                                                                                                                                                                                                                                                 |
| Live built server on PostgreSQL, the reviewer's exact HTTP reproductions                                                 | **G02-H01:** hidden and nonexistent locations identical for PUBLIC, PARTY, PLAYER, and `NPC:mira-vale`; entity routes 404; DM nesting intact. **G02-H02 (knowledge variant):** blind move 422 `ENTITY_NOT_FOUND`; disclosure undo 422 `UNDO_UNSAFE`, blocker = the move; undo move, then disclosure: both accepted. The database was then reset and reseeded (version 92) |
| Mutation checks (10 defects injected one at a time)                                                                      | Each detected, then reverted                                                                                                                                                                                                                                                                                                                                              |

## Other changes in this remediation

- `packages/domain/src/memory/AGENTS.md` corrected a rule that predated Stage 60 (play now creates memories).
- ADR amendments:
  - 0010: owner-approved location containment.
  - 0013: premises.
  - 0007: the reads-only event.

## Deferred Findings

None.

## Retest Request

Astra:

- Independently retest G02-H01 and G02-H02 and their adjacent attack paths: other filters and IDs that could touch hidden structure, and other premises of player commands under undo.
- Rerun the Gate 02 surfaces affected by the change: memory, knowledge, context, investigation, and contradictions.
- Write `reviews/ASTRA_GATE_02_RETEST_1.md` using `ASTRA_REVIEW.md`. The updated handoff `handoffs/ASTRA_GATE_02_REQUEST.md` is a RETEST request naming this output.
- Preserve earlier reports, and do not rely on this report's claim that the fixes are correct.

## Hard Stop

Opus stops here. Do not begin Stage 80 until Astra writes PASS.
