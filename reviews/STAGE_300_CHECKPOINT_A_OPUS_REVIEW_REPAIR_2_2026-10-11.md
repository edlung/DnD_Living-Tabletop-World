<!-- prettier-ignore-start -->
# Stage 300 checkpoint A (repair 2): bounded re-review 2, Opus

**Verdict: PASS.** I found no blocking findings for checkpoint A. This review alone doesn't accept the checkpoint; the independent Sol review is also required.

This report text is for `reviews/STAGE_300_CHECKPOINT_A_OPUS_REVIEW_REPAIR_2_2026-10-11.md`; I did not write that file.

## Artifact and role
- **HEAD:** `406904343bfe8542640035564d3e044561824125`.
- **Manifest:** `/tmp/ltw-stage300-checkpoint-a/repair2-frozen.json`, SHA-256 `0c5e7373…5e63e`, 84 entries.
  - All 84 file hashes matched before and after my checks. `apps/server/src/ai/budget.ts` is absent.
  - The working tree has exactly 84 dirty paths, all of them in the manifest.
- **Handoff:** hash `5c186a6a…9b27` matches. I checked the hash only and did not read the text.
- **Design:** `docs/STAGE_300_REMEDIATION_DESIGN.md` hash `23e53e4d…aab2` matches.
- **What changed since repair 1:**
  - **Code:** migration `0006_ai_outcome_window.sql` (new), `pg-transaction.ts`, `request-journal.ts` and their tests, `testing/accounting.ts`.
  - **Docs:** ADR 0032, the accounting and migrations `AGENTS.md` files, `docs/AI_CONTEXT_MAP.md`.
  - **Process files:** new or changed handoffs and reviews, plus `docs/PROJECT_WORKFLOW.md`. I checked these by hash only and did not read them.
  - Migration 0005, the gateway, eval, `main.ts` and config are byte-identical to repair 1.
- **Role:** the same independent acceptance reviewer session as re-review 1, Claude Opus 5.5 (`claude-opus-5-5`). The orchestrator configured xhigh; I can't observe the effort setting from inside the session.
- **Not read:** the handoff text or its copies, any checkpoint A review or receipt (including the new re-review 1 files), `docs/PROJECT_WORKFLOW.md`, or `.env.local`.
- **Not done:** no provider or network calls, no writes to the repo, no commits, and no format, build, migrate, seed, full validate or dev-database work.

## Checks run
| Check | Result |
|---|---|
| Focused unit tests (`ai`, `testing/eval`, `platform/config`), run twice | 86/86 passed both times |
| Accounting integration tests, run twice in throwaway databases | 60/60 passed both times |
| `ai-traces` and `platform/db` integration tests | 10/10 passed |
| `finalizer-window` and `request-journal` test files, run 6 times in a row | 15/15 passed every time |
| My re-review 1 counterexamples rerun on repair-2 code (`ce1`–`ce4`) | All held. The only "FAIL" is my known-flawed empty-table probe; the populated-table version passes on all 12 tables |

New counterexamples, run with real PostgreSQL in throwaway databases. The scripts are `/tmp/ltw-opus-review-ce/ce5-window.ts` and `ce6-commit.ts`, outside the repo.

| Counterexample | Observed |
|---|---|
| Window has 300 ms left, window read answered after 450 ms, caller allows 5,000 ms | `window-closed`. No outcome and no trace stored; recovery succeeds afterwards |
| Request lock held elsewhere past the window, caller allows 5,000 ms | `window-closed` after 293 ms, so the window bounded it, not the caller. Nothing stored |
| Trace `INSERT` answered after the window | `window-closed`; `COMMIT` was never sent; nothing stored |
| Timeout-settings statement before the outcome `INSERT` answered after the window | `window-closed`; the outcome `INSERT` was never sent |
| `COMMIT` applied inside the window but answered late | Throws `commitUnknown` at 399 ms, never reported as recorded. Outcome and trace are both present, and recovery stays not-eligible after the window |
| Clock skew simulated at `COMMIT` (moved the stored deadline into the past with a test-only trigger bypass in the throwaway database) | The deferred trigger aborts with `LT001`, `finalize` returns `window-closed`, outcome and trace roll back together, and recovery succeeds |
| Caller deadline shorter than the window and binding | Throws a caller timeout (not `window-closed`, not `commitUnknown`); a later retry inside the window records normally |
| Real `COMMIT` answered with `22012`/ERROR, `40003`/ERROR, `LT001`/FATAL, `EPIPE` (no severity), `XX000`/PANIC | All `COMMIT_UNKNOWN`. The hold persisted and blocked the next admission |
| Real `ROLLBACK` answered with `40001` or `40P01` at ERROR | `STORAGE`, no hold, next admission succeeds |
| Real `ROLLBACK` answered with `40001` at localized severity `ОШИБКА` | `COMMIT_UNKNOWN`: conservative, as specified |
| Settlement whose real `COMMIT` is answered `08006`/FATAL | `commitUnknown`; the retry is a `duplicate`; exactly one `settled` row |

## Assessment of the repair-2 delta
- **Finalizer (`request-journal.ts:97-200`):** the window cutoff is never later than the database's own window end.
  - It reads the window from the database before and after taking the request lock.
  - It sets the local cutoff to the time the read was sent plus the remaining window the database reports. Because the server executes after the send, a slow answer can only shorten the cutoff, never extend it.
  - It lowers the transaction deadline to that cutoff; lowering never raises it.
  - The outcome `INSERT` is itself conditional on database time.
  - If a timeout happens before `COMMIT` was sent, nothing can have committed; it maps to `window-closed` only when the window was the binding bound.
- **Migration 0006:** the immediate trigger and the deferred trigger enforce the same database-clock rule, and live and recovery windows can't overlap in database time.
  - The deferred trigger runs as `COMMIT` starts, before the commit record is written. Recovery waits on the request lock, so there can only ever be one outcome.
  - Recovered outcomes are unaffected, and migration 0005 is unchanged.
- **`COMMIT` classification (`pg-transaction.ts:71-94, 235-245`):** a commit counts as definitely rolled back only for an ERROR-severity answer with one of a short list of codes. Every other error answer, including FATAL, PANIC or a localized severity, stays `commitUnknown`. This resolves re-review 1 risks 2 and 3.
- **Unchanged guarantees:** everything else from re-review 1 still holds, now rechecked on repair-2 code. Every database wait is bounded, failed connections are destroyed, settlement keys are idempotent, batches require terminal accounting, there is one terminal row per attempt, evidence never lowers a charge, the gateway and eval are local-only, and the legacy ledger is gone.
- **Docs:** the ADR, the accounting and migrations `AGENTS.md` files and the context map match the code.
- **File sizes:** all within limits; the largest changed file is 330 lines.

## Blocking findings
None.

## Non-blocking risks
1. **Low (`request-journal.ts:153-159, 189-197`).** When `finalize` classifies a timeout, it compares against the latest window read, not the tighter of the two. In a narrow case (the first read sent more slowly than the second, with the caller deadline between the two cutoffs), a window timeout would be thrown as a caller timeout instead of returning `window-closed`. Nothing commits either way. Fix: keep the minimum of the two cutoffs.
2. **Low (`0006_ai_outcome_window.sql:14`).** The migration hardcodes `'5 seconds'`, duplicating `FINALIZER_GRACE_MS` (`request-journal.ts:25`). Changing one without the other would make them disagree. The SQL comment notes the coupling.
3. **Low, deployment note.** `node-postgres` reads the severity from the server's localized field. On a server with non-English messages, every `COMMIT` error is treated as unknown, including `LT001`, so `finalize` would throw `commitUnknown` instead of returning `window-closed`. This is conservative but worth knowing.
4. **Carried from re-review 1:**
   - Overrun and discrepancy stops apply only to the approval, not to the account and model. Reproduced again; decide before B2/live.
   - Recovery takes the exclusive policy lock before the request lock, so admissions can stall up to 5 s.
   - The digest is over the caller's exact string while the trace is stored as normalized JSONB.
   - Admission doesn't check whether the request is still open in the database.
   - The campaign-day bucket is shared across approvals, but each approval applies its own ceiling.
   - The historical-evidence guard compares paths without resolving symlinks.
   - The gateway's adapter-import check skips `src/testing/`.
   - `startRequest` reports every failure as `UNAVAILABLE`.

## Product limitations
- No verified pricing catalog exists, so nothing can be admitted or dispatched for real.
- The AI request lifecycle isn't connected to the store.
- Owner decisions are still pending: ceilings set by the CLI rather than the environment, and DM preparation and Chronicle rendering being local-only after a play session closes.
- Live acceptance is deferred, and B1, B2 and C haven't started.

## Not independently verified
- The writer's full validation counts (1674 unit / 138 integration / 45 e2e). Full validation wasn't permitted.
- That the 19 new regression tests failed on the unrepaired code first. The pre-repair source isn't in the tree.

## Scope
This covers checkpoint A only. Repair 2 enforces the already-approved §2 cutoff more strictly and narrows `COMMIT` uncertainty conservatively. It adds no new authority and nothing from B1, B2 or C, and none was required.

**PASS. STOP.**
<!-- prettier-ignore-end -->
