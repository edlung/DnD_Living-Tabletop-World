# Astra Gate 02 — Retest 1

- **Review ID:** ASTRA_GATE_02_RETEST_1
- **Stage/Gate:** Stage 70 / Gate 02, including Stages 30 and 50–60 and affected Gate 01 regressions
- **Code revision:** `757db1066fc4b8fd14e26244c1e63adbdd0aa281`
- **Checkout revision:** `856c7ea823f915acb2bd47fffe59b9634e157ec1`; subsequent changes comprise only the handoff and remediation documentation.
- **Date:** 2026-10-03, Europe/Oslo
- **Reviewer model:** GPT-6 / Codex, independent Astra role. Requested configuration: GPT-6 Astra / MAX (`EFFORT_MATRIX.md`). Runtime model alias and effort are not independently exposed to the reviewer.
- **Prior report:** [ASTRA_GATE_02_REPORT.md](ASTRA_GATE_02_REPORT.md), FAIL
- **Remediation reviewed:** [OPUS_GATE_02_REMEDIATION.md](../remediation/OPUS_GATE_02_REMEDIATION.md)
- **Surfaces tested:** Scoped knowledge and memory retrieval, known entities, context, all four player commands, claims/contradictions, authorization, command/result serialization, undo, replay, PostgreSQL and reload.
- **Overall result:** FAIL
- **Required surfaces not tested:** None identified for this gate; future obligations below.
- **Owner-approved nonblocking dispositions:** None for the findings below. The owner-approved ADR 0010 containment amendment is the governing product rule, not a waiver of a reproduced defect.

## Assessment

The original **G02-H01** and **G02-H02** reproductions now satisfy their expected behavior. Nevertheless, adjacent testing found **one High** omission in player-command authorization dependencies and **one Medium** undo recovery failure. Both reproduce in memory and after loading PostgreSQL state through a fresh engine. The gate remains blocked.

These are findings at the reviewed revision; this report does not claim that both were introduced by the remediation commit.

| Original finding                                                       | Independent retest result                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G02-H01 — hidden ancestry in memory filtering**                      | Closed for the original exploit and tested adjacent variants. PUBLIC, PARTY, PLAYER and Mira return identical status and full bodies for hidden versus absent parents: total 0, no IDs/scores/order differences. Direct hidden entity/context requests remain 404. A known outer and inner with an unknown intermediate also match nothing. After disclosing the intermediate, authorized nesting works; DM containment remains available. PostgreSQL reload preserves the result. |
| **G02-H02 — sole knowledge/memory disclosure undone beneath movement** | Closed for both original variants. Undo returns `UNDO_UNSAFE`, names exactly the movement, and leaves state unchanged; undo movement then disclosure succeeds and restores placement. Independently repeated in memory and with PostgreSQL reload before the unsafe undo. Earliest knowledge-versus-memory ordering works in both directions; later redundant disclosures remain undoable. The broader premise boundary is still incomplete: see G02-H03.                          |

## Authority and method

Applied `ASTRA_MASTER.md`, the Gate 02 mission, `ASTRA_REVIEW.md`, `EFFORT_MATRIX.md`, `AGENT_WORKFLOW.md`, the RETEST handoff, context map and applicable directory instructions. Read the original report and remediation claims; checked the named sections of the invariants, product blueprint, architecture, Ravenford specification, adversarial tests A/B/C/G/I/J and coverage ledger. Applied ADRs 0006, 0008–0014, including the new containment and premise amendments; ADR 0011 supplies skill-check background.

Inspected the changed decision, projection, event and undo boundaries. Re-ran the complete local validation and independent HTTP probes. Scenario mutations used isolated seeded memory stores and throwaway PostgreSQL databases, which were dropped. The ordinary development campaign remained at seed version 92. The review's live server was stopped; the existing PostgreSQL service was retained. No implementation, existing tests, fixtures, handoff, remediation artifact or historical report was changed.

## Findings

### G02-H03 — Undo removes the controlling-player assignment while the player's action stands

- **Severity:** High
- **Invariant(s):** **1 — WORLD ENGINE IS AUTHORITY**, specifically validation of an undo transition; **12 — WORLD HISTORY IS RECONSTRUCTABLE**, under ADR 0006 §8's dependency-preserving current-canon contract. ADR 0013 §1 requires the controlling-player assignment to authorize these commands.
- **Category:** Permission / State / Rollback
- **Preconditions:** A newly created character has no unrelated dependency on its roster assignment. A DM assigns it to a player, who enters a PUBLIC-known destination or forms a CHARACTER-only hypothesis.
- **Boundary:** [kernel/authorization.ts](../packages/domain/src/kernel/authorization.ts), lines 30–35, reads the actor's roster assignment. [movement-and-hypotheses.ts](../packages/domain/src/investigation/movement-and-hypotheses.ts), line 27, records only the destination premise for movement. [kernel/facts.ts](../packages/domain/src/kernel/facts.ts), lines 252–297, does not preserve the controlling-player authorization premise; a PUBLIC knowledge basis has `viaParty: false`. A CHARACTER hypothesis without subjects/relations records an empty premise list.

**Exact reproduction**

Use a fresh seeded test campaign. POST commands to `/campaigns/ravenford/commands` as `{ "commandId": "<key>", "command": <command below> }`. Use `dev-dm-ravenford` for DM and `dev-outsider` for the newly assigned player.

1. DM creates `{"type":"CreateEntity","entityId":"guest-character","kind":"character","name":"Guest","existsSince":null}`.
2. Before assignment, `dev-outsider` attempts `{"type":"EnterLocation","characterId":"guest-character","locationId":"market-square"}`: **404**, uniform campaign non-membership.
3. DM submits `{"type":"AssignCharacter","characterId":"guest-character","playerActorId":"outsider"}` with key `auth-assign`: accepted.
4. The assigned player repeats the movement with key `auth-move`: accepted.
5. DM submits `{"type":"UndoCommand","targetCommandId":"http:dm-ravenford:auth-assign"}`.

**Adjacent variant:** On a fresh assignment, substitute step 4 with `{"type":"FormHypothesis","characterId":"guest-character","scope":"CHARACTER","statement":"A private guess.","subjects":[]}`. Undo its assignment while the hypothesis stands.

- **Expected behavior:** `UNDO_UNSAFE` names the player action and changes nothing. Explicitly undoing that action first permits assignment undo. DM/system-issued actions must retain their independently authorized behavior.
- **Actual behavior:** Both assignment undos return **200 / accepted**. The roster entry disappears. Movement remains at `market-square`, or the authored HYPOTHESIS remains, with the corresponding command's `undoneBy: null`. Subsequent HTTP requests by that actor receive 404 again.
- **Evidence:** [results.json](evidence/gate-02/retest-1/results.json), `adjacent.observations`, cases `actor-assignment` and `hypothesis-actor-assignment`, each in `memory` and `postgres-reloaded`. Movement occupies sequences **95–96**; its assignment is undone at **97**. The hypothesis occupies **99–100** and its assignment is subsequently undone. Persisted movement premises contain only `pub-market-square / viaParty:false`; hypothesis premises are empty. [ADJACENT_PROBES.md](evidence/gate-02/retest-1/ADJACENT_PROBES.md) is executable evidence.
- **Impact:** Undo withdraws the exact authorization fact read when accepting a still-effective action. This is an invalid dependency transition, not a demonstration that an unassigned caller can issue a new command. Stored history remains readable; the defect is the missing undo dependency.
- **Suggested remediation direction:** Carry the authority premise actually used by command authorization into the auditable dependency boundary. Distinguish a controlling player's authorization from DM/system authority; audit all player commands, not only knowledge-derived targets. The randomized premise test currently checks recorded premises, so it cannot detect an omitted premise of this kind.
- **Regression test required:** **Yes:** `undo_controlling_assignment_is_blocked_by_player_action`, parameterized over EnterLocation and CHARACTER FormHypothesis, public/perceived targets where relevant, both stores and reload. Assert the exact blocker, no mutation on rejection, safe reverse-order undo and preserved DM/system controls.

### G02-M01 — An empty inspection creates an undo blocker that cannot itself be undone

- **Severity:** Medium
- **Invariant(s):** No independent canonical-integrity violation demonstrated. The affected contract is the dependent-first undo recovery described in ADR 0006 §8 and ADR 0013's premise amendment. This is a bounded recoverability/UX defect; no event erasure, replay divergence or new secret leak is claimed.
- **Category:** Rollback / State
- **Preconditions:** A player enters a location learned from a sole disclosure, then performs an accepted `inspect` with no discoveries.
- **Boundary:** [kernel/facts.ts](../packages/domain/src/kernel/facts.ts), lines 185–202 and 252–263, retains inspection reads as dependencies. [decide/undo.ts](../packages/domain/src/kernel/decide/undo.ts), lines 63–68, rejects its undo when no restorable facts exist. Lines 93–98 keep that command effective as a blocker.

**Exact reproduction**

On a fresh seeded campaign, use the same POST wrapper and DM/player tokens as the original H02 reproduction:

1. DM creates `empty-remote`: location, `existsSince:null`, `location:{"type":"site","parentId":null}`.
2. DM adds PARTY FACT `empty-route`, statement `Known empty-remote`, subjects `["empty-remote"]`, `knownSince:36000`, key `empty-reveal`.
3. Elowen enters `empty-remote`, key `empty-move`.
4. Elowen submits `{"type":"ExamineEntity","characterId":"elowen-starwhisper","entityId":"empty-remote","method":"inspect"}`, key `empty-inspect`. Result: accepted, `roll:null`, `discovered:[]`.
5. DM tries undo of `http:dm-ravenford:empty-reveal`, then `http:player-elowen:empty-move`, then `http:player-elowen:empty-inspect`.

- **Expected behavior:** The explicit dependent-first recovery path can release the read-only inspection dependency while preserving audit history, then undo movement and disclosure. It must not leave an unresolvable instruction to “undo them first.”
- **Actual behavior:** Disclosure undo returns **422 / UNDO_UNSAFE**, naming movement. Movement undo returns **422 / UNDO_UNSAFE**, naming inspection. Inspection undo returns **422 / NO_EFFECT**. All three commands remain effective. Repeating the sequence cannot retire the blocker.
- **Evidence:** `adjacent.observations`, case `empty-inspection-undo-lock`, in [results.json](evidence/gate-02/retest-1/results.json), with both stores and PostgreSQL reload. Full response/blocker IDs and the `PremisesRecorded` + empty `EvidenceExamined` payloads are preserved. Rejected undos leave state unchanged and replay matches it.
- **Impact:** A routine inspection prevents rollback of the preceding movement and its sole immutable knowledge disclosure. Direct movement authoring can reposition a character, but cannot complete the blocked disclosure undo. Scope is limited to recovery; canonical history remains consistent.
- **Existing rule considered:** ADR 0013 explicitly documents `NO_EFFECT` for empty-inspection undo. The finding concerns its interaction with permanent read dependencies and the same ADR's promise that undoing the action releases its premise. No owner disposition accepting that stranded recovery chain was supplied.
- **Suggested remediation direction:** Reconcile read-only command effectiveness, undo eligibility and the documented recovery contract. Preserve history and real dependencies; do not simply drop all inspection reads. Any intentional irreversible-inspection policy needs an explicit owner-approved contract/disposition.
- **Regression test required:** **Yes:** `empty_inspection_does_not_strand_dependency_undo`, covering this chain in both stores, reload, state integrity and history-preserving recovery.

## Validation and coverage

**`pnpm validate:ci-local` passed:** install, formatting, lint, typecheck, clean build, migrations twice, seed twice; **744 tests in 55 unit files**, **22 tests in 6 integration files**. Context budget: **190 active files**, none above 500/700 lines. Seed: **0 new / 83 existing commands**, version **92**, **21 entities**. GitHub Actions itself was not run.

Independent evidence comprises **1,010 HTTP requests**:

| Evidence                                                           |         Requests | Coverage                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | ---------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [LIVE_PROBES.md](evidence/gate-02/retest-1/LIVE_PROBES.md)         |    698 live GETs | Eight exact knowledge/memory perspective sets; direct IDs; text/entity/location/time/kind/session/limit filters; context crawl; malformed/forged scopes; authentication; forbidden markers; metadata; 80 interleaved reads and cache headers.                                                                                                             |
| [STATE_PROBES.md](evidence/gate-02/retest-1/STATE_PROBES.md)       | 202 via HTTP app | Original H01/H02 safety checks; hypothesis/testimony types; explicit separate DM FACT; five-scope contradiction oracle; NPC isolation; private claims; impossible memories and atomic rejection; hidden-memory score stability; undiscovered clues; failed/empty/successful skill checks; discovery memories; idempotency; undo; storage/reload equality. |
| [ADJACENT_PROBES.md](evidence/gate-02/retest-1/ADJACENT_PROBES.md) | 110 via HTTP app | Earliest premise across knowledge/memory, redundant disclosure undo, unknown intermediate versus authorized/DM containment; G02-H03 and G02-M01 reproductions in both stores and after reload.                                                                                                                                                            |

Recorded counts, assertions and observations are in [results.json](evidence/gate-02/retest-1/results.json). Live/state checks have no assertion failures. The adjacent recipe intentionally asserts the observed defects: its successful execution reproduces findings and does **not** certify product safety. The repository's added AskAbout topic/sheet, hypothesis subject, perception-preference, randomized noninterference and replay regressions also ran in the passing baseline suite.

## Summary and future obligations

- **Open findings:** Critical 0; High **1** (G02-H03); Medium **1** (G02-M01); Low 0.
- **Invariants exercised:** 1, 3–9, 11, 12, 19, 20 within implemented surfaces. Invariant 6 was tested through scoped NPC data, not runtime dialogue.
- **Violations / blockers:** G02-H03 violates authority/dependency validation under invariants 1/12 and requires FAIL. G02-M01 is a separate Medium recovery/contract issue, without a demonstrated additional invariant violation; under the workflow it requires remediation or an owner-approved disposition before deferral. No such disposition was supplied.
- **Residual risk:** Finite probes do not prove completeness. Claims use DM-authored structure; current membership, simplified perception/travel, policy-only disclosures and development authentication retain their documented limits.

Future surfaces remain **NOT YET IN SCOPE**, not passed:

| Surface                                                   | Introduction / next review                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| Executable Detect Magic, spellcasting and combat          | Stage 80 / Gate 03                                                   |
| Reactions, expiry, concurrency and reaction undo          | Stage 90 / Gate 03                                                   |
| AI contexts, mutation proposals, authoring and continuity | Stages 100–120 / Gate 04                                             |
| Runtime NPC dialogue and prompt injection                 | Stage 130 / Gate 04                                                  |
| Assets, metadata, lineage and historical visuals          | Stages 150–160 / Gate 05                                             |
| Chronicle / flashbacks                                    | Stage 170 / Gate 05                                                  |
| Integrated backend obligations                            | Stage 180 / Gate 05, Stage 190                                       |
| Production authentication                                 | Approved ADR before deployment; Gate 05 at latest                    |
| Real UI consumers                                         | Stages 200–230 / boundary and E2E regressions; reopen affected gates |

Remediate with the required regression tests and updated remediation/handoff artifacts, then obtain **ASTRA_GATE_02_RETEST_2.md**. Preserve the initial report and this retest. Under `EFFORT_MATRIX.md`, Critical/High remediation uses Opus / MAX; formal retest uses Astra / MAX. Stage 80 was not started and remains blocked.

FAIL
