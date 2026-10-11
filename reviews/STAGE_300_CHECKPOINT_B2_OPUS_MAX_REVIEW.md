**Verdict: PASS**

There are no Critical or High findings and all ten required checks pass. There is one Medium finding: the whole-request deadline is only enforced at dispatch through the abort signal, so under event-loop lag a call can start after expiry. I reproduced it on the real stack. It is not a breach of `ARCHITECTURE_INVARIANTS.md` or of the handoff's stated invariant, because admission still reserves before any dispatch and the ceilings hold. Under `AGENT_WORKFLOW.md:74` it still needs a recorded owner disposition, and it should be fixed before any live calls. There are also three Low findings and three informational notes.

## 1. Artifact identity verified

- **Design draft 7:** `docs/STAGE_300_REMEDIATION_DESIGN.md` SHA256 is `23e53e4d…aab2`, which matches.
- **Stop-scope delta:** `docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md` SHA256 is `6bba0030…b485`, which matches.
- **Handoff:** `handoffs/STAGE_300_CHECKPOINT_B2_REQUEST.md` SHA256 is `fd04146c…81df1` (recorded for reference).
- **Dirty-file manifest:** all 106 entries are byte-identical and the listing hash is `980b1f67…22cf`, as claimed. I checked this before and after all my runs, so nothing in the snapshot changed.
- **Files claimed unchanged since checkpoint A:** `settlement.ts`, `money.ts`, `lock-keys.ts`, `pg-transaction.ts`, `deadline.ts`, `recovery.ts`, `types.ts` and migrations 0005/0006 match the A accepted manifest. `settlement.ts` and `lock-keys.ts` also match the hashes pinned in the delta.
- **Changed A accounting files:** every change (`admission.ts`, `spend.ts`, `operator-*`, `postgres-budget-store.ts`, `request-journal.ts`) is in the manifest and is allowed by the design or the delta.
- **Environment files:** only `.env.example` exists.
- **Limit:** without git metadata I cannot rule out uncommitted changes outside the manifest.

## 2. Findings

### F1 — Medium: dispatch can start after the whole-request deadline

**Where:** `apps/server/src/ai/admitted-provider.ts:93,137-145`; the same pattern is in `packages/ai/src/fallback.ts:166` and `apps/server/src/ai/raw-provider.ts:79`.

**Cause:** the code decides whether the caller has gone only from `attempt.signal.aborted`. It never compares the clock with `attempt.deadlineAtMs`. The budget store's own contract (`accounting/admission.ts:171-178`) says an admission can commit after the request expired, and that the caller "must then not dispatch". If the admission's COMMIT answer is processed after the deadline but before the abort timer has run (event-loop lag), the wrapper:
1. reveals the key,
2. fires `onStart`,
3. calls `fetch`.

The abort then arrives and the attempt becomes `CALLER_CANCELLED` with its full hold kept.

**Reproduction (probe P7, real stack):**
- Setup: PostgreSQL admission, the admission wrapper and the HTTP intent route, with a 1,500 ms deadline. The admission's COMMIT answer was processed at 1,540 ms.
- The key was revealed and `fetch` was called at 1,541 ms.
- The caller received the correct cancellation result.
- The journal kept an open hold of 332,160 µ$ that only operator reconciliation can clear, instead of a live pre-dispatch release.

**Second form (probe P2):** for intent, dialogue and Chronicle, a denial answered after the deadline makes the fallback switch to the local provider after expiry. The frozen result is still the correct cancellation row, so this part only costs a wasted local call.

**What it contradicts in the design:**
- "If admission resolves after expiry, do not dispatch" (`docs/STAGE_300_REMEDIATION_DESIGN.md:397`).
- "Expiry prevents any new dispatch" (`docs/STAGE_300_REMEDIATION_DESIGN.md:95`).
- "no new provider (including local) runs" (`docs/STAGE_300_REMEDIATION_DESIGN.md:669-670`).

The freeze step does check the clock (`request.ts:160`), and `request-lifecycle.test.ts:152` tests this lag case there. No test covers it at dispatch.

**Fix:** before `raw.dispatch`, also treat `performance.now() >= attempt.deadlineAtMs` as "caller gone", then release the hold and do not dispatch. Apply the same check in the fallback before invoking any provider.

### F2 — Low: the automatic stop for a suspect response is not retried

**Where:** `apps/server/src/ai/admitted-provider.ts:162-170` and `accounting-tasks.ts:29-42`.

**Behaviour:** `holdWithStop` runs once in the background. If its transaction fails, the only trace is the log code `STOP_FAILED`, and the route can be admitted again.

**Reproduction (probe P6-B):**
1. A response came back with an unexpected model while the exclusive policy lock was held.
2. The stop write timed out at its fixed 5 s bound: `STOP_FAILED`, no stop row.
3. After the lock was released, the next request was admitted and dispatched to the same suspect route.

**Why it matters:** the design requires that an unexpected model "disables remote admission until such reconciliation" (`docs/STAGE_300_REMEDIATION_DESIGN.md:370-371`). The design only mandates retries for settlement, so this is a gap in failure handling rather than a contradiction of the text. The impact is bounded: the suspect attempt's hold remains, and the next suspect response tries the stop again.

**Recommendation:** use the settlement retry schedule for this write, or refuse further admissions in-process until the stop commits.

### F3 — Low: provider request IDs are not stored for unsettled attempts

**Where:** `admitted-provider.ts:162-183`.

**Behaviour:** provider request IDs are written only by settlement of known usage. For responses with no usage, and for suspect responses (`UNEXPECTED_MODEL`, `UNVERIFIED_BILLING`), the ID is dropped. The trace's attempt view has no such field either.

**Why it matters:** these are exactly the attempts that need operator reconciliation against the provider's billing. Design §2 says to "Store provider request/message IDs when available" (`docs/STAGE_300_REMEDIATION_DESIGN.md:372`).

### F4 — Low: an admission with an unconfirmed COMMIT is never released

**Where:** `admitted-provider.ts:121-126`.

**Behaviour:** when admission is denied because its COMMIT was sent but not confirmed, the hold may exist. The live process knows the transport never started, yet it does not append a pre-dispatch release; the release step does nothing if the attempt row does not exist. The hold stays until the operator reconciles it. Meanwhile the trace says "not dispatched, cost 0".

This is conservative, so it is only a matter of avoidable uncertain holds.

### Informational notes

- **B1 carry-over 10 is still open:** the Sonnet 5.5 usage and model allowlists cannot be written because catalog verification is not authorized. The handoff discloses this.
- **Stale comment:** `accounting/types.ts:7` still says "no use case calls it yet (B2)".
- **Stale context-map entry:** `docs/AI_CONTEXT_MAP.md:14` still describes the design as a draft needing approval.

### Verified as conforming

- **B1 carry-overs 1–9 are closed:**
  - The start boundary is aligned with design §1 (`raw-provider.ts:100-106`).
  - `onStart` fires at most once per attempt and is ignored after the attempt settles (`fallback.ts:223-243`).
  - The raw-adapter import guard now resolves module paths (`tests/architecture/raw-adapter-imports.test.ts`).
  - The ADR and Gate 06 documentation fixes are in place (ADR 0032 lines 21-29, 61-62, 365-369; `GATE_COVERAGE.md:145-148`).
  - Fetch uses `redirect: 'error'` (`raw-provider.ts:113`).
  - DeepSeek's provider identity and URL are fixed in code, and its edge cases are handled.
  - Startup logs every capability's route.
  - The fallback outcome code is stored (migration 0007).
- **All seven architect clarifications to the delta hold:**
  - A route refused at composition becomes local-only, with no fictitious remote attempt.
  - Identity gaps at runtime deny with the existing `STOPPED` detail.
  - The ADR enumerates the four accepted stop row shapes.
  - An unexpected-model stop records the canonical attempt model and keeps the returned string only as `observed_model`.
  - The journal keeps the configured alias.
  - Historical-identity resolution runs inside the bounded admission transaction.
  - Stop causes are visible only through the operator `stops` command, never in campaign diagnostics.
- **Owner decision 3 is reflected:** `.env.example` routes every capability to `anthropic:claude-sonnet-5-5`, the decision is recorded in ADR 0032, and the DeepSeek adapter code is kept.
- **Cache prefix:** the cached part (tool definition plus system text) is fixed per capability and language.

## 3. Checks (run from the snapshot root)

| Check | Result |
|---|---|
| `pnpm run format:check` | Pass |
| `pnpm run lint` (zero warnings allowed) | Pass |
| `pnpm run typecheck` | Pass |
| `pnpm run context-budget` | Pass: 681 files, 0 over target, 0 over the hard limit |
| `pnpm run test` | Pass: 195 files, 2,144 tests |
| `pnpm run build` | Pass |
| `pnpm run db:migrate` | Pass: 7 already applied, 0 new |
| `pnpm run seed:ravenford` | Pass: 0 accepted, 91 duplicates, version 113 |
| `pnpm run test:integration` | Pass: 30 files, 168 tests |
| `pnpm run test:e2e` | Pass: 45 tests (ports 4310 and 4311 were free) |

## 4. Probes added

All probes ran inline with `node --conditions=@ltw/source`, because the permission mode blocked writing files to scratch. PostgreSQL probes used the project's own throwaway databases.

- **P1 — wrapper with a fake store:** admission answered about 5 ms after the deadline, and the key reveal, `onStart` and `fetch` all followed. The hold was kept with no release. This is F1.
- **P2 — fallback through intent, dialogue and Chronicle:** a denial answered after the deadline led to one local call after expiry in each case. The public result was still the correct cancellation row. This is the second form of F1.
- **P3 — stop-scope predicate:** all 24 cases behaved as the delta requires. They covered:
  - the four reasons against the same approval on another route, a sibling approval on the same route, a sibling on another route, and another provider;
  - malformed row shapes and unknown reasons;
  - a missing source attempt and source account or approval mismatches;
  - legacy and current aliases, a wrong or unknown pricing version, and an unresolvable model.
- **P4 — catalog:** validation refused every ambiguity I tried (alias or history colliding with another model, duplicate pricing versions, bad tiers, negative rates, zero limits). The production catalog is empty and frozen. Across 200,000 random usages within the limits, settlement never exceeded the reservation; the corner case equals it exactly.
- **P5 — no outbound calls and no key reveal:** I used the `.env.example` routes plus a DeepSeek variant, both keys set to secrets that throw if read, a trapped global `fetch`, an approval selected and stored, and an accounting store. Across all four HTTP routes there were 0 `fetch` calls, 0 key reveals and 0 budget-store calls. Every remote entry was refused with `UNVERIFIED_MODEL`, and request starts carried the session but no approval.
- **P6 — real PostgreSQL:**
  - **A:** an unexpected model recorded a stop in the accepted shape, and the next request was denied and switched to local.
  - **B:** reproduced the stop-write failure in F2.
  - **C:** an overrun on one approval denied a sibling approval on the same account and route, with no dispatch.
  - **D:** reading the diagnostic from another campaign returned nothing.
- **P7 — real stack:** reproduced F1 as described above.

## 5. Residual risks and what I could not verify

- No live provider behaviour was verified: no network was allowed and the catalog is empty. Live responses may first be treated as suspect (for example, unknown usage fields), which would put provider-wide stops in place until the catalog is verified.
- When settlement of a known overrun exhausts its retries, the hold stays at the reservation, below the known charge, and no stop is written. The design accepts this; the operator sees `SETTLEMENT_HELD`.
- A repair admitted before a background overrun stop commits may still go out. The design accepts both orderings.
- Other limits, all disclosed in the handoff or carried from B1:
  - Response size is unbounded (carried from B1).
  - Recovery runs only when the operator triggers it.
  - The approval is checked once, at startup.
- I did not measure how often the event-loop lag behind F1 happens in practice; my probes force it with a synchronous spin.
- Both acceptance reviewers are from the same model family, which the owner already noted as a risk.
