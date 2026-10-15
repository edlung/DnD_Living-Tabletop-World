<!-- prettier-ignore-start -->
# Stage 300 remediation checkpoint A: independent Opus acceptance review

**Verdict: FAIL.** One Medium finding blocks acceptance. The repair is small (one function and one test). Everything else I checked held up.

## Artifact identity (checked before and after the review)

- HEAD is `406904343bfe8542640035564d3e044561824125`.
- The manifest `/tmp/ltw-stage300-checkpoint-a/frozen-artifact.json` hashes to `89b3acc5…cb8c4c`. All 71 entries match the working tree, before and after review. The manifest set is exactly the dirty set (`--untracked-files=all`).
- `apps/server/src/ai/budget.ts` is absent before and after.
- Handoff `d6cf5a8a…e82` matches. Design `23e53e4d…aab2` matches.
- No repository file was modified. Probe scripts live only in `/tmp/opus-review-a-scripts/`. All my throwaway databases were dropped. The two leftover `ltw_it_*` databases are dated 2026-10-04, predate this review, and were left untouched.
- I did not open `stream.jsonl` or `report.txt` in the artifact directory, any peer verdict, `.env.local`, or any secret.

## Role and effort

- Requested role: `claude-opus-5-5` at xhigh, native Anthropic subscription, fresh clean session. Read-only reviewer.
- The supervising runner records the actual response model and effort; I cannot attest effort myself.
- No paid or provider calls, no network provider access, no other agents.

## Checks actually run

- **Reading:** the required documents (AI_CONTEXT_MAP, PROJECT_WORKFLOW, EFFORT_MATRIX, the applicable AGENTS files, invariants 2/11/18/21/22, the handoff, and design §1, §2, §4 at A plus "Checkpoints and required evidence" A). I read the migration, every source file under `accounting/`, `gateway.ts`, the `main.ts`/config diffs, the eval CLI/run/output/runners, and the tests.
- **Unit tests:** `vitest --project unit apps/server/src/ai apps/server/src/testing/eval apps/server/src/platform/config` passed: 9 files, 66 tests.
- **Integration tests:** `vitest --project integration apps/server/src/ai/accounting` passed in throwaway databases: 6 files, 44 tests.
- **Eval refusal:** `pnpm eval:ai` and `pnpm eval:ai --live` both exit 2 ("refused"), and no evidence directory is created.
- **Probes:** nine out-of-repo probes, P1–P9, against throwaway databases. Results are cited below.
- **Not run:** build, format, migrate, seed, full validate, `ai:operator` against the dev database.

## Blocking finding

### F1 (Medium): a second automatic settlement with a higher charge is silently discarded

**Where:**
- `apps/server/src/ai/accounting/settlement.ts:75-92`
- The test that asserts the wrong behaviour: `apps/server/src/ai/accounting/settlement.integration.test.ts:121`

**What happens:** `settle` always uses the key `settle:<attemptId>` with `ON CONFLICT DO NOTHING`, and never compares the charge it was given. Any second automatic settlement of the same attempt therefore returns `duplicate`, whatever its absolute charge. It writes no evidence row and appends no OVERRUN or DISCREPANCY stop.

**Why it matters:** the approved design (§1, lines 205–213) says:
- automatic settlement records an `evidence` row when a terminal row already exists;
- evidence cannot be ignored;
- later evidence may raise the charge, with a stop, but never lower it.

The finalizer already tells an identical repeat (`duplicate`) apart from different content (`conflict`); settlement does not. The integration test then locks in the wrong behaviour: it asserts `duplicate` for 250 when the effective charge was 200.

**Reproduction (P1):**
1. Session ceiling 1,000. Admit an attempt reserving 500.
2. `settle(300)` returns `settled`.
3. `settle(900)` returns `duplicate`. That charge is over the 500 bound and above the terminal 300.
4. The state now has one row (`settled 300`) and zero stops.
5. A new admission of 700 is `admitted`. Reported provider charges now total 1,600 against a 1,000 ceiling, with no stop.

**Required fix:**
1. Add the failing regression test first.
2. An identical repeat (same charge and metadata) stays `duplicate`.
3. A different charge must be appended as non-reducing `evidence` under a distinct key (for example, one derived from the charge and usage). It must go through `stopForCharge`, so a higher charge appends DISCREPANCY or OVERRUN. Alternatively, surface an integrity conflict and still append the evidence and the stop.
4. Correct `settlement.integration.test.ts:121`.

Nothing calls the store at A, so this is not reachable in production today. It is a defect in the store contract that B2 would build on, and it falsifies the handoff's "terminal idempotency / non-decreasing evidence" claim.

## Verified, no defect found

- **Local-only composition.**
  - The gateway builds `[local]`, `[local]`, `[local]`, `[]` whatever keys or routes are configured; a key alone is no route.
  - Only adapter unit tests import the remote adapters, and no `fetch(` or `reveal()` exists outside them, here or in `packages/`.
  - The `ThrowingSecret` and `fetch`-spy tests pass.
  - Eval refuses live mode before any configuration, provider or runner is constructed. The offline run strips keys and routes and reads the effective relevance deadline. Run directories are fresh and written with `wx`; the historical directory is refused. `eval:ai` no longer loads `.env.local`.
- **Four positive ceilings.**
  - The schema enforces `CHECK > 0`. Only the account owns the global ceiling: approval revisions have no column for it, and the CLI rejects the flag.
  - Admission takes the shared policy lock, then reads the latest revisions and the database UTC day, then takes the sorted, deduplicated, nonnegative 63-bit bucket and account-control locks (one statement each) before reading totals.
  - P3: two processes on different approvals and campaigns competing only on the account's global day; exactly one is admitted.
  - P4: concurrent admissions racing a ceiling-lowering revision serialize correctly.
  - The barrier, restart, midnight, revision, rotation, session and run tests are meaningful; for example, the barrier test fails if locks are dropped or totals are read before the locks.
- **Accounting.**
  - A partial unique index allows one terminal row per attempt.
  - Charges are absolute. A terminal attempt counts the maximum of its charge rows; an open attempt counts the larger of its hold and its evidence. No hold is ever subtracted.
  - Recovery never writes accounting rows, and there is no automatic refund.
  - A pre-dispatch release requires an explicit call, and startup only reports counts.
- **Locks and deadlocks.**
  - Admission and settlement: shared policy lock, then sorted bucket locks. Operator writes and recovery: exclusive policy lock, then (recovery only) the request lock. The finalizer takes the request lock only; request start takes no locks.
  - There is no wait cycle, and request locks are never nested with bucket locks. Advisory lock waits sit behind the transaction-local lock timeout.
  - READ COMMITTED is set explicitly and asserted; the REPEATABLE READ negative control works.
- **Deadlines.**
  - A timeout is never set to 0, and no database work starts once the deadline has passed.
  - Checkout races the deadline, and a client that arrives late is released untouched.
  - The storage step is the lesser of the request's remaining time and 5 s; work outside the caller's lifetime gets a fixed 5 s.
  - Stored request deadlines use `clock_timestamp()` plus the remaining monotonic time.
  - Recovery applies only after the stored deadline plus 5 s, under the exclusive policy lock and the request lock, and rechecks before writing. A late finalizer then loses.
- **Append-only schema.** P8: all 12 new tables (and `ltw_ai_traces`) have both the append-only and no-truncate triggers. Revisions reference the original grant by foreign key. Grant and provider-account references are unique.
- **Campaign-day bucket keyed by campaign and day across approvals.** This is strictly more restrictive than the design requires: it is shared even across billing accounts that bind the same campaign. The lock identity, the spend query and settlement (which uses the persisted day) all agree. Not a material architecture change.
- **Extra `attempt-evidence` command.** It is non-terminal and can never lower a charge. It runs under the exclusive policy lock with recorded authorization, and it stops on an overrun. The design's required test ("over-bound evidence on a crash-held open attempt before any terminal settlement") needs exactly this path. Consistent with the invariants.
- **Scope.** Nothing from B1, B2 or C is implemented or claimed: no outcome classification, no prepare/dispatch split, no use-case wiring, no diagnostic route, no nullable trace IDs, no eval admission. The adapter, contract and `packages/ai` source is unchanged. The ADR original text is preserved, and the caveat is appended.

## Non-blocking risks (address by the named checkpoint)

1. **Overrun stops only the approval** (`spend.ts:133-147`). P5: after an overrun on approval a1, sibling approval a2 on the same account and model is still admitted. This is consistent with the design's split into approval stops and provider/model/billing stops, but it lets another approval keep using a model whose bound has been proven wrong. Get an explicit architecture decision, or also stop the account's provider/model, before live enablement.
2. **The trace digest can't be checked against the stored trace.** The digest covers the caller's string (`request-journal.ts:97`), but `ltw_ai_traces.trace` is `jsonb`, which normalizes it. P2: sha256 of the stored text does not equal the digest. The "exact serialized trace" wording in the handoff and the test name overstates this. Duplicate/conflict detection still works. For B2: compute the digest over the canonical `jsonb::text`, or reword the claim.
3. **Recovery holds the exclusive policy lock while waiting up to 5 s on a slow request lock** (`request-journal.ts:144-145`). P6: admissions across all processes stall and end CALLER_CANCELLED or UNAVAILABLE. This follows the design; consider a try-lock.
4. **Admission doesn't check that the request is still open in the database.** P7: it admits on a request already marked `recovered_incomplete`. B2's caller deadline is the design's control; a check on database-side state would be cheap defence.
5. **Batch evidence treats "still running" as "the request has no outcome"** (`operator-store.ts:266-280`). P9: an in-flight attempt whose request has a live outcome can be reconciled down; a later settle then raises it with DISCREPANCY. The handoff lists this. B2 must define completion per attempt.
6. **Some statements are only server-bounded.** `BEGIN`, `SHOW` and `COMMIT`, and network stalls after checkout, are bounded only by server-side timeouts (`pg-transaction.ts:138-142`). B2's hard abort needs client-side cancellation.
7. **Some tests are weaker than their names suggest.**
   - The concurrent-stop test doesn't distinguish sorted from unsorted lock order; sorting is covered by a unit test and by inspection.
   - `gateway.test.ts:110` skips `testing/` directories (where the eval runners live) and only matches `.ts'` import specifiers. The eval path is currently clean by grep.
   - The append-only test covers only 3 of the 12 tables; P8 verified all 12.
8. **Low:**
   - The historical-evidence guard in `eval-output.ts` is lexical, so a symlinked `--out` could add a fresh directory inside historical evidence. Files are still never overwritten.
   - The finalizer checks its window before its inserts, so a commit can land milliseconds after deadline + 5 s. Uniqueness still holds under the request lock.

**FAIL.** STOP. Neither reviewer alone advances B1.
<!-- prettier-ignore-end -->
