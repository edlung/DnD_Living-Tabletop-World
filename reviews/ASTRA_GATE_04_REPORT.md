# Gate 04 — NPC Isolation: FAIL

## Review header

- **Review ID:** ASTRA-GATE-04-INITIAL
- **Stage/Gate:** Stages 100–130 / Gate 04, NPC Isolation
- **Commit/Build:** `0f2ae9071a8b7ac558f7c0b8bae1302f1f15ef9f`; tested at `b3e4bcf77258760f72df63421e9930f2fa1fabae`. HEAD adds only the Gate 04 handoff and Stage 130 completion report; implementation is identical.
- **Date:** 2026-10-04
- **Reviewer model:** GPT-6 (Codex), independent review context. Astra/MAX was requested; the exact runtime variant and effort were not exposed for independent verification.
- **Inputs:** [handoff](../handoffs/ASTRA_GATE_04_REQUEST.md), `ARCHITECTURE_INVARIANTS.md`, relevant architecture/Ravenford/adversarial requirements, ADRs 0006–0010, 0012–0014 and 0017–0020 with their applicable amendments, and `docs/GATE_COVERAGE.md`. Builder validation claims were treated as non-authoritative.
- **Surfaces tested:** Actual NPC provider requests, dialogue/fallback/traces, disclosure, showing evidence, Insight, DM intent context, proposals/revisions/confirmation, continuity/options, authoring concurrency/idempotency, current and historical undo, monster suggestions, permissions, replay and PostgreSQL restart.
- **Overall result:** FAIL
- **Required surfaces unavailable:** None in the implemented backend scope. HTTP probes use actual authenticated Fastify handlers through `inject()`; no separate listening deployment or live Anthropic model was exercised. Provider inputs were captured directly, including fallback and repair. Future surfaces are listed below.
- **Owner-approved dispositions:** ADR 0020 deliberately limits dialogue to sayable context, permits guarded-topic names and attitude-dependent tone, leaves Trade unavailable and uses deterministic monster suggestions. ADR 0019 defines acknowledged warnings separately from blocking continuity. ADRs 0006/0007 conservatively protect incomplete older records. **No owner-approved disposition accepts the findings below.**

## Decision

**Gate 04 fails on G04-H01:** a proposal edit and a commit of its superseded revision can both succeed, so the current revision no longer determines what becomes canonical. Two Medium defects also remain: an illegal monster suggestion during a reaction pause, and failed idempotent commit retries.

No forbidden NPC-context disclosure was demonstrated in the exercised scenarios. **1269 unit tests and 57 integration tests pass**, but their success does not cover the edit/commit interleavings or the open-window suggestion reproduced here.

Only this report and new evidence under `reviews/evidence/gate-04/` were added. Source, existing tests, historical fixtures, handoffs, completion reports and earlier reviews were preserved.

## Findings

### [G04-H01] Concurrent revision and commit bypass latest-revision confirmation

- **Severity:** High
- **Invariants:** **3 — DM HAS FINAL AUTHORING AUTHORITY** and **16 — AI mutations pass schema → permission → rules → continuity/lore → risk/confirmation → World Engine**. ADR 0018 §5 explicitly voids an earlier revision's preview and confirmation on edit; §6 requires concurrency-safe commit behavior.
- **Category:** AI / Permission / Concurrency / State
- **Preconditions:** A valid, uncommitted proposal exists at revision 1. Two DM requests overlap: an edit based on revision 1 and a commit naming revision 1. The reproduction creates the proposal from a valid AI trace and uses PostgreSQL for proposals, traces and canonical events.
- **Reproduction:**
  1. Create a proposal for NPC `g04-revision-npc`, named `Earlier approved name`, at the North Gate. Its revision is 1.
  2. Begin `POST /authoring/proposals/<id>/commit` with revision 1 and L2 confirmation. Pause after its real proposal-store SELECT reads revision 1.
  3. Complete `POST …/<id>/revisions`, based on revision 1, changing the NPC's name to `Latest edited name`. It returns **201**, revision **2**, status **DRAFT**.
  4. Resume the original commit. It returns **200 / accepted** and creates `Earlier approved name` from revision **1**.
  5. Restart the engine and read both the proposal and canon.
- **Expected:** Editing and committing a proposal have one consistent order. If the edit wins, committing revision 1 returns 409 and writes nothing. If the commit wins, editing the now-committed proposal returns 409. Both requests cannot succeed.
- **Actual:** Both succeed. After restart the proposal reports `revision: 2`, `status: COMMITTED`, and `commit.revision: 1`; its latest command names `Latest edited name`, while the canonical entity is `Earlier approved name`. Reversing the interleaving also reproduces the mismatch: an edit that read the old draft completes successfully after the commit has finished.
- **Evidence:** [Race recipe](evidence/gate-04/AUTHORING_RACE_PROBES.md), [results](evidence/gate-04/authoring-race-results.json), keys `edit-during-commit` and `commit-during-edit`. Both sequential controls correctly reject the losing operation. Each case has its own database; proposal ID `00000000-00a2-4000-8000-000000000001` is reused only across those isolated databases.
- **Cause:** [AuthoringService](../apps/server/src/authoring/service.ts) checks `committed(snapshot)` and `latest.revision` separately from the eventual writes: revision lines 135–139 and 175–181; commit lines 191–211. A revision append does not advance the campaign event stream. Consequently, World Engine optimistic concurrency cannot detect the intervening proposal edit, and the proposal store's unique revision constraint does not serialize an edit against a commit.
- **Impact:** An edited-away AI proposal can become canonical using confirmation the accepted contract has invalidated. The proposal's current content and committed content then disagree across processes. Ordinary replay and integrity checks still pass because they do not enforce proposal-revision authority.
- **Remediation direction:** Serialize revision changes and commit reservation/acceptance across the proposal and canonical-write boundary, including multiple server instances. A second unprotected read is insufficient. Preserve atomic world mutation, the latest-revision requirement, and correct retries.
- **Regression test required:** **Yes — `proposal_revision_and_commit_are_serializable`**. Exercise both interleavings with PostgreSQL and separate service/engine instances, plus sequential controls and restart. Assert that exactly one conflicting operation succeeds and the other returns 409, with no unconfirmed revision entering canon.

The recipe wraps the public `ProposalStore` interface only to schedule requests after the actual SELECT returns. It does not invent rows, change event contents, bypass authentication, or call a domain mutation outside the normal route.

### [G04-M01] Monster suggestion ignores the reaction pause

- **Severity:** Medium
- **Contract / invariant boundary:** ADR 0020 §5 requires a suggested **legal** action; ADR 0016 pauses combat while a reaction window is open. Invariant **9 — RULES DECIDE LEGALITY** is the relevant boundary. The World Engine still enforces it; no illegal canonical mutation was demonstrated.
- **Category:** Rules / State
- **Preconditions:** The Shaman is current in the standard ambush. Its suggested Ashen Bolt was accepted and opened Elowen's Counterspell window.
- **Reproduction:** As DM, GET `/campaigns/ravenford/encounter/suggestion` while that window remains open, then submit the returned command unchanged to `/commands`.
- **Expected:** No normal combat action is advertised as executable during the pause, for example `suggestion: null` until the window resolves.
- **Actual:** GET returns a `MoveCombatant` suggestion for the Shaman, with a six-square path from `(11,6)` to `(6,2)`. Submission immediately returns **422 / `REACTION_PENDING`** on the same state. The suggestion survives restart. Closing the window makes the movement control acceptable; subsequent end-turn advice is also accepted.
- **Evidence:** [Suggestion recipe](evidence/gate-04/SUGGESTION_PROBES.md), [results](evidence/gate-04/suggestion-results.json), key `openWindow`; window `00000000-0000-4000-8000-000000000078`, rejected command `http:dm-ravenford:g04-suggest-9`.
- **Cause:** [suggestMonsterTurn](../packages/combat/src/suggestion.ts) lines 37–51 do not check the open window. Its action planners do not include the separate kernel pause guard, and lines 92–101 can return movement or end-turn advice during that pause.
- **Impact:** The backend's proposed action is unusable in an ordinary reaction state. DM clients cannot rely on the stated legality guarantee. Player/outsider access remains blocked, and rejection changes no canon.
- **Remediation direction:** Include the reaction pause in the shared suggestion eligibility boundary without weakening command validation or automatically answering the window.
- **Regression test required:** **Yes — `monster_suggestion_is_unavailable_while_reaction_pending`**, through the domain and HTTP routes, with restart and post-close controls.

### [G04-M02] An identical successful commit cannot be retried idempotently

- **Severity:** Medium
- **Contract / invariant boundary:** ADR 0018 §5 explicitly requires an identical commit retry to return `duplicate`. This is an idempotency/API defect; no duplicate canonical mutation or separate canonical-integrity violation was demonstrated.
- **Category:** Events / State
- **Preconditions:** A proposal has just committed successfully; no edit or undo is necessary.
- **Reproduction:** POST `…/proposals/<id>/commit` with revision 1 and its confirmation; after receiving 200 / `accepted`, repeat the identical request body.
- **Expected:** An idempotent success identifying the original command, with `status: duplicate` and no new events. A conflicting revision or different submission must still be rejected.
- **Actual:** The identical retry returns **409 / `CONFLICT`**. The isolated `sequential-commit` case reproduces this without either race from H01.
- **Evidence:** [Race/retry recipe](evidence/gate-04/AUTHORING_RACE_PROBES.md), [results](evidence/gate-04/authoring-race-results.json), `sequential-commit.retry`. The same outcome occurs in both race cases after their accepted commits.
- **Cause:** [AuthoringService](../apps/server/src/authoring/service.ts) lines 195–196 reject any already-committed proposal before reaching the World Engine's fingerprint-based duplicate handling.
- **Impact:** A client retry after a lost successful response gets a conflict instead of the promised safe retry result and must perform a separate read to discover whether the commit succeeded.
- **Remediation direction:** Distinguish an identical committed request from a conflicting one, reusing the accepted command's identity and fingerprint semantics. Keep the single-commit guarantee and the fix for H01.
- **Regression test required:** **Yes — `identical_authoring_commit_retry_returns_original_duplicate`**, including restart, unchanged event count and conflicting-body/revision controls.

## Validation and evidence

| Check                                                                                                                    | Independent result                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                                                              | PASS — 116 files, 1269 tests                                                                                                                |
| `pnpm test:integration`                                                                                                  | PASS — 14 files, 57 tests                                                                                                                   |
| `pnpm lint`, `pnpm typecheck`, `pnpm build`                                                                              | PASS                                                                                                                                        |
| `pnpm context-budget`                                                                                                    | PASS — 376 active files; none over 500/700 lines                                                                                            |
| `pnpm format:check`                                                                                                      | PASS after formatting the new review artifacts                                                                                              |
| [NPC recipe](evidence/gate-04/NPC_PROBES.md) / [results](evidence/gate-04/npc-results.json)                              | 3 PostgreSQL worlds, 66 exchanges, **72 exact provider requests**; isolation/permissions/fallback/trace checks pass                         |
| [Authoring recipe](evidence/gate-04/AUTHORING_PROBES.md) / [results](evidence/gate-04/authoring-results.json)            | 18 groups pass: PUBLIC intent context, permissions, validation, continuity/options, consent, atomicity, provenance and stale-world controls |
| [Race/retry recipe](evidence/gate-04/AUTHORING_RACE_PROBES.md) / [results](evidence/gate-04/authoring-race-results.json) | 4 PostgreSQL cases complete: **H01 and M02 reproduced**; both sequential ordering controls pass                                             |
| [Suggestion recipe](evidence/gate-04/SUGGESTION_PROBES.md) / [results](evidence/gate-04/suggestion-results.json)         | 4 groups on PostgreSQL: **M01 reproduced**; post-close and permission controls pass                                                         |
| [State recipe](evidence/gate-04/STATE_PROBES.md) / [results](evidence/gate-04/state-results.json)                        | 44 cases pass: disclosure matrix, generated-name dependencies, reverse recovery, Insight and re-decision                                    |
| [History recipe](evidence/gate-04/HISTORY_PROBES.md) / [results](evidence/gate-04/history-results.json)                  | 103 old-reader prefix comparisons and 102 undo attempts pass; PostgreSQL historical refusals, 12-command reverse recovery and reload pass   |

All six recipes were executed from their final Markdown form. The vulnerability assertions deliberately confirm the defects; successful recipe execution is evidence for **FAIL**, not gate success. [Results index](evidence/gate-04/results.json) records revisions, counts, findings and limits.

The NPC probe covers Mira, Orin and Thorne under all five attitudes, three injection lines, showing/asking/Insight, fallback and repair. It examines full requests for planted world truth, DM data, guarded/secret content, other holders' information, unknown names and IDs. The fallback receives the same request. A scripted provider also returns false claims of canonical changes; the world remains exactly unchanged. Traces persist through restart, are DM-only, and cannot become authoring proposals. These checks do not certify arbitrary live-model prose.

The disclosure matrix covers FACT, SECRET, UNKNOWN and CONTRADICTION across five attitudes and evidence shown/not shown. Accepted answers protect their source, the relevant relationship and the showing that unlocked them. Renames quoted by ShowEvidence, AskAbout and Insight resist undo; explicit reverse recovery succeeds. Insight failure with and without hidden knowledge is indistinguishable in the checked outcomes; repetition is refused.

The historical comparison runs the actual `b7a1a92fa5886c271d623d3a7a87fdeec9c7f8bf` reader in an isolated archive. It omits only the current empty `investigation.shown` collection when comparing state digests, because that field did not exist in Stage 120. Of 102 candidate undos, 101 are safely refused and the newest succeeds. PostgreSQL checks preserve named-memory/disclosure dependencies and allow reversing the 12 old scenario commands while an unrelated current note stands. Historical events were never rewritten.

Nine throwaway PostgreSQL databases are created and removed by one complete run of the independent recipes. Old-reader dependencies use the frozen offline cache. No development database was reset. The root dependency reinstall, full CI wrapper, separate network listener, deployment and live external-provider call were not run; the adapter's injected-fetch tests are included in the unit suite.

## Coverage ledger and future obligations

| Due surface                                                                               | Evidence / disposition                                                                                                       |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Stage 100 PUBLIC context, provider routing, validation, fallback, traces                  | Full suites plus captured requests and authoring controls pass; no automatic mutation                                        |
| Stage 110 permission, validation, confirmation, atomicity, provenance, revisions and undo | Full suites and independent controls pass except **H01** revision concurrency and **M02** retry semantics                    |
| Stage 120 continuity, warnings/options, relationships and structured lore                 | Full suites; independent before-subject/after-death, option, warning and risk controls pass                                  |
| Stage 130 runtime NPC supplied context and replies                                        | 72 captured requests, full isolation suites, permissions and persistence pass in exercised cases                             |
| Guarded disclosure, evidence ownership, Insight and current undo                          | Independent matrix and generated-name/recovery checks pass                                                                   |
| Context Engine Talk/Insight/Show/Trade, relevance and result hygiene                      | Complete context alignment/leakage suites pass; unavailable Trade is rejected                                                |
| Monster suggestions                                                                       | Valid post-close/no-combat/character-turn controls and permissions pass; **M01** violates the open-window legality guarantee |
| Earlier writers and version boundaries                                                    | Old-reader comparison, 102 undo attempts, continuation/recovery/reload and version suites pass                               |
| Gates 01–03 shared permissions, knowledge, memories, context, rules, reactions and replay | Complete prior suites rerun; no additional regression demonstrated beyond the new suggestion consumer in M01                 |

Future surfaces remain **NOT YET IN SCOPE**, not passed:

| Surface                                                                          | Introduction / next review                                                                                                                          |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relevance ranking                                                                | Stage 140 / Gate 05 integration                                                                                                                     |
| Asset identity, metadata, lineage, historical visual state and authoring jobs    | Stages 150–160 / Gate 05                                                                                                                            |
| Chronicle/flashbacks; dialogue cited only through canonical records              | Stage 170 / Gate 05                                                                                                                                 |
| Complete backend Ravenford integration                                           | Stage 180 / Gate 05, reviewed at Stage 190                                                                                                          |
| UI consumers, stale proposals, perspective changes, conversation/monster-turn UI | Stages 200–230, especially 220–230 / introducing-stage boundary/E2E regressions and Stage 250 release evidence; reopen affected gates when required |
| Production authentication                                                        | Its own ADR before deployment / Gate 05 at the latest                                                                                               |
| Economy/Trade, other or monster reactions, reaction chains/timers                | Unscheduled owner decisions / first gate after introduction                                                                                         |

## Final summary

- **Findings:** 0 Critical, **1 High**, **2 Medium**, 0 Low.
- **Exact High blocker:** **G04-H01**. M01 and M02 also need remediation or explicit owner-approved disposition; none is currently recorded.
- **Invariants exercised:** 1–13, 16–18 and 20–22 through this gate and prior regression suites. H01 violates **3 and 16**. No NPC-context leakage or unauthorized canonical write was demonstrated in the tested isolation cases.
- **Residual risk:** Finite scripted inputs do not exhaust model behavior, histories or schedules. Provider isolation was tested from exact supplied requests, not a live remote model. Ordinary replay proves event consistency but cannot certify the external proposal-store/confirmation boundary; H01 illustrates that gap.

Return to **Claude Opus 5.5 / MAX**: add failing regressions, remediate the findings, write the remediation artifact and STOP. Then request **GPT-6 Astra / MAX Retest 1** at `reviews/ASTRA_GATE_04_RETEST_1.md`, preserving this report and evidence. **Stage 140 remains blocked.** No implementation fixes or later-stage work were performed; review stops here.

FAIL
