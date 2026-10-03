# Astra Gate 02 — Retest 2

- **Review ID:** ASTRA_GATE_02_RETEST_2
- **Stage/Gate:** Stage 70 / Gate 02, including Stages 30 and 50–60 and affected Gate 01 regressions
- **Code revision:** `017ab0b4fb1386dfc994a46bb4d82b762aaba237`
- **Checkout revision:** `6f21fad0b791c44393f4716f0c7e3c3e0ff97c36`; only the handoff and remediation documentation differ from the reviewed code revision.
- **Date:** 2026-10-03, Europe/Oslo
- **Reviewer model:** GPT-6 / Codex, independent Astra role. Requested configuration: GPT-6 Astra / MAX (`EFFORT_MATRIX.md`). Runtime model alias and effort are not independently exposed to the reviewer.
- **Prior reports:** [Initial FAIL](ASTRA_GATE_02_REPORT.md); [Retest 1 FAIL](ASTRA_GATE_02_RETEST_1.md)
- **Remediation reviewed:** [OPUS_GATE_02_REMEDIATION.md](../remediation/OPUS_GATE_02_REMEDIATION.md), “Remediation for Retest 2”
- **Surfaces tested:** Authorization, all player commands, scoped knowledge/memory/context, claims and contradictions, result serialization, undo/recovery, replay, persistence/reload, and concurrent assignment undo.
- **Overall result:** PASS
- **Required surfaces not tested:** None identified for the current gate. Future obligations remain below.
- **Owner-approved nonblocking dispositions:** None required. ADR 0010's owner-approved known-location containment amendment remains the governing product rule.

## Assessment

**G02-H03 and G02-M01 are closed. G02-H01 and G02-H02 remain closed.** Independent reproductions, adjacent attacks and the complete local validation found no remaining blocking violation at the reviewed revision.

The authorization fix records the authority granted by `authorize`, centrally adding the controlling-player premise to accepted player commands. Both character and player roster facts participate in undo dependencies. DM/system authority is distinguished from player control.

An empty inspection can now be explicitly undone with `CommandUndone.restores: []`. Its original events remain in history; its command is marked undone and releases its read dependencies. This resolves the previous conflict between the `NO_EFFECT` behavior and dependent-first recovery. The amended event schema successfully reads the empty compensation from PostgreSQL.

## Retest dispositions

| Finding                                                                | Result and independent evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G02-H03 — controlling-player assignment omitted from dependencies**  | **Closed.** Both original variants—PUBLIC-known movement and a CHARACTER-only hypothesis with no subjects—return `UNDO_UNSAFE` when the DM tries to undo the assignment. The sole blocker is the player's action, and rejection changes no state. Undoing the action, then its assignment, succeeds. The movement/hypothesis is removed from current canon, and the former player again receives uniform 404 campaign non-membership. Repeated with memory storage and PostgreSQL reload before unsafe undo and after recovery.                                 |
| **G02-M01 — empty inspection strands recovery**                        | **Closed.** Disclosure undo names movement; movement undo names inspection. Explicit inspection undo succeeds with an empty compensation, followed by successful movement and disclosure undo. The disclosure disappears and Elowen returns to Market Square. The compensation survives reload; replay retains the original inspection and reconstructs the final state. Duplicate undo returns the original result without another mutation; a new undo of the same inspection is `ALREADY_UNDONE`, and undo of the compensation remains `UNDO_NOT_SUPPORTED`. |
| **G02-H01 — hidden containment influences memory retrieval**           | **Still closed.** Hidden and absent parent filters return identical full bodies for PUBLIC, PARTY, PLAYER and Mira, with total 0 and no ID/score/order differences. Direct hidden entity/context routes remain 404. A known outer/inner pair separated by an unknown intermediate also matches nothing. Disclosing the intermediate enables authorized nesting; DM containment remains available. Checked in both stores and after reload.                                                                                                                      |
| **G02-H02 — sole knowledge/memory disclosure undone beneath movement** | **Still closed.** Both disclosure types produce exactly the movement blocker, preserve state on rejected undo, and unwind safely in reverse order. The PostgreSQL unsafe undo runs through a fresh engine. Earliest knowledge-versus-memory selection works in both orders; redundant later disclosures stay undoable.                                                                                                                                                                                                                                          |

Original reproductions and exact recorded responses are preserved in [STATE_PROBES.md](evidence/gate-02/retest-2/STATE_PROBES.md), [ADJACENT_PROBES.md](evidence/gate-02/retest-2/ADJACENT_PROBES.md) and [results.json](evidence/gate-02/retest-2/results.json). These recipes now assert safe behavior; they do not retain the previous retest's assertions that intentionally reproduced defects.

## Adjacent attacks and regression coverage

| Boundary                                   | Observed result                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every player-command family                | EnterLocation (PUBLIC-known and perceived destinations), ExamineEntity, AskAbout and CHARACTER FormHypothesis all recorded the controlling-player premise. Assignment undo named exactly the action; dependent-first undo succeeded. Player results retained `events: []` and exposed no controller/premise metadata.                                                                                   |
| Privileged authority                       | DM and trusted internal system movement/hypothesis commands did not acquire a controller premise. Their unrelated assignments could be undone while those actions stood. No HTTP system actor was introduced or used.                                                                                                                                                                                   |
| Multiple empty inspections                 | Two inspections independently held a clock advance. Undoing the first left the second as the exact blocker; undoing the second allowed clock recovery. Empty compensation did not erase another command or release its dependencies.                                                                                                                                                                    |
| Concurrent assignment undo                 | **16 races**, eight per store; PostgreSQL used two engine instances. No race accepted both movement and assignment undo. Observed outcomes were either movement accepted with undo blocked, or assignment undone with movement denied. Both outcomes occurred in memory; PostgreSQL races observed undo winning. Sequential PostgreSQL tests also covered an accepted action blocking a later undo.     |
| Contradiction IDs, retries and redetection | A duplicate SetClaim produced no new event. Undo removed its contradiction while reserving the old ID. Reapplying the claim under a fresh command created a distinct ID with the same neutral statement and relations; both source records remained HYPOTHESIS. Memory and PostgreSQL produced the same IDs for the same causing commands. No claim aspect/value or liar verdict entered the statement. |
| Contradiction and knowledge isolation      | Repeated neutral Thorne/Mira contradiction, five-scope joint-audience oracle, explicit separate DM FACT authoring, immutable hypothesis/testimony types, NPC noninterference, DM-only claims and player-authority rejection tests. No new violation reproduced.                                                                                                                                         |
| Memory and context                         | Exact permitted sets, direct IDs, text/entity/location/time/kind/session/limit filters, impossible-memory rejection, hidden-memory score stability, context crawl, undiscovered-clue noninterference, failed/empty/successful checks and discovery memories passed. Malformed/forged scopes, uniform absence, metadata filtering and interleaved reads remained scoped.                                 |
| Replay and current canon                   | Historical replay and integrity checks passed throughout the extended recovery scenarios. The repository's re-decision oracle additionally found no divergence after the tested undos. The oracle is supplementary evidence; the HTTP reproductions and state assertions independently establish the finding closures.                                                                                  |

Executable adjacent coverage is in [EXTENDED_PROBES.md](evidence/gate-02/retest-2/EXTENDED_PROBES.md). Existing randomized authorization/undo, contradiction, scope noninterference and replay suites also ran in the full baseline.

## Validation and method

`pnpm validate:ci-local` completed with **exit 0**:

| Check                                          | Independently observed result                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Frozen install, formatting, lint and typecheck | Passed                                                                                   |
| Context budget                                 | **192 active files**, none above 500 or 700 lines                                        |
| Unit tests                                     | **753 passed**, 56 files                                                                 |
| Clean build and migrations twice               | Passed                                                                                   |
| Seed twice                                     | **0 accepted / 83 existing commands**, stream version **92**, **21 entities**, both runs |
| Integration tests                              | **25 passed**, 6 files                                                                   |

Independent probes completed with no assertion failures: **1,236 HTTP requests** plus **4 explicit trusted-system command probes**.

| Recipe                                                             | Requests / purpose                                                                                                                |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| [LIVE_PROBES.md](evidence/gate-02/retest-2/LIVE_PROBES.md)         | **698 live GETs** against the built PostgreSQL server: scoped reads, filters, context, errors, authorization and response hygiene |
| [STATE_PROBES.md](evidence/gate-02/retest-2/STATE_PROBES.md)       | **202 HTTP-app requests**: original H01/H02 reproductions and broad Gate 02 controls in both stores                               |
| [ADJACENT_PROBES.md](evidence/gate-02/retest-2/ADJACENT_PROBES.md) | **132 HTTP-app requests**: original H03/M01 reproductions, reverse undo, reload and adjacent containment/disclosure checks        |
| [EXTENDED_PROBES.md](evidence/gate-02/retest-2/EXTENDED_PROBES.md) | **204 HTTP-app requests**, plus the four internal system commands: authority families, recovery, contradiction identity and races |

Applied `ASTRA_MASTER.md`, the Gate 02 mission, `ASTRA_REVIEW.md`, `EFFORT_MATRIX.md`, `AGENT_WORKFLOW.md`, the updated handoff, prior reports, context map and applicable directory instructions. The authoritative product/architecture sections and ADRs from the preceding reviews remain applicable; inspected this remediation's changes to ADRs 0007/0013 and the affected authorization, decision, event-schema, undo, footprint and contradiction-ID code. ADRs 0006, 0008–0014, the invariant document, Ravenford specification, adversarial families A/B/C/G/I/J and coverage ledger governed the checks. Builder validation claims were independently checked rather than used to waive requirements.

Environment: Node 25.8.1, pnpm 11.11.0, PostgreSQL 18 development setup. GitHub Actions itself was not run; the documented local equivalent passed. Scenario writes used isolated memory stores and three separately created throwaway PostgreSQL databases; all were dropped. Live probes made only GET requests. The ordinary development campaign stayed at seed version 92. The review's server was stopped cleanly; the existing PostgreSQL service was retained.

No implementation, existing tests, fixtures, handoff, remediation artifact or historical report was changed. New files are this report and its evidence directory.

## Final summary and future obligations

- **Open findings by severity:** Critical **0**, High **0**, Medium **0**, Low **0**.
- **Exact blocking findings:** None.
- **Invariants exercised:** 1, 3–9, 11–13, 19 and 20 within implemented Gate 02 surfaces. Invariant 6 was exercised through scoped NPC data, not runtime dialogue.
- **Invariants violated:** None reproduced in this retest.
- **Residual risk:** Finite probes do not prove the system bug-free or exhaust every concurrent schedule. Structured DM claims, current party membership, simplified perception/travel, policy-only disclosure and development authentication retain their documented limits.

The following remain **NOT YET IN SCOPE**, not passed by this report:

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

Gate 02 passes for `017ab0b4fb1386dfc994a46bb4d82b762aaba237`. The initial report and Retest 1 remain preserved historical FAILs. Stage 80 was not started; later implementation requires its own authorization. Review stops here.

PASS
