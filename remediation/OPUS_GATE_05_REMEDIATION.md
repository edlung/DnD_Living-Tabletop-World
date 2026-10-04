# Opus Gate Remediation Report

- Gate: #5 — Full Ravenford Red Team (the review activity called Stage 190)
- Astra report: `reviews/ASTRA_GATE_05_REPORT.md` (FAIL: G05-H01 High, G05-M01 Medium), with its evidence under `reviews/evidence/gate-05/` (committed unmodified in `383a66d`)
- Retest number / required output path: 1 — `reviews/ASTRA_GATE_05_RETEST_1.md`
- Revision before remediation: `e9c05ad46c15863b124b20fc4dd217f654f29777` (reviewed code; `33d1c97` added only the completion report and the request)
- Revision after remediation: `a488de462ff5e4fa6f1513a831f38e63291e3c2a` (the genuine earlier-writer history went in first, in `0359f30`)
- Builder: Claude Opus 5.5, MAX (High remediation per `EFFORT_MATRIX.md`)
- Status: AWAITING_ASTRA_RETEST

Both findings reproduce as reported. They share a root: a derived record or projection used facts its dependency bookkeeping did not see.

- **G05-H01:** the chapter's names were not in its `rests`.
- **G05-M01:** the quest asked the present state about the past.

Each finding's regression tests were written first and failed on the reviewed code.

## Finding Remediation

### G05-H01 — Chronicle allows undo beneath names its recorded entries depend on

- **Severity:** High
- **Violated invariant:** 11 (every canonical mutation is auditable) and 12 (world history is reconstructable); ADR 0006 §8 and ADR 0024 §4.
- **Root cause:** A chapter's entries and prose are derived from more than the records and events they cite. The derivation also uses:
  - the current names of every participant and place, in the DM's entry words and in what the prose renderer is given for every entry;
  - the statements of the records entries quote;
  - the party membership that selects a member's move into the DM chapter;
  - the perspective holder: its existence, and for a character, whether it is in the party, which decides whether PARTY records are visible.

  `ChronicleGenerated.rests` held only what the told events wrote, plus the told memories and records. The undo rule reads footprints only, so it never saw the names or the other premises. A rename beneath a standing chapter was accepted, and the re-decision of `GenerateChronicle` then diverged. The same gap affected every named event family and the names behind a party chapter's prose, not only the two the review showed.

- **Regression tests added first:**
  - `packages/domain/src/chronicle/gate05-h01.test.ts`, `chronicle_protects_generated_name_dependencies`. It covers:
    - a character's name and a location's name in the DM chapter;
    - the names behind an examination, a new NPC, a death, and an answer;
    - the names a party chapter's prose was rendered from, while a name used by no entry stays free;
    - the membership that put a member's move in the chapter;
    - the holder premises of a character's own chapter.

    Each case requires that undoing the premise is refused (`UNDO_UNSAFE`, naming `GenerateChronicle`). Then a fresh engine on the same store reloads identical state, and explicit reverse recovery (the chapter, then the rename) is accepted. The oracle, replay, and integrity hold throughout.

    Five cases failed on the reviewed code: four with the undo accepted, one with the holder premises missing. The membership case was added during the mutation run below and fails without the fix.

  - `apps/server/src/world-engine/gate05-regressions.integration.test.ts`: the review's recipe, over the authenticated HTTP app on PostgreSQL, with a restart, for Elowen and the Market Square. On the reviewed code both cases failed: the undo returned 200 instead of 422.
- **Fix:**
  - `packages/domain/src/chronicle/entries.ts`: the chapter's `rests` now also hold `premisesOf` every kept entry:
    - the profile of each participant and place;
    - the records it quotes;
    - for a party member's move, `roster:character`.

    They also hold `perspectivePremises`: the holder's existence, and for a character, its roster membership.

  - `salience.ts`: a new NPC is told by its current name, like every other entry, and so rests on it.
  - **Earlier-writer compatibility.** `ChronicleGenerated` moves to version 3 (`event-versions.ts`); version 2 is read alike.
    - Chapters already recorded by the Stages 170–180 writer are earlier-writer commands. Under the owner's rule (ADR 0006 retest 3 amendment), undo beneath them is refused, the oracle folds them as recorded, and they read and display exactly as stored.
    - No stored event is rewritten.
    - A genuine version 2 history written by revision `e9c05ad` itself was added before the change: `fixtures/history/e9c05ad-chronicle-names.json`, recipe in `WRITERS.md`. It is tested by `packages/combat/src/chronicle-history.test.ts` and `apps/server/src/world-engine/chronicle-history.integration.test.ts`. Those tests cover loading, replaying every prefix, refused undo beneath both chapters across a restart, reverse recovery, and new version 3 chapters protecting their names.
  - ADR 0024 and ADR 0007 amendments; kernel and Chronicle AGENTS rules.
- **Why this fixes the boundary rather than only the symptom:**
  - The dependency is recorded where entries are derived. Every input of entry selection, words, and prose rendering joins the chapter's footprint, and the kernel's generic, footprint-based undo then protects it.
  - There is no rename-specific check. Any undo that would remove or change a premise is refused while the chapter stands: a rename, a record, a membership, or a holder.
  - The re-decision oracle reproduces every standing chapter.
  - Old chapters fall under the established earlier-writer contract instead of being rewritten.
- **Validation evidence:** the regression files above pass. Mutation checks, each injected alone, were detected:
  - no premises at all;
  - names only for the DM's event entries;
  - no perspective premises;
  - no membership premise;
  - no version bump (the genuine-history tests fail);
  - a new NPC told by its first name.

### G05-M01 — Later evidence movement rewrites an earlier quest milestone

- **Severity:** Medium
- **Violated invariant:** 12 (world history is reconstructable); ADR 0025 §2.
- **Root cause:** `questFor` walked the effective history but evaluated each milestone condition against the present state. Three conditions were read that way:
  - the examined thing's current placement, which is the reported defect;
  - the party's current roster;
  - the current records' subjects.

  A later move, or a later membership, therefore changed which past events counted.

- **Regression tests added first:**
  - `packages/domain/src/quest/gate05-m01.test.ts`, `quest_examination_uses_location_when_examined`:
    - an examination at the site, then the evidence moved away, at a later world time and later within the same one;
    - an examination in town, then the evidence moved to the site, in both timings;
    - restart parity (a fresh engine on the same store);
    - undoing the move changes nothing, while undoing the examination removes the milestone.

    Both cases failed on the reviewed code: the milestone disappeared, or appeared.

  - Adjacent predicate, found while reviewing: a character who reached the site before joining the party does not give the party that milestone; once a member, arriving again does.
  - `apps/server/src/world-engine/gate05-regressions.integration.test.ts`: the review's two modes over HTTP on PostgreSQL, with a restart, the undo of the move, and the PUBLIC and outsider controls. Both failed on the reviewed code.
- **Fix:** `packages/domain/src/quest/projection.ts` reads every condition from the effective history at the event that met it. It tracks placements, party membership (`CharacterAssigned`), and record subjects in sequence order, so same-time ordering is the history's own. Only location nesting stays a present-state lookup: it is timeless (ADR 0006 §3). ADR 0025 amendment; quest AGENTS rule.
- **Why this fixes the boundary rather than only the symptom:**
  - The projection no longer consults the present state for any past condition, so no later command can rewrite an earlier milestone, whether it moves evidence, people, or anything else the predicates read.
  - Undoing a cause still removes what it caused, because only effective events are read.
- **Validation evidence:** the regression files above pass. Mutation checks were detected:
  - the examination placed where the evidence is now;
  - the party's members as they are now.

  Reading record subjects from the present state is an equivalent mutation: records never change, and a record a memory cites cannot be undone beneath it.

## Full Validation

| Command                                                                            | Result                                                                           |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm validate:ci-local` on `a488de4` (`NODE_ENV=test`, docker-compose PostgreSQL) | PASS (exit 0)                                                                    |
| Frozen install, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`                 | PASS                                                                             |
| Context budget                                                                     | PASS: 470 files, none over the limits                                            |
| `pnpm test` (unit)                                                                 | PASS: 148 files, 1488 tests (12 more than at review)                             |
| `pnpm build`, `pnpm db:migrate` ×2, `pnpm seed:ravenford` ×2                       | PASS                                                                             |
| `pnpm test:integration` (PostgreSQL)                                               | PASS: 20 files, 72 tests, including `gate05-regressions` and `chronicle-history` |
| Mutation checks (8 injected defects, one at a time)                                | 8 detected                                                                       |

## Deferred Findings

None. Both findings are remediated; neither had an owner-approved disposition.

## Retest Request

Astra: independently retest G05-H01 and G05-M01 and their adjacent attack paths. Write `reviews/ASTRA_GATE_05_RETEST_1.md` using `ASTRA_REVIEW.md`. The handoff `handoffs/ASTRA_GATE_05_REQUEST.md` is updated with review type RETEST and this output path. Preserve earlier reports. Do not rely on this report's claim that a fix is correct.

## Hard Stop

Opus stops here. Stage 200 does not begin until Astra writes PASS and the owner authorizes it.
