<!-- prettier-ignore-start -->
# Stage 300 checkpoint A (repair 1): independent acceptance review, Opus

**Verdict: PASS.** I found no blocking findings for checkpoint A. This review alone doesn't accept the checkpoint; the independent Sol review is also required.

## Artifact and role
- **HEAD:** `406904343bfe8542640035564d3e044561824125`.
- **Manifest:** `/tmp/ltw-stage300-checkpoint-a/repair1-frozen.json`, SHA-256 `d4f97d28…8b442`, 78 entries.
  - All 78 file hashes matched before and after my checks. `apps/server/src/ai/budget.ts` is absent.
  - The working tree has exactly 78 dirty paths, all of them in the manifest.
- **Handoff:** hash `d5052c2e…9922` matches. I checked the hash only and did not read the text.
- **Design:** `docs/STAGE_300_REMEDIATION_DESIGN.md` hash `23e53e4d…aab2` matches. I read §1, §2, §4 and the checkpoint section.
- **Role:** fresh, independent acceptance reviewer, Claude Opus 5.5 (`claude-opus-5-5`). The requested effort was xhigh; I can't observe the runtime effort setting from inside the session.
- **Read:** root `AGENTS.md`, `EFFORT_MATRIX.md`, `docs/AI_CONTEXT_MAP.md`, the server, migrations and accounting `AGENTS.md` files, ADR 0032 amendment, and all of checkpoint A's source and tests.
- **Not read:** the handoff text, any checkpoint A review or receipt, `docs/PROJECT_WORKFLOW.md` status, implementation streams or reports, peer verdicts, or `.env.local`.
- **Not done:** no paid, provider or network calls, no writes to the repo, no commits, and no format, build, migrate, seed, full validate or dev-database work.

## Checks run
| Check | Result |
|---|---|
| Focused unit tests (`ai`, `testing/eval`, `platform/config`), run twice | 73/73 passed both times |
| Integration tests (`ai`, including accounting, and `platform/db`), run twice in throwaway databases | 60/60 passed both times (50 of them are accounting) |
| Did the repair change migration, gateway, eval, `main.ts` or config? (pre-repair vs repaired manifest hashes) | No. The repair changed only `ai/accounting/*`, `testing/accounting.ts` and the accounting `AGENTS.md` |
| Remote adapter imports outside unit tests; HTTP paths to the operator store | None. `main.ts` only reads the status counts |
| Leftover price table, `SpendLedger`, `budgeted`, `LTW_AI_DAILY_BUDGET_USD` | Removed. A set `LTW_AI_DAILY_BUDGET_USD` now only produces a startup warning |

My own counterexamples were run with real PostgreSQL in throwaway databases. The scripts are in `/tmp/ltw-opus-review-ce/ce1-4*.ts`, outside the repo.

| Counterexample | Observed |
|---|---|
| Settings answered after 100 ms under a 40 ms deadline | Denied `CALLER_CANCELLED` at 41 ms. Only `BEGIN`, `SHOW` and `set_config` were sent: no application SQL, no `COMMIT`. Connection destroyed (pool count 0) |
| `BEGIN` / `SHOW` answered after 600 ms under a 150 ms deadline | Returned at about 151 ms. Nothing was sent after the delayed statement; connection destroyed |
| `COMMIT` answered after 6.5 s, 20 s caller | `ADMISSION_UNAVAILABLE` / `COMMIT_UNKNOWN` at 5,002 ms. The hold did commit and blocked the next admission (`BUDGET_DENIED:SESSION`) |
| Request start with 200 ms delays on `BEGIN`, `SHOW` and settings, 2 s caller | Stored deadline window 1,380 ms: it was not extended |
| Request start whose `COMMIT` answer is late | Reported `failed` at 303 ms; the orphan row exists for recovery |
| `pg_sleep(3)` under a 200 ms deadline | Timed out at 202 ms; the server-side statement was gone afterwards |
| Pending 1,000 hold whose caller recorded `TIMEOUT` | Four batch shapes refused (`ATTEMPTS_UNRESOLVED` ×3, `WINDOW_NOT_COVERED`). Evidence of 10 left the effective charge at 1,000 |
| Hold 500, session 1,000: settle 300, then 900, plus variants | Outcomes: settled, duplicate, evidence, duplicate, then evidence for each differing usage, returned model or request ID. Effective 900, `OVERRUN` stop, one terminal row. 700 blocked; after clearing the stop, still `SESSION`; 100 admitted (exactly 1,000) |
| 12 concurrent 300 admissions over 3 pools | Session ceiling 1,000: 3 admitted. Stage ceiling 1,000 across 12 sessions: 3 admitted. 18 concurrent mixed settle/release calls: no errors, one terminal row per attempt |
| Schema constraints | A second terminal row is rejected (23505); a zero ceiling is rejected (23514) |
| Append-only | `UPDATE`, `DELETE` and `TRUNCATE` rejected on all 12 tables |
| Release, then a billed charge of 200 | Recorded as evidence with a `DISCREPANCY` stop; effective 200 |

My first append-only probe reported a false failure: five tables were empty, so the row-level triggers had nothing to fire on (`TRUNCATE` was rejected everywhere). Rerun with every table populated, it passed.

Rotated approvals, restart, midnight, session limits, evaluation-run binding, the `REPEATABLE READ` negative control and the offline-eval fetch trap are covered by repo tests I ran. I didn't write separate probes for them.

## Assessment against the A requirements
Every A requirement in the brief is met:
- **Store and money:** durable append-only PostgreSQL store, operator CLI and migration 0005. Four mandatory positive ceilings, checked in the schema and the CLI. Latest stored account and approval revisions are used. Grant references and evaluation-run bindings are immutable. Money is integer microdollars.
- **Locking:** one `READ COMMITTED` transaction per operation, which takes policy key -1 shared and then sorted, deduplicated bucket and account-control locks before reading totals. Operators take the policy lock exclusively, and request locks are never nested with bucket locks.
- **Settlement:** one terminal row per attempt. Effective charge is the maximum of absolute charges; an open attempt counts the larger of its hold and any evidence. Evidence never lowers a charge, overruns and discrepancies stop admission, uncertain holds are never refunded automatically, and startup only reports counts.
- **Request journal:**
  - The request start commits first, with the remaining time taken fresh as the `INSERT` is sent.
  - The finalizer writes outcome and trace atomically under the request lock, digesting the exact JSON string.
  - Recovery is diagnostic-only, runs only after the window and only from the CLI.
- **Gateway:** local-only. No remote adapter is built, no `Secret` is revealed and nothing is fetched, even with keys and routes set (tested with a `Secret` whose `reveal` throws).
- **Evaluation:** live mode exits 2 before reading configuration. Offline runs write fresh, write-once files and report the real relevance deadline.
- **Repair delta:** every specific item in the brief holds.
- **ADR 0032:** the historical-results correction and the store decision are appended.

## Blocking findings
None.

## Non-blocking risks
1. **Medium, decide before B2/live (`spend.ts:133-143`).** Overrun and discrepancy stops apply only to the approval. Reproduced: after an overrun on approval `a1`, approval `a2` on the same account and model was still admitted. An overrun means the model's bound is wrong, and that affects every approval using it, so an account-and-model stop may be the safer choice. A second approval does need its own owner grant.
2. **Low (`pg-transaction.ts:64-67, 202`).** Any five-character error code on `COMMIT` is treated as a definite answer. A fatal error after a local commit (for example, admin shutdown during synchronous replication) would be reported as `STORAGE` instead of `COMMIT_UNKNOWN`. At A the hold still stays in the database and is counted; only the label is wrong. Fix: treat error classes `08`, `57P` and `XX` as unknown.
3. **Low (`request-journal.ts:104-135`).** The finalizer checks its window at the `SELECT`, so its `COMMIT` can land a few milliseconds after the window closes. Uniqueness still holds because recovery waits for the request lock. Fix: repeat the window condition in the outcome `INSERT`.
4. **Known (`request-journal.ts:147-149`).** Recovery takes the exclusive policy lock before the request lock, so admissions can stall up to 5 s per locked request during a sweep. This affects availability only, not spending.
5. **Known, conservative (`request-journal.ts:75, 131`).** The digest is over the caller's exact string while the trace is stored normalized as JSONB. The worst case is a false "conflict", never an overwrite.
6. **Known (`admission.ts:66-74`).** Admission doesn't check whether the request already has an outcome or has passed its deadline in the database. Wiring this in B2 would add defense in depth.
7. **Known (`admission.ts:91`, `spend.ts:42`).** The campaign-day bucket is shared across approvals, but each approval applies its own ceiling, so the effective daily cap is the largest ceiling among the approvals used.
8. **Low (`eval-output.ts:21-37`).** The historical-evidence guard compares paths without resolving symlinks. Write-once files and a fresh directory still prevent any overwrite; at most, new files could be added inside the historical directory.
9. **Low (`gateway.test.ts:111`).** The import check that keeps remote adapters out of production code skips `src/testing/`, where the eval runners live. That folder is clean today; B2's construction-path check should cover it.
10. **Low (`request-journal.ts:66-71`).** `startRequest` reports every failure, including an unknown approval or duplicate ID, as `UNAVAILABLE`. B2 callers need to know this.

## Product limitations
- No verified pricing catalog exists, so nothing can be admitted or dispatched for real.
- The AI request lifecycle isn't connected to the store.
- Owner decisions are still pending: ceilings set by the CLI rather than the environment, and DM preparation and Chronicle rendering being local-only after a play session closes.
- Live acceptance is deferred, and B1, B2 and C haven't started.

## Not independently verified
- The writer's full validation counts (1661 unit / 128 integration / 45 e2e). Full validation wasn't permitted.
- That the 14 regression tests failed on the unrepaired code first. The pre-repair source isn't in the tree; I only confirmed which files the repair changed, by hash.

## Scope
This covers checkpoint A only. Nothing from B1, B2 or C is required or present. The changed process documents (`AGENTS.md`, `AGENT_WORKFLOW.md`, `CHECKPOINTS.md`, `EFFORT_MATRIX.md`, `HANDOFF_TEMPLATE.md` and the nested `AGENTS.md` files) are part of the frozen artifact. I checked them for consistency only, not as implementation scope.

**PASS. STOP.**
<!-- prettier-ignore-end -->
