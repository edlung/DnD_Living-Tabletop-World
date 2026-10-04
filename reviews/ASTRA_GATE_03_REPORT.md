# Gate 03 — Reaction Integrity: FAIL

## Review header

- **Review ID:** ASTRA-GATE-03-INITIAL
- **Stage/Gate:** Stages 80–90 / Gate 03, Reaction Integrity
- **Commit/Build:** `429e2a273ef17a304c09d62965cc60b6cf3be7ad`; tested at `b6f4cff5376b477ffcecc68ba32198fa1802f246`. The latter adds only the handoff and Stage 90 completion report; application sources are identical.
- **Date:** 2026-10-04
- **Reviewer model:** GPT-6 (Codex), independent review context. The handoff requests Astra/MAX; the exact runtime variant and effort were not exposed for independent verification.
- **Surfaces tested:** World Engine commands, reaction/combat decisions, context and encounter projections, authenticated HTTP handlers, PostgreSQL persistence, fresh-engine reload, replay, undo, re-decision, and relevant Gate 01/02 regression suites.
- **Overall result:** FAIL
- **Required surfaces not tested:** None unavailable in the Stage 80–90 backend scope. HTTP evidence uses real Fastify handlers through `inject()` with PostgreSQL, not a separately listening server. Future obligations are listed below.
- **Owner-approved nonblocking dispositions:** ADR 0016 §6 excludes opportunity attacks, monster reactions, Counterspell chains, windows outside combat, and timed expiry. These are scope decisions, not accepted exceptions for the findings below. No disposition accepts a new finding.

## Decision and evidence

**Three High findings block Gate 03.** The existing 862 unit tests and 31 integration tests pass, but independent probes reproduce unsafe undo and invalid knowledge acquisition. All three findings also reproduce through authenticated HTTP handlers backed by PostgreSQL and survive fresh-engine reloads.

Authority: `ARCHITECTURE_INVARIANTS.md`, ADRs 0006–0007, 0009, 0011–0012, 0015–0016, and the Gate 03 mission/handoff. In particular, ADR 0016 requires the pause and safe reopening of reaction windows; ADR 0006 requires dependency-preserving undo; ADR 0015 §3 explicitly limits in-combat Detect Magic to 30 ft.

Reproduction artifacts:

- [Results index](evidence/gate-03/results.json): revision, validation, findings, and limitations.
- [State probes](evidence/gate-03/STATE_PROBES.md) and [captured results](evidence/gate-03/state-results.json): isolated worlds, scripted dice, adjacent cases, and range controls.
- [HTTP/PostgreSQL probes](evidence/gate-03/HTTP_POSTGRES_PROBES.md) and [captured results](evidence/gate-03/http-postgres-results.json): actual routes, persona authentication, persisted commands, restart checks, and recovery.

Run the recipes from the repository root using the commands at their tops. The HTTP recipe creates and drops only its own throwaway database. Its assertions demonstrate the reviewed revision's **vulnerable behavior**; a successful probe run does not mean the gate passed. Production source, existing tests, handoffs, and prior reviews were not changed.

## Findings

### [G03-H01] Undo reopens a reaction window after a combatant mutation that the pause would forbid

- **Severity:** High
- **Invariants:** 1 — WORLD ENGINE IS AUTHORITY; 10 — REACTIONS ARE DOMAIN EVENTS; 12 — WORLD HISTORY IS RECONSTRUCTABLE. Violates ADR 0016 §1/§3 and the dependency-preserving undo contract of ADR 0006 §8.
- **Category:** Rollback / State / Events
- **Preconditions:** Standard Ravenford ambush; Shaman casts Ashen Bolt at Elowen, opening a Counterspell window. DM authoring and undo are available through their authorized commands.
- **Steps to reproduce:**
  1. End Elowen's turn and have the Shaman cast `ashen-bolt` at her.
  2. Elowen uses Counterspell; script the Shaman's Constitution d20 as 1, so the window closes as `countered`.
  3. DM issues `ChangeEntityStatus { entityId: "goblin-shaman", status: "dead" }`. It is accepted while no window is open.
  4. DM issues `UndoCommand` targeting the successful `UseReaction`, leaving the status edit effective.
  5. Submit Elowen's `DeclineReaction`, DM `CloseReactionWindow`, and DM `EndCombat`.
- **Expected behavior:** Step 4 rejects unsafe undo and identifies the intervening status command as a blocker. Explicitly undoing that edit first permits the response to be undone and a valid window to reopen.
- **Actual behavior:** Step 4 is accepted and reopens the window with its caster still dead. Ignore and DM close both throw `suspended ashen-bolt became illegal (ACTOR_DEAD)` and return HTTP 500. Ending combat returns `REACTION_PENDING`. Failed completion attempts are atomic, but the accepted undo has already created the inconsistent paused state.
- **Evidence:** `state-results.json` → `undoReopensInvalidWindow`: response `test.0.9`, status edit `test.0.10`, accepted undo `test.0.11`. `http-postgres-results.json` → `undoWindow`: accepted response `http:player-elowen:counter`; status edit `http:dm-ravenford:g03-10`; both completion requests return 500 after restart. The independent oracle reports the still-effective status edit as `no longer accepted: REACTION_PENDING`.
- **Adjacent case:** A character casts Detect Magic, another character counters it, and DM sets the caster's sheet to `incapacitated`. Undoing the counter is accepted; closing the reopened window throws `INCAPACITATED`. Reversing the intervening sheet edit restores normal completion. Both invalid reopenings pass the structural integrity checker and replay identically, showing why replay equality alone is insufficient.
- **Cause/boundary:** `pausedByChanges` in `packages/domain/src/kernel/decide/reaction-pause.ts:47` exempts undo. Successful commands admitted because the window was closed do not record that pause dependency. For example, `EntityStatusChanged` in `packages/domain/src/kernel/facts.ts:105` reads only the clock and entity existence. `decideUndo` therefore cannot see the status edit's dependency on the response that closed the window.
- **Impact:** Authorized undo can strand normal spell completion and produce effective history that is illegal under the restored state. This persists across server restarts. Recovery is possible by explicitly undoing the intervening edit; it is not an unrecoverable database failure.
- **Suggested remediation direction:** Represent the pause/closed-window premise in dependency checking, including commands whose eligibility changes when a window is restored. Reject invalid reopening with explicit blockers while preserving undo of unrelated commands. Extend the invariant checks to exercise restored-window legality.
- **Regression test required:** **Yes** — `undo_closing_response_rejects_intervening_combatant_mutation`. Cover status and sheet changes, countered and proceeded closures, PostgreSQL reload, atomic rejection, and safe explicit reverse-order recovery.

### [G03-H02] A missed attack omits the target's defense from undo dependencies

- **Severity:** High
- **Invariants:** 1 — WORLD ENGINE IS AUTHORITY; 12 — WORLD HISTORY IS RECONSTRUCTABLE. Violates ADR 0006 §8 and ADR 0007's requirement to record every decision premise.
- **Category:** Rollback / Rules / Events
- **Preconditions:** Elowen and a second character, Seren, participate in an encounter. Seren starts with AC 17. Attacking a party or neutral character is a supported legal choice under invariant 20.
- **Steps to reproduce:**
  1. After starting the encounter, DM sets Seren's character sheet to AC 30.
  2. Elowen attacks Seren with her Longbow; script d20 = 10. Her total of 21 misses AC 30.
  3. DM undoes the AC-30 `SetCharacterSheet` while leaving the attack effective.
- **Expected behavior:** Step 3 returns `UNDO_UNSAFE`, listing the attack. Its result depended on the target's AC and cannot survive removal of that premise.
- **Actual behavior:** Undo is accepted, restoring AC 17 while retaining the recorded miss with total 21. Re-deciding the effective attack against current canon produces different events.
- **Evidence:** `state-results.json` → `undoTargetDefense`: edit `test.0.10`, attack `test.0.11`, undo `test.0.12`; recorded outcome `{ attackTotal: 21, hit: false }`, restored AC 17. Oracle: `Attack — decides differently under current canon`. `http-postgres-results.json` → `undoDefense` reproduces the same divergence for `http:player-elowen:g03-22` after fresh-engine reload before and after undo. Ordinary replay still matches the corrupted logical history and the structural checker returns no violations.
- **Cause/boundary:** `packages/combat/src/attack.ts:52` records the attacker's premises but not the target's defense. `AttackPerformed` in `packages/domain/src/kernel/facts.ts:297` reads only the clock and encounter. A miss produces no target-sheet write that could otherwise block undo of the target's AC edit.
- **Impact:** Combat outcomes can remain canonical after removal of the rules inputs that determined them. This is the combat-domain extension of the missing-premise failure class addressed at Gate 02; the prior fixes do not cover this new path.
- **Suggested remediation direction:** Record all target and other combat-state premises used by resolution, including read-only and no-effect outcomes. Audit adjacent saving throws, conditions, turn selection, and non-character decisions for the same missing dependency; those adjacent paths are audit targets, not additional claimed reproductions.
- **Regression test required:** **Yes** — `missed_attack_blocks_undo_of_target_defense`. Include a miss without target mutation, target-condition variants, target status where relevant, persisted reload, and successful recovery by undoing the dependent attack before the sheet edit. Require the independent re-decision oracle to agree after accepted undo.

### [G03-H03] Detect Magic discloses clues outside its 30-ft combat radius

- **Severity:** High
- **Invariants:** 5 — NO KNOWLEDGE LEAKAGE; 9 — AI RANKS RELEVANCE; RULES DECIDE LEGALITY. Violates the explicit Detect Magic mechanics in ADR 0011 and ADR 0015 §3.
- **Category:** Knowledge / Rules
- **Preconditions:** Default ambush positions: Elowen at `(2, 6)` and the Shaman at `(12, 6)`, 50 ft apart under the approved grid metric. DM adds a previously undiscovered `magic` clue to the Shaman.
- **Steps to reproduce:**
  1. Start the ambush and add the clue with `AddClue { entityId: "goblin-shaman", method: "magic", ... }`.
  2. On Elowen's turn, submit `CastSpell { combatantId: "elowen-starwhisper", spellId: "detect-magic" }`.
  3. Repeat with a second Counterspell-capable character in the encounter so the cast is suspended, then have DM close that window.
  4. Query `GET /campaigns/ravenford/knowledge?perspective=PLAYER`.
- **Expected behavior:** A clue 50 ft away is not discovered, copied into party knowledge, or placed in a discovery memory. A clue exactly 30 ft away is discoverable. These rules apply both to immediate casting and completion after a reaction window.
- **Actual behavior:** Both cast paths reveal the distant clue as PARTY `EVIDENCE`. Boundary probes also reveal a clue at 35 ft; the 30-ft positive control succeeds. The player knowledge route returns `G03_HTTP_DISTANT_SECRET` after persisted reload, although the same route did not contain it before the cast.
- **Evidence:** `state-results.json` → `detectMagicAt30Ft`, `detectMagicAt35Ft`, `detectMagicAt50Ft`, `directDetectMagicRange`, and `suspendedDetectMagicRange`; `http-postgres-results.json` → `detectMagic`. The default-position direct cast creates the evidence at sequence 113; the suspended cast's DM close creates it at sequence 122 in its separate probe world.
- **Cause/boundary:** `packages/domain/src/investigation/reveal.ts:64` filters clues by room-level `perceivedEntityIds` and prior discovery only. It never applies combat positions or the 30-ft radius. Both `castEvents` and suspended completion use this helper, so a correct reaction lifecycle still publishes an invalid discovery.
- **Impact:** A player learns and permanently records discoverable-but-currently-out-of-range DM-authored evidence without satisfying the spell's acquisition rule. This is a range-gated acquisition leak, not evidence of unrestricted access to all DM/WORLD_TRUTH records.
- **Suggested remediation direction:** Apply the approved spell-specific spatial boundary before creating evidence, claims, or memory records. Keep immediate and suspended completion aligned, preserve the approved outside-combat room behavior, and define handling for perceived entities without combat positions using the existing architecture/ADR process if a material rule is missing.
- **Regression test required:** **Yes** — `detect_magic_discloses_only_within_30_feet_in_combat`. Test 30-ft and 35-ft boundaries, default 50-ft positions, immediate and suspended casts, both candidate decline and DM close, and absence of unauthorized evidence/claims/memories in player reads after reload.

## Validation and coverage

| Check                                       | Independently observed result                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                 | 73 files, 862 tests passed; includes prior Gate 01/02 regressions and reaction property/re-decision suites              |
| `pnpm test:integration`                     | 8 files, 31 tests passed on PostgreSQL; includes two-engine reaction ordering and restart tests                         |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed                                                                                                                  |
| `pnpm context-budget`                       | Passed: 255 active files; none over 500 or 700 lines                                                                    |
| `pnpm format:check`                         | Passed after formatting the review artifacts                                                                            |
| Independent state recipe                    | Eight scenarios completed; reproduced all three findings, the adjacent incapacitated-caster case, and distance controls |
| Independent HTTP/PostgreSQL recipe          | All three findings reproduced; restart persistence verified; H01 explicit recovery verified                             |

The complete `validate:ci-local` wrapper, a deployment, and a separate live-network smoke test were not run. Review used installed dependencies and the available PostgreSQL instance; it did not reset the development volume. Commands and compact durable evidence are indexed above.

| Due surface                                                                                    | Coverage and result                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reaction eligibility, slot/Reaction spending, range/cover, conditions, multiple candidates     | Executed `reactions/eligibility.test.ts`, `lifecycle.test.ts`, and rules tests; no additional failure in those cases                                                                                                                                                             |
| Expiry, stale/late/repeated answers, non-candidates, outsider commands, direct pause           | Executed `reactions/integrity.test.ts` and HTTP/context regressions; direct checks pass, but undo bypasses the effective pause dependency (H01)                                                                                                                                  |
| Concurrent answers and close, both winning orders, duplicate candidate, two candidates, bursts | Executed `reactions/concurrency.test.ts` and `reaction.integration.test.ts`; tested races serialize and do not double-spend                                                                                                                                                      |
| Ordering, retries, recorded entropy, restart, replay, as-of reads                              | Existing integrity/undo/property and PostgreSQL suites pass; HTTP duplicate Counterspell remains `duplicate`. Independent undo probes expose effective-history divergence (H01/H02)                                                                                              |
| Open-window undo, closed-window reopening, dependent and unrelated authoring                   | Existing reverse-order cases pass; independent status/sheet invalidation reveals H01                                                                                                                                                                                             |
| Stage 80 encounters, initiative, turns, movement, attacks, spells, AoE, 0 HP and death saves   | Executed combat unit/integration suites; missed-attack dependency and Detect Magic radius fail independently (H02/H03)                                                                                                                                                           |
| Encounter/context visibility, perspective validation, response hygiene                         | Executed encounter/reaction routes, context combat/reaction/leakage suites, and prior gate regressions. HTTP candidate view hides suspended spell/target; player cannot close a window; player results omit canonical events. Invalid magic acquisition leaks new evidence (H03) |
| Knowledge, memory, claims, contradictions, controller and placement dependencies               | Relevant existing regression suites pass; H03 shows why those tests do not certify every new acquisition path                                                                                                                                                                    |

## Future coverage — NOT YET IN SCOPE

| Surface                                                                                          | Introduction / next review                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI contexts, authoring proposals, validation, confirmation, continuity, provenance and safe undo | Stages 100–120 / Gate 04                                                                                                                          |
| Runtime NPC dialogue/actions and actual supplied context isolation                               | Stage 130 / Gate 04                                                                                                                               |
| Relevance ranking using scoped context                                                           | Stage 140 / Gate 05 integration                                                                                                                   |
| Asset identity, metadata, lineage and visual history                                             | Stages 150–160 / Gate 05                                                                                                                          |
| Chronicle and flashback retrieval, including combat/reaction events                              | Stage 170 / Gate 05                                                                                                                               |
| Complete backend Ravenford integration                                                           | Stage 180 / Gate 05 (Stage 190 review)                                                                                                            |
| Real UI consumers, perspective changes and stale prompts/previews                                | Stages 200–230, combat UX at 220 / introducing-stage boundary/E2E regressions and Stage 250 release evidence; reopen affected gates when required |
| Opportunity attacks, other/monster reactions, chains and out-of-combat windows; timers           | Unscheduled owner-approved ADR 0016 exclusions / first gate after introduction                                                                    |
| Production authentication                                                                        | Requires its own ADR before deployment / Gate 05 at the latest, per the handoff                                                                   |

## Final summary

- **Findings:** 0 Critical, **3 High**, 0 Medium, 0 Low.
- **Invariants exercised:** 1, 4–6, 7–12, 13 and 20 through current commands, rules, projections, replay and prior regressions. AI/runtime NPC/UI/asset invariants are not certified by this review.
- **Invariants violated:** 1, 5, 9, 10 and 12, as detailed above.
- **Exact blockers:** G03-H01, G03-H02 and G03-H03. No owner-approved exception applies.
- **Residual risk:** The randomized suite and structural checker miss the demonstrated authoring/undo interactions; ordinary replay equality cannot establish effective-command legality. Deterministic agreement also cannot detect a consistently wrong acquisition radius. Coverage is finite, not proof that no further defects exist.

Per `EFFORT_MATRIX.md`, High findings require Opus remediation at MAX, failing regressions first, a remediation artifact, and an Astra/MAX retest. Preserve this initial report; the next review is `reviews/ASTRA_GATE_03_RETEST_1.md`. Stage 100 remains blocked. No fixes or later-stage work were performed; review stops here.

FAIL
