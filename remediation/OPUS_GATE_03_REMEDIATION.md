# Opus Gate Remediation Report

- Gate: #3 — Reaction Integrity
- Astra report: `reviews/ASTRA_GATE_03_REPORT.md` (FAIL: G03-H01 High, G03-H02 High, G03-H03 High)
- Retest number / required output path: 1 — `reviews/ASTRA_GATE_03_RETEST_1.md`
- Revision before remediation: `429e2a273ef17a304c09d62965cc60b6cf3be7ad` (reviewed code)
- Revision after remediation: `88d8137401451dd6a6d6703217bf53e273a2ede4`
- Builder: Claude Opus 5.5, MAX (Critical/High remediation per `EFFORT_MATRIX.md`)
- Status: AWAITING_ASTRA_RETEST

## Finding Remediation

### G03-H01 — Undo reopens a reaction window after a combatant mutation that the pause would forbid

- **Severity:** High
- **Violated invariant:** 1, 10, 12; ADR 0016 §1 and §3; ADR 0006 §8.
- **Root cause:**
  - The pause rule applied only to commands decided while a window was open.
  - A command accepted while no window was open (a status, sheet, or clock change) did not record that it relied on the window being closed.
  - Undo applied only the generic footprint rule. Undoing the command that closed a window therefore reopened it in front of later commands that the pause would have refused. Nothing checked that a reopened window's suspended spell could still resolve.
- **Regression tests added first** (all failed on `429e2a2`):
  - `packages/combat/src/gate03-regressions.test.ts`, `G03-H01 undo_closing_response_rejects_intervening_combatant_mutation`:
    - a countered window, then the caster dies;
    - a window that let the spell through, then a sheet edit (Incapacitated);
    - the reviewer's adjacent case: a character's suspended Detect Magic, countered, then the caster Incapacitated;
    - time advanced after the window closed.

    Each undo is rejected atomically (stream version unchanged) and names the blocker; the PostgreSQL suite checks that the list holds exactly that blocker. Unrelated knowledge does not block. Explicit reverse-order recovery reopens a window that completes normally, and every history replays and re-decides identically.

  - `apps/server/src/world-engine/gate03-regressions.integration.test.ts`: both closure kinds on PostgreSQL. The rejection holds after a restart with a fresh engine (HTTP 422, the blocker named, version unchanged); recovery and the DM's close complete; replay, integrity, window legality, and the re-decision oracle are checked from the database.
  - `apps/server/src/http/gate03-regressions.test.ts`: the reviewer's HTTP reproduction on the in-memory engine.
- **Fix:**
  - `packages/domain/src/combat/reaction-undo.ts` (`reopeningBlockers`), called by `decideUndo`. Undoing a command that resolved a window is rejected while any later, still-effective command wrote a fact the window depends on. Those facts are exactly what the window's opening read, the same set the pause rule uses. The blockers are listed, and undone commands and compensations are ignored.
  - `packages/combat/src/reactions/invariants.ts` (`reactionWindowViolations`): an open window's suspended spell must still be legal and every pending candidate must still be able to react. It shares `replanSuspended` with the completion code, so the invariant and the resolution cannot diverge. It runs in every reaction suite's `verifyHistory` and after every step of the randomized test.
- **Why this fixes the boundary rather than the symptom:**
  - Reopening and pausing now use one dependency set.
  - A window can return only to a world in which every later command would still have passed the pause. Every combat command writes the encounter, which is in that set, so later combat also blocks.
  - The randomized suite now tries undoing each of the latest commands on a copy of the world (`testing/fork.ts`) and re-decides whatever undo accepts. It detects this defect on its own if the rule is removed.
- **Validation evidence:** all tests above pass. Removing the rule is detected by the unit regressions, the PostgreSQL regressions, and the randomized suite.

### G03-H02 — A missed attack omits the target's defense from undo dependencies

- **Severity:** High
- **Violated invariant:** 1, 12; ADR 0006 §8; ADR 0007 (every decision premise recorded).
- **Root cause:**
  - Combat decisions recorded only the acting character's own sheet. What resolution read about other combatants was in no footprint:
    - the target's Armor Class, conditions, status, and saving throws;
    - who is alive, for occupancy and turn order;
    - a creature's own stat block.
  - Only writes, such as damage, blocked undo, so results that changed nothing left their inputs unprotected. Examples: a miss, a successful save without damage, a turn passing over the dead.
- **Regression tests added first** (all failed on `429e2a2`):
  - `packages/combat/src/gate03-regressions.test.ts`, `G03-H02 missed_attack_blocks_undo_of_target_defense`:
    - an Armor Class 30 miss, recovered by undoing the attack first;
    - a target-condition variant (Prone);
    - a target-status variant (a Raider revived by the DM, then attacked);
    - turn order passing over a combatant the DM killed.

    The re-decision oracle agrees after every accepted undo.

  - Outside combat, in the same file: a Hunter's Mark on an NPC the DM had revived blocks undoing the revival.
  - PostgreSQL: the Armor Class case stays blocked after a restart and recovers in reverse order (`gate03-regressions.integration.test.ts`).
- **Fix:**
  - New premise kind `vitals`: a creature's status, sheet, and stat block (`domain/investigation/events.ts`; facts in `kernel/facts.ts`).
  - `combatPremiseList` (`packages/combat/src/refusal.ts`) records `vitals` for every combatant in every combat decision: attacks, casts (suspended casts and their completion included), moves, turn ends, and reaction answers.
  - Outside combat, a spell records its target's `vitals`.
  - The premise limit per event rose to 512.
- **Why this fixes the boundary rather than the symptom:**
  - Every combat resolution may read any combatant (targets, areas, occupancy, turn order, saves), so every combat decision now depends on all of them. Combat unwinds strictly in reverse order, DM edits of combatants included.
  - This closes the whole class for saving throws, conditions, turn selection, and creature decisions, which the reviewer listed as audit targets. A single target path is not special-cased.
- **Adjacent audit:** the same missing-premise class turned up in two more places, both fixed (see "Adjacent findings" below).
- **Validation evidence:** all tests above pass. Removing the premises is detected by the unit regressions, the PostgreSQL regressions, and the randomized suite.

### G03-H03 — Detect Magic discloses clues outside its 30-ft combat radius

- **Severity:** High
- **Violated invariant:** 5, 9; ADR 0011 and ADR 0015 §3.
- **Root cause:** Detect Magic applied room-level perception only. The approved 30-ft radius in combat was never applied, and both the immediate and the suspended path used the same helper.
- **Owner decision** (2026-10-04, ADR 0015 amendment): entities without a battlefield square have no measurable distance, so they are not sensed during combat. After combat ends, Detect Magic senses the room as before.
- **Regression tests added first** (the out-of-range cases failed on `429e2a2`; the 30-ft cases are positive controls):
  - `packages/combat/src/gate03-regressions.test.ts`, `G03-H03 detect_magic_discloses_only_within_30_feet_in_combat`:
    - cast at once at 30, 35, and 50 ft;
    - suspended, then declined by the candidate or closed by the DM, at 30 and 50 ft;
    - an item with no square, not sensed in combat but sensed after it.

    Knowledge and discovery memories are both checked.

  - Player reads (`knowledge` for PLAYER and PARTY, and `memories` for PLAYER) never contain the far clue and do contain the near one: over HTTP (`apps/server/src/http/gate03-regressions.test.ts`) and on PostgreSQL after a restart (`gate03-regressions.integration.test.ts`), for both cast paths.
- **Fix:**
  - `magicDiscoveryEvents` takes a `sensed` predicate (`domain/investigation/reveal.ts`).
  - In combat, `castEvents` passes "a combatant within `DETECT_MAGIC_RADIUS_FT` (30) of the caster" (`packages/combat/src/spells.ts`; the constant is in `packages/rules/src/catalog.ts`).
  - The suspended path resolves through the same `castEvents`.
- **Why this fixes the boundary rather than the symptom:**
  - Evidence, claims, and memories are created only after the spatial rule, in the one helper both paths use.
  - The randomized suite now starts with magic on every goblin and asserts after every step that each magic clue sensed in combat lies within 30 ft. Removing the radius is detected.
- **Validation evidence:** all tests above pass.

## Adjacent findings (found by Opus while auditing the H02 class)

### A1 — Stat block authoring did not depend on the encounter

- **Defect:** `SetStatBlock` is refused for a combatant, but its event did not read the encounter. Undoing an `EndCombat` could therefore strand a stat block authored after it.
- **Test:** `gate03-regressions.test.ts`, "a stat block set after combat ended blocks undoing the end". It failed before the fix.
- **Fix:** `StatBlockSet` reads the encounter (`kernel/facts.ts`).

### A2 — Results that found nothing did not record why

- **Defect** (since Stages 60 and 80):
  - An inspection that passed over a clue its scope had already found did not record that discovery. Undoing the earlier discovery left the later inspection deciding differently under current canon.
  - Detect Magic results that found nothing had the same gap for:
    - the clues already found;
    - where the caster stood;
    - where the unreached magic-bearing entities were.
- **Tests** (failed before the fix):
  - `packages/domain/src/investigation/negative-premises.test.ts`;
  - `gate03-regressions.test.ts`, "adjacent audit: Detect Magic that found nothing still depends on why" (a moved item, a moved caster, a repeat cast).
- **Fix:**
  - New premise kinds `revealed` (a clue the scope had found) and `placement` (where an entity was).
  - `ExamineEntity` records the clues it passed over.
  - `magicSensingPremises` (`reveal.ts`) records Detect Magic's sensing premises: the caster's position, party membership, found clues, and unreached entities' placements.
- **Strengthened coverage:**
  - The Gate 02 randomized suite (`premises.property.test.ts`) now seeds clues and inspects mostly where the character stands.
  - It runs the same what-if undo check with the re-decision oracle, and detects the inspection defect on its own if the fix is removed.
- **Scope note:** `ExamineEntity` is a Gate 02 surface. The fix only records more premises, so more undos are rejected. Legality, results, and every player-visible output are unchanged.

## Full Validation

| Command                                                                                                                                         | Result                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm validate:ci-local` (format, lint, typecheck, budget, unit, clean build, migrate ×2, seed ×2, integration)                                 | PASS on `88d8137`                                                                                                                                                                                                                                                    |
| `pnpm test`                                                                                                                                     | PASS — 76 files, 887 tests (Gate 01/02/03 regressions, randomized suites with the re-decision oracle)                                                                                                                                                                |
| `pnpm test:integration`                                                                                                                         | PASS — 9 files, 36 tests (includes `gate03-regressions.integration.test.ts`)                                                                                                                                                                                         |
| `pnpm context-budget`                                                                                                                           | PASS — 263 active files, 0 over 500 lines, 0 over 700                                                                                                                                                                                                                |
| Fresh volume: `pnpm db:migrate` ×2, `pnpm seed:ravenford` ×2                                                                                    | PASS — 91 commands, version 100, 25 entities; the second runs change nothing                                                                                                                                                                                         |
| Live server on PostgreSQL (crypto dice), over HTTP, at `88d8137`                                                                                | PASS: undoing a Counterspell answer after a DM kill is refused, naming the kill; reverse order reopens a window that resolves. Detect Magic in combat leaves a 50-ft clue out of the player's knowledge and memories. The database was then reset and reseeded clean |
| Mutation checks: the 17 Stage 90 reaction defects, plus the 7 fixes of this remediation, each removed one at a time against the full unit suite | All 24 detected. The out-of-combat target premise was detected once its regression test was added                                                                                                                                                                    |

## Deferred Findings

None.

## Retest Request

Astra: independently retest G03-H01, G03-H02, and G03-H03 and their adjacent attack paths, including the adjacent findings above. Write `reviews/ASTRA_GATE_03_RETEST_1.md`. The handoff `handoffs/ASTRA_GATE_03_REQUEST.md` is updated to review type RETEST with this output path. Preserve `reviews/ASTRA_GATE_03_REPORT.md`. Do not rely on this report's claim that a fix is correct.

## Hard Stop

Opus stops here. Do not begin Stage 100 until Astra writes PASS.
