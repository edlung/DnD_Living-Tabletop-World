# Gate 04 — NPC Isolation — Retest 1: PASS

## Review header

- **Review ID:** ASTRA-GATE-04-RETEST-1
- **Stage/Gate:** Stages 100–130 / Gate 04, NPC Isolation
- **Commit/Build:** Remediated code `987c22377bd571c86ad84187e810c95d78b511c5`; tested HEAD `a5befed7d98f2ee9aaf2872cfb990e0c7f68d686`. The later commit changes only README, the handoff and the remediation report.
- **Date:** 2026-10-04
- **Reviewer model:** GPT-6 (Codex), independent review context. Astra/MAX was requested; the exact runtime variant and effort were not exposed for independent verification.
- **Inputs:** [Retest handoff](../handoffs/ASTRA_GATE_04_REQUEST.md), [initial FAIL report](ASTRA_GATE_04_REPORT.md), [remediation](../remediation/OPUS_GATE_04_REMEDIATION.md), architecture invariants, workflow/effort policy, applicable ADRs 0006–0010, 0012–0014 and 0017–0020, Ravenford/adversarial requirements and the gate coverage ledger. Builder claims were treated as non-authoritative.
- **Surfaces tested:** Proposal revisions/options/commit/undo, competing requests within and across processes, retries, process loss and restart; reaction-pause suggestions; exact NPC provider inputs, permissions, disclosure, evidence, Insight, traces, authoring validation/continuity/provenance and current/historical undo.
- **Overall result:** PASS
- **Required surfaces unavailable:** None in the implemented backend scope. HTTP checks use authenticated Fastify handlers through `inject()`. No separate listening deployment or live external model was exercised. Future obligations remain below.
- **Owner-approved dispositions:** Existing ADR 0020 choices remain: scoped sayable context, guarded-topic names, attitude-dependent tone, unavailable Trade and deterministic monster suggestions. ADRs 0018/0019 retain explicit confirmation and continuity options; ADRs 0006/0007 retain conservative older-history protection. No exception was needed to close the three findings.

## Decision and retest findings

**G04-H01, G04-M01 and G04-M02 are closed.** No new blocking finding was demonstrated. All **1273 unit tests and 61 integration tests** pass, alongside the independent probes below. This supersedes the initial FAIL for the reviewed revision; it does not approve future stages.

### G04-H01 — CLOSED: revisions and canonical writes have one order

The service now places edits, option application, commits and undos inside the proposal store's exclusive section. PostgreSQL holds a transaction-scoped advisory lock on a dedicated pool while the protected operation reads and writes; the in-memory store queues operations on the same proposal. The fresh revision and canonical checks occur inside that section.

The independent [race recipe](evidence/gate-04/retest-1/AUTHORING_RACE_PROBES.md) exercises **64 ordered schedules**: every ordered pair of direct edit, explicit option, commit and undo, starting from both DRAFT and COMMITTED. There are 32 in-memory cases through two application instances in one process, and **32 PostgreSQL cases using two actual child Node processes with independent engines and pools**. The database-backed cases create proposals through AI traces; a third process checks persisted results after both writers stop.

The scheduler pauses after a real protected revision read. For PostgreSQL, an ungranted advisory lock proves the competing operation is waiting before the first resumes. No stored revision or canonical event is fabricated. A winning edit invalidates revision 1; a winning commit prevents subsequent editing. Competing edits cannot both advance revision 1. Commit/undo pairs follow their valid serial order, including both succeeding when commit precedes undo. Canonical contents, latest/committed revision, replay, integrity and restoration after undo all match the expected order. Source trace provenance remains readable after restart.

Two additional cases kill a writer before its write or after successful commit. A surviving process completes or returns the original duplicate, without a second canonical application. These checks close the demonstrated violations of **invariants 3 and 16**. See [results](evidence/gate-04/retest-1/authoring-race-results.json), `matrix` and `recovery`.

### G04-M02 — CLOSED: retry returns the original duplicate

Identical commits reach the World Engine's stable command identity instead of the former blanket already-committed rejection. The independent checks compare the entire duplicate result, not merely its status. Identical retries return **200 / duplicate** without new events, before/after restart and after undo. Retrying an undone commit does not resurrect its effects; retrying undo is also a duplicate.

Different revision, risk confirmation or validly shaped warning acknowledgement returns **409**, with unchanged event count. Concurrent identical commits are included in the ordered race matrix. See the same [recipe](evidence/gate-04/retest-1/AUTHORING_RACE_PROBES.md) and [results](evidence/gate-04/retest-1/authoring-race-results.json), `retries` and `matrix`.

### G04-M01 — CLOSED: no turn suggestion during a reaction pause

The suggestion function applies the shared combat-pause guard. In four independently seeded PostgreSQL worlds, the Shaman's cast opens a reaction window and GET returns **`suggestion: null`**, including after restart. An attempted EndTurn remains rejected as `REACTION_PENDING`, without mutation.

The four resolution paths are DM close/expiry, decline, successful Counterspell and failed Counterspell. After each, movement and end-turn suggestions are accepted unchanged by the World Engine. Player/outsider access remains 403/404; replay and integrity pass. See [recipe](evidence/gate-04/retest-1/SUGGESTION_PROBES.md) and [results](evidence/gate-04/retest-1/suggestion-results.json).

## Independent validation and evidence

| Check                                                                                                                                      | Result                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                                                                                | PASS — 117 files, 1273 tests                                                                                                           |
| `pnpm test:integration`                                                                                                                    | PASS — 15 files, 61 tests                                                                                                              |
| `pnpm lint`, `pnpm typecheck`, `pnpm build`                                                                                                | PASS                                                                                                                                   |
| `pnpm context-budget`                                                                                                                      | PASS — 378 active files; none over 500/700 lines                                                                                       |
| `pnpm format:check`                                                                                                                        | PASS after formatting the new artifacts                                                                                                |
| [NPC recipe](evidence/gate-04/retest-1/NPC_PROBES.md) / [results](evidence/gate-04/retest-1/npc-results.json)                              | PASS — Mira, Orin and Thorne; 66 exchanges, **72 exact provider requests**                                                             |
| [Authoring recipe](evidence/gate-04/retest-1/AUTHORING_PROBES.md) / [results](evidence/gate-04/retest-1/authoring-results.json)            | PASS — 18 groups covering PUBLIC intent context, permissions, validation, options, confirmation, atomicity, stale world and provenance |
| [Race/retry recipe](evidence/gate-04/retest-1/AUTHORING_RACE_PROBES.md) / [results](evidence/gate-04/retest-1/authoring-race-results.json) | PASS — 64 ordered races, 4 retry groups, 2 process-loss cases; 34 PostgreSQL databases                                                 |
| [Suggestion recipe](evidence/gate-04/retest-1/SUGGESTION_PROBES.md) / [results](evidence/gate-04/retest-1/suggestion-results.json)         | PASS — 4 reaction-resolution paths, restart, post-resolution legality and permissions                                                  |
| [State recipe](evidence/gate-04/retest-1/STATE_PROBES.md) / [results](evidence/gate-04/retest-1/state-results.json)                        | PASS — 44 cases: disclosure matrix, named dependencies, reverse recovery and Insight                                                   |
| [History recipe](evidence/gate-04/retest-1/HISTORY_PROBES.md) / [results](evidence/gate-04/retest-1/history-results.json)                  | PASS — 103 old-reader prefix comparisons, 102 undo attempts, PostgreSQL historical refusals and 12-command reverse recovery/reload     |

The six executable recipes and fresh results are indexed in [results.json](evidence/gate-04/retest-1/results.json). Earlier evidence remains unchanged. The NPC, authoring, state and history recipes retain the initial review's positive assertions and were independently rerun; race and suggestion recipes now assert the required fixed behavior and additional adjacent cases.

No forbidden information was demonstrated in the captured NPC requests. The checks include all five attitudes, three injection lines, positive allowed-context assertions, forbidden/guarded/cross-NPC markers, fallback and repair, false claims of canonical action, trace persistence, permissions and refusal to convert NPC traces into authoring proposals. Talk leaves canon unchanged; unsupported Trade is rejected.

Disclosure checks cover FACT, SECRET, UNKNOWN and CONTRADICTION across attitudes and shown/not-shown evidence. Answers protect their source and unlocking dependencies; generated-name dependencies resist unsafe undo. Insight failure does not distinguish hidden knowledge from nothing found in the checked outcomes. The historical comparison executes the actual Stage 120 reader at `b7a1a92fa5886c271d623d3a7a87fdeec9c7f8bf`, omitting only the newly introduced empty `investigation.shown` collection for state comparison. Historical events are never rewritten. Of 102 candidate undos, 101 are refused safely and the newest succeeds; explicit reverse recovery of all 12 scenario commands succeeds.

## Coverage ledger and future obligations

| Due surface                                                                                    | Disposition                                                                                   |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Stage 100 intent horizon, providers, validation, fallback and traces                           | PASS — full suites and exact provider/context checks; no automatic mutation                   |
| Stage 110 authoring permission, validation, consent, atomicity, provenance, revisions and undo | PASS — full suites, authoring probes and expanded concurrency/retry/restart checks            |
| Stage 120 continuity, options, relationships and lore                                          | PASS — full suites; independent temporal, warning, risk and option checks                     |
| Stage 130 NPC context, replies, disclosure, evidence and Insight                               | PASS — captured requests, disclosure matrix, permissions and persistence                      |
| Context actions/results and monster suggestions                                                | PASS — alignment/leakage suites, unavailable Trade refusal and four reaction-resolution paths |
| Earlier writers and Gate 01–03 shared boundaries                                               | PASS — all suites rerun; historical comparison, undo sweep, continuation and reload           |

Future surfaces are **NOT YET IN SCOPE**, not passed:

| Surface                                                                              | Introduction / next review                                                                                                                    |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Relevance ranking                                                                    | Stage 140 / Gate 05                                                                                                                           |
| Asset identity, metadata, lineage, visual history and authoring jobs                 | Stages 150–160 / Gate 05                                                                                                                      |
| Chronicle/flashbacks citing dialogue through canonical records                       | Stage 170 / Gate 05                                                                                                                           |
| Complete backend Ravenford integration                                               | Stage 180 / Gate 05, reviewed at Stage 190                                                                                                    |
| UI consumers, stale proposals, perspective changes, conversation and monster-turn UI | Stages 200–230, especially 220–230; introducing-stage boundary/E2E checks and Stage 250 release evidence; reopen affected gates when required |
| Production authentication                                                            | Its own ADR before deployment / Gate 05 at the latest                                                                                         |
| Economy/Trade, other or monster reactions, reaction chains/timers                    | Unscheduled owner decisions / first gate after introduction                                                                                   |

## Limits and final summary

- **Open findings:** 0 Critical, 0 High, 0 Medium, 0 Low. **Exact blocking findings: none.** All three original findings are closed by this retest.
- **Invariants exercised:** 1–13, 16–18 and 20–22 through this gate and the prior regression suites. No invariant violation was demonstrated in the exercised cases.
- **Evidence limits:** Finite inputs and controlled schedules do not exhaust model behavior or possible histories. Providers were local/scripted, with injected-fetch adapter tests in the suite; no live external model or separately listening deployment was tested. Process-kill recovery does not certify every network partition, database failover or failure within storage transactions.
- **Operational limit:** Proposal locks have no timeout and the dedicated production pool has four connections. A hung section can hold its proposal until its connection ends; additional sections can queue. This retest demonstrates serialization and process-loss recovery, not a latency/availability bound.
- **Execution:** A complete independent recipe run creates/removes 42 owned PostgreSQL databases and one old-reader archive. Offline frozen dependencies serve the old reader. No development database reset, root dependency reinstall, full CI wrapper or deployment was performed.
- **Changed files:** Only this report and new evidence under `reviews/evidence/gate-04/retest-1/`. Production code, existing tests, fixtures, handoffs, remediation and all prior reports/evidence are unchanged.

**Gate 04 passes.** Under `AGENT_WORKFLOW.md`, PASS permits the owner to authorize Stage 140; it does not start that stage. Its builder setting is **Claude Opus 5.5 / HIGH** per `EFFORT_MATRIX.md`. No implementation or later-stage work was performed. Review stops here.

PASS
