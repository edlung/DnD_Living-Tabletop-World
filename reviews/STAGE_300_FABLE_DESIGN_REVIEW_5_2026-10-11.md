# Stage 300 remediation design 5 — Fable review

Date: 2026-10-11. Verdict: CHANGES REQUIRED.
Artifact SHA256: `35c4623d0878cb0a39b0b9abd8fa0bbd80264594dc8861f60ede63e239e7779e`.
Native Anthropic response model: `claude-fable-5-1`; configured effort: xhigh.
Fresh read-only session; no other reviewer verdict supplied.
The orchestrator verified the unchanged artifact hash before and after review.
The returned report below is verbatim.

---

<!-- prettier-ignore-start -->

**Verdict: CHANGES REQUIRED.** Two blocking contract gaps, one unverified precondition, and several non-blocking fixes. Review was read-only. I made no writes, invoked no agents, made no paid calls, and did not open reviews/, reports/, handoffs/ or any .env file. Reviewer identity is not asserted by this text.

**Hash not verified.** This session has no shell or hashing tool, so I could not compute SHA256. The file I reviewed is draft 5, 541 lines, dated 2026-10-11, baseline bc6c116, status DRAFT NOT APPROVED. The orchestrator must confirm that content matches 35c4623d… before treating this verdict as bound to the artifact.

**Audit claims the source confirms.** The design's premises hold against baseline code:

- Unknown-model price fallback and non-durable ledger: `apps/server/src/ai/budget.ts:18` and `budget.ts:23-54`.
- Three-entry routes never reach local: `packages/ai/src/fallback.ts:87-92`. A missing key silently drops a route entry: `apps/server/src/ai/gateway.ts:89-94`. Implicit paid relevance from the global model: `gateway.ts:83-87`.
- Refusal and truncation discard usage: `apps/server/src/ai/anthropic-provider.ts:110-115`, `openai-compatible-provider.ts:107-108`.
- The intent system prompt tells the model to call the tool with an empty command list at `packages/ai/src/prompt.ts:31`, while the schema needs at least one command. The repair note then asks for a corrected proposal at `prompt.ts:51`. That is the invent-a-command pressure the decline envelope removes.
- Evaluation false positives, hardcoded 2000, overwriting evidence directory, blind key beside the comparison: `apps/server/src/testing/eval/eval-cli.ts:113-117`, `:245-249`, `:311-313`, `:343`.
- Cache-prefix claim is feasible. System prompts are stable per capability and language: `prompt.ts:24-34`, `dialogue-prompt.ts:173`, `chronicle-prompt.ts:78`, `relevance-prompt.ts:240`. The adapter appends only a fixed sentence at `anthropic-provider.ts:49`.
- READ COMMITTED with lock-then-read, the REPEATABLE READ negative control, lock_timeout covering advisory waits, and zero meaning disabled are all correct PostgreSQL semantics.

## Blocking findings

**B1. No-durable-start behaviour is unspecified and the stated rule cannot be met for three capabilities.**
- Design lines 249 and 299–300 say no durable request-start means no trace ID. The outcome table at lines 380–411 has no row for a failed request-start for intent, dialogue or Chronicle.
- Public contracts carry a non-null trace ID: `packages/contracts/src/ai-gateway/intents.ts:45`, `packages/ai/src/dialogue.ts:68`, `packages/ai/src/chronicle.ts:104-107`. Only relevance is nullable at `packages/ai/src/relevance.ts:114`.
- Decision needed. Option A: when the request-start row cannot commit within the deadline, run no provider including local, and fail the request the way a trace-append failure fails today. Option B: make the trace ID nullable, which is a public contract change needing its own approval. I recommend Option A.
- Test: stall the journal before request-start for all four capabilities. Assert zero provider calls, the chosen response shape, and deterministic relevance actions with a null trace ID.

**B2. The global daily ceiling is not mechanized against approval rotation.**
- Lines 27–29, 50–51 and 85–88 make every ceiling an approval attribute read from the latest approval revision. Lines 30–34 key the global bucket by billing account and assert rotation cannot bypass it. Line 117 anticipates additional approvals.
- Two enabled approvals under one billing account with different global ceilings share spend but check different limits. The effective ceiling becomes the larger one, and any process may select the larger approval.
- Fix: add an operator-created billing-account record with append-only ceiling revisions and the same owner-authorization fields. Approvals reference it. Admission reads the global daily ceiling and account-level stops from that record only. Billing-account identity is never taken from process environment.
- Test: two approvals with different global ceilings under one account. Once spend reaches the account ceiling, both deny.

**B3. Conditional. The session identity field is unverified and its package is outside the design's boundaries.**
- Lines 98–111 build admission on `WorldState.activeSessionId`. No allowed path references that field, and `packages/domain` is not in the boundaries at lines 485–500. I could not verify it within the review scope.
- If the field does not exist, the session model needs a boundary change and the hash changes. Confirm before pinning the approval hash.

## Required fixes and tests, non-blocking

- **Chronicle provenance wording.** Lines 257–263 say recovery cannot know whether a result reached the caller. For Chronicle the caller is the route, which commits the prose through GenerateChronicle at `apps/server/src/http/routes/chronicle-routes.ts:109-132` whether or not the trace lands. The chapter proves the result was used. State that a chapter may carry a trace ID resolvable only through the diagnostic, and have the diagnostic say "caller outcome not recorded" rather than "unknown". Test: stalled finalizer, chapter commits AI prose, trace 404 while pending, later finalizer lands with matching paragraphs and provider.
- **One clock for deadlines.** Lines 243–256 store a process-clock caller deadline but recovery compares database time. Under skew a live finalizer inside its own window loses to recovery and a delivered result is recorded as recovered_incomplete. Compute and store the deadline with database now() in the request-start transaction and recheck with database time in the finalizer.
- **Open holds with evidence.** Lines 167–169 sum the maximum for terminal attempts plus each open hold. Define the open-hold contribution as the maximum of the hold and any evidence rows, so a crash-held attempt is not undercounted before its stop commits.
- **Advisory lock namespaces.** Lines 41–53 and 236 exclude only policy-versus-bucket collisions. The authoring store already uses advisory locks in the same database. Specify the two-integer form with a reserved class for budget, request and policy locks.
- **Stops across midnight.** Lines 33 and 46–48 claim stops are checked after all locks are held. A settlement for yesterday's period appends its stop under yesterday's global bucket lock while today's admission holds today's. Ceilings still apply, so this is not a conservation break, but have stop-appending settlements also take the current-day global bucket lock in the sorted set.
- **Offline composition at A and B1.** Lines 512–513 reject dispatch. Say that no remote adapter is constructed and the key is never revealed. Test with a Secret whose reveal throws.
- **Boundary gaps.** Lines 197–198 put AdmittedProvider acceptance at the router, but `router.ts` is not in the list at 490–493. Lines 220–222 let normal trace reads resolve accounting, but line 496 allows only the diagnostic read. Widen the list or state the router check is server-side only and the normal trace read is unchanged.
- **Outcome row payload.** Lines 234–235 store the full trace payload in the outcome row. The trace insert is atomic with it, so the digest suffices. Dropping the copy reduces duplicated DM text and output.
- **Unpinned deltas.** The relevance TIMEOUT path appends its trace before returning at `relevance.ts:176-177`. Returning the preallocated ID at the deadline changes tests that read the trace immediately; list that delta beside the envelope delta at 353–354. Also pin the attempt outcome of a non-dispatched denied repair at 327–329 as `error` with its fixed code.

## Residual risks

- Full-context reservation without a verified token bound makes Anthropic routes practically unusable until catalog verification, which is separately authorized. Checkpoint C's session estimate stays an estimate.
- Routine relevance deadline misses create uncertain full holds that only operator reconciliation clears. The design discloses this cost.
- The global daily bucket is one exclusive lock across every admission and settlement. Acceptable at tabletop scale, but it caps throughput.
- Dialogue prompts are likely below Anthropic's minimum cacheable prefix, so caching yields little for the highest-volume capability.
- The Q5 product limitation at lines 116–121 remains pending owner disposition. This review does not accept it.
- Checkpoint A bundles admission, journal, CLI, migration, ledger removal and the ADR correction. Keeping files under the 500 and 700 line caps will need several modules.
- New operational tables need the ADR 0032 amendment before implementation per `apps/server/migrations/AGENTS.md`.

This review does not authorize code, spending or product limitations.

<!-- prettier-ignore-end -->
