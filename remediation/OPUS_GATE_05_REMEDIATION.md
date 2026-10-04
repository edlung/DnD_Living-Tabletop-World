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

---

# Remediation for Retest 2 (after `reviews/ASTRA_GATE_05_RETEST_1.md`)

- Astra report: `reviews/ASTRA_GATE_05_RETEST_1.md` (FAIL: G05-H02 High), with its evidence under `reviews/evidence/gate-05/retest-1/` (committed unmodified in `0c81bc8`). G05-H01 and G05-M01 were confirmed closed for the reported failures.
- Retest number / required output path: 2 — `reviews/ASTRA_GATE_05_RETEST_2.md`
- Revision before remediation: `a488de462ff5e4fa6f1513a831f38e63291e3c2a` (reviewed code; `b086622` added only the report, the request, and the README line)
- Revision after remediation: `a85b6f87f1dbd5ed8287e294acc6d18b191e5904` (the genuine earlier-writer histories went in first, in `a89a2d5`)
- Builder: Claude Opus 5.5, MAX (High remediation per `EFFORT_MATRIX.md`)
- Status: AWAITING_ASTRA_RETEST

## G05-H02 — Chronicle permits undo of a cited examination that wrote no facts

- **Severity:** High
- **Violated invariants:** 11 (every canonical mutation is auditable) and 12 (world history is reconstructable); ADR 0006 §8 and ADR 0024 §4–5.
- **Root cause:**
  - Undo protects facts only: undo of _C_ is refused while a later standing command reads or writes a fact _C_ wrote (ADR 0007). A chapter protected each event it told through the facts that event wrote.
  - What a chapter cites is the occurrence itself, an event at a command's index (ADR 0024 §4), not what the event changed. An inspection that rolls nothing and finds nothing new writes no fact, so the chapter rested on nothing its undo would change.
  - The kernel had no fact for "this command stands", so no footprint could state the dependency. The G05-H01 remediation added the chapter's premises (names, records, membership, holder), not the cited occurrence.
- **Regression tests added first** (each failed on `a488de4`):
  - `packages/domain/src/chronicle/gate05-h02.test.ts`, `chronicle_protects_cited_occurrences_without_fact_writes`:
    - **The review's two modes:** a repeated inspection, and a first inspection of an item with no clue. Each examination is first shown to write no fact. Undo is refused (`UNDO_UNSAFE`, the chapter its only blocker) and changes nothing: state and history are equal, and the entry still resolves its source. A fresh engine on the same store reloads the same state and refuses again. The chapter, then the examination, are undone. Integrity, the oracle, and replay from stored JSON hold throughout. On `a488de4` both undos were accepted.
    - **Uncited control:** an examination that changed nothing stays undoable beneath a DM chapter whose window starts after it and a party chapter told from memories. This passed before and after the fix.
    - **The general boundary:** for a DM, a party, and a character chapter, undoing the command behind every source the chapter resolves is refused naming the chapter (or is not undoable at all), and nothing changes. The recorded `rests` hold the standing of every command an entry tells. On `a488de4` the DM case failed; the party and character cases passed, since memories and records were already protected.
    - **Random walk:** examinations, DM and party chapters, time, and undos over 6 seeds. Every entry of every standing chapter must keep resolving exactly the sources it resolved when told. Five seeds failed on `a488de4`.
  - `apps/server/src/world-engine/gate05-regressions.integration.test.ts`: the review's recipe over the authenticated HTTP app on PostgreSQL, for both modes. It checks:
    - the refusal (422, naming the chapter);
    - no change, with the entry's source still in the DM view;
    - a restart, then the player's 403, the outsider's 404, and the refusal again;
    - chapter-first recovery, the oracle, replay, and integrity.

    It also runs the uncited control. Both modes returned 200 on `a488de4`.
- **Fix:**
  - **A command's standing is a fact** (`packages/domain/src/kernel/fact-keys.ts`, `facts.command`): `command:<commandId>`.
    - Every command writes its own standing, and only its undo changes it.
    - `decide/undo.ts` counts it among the facts the target wrote, so a later standing record that reads it blocks the undo, whatever else the target changed.
    - Event footprints and `CommandUndone`'s restore footprint are unchanged.
  - **A chapter rests on the occurrences it tells** (`packages/domain/src/chronicle/entries.ts`, `standingOf`). Its `rests` hold the standing of the command behind every event entry. That standing is taken from the stored entry's own source, the field views resolve. Memory entries already rest on their memory, and quoted knowledge on its record.
  - **Integrity** (`chronicle/integrity.ts`): a standing chapter tells only events whose command still stands, besides memories and knowledge that exist.
  - **Earlier-writer compatibility.** `ChronicleGenerated` moves to version 4 (`event-versions.ts`); versions 2 and 3 are read alike.
    - Version 3 chapters, recorded by the retest 1 writer, become earlier-writer commands (ADR 0006 retest 3 amendment). Undo beneath them is refused, the oracle folds them as recorded, and they read and display exactly as stored.
    - No stored event is rewritten.
    - Before the change, revision `a488de4` itself wrote two histories (`a89a2d5`; recipe in `fixtures/history/WRITERS.md`):
      - `a488de4-cited-examinations.json`: a version 3 DM chapter telling both kinds of examination without resting on them, then one more inspection;
      - `a488de4-cited-examination-undone.json`: the same, then the undo of the told repeated inspection, which that revision accepted.
    - `packages/combat/src/chronicle-occurrence-history.test.ts` and `apps/server/src/world-engine/chronicle-history.integration.test.ts` test both histories. They cover:
      - loading and replaying every prefix;
      - the chapter read exactly as stored, with every source;
      - each told examination's undo refused, across a restart;
      - the later inspection still undoable;
      - chapter-first recovery;
      - new version 4 chapters protecting what they tell.

      On the second history: the entry shows no source, integrity names it, and `undoneBeneathEarlierWriters` names the undo. Further undo beneath the chapter is refused, and undoing the chapter recovers.
  - ADR 0024 and ADR 0007 amendments; kernel and Chronicle AGENTS rules; fixture rows.
- **Why this fixes the boundary rather than only the symptom:**
  - Protection no longer depends on what a told event changed. Every event entry rests on its command's standing, whatever type the salience table tells now or later. The standing comes from the source the views resolve. Examinations are not special-cased, and nothing is suppressed.
  - The undo rule stays generic: a record that cites a command reads its standing, and undo writes it. The kernel AGENTS now requires this of any record that cites commands.
  - The general test checks every kind of source (memory, knowledge, and event) for every perspective.
  - Integrity now detects an entry left without its source, so the class stays visible in histories that predate the fix.
- **Validation evidence:** the regression files above pass. Each of these mutation checks, injected alone, was detected:
  - chapters resting on no told command's standing;
  - undo not counting the target's standing;
  - standing only for told examinations (caught by the general boundary test);
  - no version bump (the genuine-history tests fail);
  - integrity ignoring told commands that left canon.

  The review's recipe `reviews/evidence/gate-05/retest-1/SOURCE_OCCURRENCE_PROBES.md` was run against the fix with its output redirected to a scratch file. It first stops at its expectation that a new chapter is version 3; it is now 4. With only that expectation changed to 4, it stops at the source undo: HTTP 422 `UNDO_UNSAFE`, whose only blocker is the chapter (sequence 111).

- **For the reviewer:**
  - In a history where the retest 1 writer already accepted such an undo, the re-decision oracle folds the version 3 chapter as recorded and reports nothing. Integrity and the earlier-writers audit report it. That audit keeps naming the undo after recovery, since the undo did reach beneath a standing earlier chapter. Only reviewers' throwaway databases are known to hold such a history.
  - The `a488de4` writer was first run without the undo step. That output was discarded before commit; both committed files come from one run of the script in `WRITERS.md`.

## Full Validation (revision `a85b6f8`)

| Command                                                                            | Result                                                                                                   |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm validate:ci-local` on `a85b6f8` (`NODE_ENV=test`, docker-compose PostgreSQL) | PASS (exit 0)                                                                                            |
| Frozen install, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`                 | PASS                                                                                                     |
| Context budget                                                                     | PASS: 473 files, none over the limits                                                                    |
| `pnpm test` (unit)                                                                 | PASS: 150 files, 1505 tests (17 more than at retest 1)                                                   |
| `pnpm build`, `pnpm db:migrate` ×2, `pnpm seed:ravenford` ×2                       | PASS                                                                                                     |
| `pnpm test:integration` (PostgreSQL)                                               | PASS: 20 files, 77 tests (5 more), including `gate05-regressions` and `chronicle-history` with a restart |
| Mutation checks (5 injected defects, one at a time)                                | 5 detected                                                                                               |

## Deferred Findings

None. G05-H02 is remediated; it had no owner-approved disposition.

## Retest Request

Astra:

- Independently retest G05-H02 and its adjacent paths:
  - undo beneath a standing chapter of any command whose event it tells, whatever that command changed;
  - uncited examinations that changed nothing;
  - every kind of source, for every perspective;
  - refusal naming the chapter, atomicity, restart, chapter-first recovery, re-decision, and integrity;
  - both `a488de4` histories, and the `e9c05ad` chapters.
- Recheck that G05-H01 and G05-M01 remain closed, and that what held at retest 1 still holds, since `ChronicleGenerated` changed version again and undo now counts the target's standing.
- Write `reviews/ASTRA_GATE_05_RETEST_2.md` using `ASTRA_REVIEW.md`. The handoff `handoffs/ASTRA_GATE_05_REQUEST.md` is updated to retest 2 with this output path.
- Preserve every earlier report and its evidence. Do not rely on this report's claim that a fix is correct.

## Hard Stop

Opus stops here. Stage 200 does not begin until Astra writes PASS and the owner authorizes it.
