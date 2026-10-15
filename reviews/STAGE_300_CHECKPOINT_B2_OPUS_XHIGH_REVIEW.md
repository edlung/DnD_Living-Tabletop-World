**Verdict: PASS**

## 1. Artifact identity verified

- **Snapshot:** `/private/tmp/ltw-stage300-checkpoint-b2-review/xhigh-snapshot`. There is no git metadata, so I could not check the base commit `9be1307…` or confirm that the manifest lists every changed file.
- **Dirty-file manifest:** I ran all 106 `shasum -a 256` entries from the handoff against the snapshot and all of them match. The SHA256 of the listing is `980b1f67e5df3fa5a6f913afb299a8b588c96c7cf70b404e5b0f309f5e1f22cf`, the same as the handoff.
- **Design draft 7:** `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2`, matches.
- **Stop-scope delta:** `6bba003055bfd53ac4e069d01d5bf6e3a5a6e272fddb41a2f8305b55e153b485`, matches.
- **Environment:** no `.env*` files other than `.env.example`. The runtime was Node v25.8.1 (engines `>=24`).

## 2. Findings

No Critical or High findings.

**M1 — Medium: an admitted attempt can be sent a fraction of a millisecond after the whole-request deadline.**
- **Where:** `apps/server/src/ai/admitted-provider.ts:93` and `:137`, `apps/server/src/ai/raw-provider.ts:79` and `:106`, `packages/ai/src/fallback.ts:166`.
- **Cause:** every "has the caller gone?" check reads only `signal.aborted`. That signal is aborted by a `setTimeout` (`packages/ai/src/request-deadline.ts:35`), and timers can fire a little after the deadline has passed on the monotonic clock. The repo's own test helper `spinUntil` (`packages/ai/src/testing/journal.ts`) shows this gap exists.
- **Reproduction (Probe 1):** admission resolves just after `deadlineAtMs` but before the abort timer runs. The wrapper then reads the key and calls `fetch` 0.388 ms after the deadline. The attempt ends `CALLER_CANCELLED` and its full hold is kept.
- **Why it matters:** the design says "If admission resolves after expiry, do not dispatch" and "Expiry prevents any new dispatch."
- **Consequence:** one request that may be billed, plus an uncertain full hold that the operator must reconcile. There is no ceiling bypass and no unreserved spend.
- **Same cause, zero cost (Probe 3):** the fallback can also start the local provider after expiry. That output is thrown away at the freeze, because `request.ts:160` checks expiry correctly.
- **Fix:** have `callerGone` also check `performance.now() >= deadlineAtMs`, the same test `isExpired` already uses.

**L1 — Low: the provider message ID is lost for exactly the attempts the operator must reconcile.**
- **Where:** `admitted-provider.ts:162-166` (suspect response), `:168-182` (unverified billing), `:183` (no usage). Also `settlement.ts:141-152`: `holdWithStop` only keeps the returned model.
- **What happens:** for an unexpected model, unverified billing or missing usage, `msg_…` is not stored in the journal or in the trace (Probe 5). It is stored only when usage is settled.
- **Why it matters:** design §2 says "Store provider request/message IDs when available." Fail-closed behaviour is not weakened, but reconciliation is harder.

**L2 — Low: a failed automatic stop is not retried.**
- **Where:** `admitted-provider.ts:164,169` → `accounting-tasks.ts:29-42`.
- **What happens:** if `holdWithStop` hits a transient storage failure, it is logged as `STOP_FAILED` once, and remote admission stays enabled until a later suspect response manages to write a stop.
- **Assessment:** this matches the design ("retry only settlement"), and each suspect attempt still keeps its full hold, so ceilings still bound spending. Recorded as a residual risk.

## 3. Checks

| Check | Result |
|---|---|
| `format:check` | PASS |
| `lint` (`--max-warnings=0`) | PASS, exit 0 |
| `typecheck` | PASS, exit 0 |
| `context-budget` | PASS: 681 files, 0 over target, 0 over hard limit |
| `test` (unit) | PASS: 195 files, 2144 tests |
| `build` | PASS (`tsc -b` and `vite build`) |
| `db:migrate` | PASS: nothing new applied, 7 already applied (0007 was already in the shared dev DB) |
| `seed:ravenford` | PASS: 0 accepted, 91 duplicates, version 113 |
| `test:integration` | PASS: 30 files, 168 tests |
| `test:e2e` | PASS: 45 tests (ports 4310 and 4311 were free) |

## 4. Probes

1. **Dispatch after the deadline:** reproduced M1, as described above.
2. **Stop-scope predicate:** I ran `stopCause` on 17 adversarial rows. Results:
   - Sibling approvals are blocked on the same route; other routes and other accounts stay eligible.
   - The recorded approval-wide restriction is never narrowed.
   - Historical aliases resolve to the canonical model; an alias that does not map under its pricing version fails closed for the whole account.
   - Every malformed or unknown row shape, and every missing or mismatched source attempt, fails closed for the whole account.
   - `UNVERIFIED_BILLING` applies to the whole provider; raw unknown `UNEXPECTED_MODEL` strings fail closed for the account.
3. **Local switch after expiry:** confirmed the zero-cost part of M1; the freeze then discards the result.
4. **Catalog and pricing:** these all deny or come back as unverified billing: history alias used as the model, unknown body field, oversize body, bad `max_tokens`, cache block without permission, wrong provider entry; negative or string counts, `__proto__`, `server_tool_use`, a mismatched cache split, `service_tier: priority`. Absent usage keeps the hold. The reservation amount, the tier change and the 1-hour cache-write pricing match hand calculation.
5. **Provider message ID persistence:** confirmed L1.

**Read-only code review** found no problems in:
- No outbound request with keys present: every route is refused (`UNVERIFIED_MODEL`) before an adapter is built or a key read. `main.ts`, the eval runners and the test gateways all use the empty `VERIFIED_CATALOG`.
- Raw adapters are imported only by `gateway.ts`.
- The diagnostic is isolated by campaign and keeps the 401/400/404/403 order.
- The Fable clarifications: canonical model on unexpected-model stops, configured alias kept in the journal, composition refusals stay local-only with no denied attempt, identity gaps report the fixed `STOPPED` detail.
- The B1 carry-overs: one `onStart` per attempt, `redirect: 'error'`, pinned DeepSeek identity and URL, startup route report, outcome code stored, resolver-based import guard, ADR "superseded" marks. Sonnet 5.5 allowlists wait for catalog verification, which matches the brief.

## 5. Residual risks and what I could not verify

- Live provider behaviour, Sonnet 5.5 usage allowlists, cache minimums, and the per-model proof that the reservation bound covers the real charge all wait for catalog verification, which is not authorized.
- Recovery runs only when the operator triggers it, so a request stays `pending` until then.
- Once any catalog entry exists, `UNEXPECTED_MODEL` rows written before B2 with unknown raw model strings will block the whole account until an operator clears them. This is by design.
- A `COMMIT_UNKNOWN` admission keeps any hold that may exist; the wrapper does not attempt a release. Conservative.
- `journal.begin` always records session class `play`, so checkpoint C must extend it for evaluation runs. This does not contradict C.
- Both reviewers are the same model family.
