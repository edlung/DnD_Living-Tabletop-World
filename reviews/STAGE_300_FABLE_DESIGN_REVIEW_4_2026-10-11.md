# Stage 300 remediation design 4 — FABLE review

Date: 2026-10-11. Verdict: APPROVE.
Artifact SHA256: `beb33666dc682f04719e6ae9a50c1139bf4ff2f09d2d9637ccfef0efbf55ada5`.
Source baseline: `bc6c1162073f6c1c1e7bfb5b775d88a50b639181`.
Actual transport response model: `claude-fable-5-1`; explicitly configured effort: `high`.
Fresh native Anthropic session; read-only; no other reviewer verdict supplied in the brief.
Receipt: `STAGE_300_DESIGN_REVIEW_4_RECEIPTS_2026-10-11.json`.
The response below is preserved verbatim. Architecture review only; no code acceptance or paid-call authorization.

---

<!-- prettier-ignore-start -->

Verdict below. I read the design at the stated hash, the current workflow and effort matrix, ADR 0017, ADR 0032, the Stage 300 work order, the migrations guide, and the directly affected contracts: `fallback.ts`, `providers.ts`, `intent.ts`, `dialogue.ts`, `chronicle.ts`, `relevance.ts`, both adapters, `budget.ts`, `gateway.ts`, the intent/relevance/dialogue status contracts, and the NPC, Chronicle, context and intent routes. I did not read `reviews/`, `.env` files, or prior verdicts.

## Verdict: APPROVE

Reviewer identity requested: `claude-fable-5-1`, effort high. The orchestrator records the actual response model. This is architecture approval only. It is not code acceptance, not paid-call authorization, and it does not resolve the pending owner disposition on the local-only preparation and closed-session Chronicle limitation (design lines 104–109).

The written decisions close the audited holes without weakening ADR 0017 §5, the scoped context builders, or canonical authority. I found no remaining invariant hole that permits unbounded or unaccounted spend, no transition that widens context or adds a paid route beyond one remote plus local, and no public status change. The conservative full-model reservation and disabled-route posture (lines 115–123) is accepted as a deliberate constraint pending catalog verification.

Specific checks that hold:

- **Admission atomicity (lines 32–58).** Shared policy lock, sorted exclusive bucket locks acquired before reading totals, READ COMMITTED on one checked-out client, and reservation plus attempt-start in one transaction. Under READ COMMITTED a waiter's post-lock read sees the competitor's committed hold. Lock IDs are nonnegative so the reserved key cannot collide. Stops are appended without lock upgrades, and admission re-checks stops after locking. Line 41 correctly admits the bounded exposure of already-admitted reservations.
- **Accounting arithmetic (lines 151–161).** One terminal row per attempt via a uniqueness constraint spanning kinds, absolute non-reducing evidence, effective charge as the maximum, totals as terminal maxima plus open holds. This is crash-readable and cannot double refund.
- **Deadline and cancellation (lines 60–70, 229–249).** One signal per request, per-attempt bound clamped to remaining time, no zero timeouts, pool checkout bounded, hard abort preserved, no detached HTTP, late output never used. Post-dispatch abort as uncertain full hold matches ADR 0021 behavior and the current `relevance.ts` race structure.
- **Transitions and table (lines 255–349).** Refusal maps to provider failure with one local switch under identical context. Deliberate decline is terminal and reuses the existing `INVALID_OUTPUT` status. Repair denial stays on the invalid-output branch. Suspect model or billing keeps the hold, stops admission, and permits only the local switch. Public status sets in the intent, dialogue, relevance and Chronicle contracts are unchanged; `TIMEOUT` already exists in the ranking statuses.
- **Session attribution (lines 86–103).** `activeSessionId` comes from world state, not the request body. The NPC route already loads a `before` snapshot before executing the command, so capture is feasible. Session reuse is blocked by the domain's used-ID set, so a session bucket cannot be reset by replaying its ID.
- **Billing components (lines 124–143).** Tiers, cache classes by TTL, reasoning, service tier and tool charges are enumerated. Unknown usage fields fail closed. Allowlisted outbound options prevent unpriced features.
- **Evaluation truthfulness (section 4).** Shared durable ledger, remote-only routes that cannot hide a fallback, the hardcoded 2000 in `eval-cli.ts` replaced by the effective deadline, and the ADR 0032 correction at checkpoint A.

## Material risks and implementer ambiguities

None of these blocks approval. Each needs a one-line pin before implementation so the conservative reading is the only reading.

1. **Local intent provider and the decline branch (lines 288–292).** The design says both providers use the envelope but does not say whether the local provider may ever emit `decline`. If it does, existing deterministic intent suites and the Ravenford acceptance phrasing change from `INVALID_OUTPUT` with issues to `NO_PROPOSAL`. Resolution: the local provider emits only the `proposal` branch and never `decline`. Unparseable phrasing keeps its current validation issues.

2. **Which ceilings are mandatory (lines 23–25, 80, 170).** Four ceiling classes are named for admission, but the CLI argument list names stage, campaign bindings and a per-session ceiling. An implementer could treat the global-day and campaign-day ceilings as optional and therefore unbounded within the stage grant. Resolution: all four ceilings are required positive integers at approval creation. Also pin whether the global-day bucket is keyed per approval or truly global across approvals.

3. **Duplicate grants through the CLI (lines 77–84).** The text forbids rotating approval IDs procedurally but nothing in the data model prevents a second enabled approval for the same stage and campaign, which would double the allowance. Resolution: a unique constraint on enabled approvals per stage binding, with a new approval accepted only when it explicitly supersedes and disables the prior one.

4. **Lock discipline for operator writes that do not clear a block (lines 35–36, 218–224).** Only reconciliation "that clears a block" is required to take the policy key exclusively. Batch evidence that does not clear a block could run under a shared lock and race a late automatic settlement. The uniqueness constraint makes this safe only if the operator path also takes the attempt's bucket locks. Resolution: every operator mutation takes the policy key exclusively, and every terminal or evidence write takes the attempt's bucket locks.

5. **Who emits `TRANSPORT_NOT_STARTED` when the wrapper never calls the adapter (lines 239–241, 276–278).** If admission commits after expiry, the wrapper must not dispatch. The only release proof is an adapter outcome, so an implementer may either skip the adapter and leave a permanent hold, or invoke it with an aborted signal. Both are safe. Resolution: pin that the wrapper always invokes the adapter with the aborted signal so the proof is uniform, and pin that a failed pre-dispatch release is not retried and leaves the hold for operator reconciliation.

6. **Checkpoint A compile feasibility (lines 436–446).** Removing `SpendLedger`, `budgeted` and the daily-budget environment at A breaks `eval-cli.ts`, which imports `costUsd` and sets the daily budget variable. The evaluation CLI is scheduled for C. Resolution: A includes the minimal evaluation CLI change that refuses live runs and compiles, so `pnpm validate` passes at A without deferring the offline guarantee.

7. **Relevance under the full-model reservation (lines 115–123, 229–233).** Measured provider latency is near the 2,000 ms default, so a large fraction of rankings will abort post-dispatch and become uncertain full holds requiring operator reconciliation. This is a documented usability constraint and not a safety hole. The checkpoint C session estimate must present outstanding holds separately from known charges, which line 413 already requires. No heuristic should be introduced to soften this.

8. **Hot global bucket.** Every admission takes an exclusive lock on the global-day bucket, which serializes all admissions across processes. Correct, and acceptable for a single-owner deployment. Record it as a known throughput ceiling rather than discovering it during evaluation.

## Not resolved by this approval

- The Q5 product limitation on paid preparation and post-session Chronicle remains pending owner disposition before checkpoint C.
- Catalog verification for token bounds is a separately authorized activity. Until it exists, routes either reserve the full context limit or stay disabled.
- No live or paid call is authorized by this review. Owner play acceptance of Stage 300 remains deferred.

<!-- prettier-ignore-end -->
