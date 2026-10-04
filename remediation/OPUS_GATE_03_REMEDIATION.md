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

---

# Remediation for Retest 2 (after `reviews/ASTRA_GATE_03_RETEST_1.md`)

- Astra report: `reviews/ASTRA_GATE_03_RETEST_1.md` (FAIL: G03-H04 High). G03-H01, the original G03-H02 reproduction, and G03-H03 were confirmed closed.
- Retest number / required output path: 2 — `reviews/ASTRA_GATE_03_RETEST_2.md`
- Revision before remediation: `88d8137401451dd6a6d6703217bf53e273a2ede4`
- Revision after remediation: `b38cbbcb6dcf340a5ab207a3fb2f4a8dac9f2750` (fixes in `447e31f`; `b38cbbc` widens the isolation test)
- Builder: Claude Opus 5.5, MAX
- Status: AWAITING_ASTRA_RETEST

## G03-H04 — An unrelated active encounter removes target dependencies from out-of-encounter spells

- **Severity:** High
- **Violated invariant:** 1, 12; ADR 0006 §8; ADR 0007 (complete premises); ADR 0015's Gate 03 amendment.
- **Root cause:**
  - Two different tests decided "in combat":
    - the spell planner (`characterSpellPlan`), and therefore legality, asks whether the caster is a combatant;
    - `castEvents` and `combatPremiseList` asked only whether some encounter exists.
  - With a fight running that the caster was not in, legality was decided as outside combat, but the premises were recorded as if in combat:
    - the target's existence, status, and placement and the caster's own placement were dropped;
    - the unrelated fight's combatants were recorded instead.
- **Regression tests added first** (the failing cases failed on `88d8137`; the controls passed):
  - `packages/combat/src/gate03-h04-regressions.test.ts`, `outside_encounter_cast_retains_target_premises_during_another_fight`:
    - Hunter's Mark and Healing Word, each against undo of the target's creation, revival, and placement and of the caster's placement, with no fight and with a fight without the caster: 16 cases.
    - The caster in the fight: undo of the target's revival, for both spells.
    - Isolation, for Hunter's Mark, Healing Word, and Detect Magic: with everyone on the road and magic on the Shaman and a bystander, a fight the caster is not in yields exactly the premises and revealed clues of no fight.
    - Each undo case checks an atomic `UNDO_UNSAFE` naming the cast, reverse-order recovery, and replay, integrity, window legality, and re-decision.
    - Checked on a scratch worktree of `88d8137`: the 8 fight-without-caster cases, the 3 isolation cases, and the unreached-clue test below fail (12); the no-fight and caster-in-fight controls pass (10).
  - `apps/server/src/world-engine/gate03-regressions.integration.test.ts`, `G03-H04 on PostgreSQL`: both spells × creation, revival, and placement over HTTP. After a restart with a fresh engine, the rejection names the cast and leaves the version unchanged; reverse-order recovery works; the history is checked from the database. All 6 fail on `88d8137`.
- **Fix:** one participation test, the planner's own.
  - `castEvents` (`packages/combat/src/spells.ts`) treats a cast as in combat only when the plan has the caster's combatant record. Outside it, the cast records its target's `vitals` and perception, and with them the caster's placement, as with no fight.
  - `combatPremiseList` (`packages/combat/src/refusal.ts`) records combatants only for an actor that takes part in the encounter.
  - A dead check at the top of `decideCastSpell` that also tested only an encounter's existence (it could never trigger) is removed.
- **Audit of every other "in combat" decision:** all already use participation, and none needed a change:
  - the spell planner;
  - `onTurn` (moves, attacks, monster spells, turn ends; a monster outside the fight gets `NOT_IN_COMBAT`);
  - reaction answers (membership);
  - suspension and completion (the caster's record);
  - the pause rule;
  - Detect Magic's radius;
  - the Context Engine frame;
  - the encounter view.
- **Randomized coverage:**
  - `reactions/property.test.ts` now has Bram, a character on the road outside the fight. He casts Hunter's Mark and Healing Word at bystanders and goblins, and comes and goes, while the DM brings, moves, kills, and revives bystanders.
  - The what-if undo check covers the last 6 commands, and the suite runs 12 seeds.
  - The pause check is now an invariant: nothing accepted during a window, other than its answers, its close, and undo, wrote a fact the window depends on. It no longer relies on a list of command types.
  - On `88d8137` the new suite fails seeds 1337 and 3. With only the participation test in `castEvents` reverted, it still fails (seed 1337).

## Found by the strengthened randomized suite: Detect Magic did not record the clues it could not reach

- **Defect:** the first remediation's sensing premises recorded where each unreached magic-bearing entity was, but not that the cast had read the clue itself. Undoing the creation of such a clue changed which premises the cast would record, so re-decision diverged; the revealed results did not change.
- **Test:** `gate03-h04-regressions.test.ts`, "a clue it passed over, out of reach, cannot be taken back beneath it". It fails on `88d8137`. With the fix removed, the randomized suite also fails (seeds 3 and 13).
- **Fix:** premise `unreached` (the clue, its entity, and that entity's placement) replaces `placement` (`domain/investigation/reveal.ts`, `events.ts`, `evolve.ts`, `kernel/facts.ts`). The revealed results and every player-visible output are unchanged; only more undos are refused. ADR 0013 records it as a dated amendment.

## Validation (revision `b38cbbc`; Node 25.8.1, pnpm 11.11.0, PostgreSQL 18)

| Command                                                                                                                                                                                                                                       | Result                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm validate:ci-local` (format, lint, typecheck, budget, unit, clean build, migrate ×2, seed ×2, integration)                                                                                                                               | PASS on `b38cbbc`                                                                                                                                                                                                                                                                                                                                                                                            |
| `pnpm test`                                                                                                                                                                                                                                   | PASS — 77 files, 915 tests                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm test:integration`                                                                                                                                                                                                                       | PASS — 9 files, 42 tests (6 new: G03-H04 on PostgreSQL)                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm context-budget`                                                                                                                                                                                                                         | PASS — 264 active files, 0 over 500 lines, 0 over 700                                                                                                                                                                                                                                                                                                                                                        |
| Fresh volume: `pnpm db:migrate` ×2, `pnpm seed:ravenford` ×2                                                                                                                                                                                  | PASS — the migration applied once; 91 commands, version 100, 25 entities; the second runs change nothing                                                                                                                                                                                                                                                                                                     |
| A larger randomized campaign, run temporarily and then deleted: 80 combat seeds × 120 steps, 60 domain seeds                                                                                                                                  | Every integrity, replay, pause, range, undo-safety, and re-decision check passed in all 140 runs. Seed 1666 failed only the suite's coverage assertion that some window opened. A step trace shows the Shaman's one turn passed without its cast, so no window could open                                                                                                                                    |
| Live server on PostgreSQL (crypto dice), over HTTP, built from `447e31f` (`b38cbbc` changes only a test)                                                                                                                                      | PASS. A fight runs without Elowen, and the player sees no encounter. Hunter's Mark at a DM-created bystander: undoing the creation is refused, naming the cast; reverse order recovers. Detect Magic outside the fight leaves a market-square magic clue out of the player's knowledge: undoing the clue is refused, naming the cast; reverse order recovers. The database was then reset and reseeded clean |
| Mutation checks against the full unit suite, one at a time: the 17 Stage 90 defects, the 7 retest 1 fixes, and 3 for this remediation (each participation test, the clue in `unreached`), on the source of `447e31f` (unchanged in `b38cbbc`) | All 27 detected. The retest 1 "combatants' vitals" mutation was restated for the new code                                                                                                                                                                                                                                                                                                                    |

## Deferred Findings

None.

## Retest Request

Astra:

- Independently retest G03-H04 and its adjacent paths:
  - casting outside an encounter, with no fight and with a fight the caster is not in;
  - the premises and results of Hunter's Mark, Healing Word, and Detect Magic;
  - undo of target creation, revival, and placement, and of the caster's placement.
- Retest the unreached-clue premise found by the randomized suite.
- Recheck that G03-H01, G03-H02, and G03-H03 remain closed.
- Write `reviews/ASTRA_GATE_03_RETEST_2.md`. The handoff `handoffs/ASTRA_GATE_03_REQUEST.md` is updated to retest 2 with this output path.
- Preserve `reviews/ASTRA_GATE_03_REPORT.md`, `reviews/ASTRA_GATE_03_RETEST_1.md`, and their evidence. Do not rely on this report's claim that a fix is correct.

## Hard Stop

Opus stops here. Do not begin Stage 100 until Astra writes PASS.

---

# Remediation for Retest 3 (after `reviews/ASTRA_GATE_03_RETEST_2.md`)

- Astra report: `reviews/ASTRA_GATE_03_RETEST_2.md` (FAIL: G03-H05 High, G03-H06 High). G03-H01 to G03-H04 were confirmed closed.
- Retest number / required output path: 3 — `reviews/ASTRA_GATE_03_RETEST_3.md`
- Revision before remediation: `b38cbbcb6dcf340a5ab207a3fb2f4a8dac9f2750` (reviewed at `37523d1`, the same implementation)
- Revision after remediation: `e893497fef95e53ec54f4baa0a314a341d09515b`
- Builder: Claude Opus 5.5, MAX
- Owner decision: G03-H06, recorded as an amendment to ADR 0015 and ADR 0016 (2026-10-04)
- Status: AWAITING_ASTRA_RETEST

## G03-H05 — Replacing a stored premise variant makes legitimate previous-version campaigns unloadable

- **Severity:** High
- **Violated invariant:** 12; ADR 0006 (append-only reconstruction); ADR 0007 (upcasting on load).
- **Root cause:**
  - The retest 1 remediation replaced the `placement` premise with `unreached` in the one schema that both wrote and read `PremisesRecorded`, so events revision 88d8137 had stored could no longer be parsed.
  - The schema version was a single constant (1) for every type, and the parser knew only the current schema.
  - No test read history written by an earlier revision: every test wrote and read with the same code.
- **Regression tests added first** (failing before the fix):
  - **Fixture** `fixtures/history/88d8137-gate03-retest1.json`: the genuine rows revision 88d8137 stored through its own HTTP app and `PostgresEventStore` (178 events, 125 commands). Its writer script and steps are in `WRITERS.md`. The scenario after the seed:
    - the reviewer's case: a far charm at the North Gate, and Detect Magic recording a version 1 `placement` premise;
    - a cast the DM undid;
    - Hunter's Mark and Healing Word by Elowen outside a fight;
    - Detect Magic in combat, with `placement` for the Shaman;
    - a countered Ashen Bolt, an expired Binding Hex, and an undone `EndCombat`.
  - `packages/combat/src/gate03-h05-regressions.test.ts`, `retest1_placement_premise_survives_current_reader`. Four of its five tests failed with a `ZodError` at `placement`, and the fifth (the control) failed because version 1 was written. The tests check that:
    - every row parses, and the state at every recorded command is consistent (as-of reconstruction);
    - the current engine loads the stream, continues it, and the result verifies (DM authoring and a player cast; replay, integrity, window legality, re-decision);
    - undo beneath the old casts is refused, atomically;
    - every command the old writer added after the seed comes off in reverse order, and the stream then verifies;
    - a fresh-current control writes version 2 and protects the same facts.
  - `apps/server/src/world-engine/gate03-retest2-regressions.integration.test.ts`, on PostgreSQL. The rows are inserted exactly as stored. The player's encounter `GET` returned HTTP 500 before the fix. The test then checks:
    - a DM command is accepted, and the result holds after a restart;
    - undo beneath the old casts is refused and leaves the version unchanged;
    - a current cast is stored with `schema_version` 2;
    - the history verifies from the database.
- **Fix:** history is never edited, reset, or given clue IDs it did not contain.
  - **Per-type schema versions** (`packages/domain/src/kernel/event-versions.ts`):
    - Each type is written with its current version; `PremisesRecorded` is now version 2.
    - Every earlier version keeps a decoder.
    - `parseRecordedEvent` checks a payload against the version it was written with and decodes it into the current in-memory form. A version a type never had is refused.
  - **Premise vocabulary:** premises are written with `premiseSchema` and read with `recordedPremiseSchema`, which keeps the legacy `placement`.
  - **Meaning of `placement`:**
    - Its fold requires the entity to exist, as in 88d8137.
    - Its footprint reads the entity and where it was. The old event does not name the clues, so the footprint also reads the entity's clues as a whole: `ClueAdded` now writes `entity:<id>#clues`.
    - So undoing a clue beneath an old cast is `UNDO_UNSAFE`, as it is for current casts.
  - **Write guard:** the engine refuses to write a payload its type's current version cannot hold, so legacy variants are read-only.
  - **Re-decision oracle:** it folds as recorded every command an earlier writer decided (one of its events has an earlier version), and re-decides only what the current rules decided. Folded events must still apply.
  - Tests added with the fix, `packages/domain/src/kernel/event-versions.test.ts`:
    - version 1 is read with `placement` (written by 88d8137) or `unreached` (written by b38cbbc);
    - version 2 never holds `placement`;
    - versions a type was never written with are refused;
    - the engine refuses to write a legacy premise.
- **Found by the new randomized test on the old history:**
  - Narrative combat records (`SpellCast`, `HealingApplied`, …) require the creatures they name to exist when folded, but their footprints did not read them.
  - An old outside-the-fight Hunter's Mark, recorded by 88d8137 without its target's premises (the G03-H04 era), let undo remove its target. The record was stranded, and re-decision reported "SpellCast references a missing entity".
  - Fix: these records read every creature they name. `packages/domain/src/combat/named-entities.ts` is shared by the fold and the footprint, so the two cannot drift.
  - A deterministic test covers it on the old history: "undo cannot remove a creature an old record names, whatever its premises" (`gate03-h05-regressions.test.ts`).
- **Guards for the class:**
  - Kernel rules (`packages/domain/src/kernel/AGENTS.md`): a change that would reject or reinterpret stored events needs a new version and decoders, and, before the change, a history written by the previous revision in `fixtures/history/`.
  - `packages/combat/src/history.property.test.ts` runs random commands and undos, old commands included, on that history (8 seeds). It checks consistency after every step, and replay plus re-decision every five steps. On copies of the world it also tries undoing each of the latest commands.
- **Compatibility audit:** I diffed every event and stored-command schema from the Gate 01 pass (`641c6af`) to now:
  - every change was additive (new types, enum values, optional fields, wider limits) or the documented relaxation of `restores`;
  - `placement` was the only removal.

## G03-H06 — Outside-encounter Healing Word reveals whether a hidden reaction window is open

- **Severity:** High
- **Violated invariant:** 5; ADR 0016 §4 ("Outsiders cannot probe").
- **Root cause:**
  - A caster outside a running fight could target its combatants.
  - Healing writes the target's stat block or sheet, which every open window depends on: a window reads every combatant.
  - So the pause refused it (`REACTION_PENDING`) only while a window was open.
  - While outsiders can change combatants, pause integrity and non-interference cannot both hold, so this needed an owner decision.
- **Owner decision** (2026-10-04, recorded as amendments to ADR 0015 and ADR 0016):
  - A character outside a fight cannot target its combatants (`TARGET_IN_COMBAT`, as `ILLEGAL_ACTION`), in every phase of the fight. This mirrors the existing rule that a combatant's spells reach only combatants.
  - A witness may thus learn that a creature it perceives is fighting, never anything about a reaction window.
  - Detect Magic, and spells at creatures outside the fight, are unchanged.
- **Regression tests added first** (failing before the fix):
  - `packages/combat/src/gate03-h06-regressions.test.ts`, `outsider_healing_does_not_reveal_hidden_reaction_window`. Before the fix, 4 of its 12 tests failed. Healing Word at the Shaman got `REACTION_PENDING` with a window open and was accepted without one. Hunter's Mark at the Shaman was accepted where the owner's rule now refuses it.
    - Phases: no fight, a fight without Elowen, and that fight with an open window (Seren is the candidate).
    - Targets: the Shaman unhurt and injured, Elowen herself unhurt and injured, and a bystander.
    - All three spells, each after a fresh engine reload.
    - Results with and without a window must be identical.
    - What the window depends on must be unchanged after every accepted probe, and the history must verify.
  - `gate03-retest2-regressions.integration.test.ts` (PostgreSQL over HTTP, after a restart):
    - the player's encounter view and six probes return the same response sequence with and without a window;
    - with no fight, the combatant probes are accepted;
    - during the fight they are refused with `TARGET_IN_COMBAT`.
- **Fix:**
  - `packages/combat/src/spell-legality.ts`: a caster outside a running fight cannot target its combatants. This check comes after every reason the caster would get anyway.
  - The Context Engine mirrors it (`packages/context/src/actions.ts`; the reason is added to the contracts).
  - `decide/reaction-pause.ts` documents why such a character can no longer reach the pause.
  - Test added with the fix, `packages/context/src/outsider.test.ts`: the context shows the same reason, agrees with the World Engine, and is identical with and without a window.
- **Randomized coverage, added with the fix** (`packages/combat/src/reactions/property.test.ts`):
  - While a window is open, Bram (outside the fight) casts at combatants, at himself, and at bystanders.
  - He must never meet the pause.
  - His result must match a copy of the world where the window never opened: the trigger undone, with the same dice.
  - Across the 12 seeds there were 66 such casts. 32 were compared; 34 were skipped because answers already rested on the window. A coverage assertion requires at least 5 comparisons.
  - With the fix removed, 6 of the 12 seeds fail.

## Validation (revision `e893497`; Node 25.8.1, pnpm 11.11.0, PostgreSQL 18)

| Command                                                                                                                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm validate:ci-local` (format, lint, typecheck, budget, unit, clean build, migrate ×2, seed ×2, integration)                                             | PASS on `e893497`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm test`                                                                                                                                                 | PASS — 82 files, 949 tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm test:integration`                                                                                                                                     | PASS — 10 files, 44 tests (2 new: G03-H05 and G03-H06 on PostgreSQL)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm context-budget`                                                                                                                                       | PASS — 274 active files, 0 over 500 lines, 0 over 700                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Fresh volume: `pnpm db:migrate` ×2, `pnpm seed:ravenford` ×2                                                                                                | PASS — the migration applied once; 91 commands, version 100, 25 entities; the second runs change nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| A larger randomized campaign, run temporarily and then deleted: 80 reaction seeds × 120 steps, 60 domain seeds, 60 seeds × 60 steps on the retest 1 history | 200 of 201 tests passed, covering every integrity, replay, pause, range, undo-safety, re-decision, window-hiding, and legacy-history check. Bram was compared with a world where the window never opened at least 40 times. Seed 1666 again failed only the coverage assertion that some window opened: a step trace shows the Shaman's one turn passed without its cast                                                                                                                                                                                                                                   |
| Live server on PostgreSQL (crypto dice), over HTTP, built from `e893497`                                                                                    | PASS. With the retest 1 rows in the development database, the player's encounter read returns 200 and a DM command is accepted. Undo of the far charm or its clue beneath the old casts is refused, naming them. A new Detect Magic is stored as version 2, and the 18 version 1 premise events are untouched. Then, in a fight without Elowen, her Healing Word at the Shaman is refused with `TARGET_IN_COMBAT`, identically before and while Seren's window is open. Healing herself with the window open is accepted, and her player sees no encounter. The database was then reset and reseeded clean |
| Mutation checks against the full unit suite, one at a time: the 17 Stage 90 defects, the 7 and 3 fixes of retests 1 and 2, and 10 of this remediation       | All 37 detected. Two of the new ones first survived because their tests passed for another reason. The tests were sharpened: the engine's write guard now names its reason, and a deterministic test covers the stranded record. Both are now detected                                                                                                                                                                                                                                                                                                                                                     |

## Deferred Findings

None.

## Retest Request

Astra:

- Independently retest G03-H05 and G03-H06 and their adjacent paths:
  - history written by earlier revisions: reload, as-of reconstruction, continuation, undo beneath and of old commands, and the version-aware parser and oracle;
  - outsider spells at combatants and at creatures outside the fight, with and without an open window, in the World Engine and the Context Engine;
  - narrative combat records under undo.
- The owner's G03-H06 decision is in ADR 0015 and ADR 0016 (retest 2 amendments).
- Recheck that G03-H01 to G03-H04 remain closed.
- Write `reviews/ASTRA_GATE_03_RETEST_3.md`. The handoff `handoffs/ASTRA_GATE_03_REQUEST.md` is updated to retest 3 with this output path.
- Preserve every earlier report and its evidence. Do not rely on this report's claim that a fix is correct.

## Hard Stop

Opus stops here. Do not begin Stage 100 until Astra writes PASS.

---

# Remediation for Retest 4 (after `reviews/ASTRA_GATE_03_RETEST_3.md`)

- Astra report: `reviews/ASTRA_GATE_03_RETEST_3.md` (FAIL: G03-H07 High). The G03-H05 loading failure and the G03-H06 disclosure were confirmed closed; G03-H01 to G03-H04 remain closed.
- Retest number / required output path: 4 — `reviews/ASTRA_GATE_03_RETEST_4.md`
- Revision before remediation: `e893497fef95e53ec54f4baa0a314a341d09515b` (reviewed at `c4d3419`, the same implementation)
- Revision after remediation: `998887d7c5ecd7ce28b3c01c13a37ee07dbf62f1`
- Builder: Claude Opus 5.5, MAX
- Owner decision: G03-H07, recorded as an amendment to ADR 0006 (2026-10-04)
- Status: AWAITING_ASTRA_RETEST

## G03-H07 — Current undo invalidates the original legality of old outside-encounter spells

- **Severity:** High
- **Violated invariants:** 1, 12; ADR 0006 §8.
- **Root cause:**
  - Earlier writers did not always record every fact a decision rested on. Revision 88d8137 recorded Elowen's spells outside an unrelated fight with that fight's combatants as premises, but not her target's status or either participant's placement. Revision 429e2a2 recorded missed attacks without the target's vitals, and earlier writers recorded results that found nothing without what they passed over.
  - The current undo trusted those records as complete footprints. The retest 2 remediation added only the existence of the creatures a record names.
  - No footprint can supply what an old record never named without inventing it. So the question was what undo should assume for such history: a product decision.
- **Owner decision** (2026-10-04, ADR 0006 retest 3 amendment): a command decided by an earlier version rests on everything before it. While it stands, nothing beneath it can be undone, so old history comes off only from its end backwards. History written by the current version is undone exactly as before.
- **Regression tests added first** (failing on `e893497`):
  - New genuine histories, written through each revision's own HTTP app and `PostgresEventStore`; steps and script in `fixtures/history/WRITERS.md`:
    - `88d8137-outside-casts.json`: the reviewer's three variants (revival, target placement, caster placement through `EnterLocation`), a Healing Word at a revived patient, and the creation control;
    - `b38cbbc-outside-casts.json`: the same scenario, recorded completely (control);
    - `429e2a2-gaps.json` and `017ab0b-investigation.json`: the audit below.
  - `packages/combat/src/gate03-h07-regressions.test.ts`, `current_undo_preserves_old_spell_legality_premises`, for both writers and all five variants. The undo must be refused atomically, naming the old cast. The cast must stay legal under the rules that decided it: caster alive, target alive and perceived, in current canon just before the cast (`testing/history.ts`: `outsideCastLegal`). A fresh process must read the same canon, and explicit reverse order must recover. On `e893497` the four 88d8137 variants failed (undo accepted); the creation control and all b38cbbc cases passed.
  - Audit, in the same file, of what other writers recorded incompletely. All six failed on `e893497` (undo accepted):
    - 429e2a2: an inspection passing over a clue found before, Detect Magic after the DM moved a charm away, Hunter's Mark at a revived creature, a missed attack after an Armor Class edit (G03-H02's original), and a turn passing over a dead goblin;
    - 017ab0b: an inspection passing over a clue found before.
  - `apps/server/src/world-engine/gate03-retest3-regressions.integration.test.ts`: the 88d8137 rows on PostgreSQL over HTTP. The four variants are refused and stay refused after a restart, the version is unchanged, reverse order recovers, and the history verifies from the database. All four returned HTTP 200 on `e893497`.
- **Fix:**
  - **The dependency contract** (`packages/domain/src/kernel/event-versions.ts`): every event type is now written as version 2 (`PremisesRecorded` as version 3), meaning the command recorded every fact its decision rested on. Earlier versions mark earlier writers (`writtenEarlier`), and every version stays readable.
  - **Undo** (`packages/domain/src/kernel/decide/undo.ts`): a standing command whose events carry an earlier version blocks undo of anything beneath it, and is listed as a blocker. Undo compensations keep their exact footprints for any writer.
  - **Independent check** (`packages/domain/src/kernel/verification/earlier-writers.ts`, `undoneBeneathEarlierWriters`): no undo the current writer accepted reached beneath a standing command an earlier writer decided. `verifyHistory` and the PostgreSQL verification run it.
  - The re-decision oracle keeps its rule-version distinction: commands earlier writers decided are folded as recorded.
  - **Retired:** the retest 2 remediation's clue-set fact, which `ClueAdded` wrote and a stored `placement` premise read. The rule above makes it redundant: undo is refused beneath any old command anyway. A stored `placement` premise now reads only what it originally meant, the entity and where it was (ADR 0013 retest 3 amendment).
- **Tests added with the fix:**
  - The structural check is tested directly: a synthetic undo beneath a standing old cast is found, while an earlier writer's own undo and an undo of the newest old command are not.
  - A standing old command with no premises (the DM's move of the charm) still blocks undo of what lies beneath it. This shows the rule, not a footprint, protects old history.
  - `history.property.test.ts` now runs random commands and undos on all five histories (10 seeds).
  - `packages/domain/src/combat/named-entities.test.ts` pins that every narrative record's footprint reads each creature its fold requires. That guarantee is redundant today, since current premises cover those creatures and old commands fall under the rule. It is kept as a structural rule of footprints and is now tested directly.
- **What the decision costs:** in a campaign started before the upgrade, the DM undoes old commands newest first; some of those undos would have been safe. Today such campaigns exist only in test databases.

## Validation (revision `998887d`; Node 25.8.1, pnpm 11.11.0, PostgreSQL 18)

| Command                                                                                                                                                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm validate:ci-local` (format, lint, typecheck, budget, unit, clean build, migrate ×2, seed ×2, integration)                                               | PASS on `998887d`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm test`                                                                                                                                                   | PASS — 84 files, 976 tests                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pnpm test:integration`                                                                                                                                       | PASS — 11 files, 48 tests (4 new: G03-H07 on PostgreSQL)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm context-budget`                                                                                                                                         | PASS — 278 active files, 0 over 500 lines, 0 over 700                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Fresh volume: `pnpm db:migrate` ×2, `pnpm seed:ravenford` ×2                                                                                                  | PASS — the migration applied once; 91 commands, version 100, 25 entities; the second runs change nothing                                                                                                                                                                                                                                                                                                                                                                           |
| A larger randomized campaign, run temporarily and then deleted: 80 reaction seeds × 120 steps, 60 domain seeds, 60 seeds × 60 steps across the five histories | 200 of 201 tests passed, covering every integrity, replay, pause, range, undo-safety, re-decision, window-hiding, and earlier-writer check. Seed 1666 failed only the coverage assertion that some window opened. This fix leaves fresh worlds unchanged, so it is the walk traced in the previous round: the Shaman's one turn passed without its cast                                                                                                                            |
| Live server on PostgreSQL (crypto dice), over HTTP, built from `998887d`                                                                                      | PASS. With the rows 88d8137 stored for the outside casts, the player's encounter read returns 200. Undoing the revival, the target's placement, Elowen's entry to the inn, or the patient's revival beneath the old casts is refused (HTTP 422 `UNDO_UNSAFE`, naming the cast). The stream stays at version 133 and the targets stay alive. Explicit reverse order (11 later commands, newest first, then the revival) is accepted. The database was then reset and reseeded clean |
| Mutation checks against the full unit suite, one at a time: the 17 Stage 90 defects and the fixes made for retests 1 to 4 (7 + 3 + 8 + 4)                     | All 39 detected on `998887d`. A first run had 41: 2 tested the clue-set fact, now retired, and 1 the narrative-record reads, now pinned by a direct test                                                                                                                                                                                                                                                                                                                           |

## Deferred Findings

None.

## Retest Request

Astra:

- Independently retest G03-H07 and its adjacent paths:
  - undo on history earlier revisions wrote, beneath and of old commands of every kind, with genuine writers;
  - reverse-order recovery;
  - histories mixing old and current commands;
  - the version marking and the independent check.
- The owner's decision is in ADR 0006 (Gate 03 retest 3 amendment).
- Recheck that G03-H01 to G03-H06 remain closed.
- Write `reviews/ASTRA_GATE_03_RETEST_4.md`. The handoff `handoffs/ASTRA_GATE_03_REQUEST.md` is updated to retest 4 with this output path.
- Preserve every earlier report and its evidence. Do not rely on this report's claim that a fix is correct.

## Hard Stop

Opus stops here. Do not begin Stage 100 until Astra writes PASS.
