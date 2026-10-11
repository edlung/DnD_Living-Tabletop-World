**Verdict: PASS**

The repaired artifact fixes all three findings from my first review, and I found no new Critical, High or Medium defects. One thing to know before you rely on this: `pnpm run test:integration` failed in 2 of my 7 full runs, both with 30 s timeouts. That test is pre-existing and unchanged by this repair. The last 4 full runs and every isolated run passed; details are in sections 2 and 3.

## 1. Artifact identity verified

- **Snapshot:** `/private/tmp/ltw-stage300-checkpoint-b2-review/xhigh-snapshot`. It has no git metadata, so I could not check the base commit `9be1307…` or that the manifest lists every changed file.
- **Repair 1 manifest:** all 113 `shasum -a 256` entries match the snapshot. The listing hash is `589b980e3be3787ac41f7d6a29c6dff8514806355bf482c7b8d7b9d288feb20e`, as stated in the handoff.
- **Design draft 7:** `23e53e4d…aab2`, and the **stop-scope delta:** `6bba0030…b485`. Both are unchanged.
- **Environment:** no `.env*` files other than `.env.example`. Node v25.8.1.

## 2. Findings

### My earlier findings

**M1 (an attempt could be sent after the deadline): fixed at the root.**
- **Fix:**
  - Every place that decides whether to send or start a provider now treats the request as over once `performance.now()` reaches `deadlineAtMs`, not only when the abort signal has fired.
  - This applies in `fallback.ts:167`, `admitted-provider.ts:100`, and `raw-provider.ts:89`.
  - An admission that commits after the deadline is released straight away (`admitted-provider.ts:148-151`).
  - The provider's own timeout is clamped to the time left (`raw-provider.ts:105`).
- **My original probe, re-run:** an admission committing after the deadline now produces no `fetch`, no key read and no `onStart`; the store calls are `admit` then `release`. Late failures, denials, refusals and valid outputs all end `CALLER_CANCELLED`, and the local provider is called 0 times.
- **Regressions:** these use a signal that never fires plus a busy-wait past the deadline:
  - `admitted-provider-holds.test.ts`
  - `fallback-deadline.test.ts`
  - `request-lifecycle.test.ts:176`
  - `raw-adapter-hardening.test.ts:188-238`
- **Would they fail without the fix?** I can't run the unrepaired code any more. They would fail on the behaviour my first-round probes measured: `fetch` called once and a local switch.

**L1 (provider message ID lost for held attempts): fixed.**
- **Fix:**
  - A new append-only table, migration `0008_ai_attempt_responses.sql`.
  - Its ID checks use the same pattern as the adapters' `safeIdentifier`.
  - Writes are idempotent and retried.
  - The DM diagnostic reads it only through that campaign's own attempts (`diagnostics.ts:71-78`).
- **Probe:** the message ID is now recorded for unexpected-model, unknown-usage, missing-usage and settled responses.
- **Regressions:** the wrapper tests and `suspect-records.integration.test.ts`, which also checks append-only enforcement and rejection of unsafe IDs.

**L2 (a failed automatic stop was not retried): fixed.**
- **Fix:**
  - `holdWithStop` is now idempotent per attempt and reason, under the attempt's account lock (`settlement.ts:146-161`).
  - It is retried at 100, 500 and 2,000 ms (`accounting-tasks.ts:88-103`).
  - Until the stop commits, the process refuses the route before admission (`admitted-provider.ts:108`).
- **Probe:** the refusal has the right scope. An unexpected-model stop blocks that provider and model; an unverified-billing stop blocks the whole provider. If the write fails permanently or the process shuts down, the route stays refused and `STOP_FAILED` is reported.
- **Regressions:** the PostgreSQL tests cover a stop write blocked past its 5 s bound, repeated ambiguous COMMIT answers that still produce exactly one stop row, and a retry after operator clearance that appends nothing.

### New finding

**L-N1 — Low, pre-existing and not introduced by repair 1: a test that hides its real failure behind a timeout.**
- **Where:** `apps/server/src/ai/accounting/transaction-bounds.integration.test.ts:231-258`. Run 1's error location points at the neighbouring `it.each` test (lines 174-208) in the same file.
- **What happened:** the test timed out at 30 s in 2 of 7 full integration runs.
- **Why the real error is hidden:** the `holder` client is released only after the first `expect`. Any error before that point leaves `finally { await pool.end() }` waiting forever. When the throwaway database is then force-dropped, the still-held connection is cut (`57P01`, "Connection terminated unexpectedly"), which is exactly the error I saw.
- **Not caused by this repair:**
  - The test file and the code it exercises are byte-identical to the initial artifact that passed in my first review: `admission.ts`, `pg-transaction.ts`, `deadline.ts`, `testing/accounting.ts`, and the admit path of `postgres-budget-store.ts`.
  - Isolated: the file passed 5 of 5 times, including twice alongside a full suite I ran to add load.
  - Load: the failures happened while the machine's load average was about 10 from other processes.
  - Connections: the suite peaked at 19 of 100 PostgreSQL connections, so exhaustion is ruled out.
- **Cause:** most likely a storage stall under load, with the real error masked by the hang. I could not identify the exact assertion.
- **Fix:** release `holder` in the `finally` block.

## 3. Checks

| Check | Result |
|---|---|
| `format:check` | PASS |
| `lint` (max warnings 0) | PASS, exit 0 |
| `typecheck` | PASS, exit 0 |
| `context-budget` | PASS: 686 files, 0 over target, 0 over hard limit |
| `test` (unit) | PASS: 197 files, 2170 tests |
| `build` | PASS |
| `db:migrate` | PASS: nothing applied, 8 already applied (`0008` was already in the shared dev DB) |
| `seed:ravenford` | PASS: 0 accepted, 91 duplicates, version 113 |
| `test:integration` | 5 of 7 full runs PASS (31 files, 173 tests). 2 runs failed with 1 timeout each (L-N1). The last 4 consecutive full runs passed. |
| `test:e2e` | PASS: 45 tests (ports 4310 and 4311 were free) |

## 4. Probes

1. **Late admission commit, and deadline passing while the key is read:** no transport and a live release in both cases. In the second case the key is read once, before the boundary check, and nothing is sent.
2. **Fallback at the deadline** (signal still live): late outage, denial, refusal and valid output all end `CALLER_CANCELLED` with 0 local calls.
3. **Provider message ID recording:** recorded for all four response types.
4. **In-process refusal:** scope, counting across two concurrent stops, a failed write rejected outright, and shutdown during retries all fail closed.
5. **Integration flake diagnosis:** load average, connection peak, isolated and concurrent runs, and file hashes, as described in L-N1.

**Code review of the rest of the delta found no problems:**
- Migration 0008 is additive and append-only, with update, delete and truncate triggers and a foreign key to attempts.
- `types.ts` only adds `recordResponse`.
- The generic `settleWithRetry` keeps settlement behaviour the same.
- The ADR "B2 repair 1" amendment and the context-map, `GATE_COVERAGE` and `AGENTS` updates match the code.
- No envelope, trace or prompt changes.

Everything I verified in the first round still holds: zero outbound with the empty verified catalog, the stop-scope predicate, catalog fail-closed behaviour, and diagnostic isolation between campaigns.

## 5. Residual risks and what I could not verify

- **Owner-approved deferrals:** an admission whose COMMIT was sent but not confirmed keeps any hold until the operator reconciles it, and its trace says "not dispatched, cost 0". Sonnet 5.5 usage/model allowlists wait for catalog verification.
- **In-process refusal is per process.** Other processes, and this one after a restart, rely only on the committed stop. If every retry fails, no stop row exists until the operator acts on `STOP_FAILED`.
- **Response records are best-effort.** If all retries fail (`RESPONSE_NOT_RECORDED`), the ID survives only in the provider's logs.
- **Integration suite reliability under load:** L-N1 may recur on a busy host. A quiet-host rerun or the one-line test fix would remove the doubt.
- **"Would fail without the fix"** for the new regressions is inferred from my first-round probes and the test construction, not demonstrated on the unrepaired code.
- **Not certified offline:** live provider behaviour, cache semantics, and the per-model proof that reservations cover real charges.
- **Same model family:** both reviewers are Opus 5.5.
