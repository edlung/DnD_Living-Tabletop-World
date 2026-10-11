# Stage 300 remediation design 7 — Fable review

Date: 2026-10-11. Verdict: APPROVE (architecture only).
Artifact SHA256: `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2`.
Native Anthropic response model: `claude-fable-5-1`; configured effort xhigh.
Fresh read-only session; no peer verdict supplied. Orchestrator verified hash before/after.
The returned report below is verbatim.

---

<!-- prettier-ignore-start -->

**Verdict: APPROVE.** Architecture only. This authorizes no code, spending or product limitation.

## Verdict and limits

- **Hash not computed.** I have no shell or hashing tool in this session. I reviewed the file whose header reads draft 7, dated 2026-10-11, baseline bc6c116 at `docs/STAGE_300_REMEDIATION_DESIGN.md:1-3`. The orchestrator's before/after hash check is the identity evidence.
- **Model identity** is not claimed from self-description. The launch configuration is the only evidence of model and effort.
- **Not inspected:** reviews/, reports/, handoffs/, .env files, fixture JSON, authoring contracts, tests/architecture, migration SQL. Claims about `guardedBy`, the authoring request schema and the insert-only trigger rest on the design text.

## Feasibility against source

- **Prepare/dispatch boundary.** The Anthropic body is a pure function of model, request and options at `apps/server/src/ai/anthropic-provider.ts:40-60`. The secret is revealed only in the header at line 82, so a prepare step reveals nothing. The DeepSeek adapter builds its body inline at `apps/server/src/ai/openai-compatible-provider.ts:64-83` and is equally pure. Both call fetch at one site, so a synchronous onStart immediately before it is feasible.
- **No-start versus admission outcome.** The three tiers are distinct and the contracts carry them. Chronicle prose already allows a null trace at `packages/contracts/src/chronicle/commands.ts:44`. The ranking view already allows null at `packages/ai/src/relevance.ts:109`. Intent and NPC reply need the listed nullable change at `packages/contracts/src/ai-gateway/intents.ts:45` and `packages/contracts/src/npc/dialogue.ts:44`. The client narrowing point is `apps/web/src/authoring/use-authoring.ts:142-153`.
- **Shared request UUID.** The generator at `apps/server/src/ai/gateway.ts:102` already yields UUIDs. The trace route pattern at `apps/server/src/http/routes/ai-routes.ts:22` accepts them. Moving allocation before fallback is a reordering inside each use case. The diagnostic route can reuse the check order at lines 53-64.
- **Immutable trace snapshot.** Each use case builds its trace after the fallback result, so freeze-then-trace is a local reordering. See precision 2 for the pending-attempt case.
- **Router test-only brand.** The router takes a plain provider array at `packages/ai/src/router.ts:13`. The scripted helper exists at `packages/ai/src/testing/providers.ts:11`. The package index does not export the testing folder, so the import boundary is checkable.
- **Session identity.** `activeSessionId` is at `packages/domain/src/kernel/state.ts:96` as stated. The route loads `before` at `apps/server/src/http/routes/npc-routes.ts:62`, ahead of command execution at line 79. The post-command context at line 92 stays untouched.
- **Lock scheme and budget conservation.** Policy, request and bucket keys occupy disjoint ranges. Request and bucket lock domains are never nested. The READ COMMITTED requirement is correct: a repeatable-read snapshot is taken at the lock statement, before the lock is granted, and would miss a competitor's commit. Absolute charges with MAX semantics and a partial unique index on terminal kinds are feasible and never release a hold without live proof.
- **Context isolation.** Prompt builders read only system, prompt and output fields. The accounting scalar and request metadata do not reach any renderer. Cache prefixes are stable per capability and language because system text depends only on language in `dialogue-prompt.ts:173` and `chronicle-prompt.ts:78`.

## Required precisions and tests

No blocking findings. These precisions belong in ADR 0032 or the checkpoint A brief. They do not change the design's architecture.

1. **Evaluation session class.** State that the admission context carries a session class. Runtime composition accepts only the state-captured play session. Evaluation composition accepts only the manifest's registered run binding and rejects a state session. The evaluation CLI drives the same HTTP routes, so the route-captured value must not become the evaluation bucket key.
2. **Fallback progress.** `runWithFallback` at `packages/ai/src/fallback.ts:60` returns attempts only on completion. The freeze point must snapshot a pending attempt as CALLER_CANCELLED without awaiting an abort-ignoring provider, so fallback must publish attempt starts.
3. **Local identity.** `createLocalProvider` returns a fresh object per call at `packages/ai/src/local-provider.ts:171`. Pin a module-private registry there exposed as a predicate, since composition recognizes local by identity.
4. **Recovery placement.** Name the component and trigger, confirm it never runs inside request handlers, and give it the same five-second bound.
5. **ADR 0017 delta.** A per-attempt timeout that coincides with whole-request expiry is CALLER_CANCELLED and earns no local switch. Record it beside the missing-tool-call delta.
6. **Repair note for a missing tool call or truncation.** Pin `RepairNote.output` to null. The intent renderer stringifies it at `packages/ai/src/prompt.ts:48`.
7. **Digest definition.** Compute over the exact JSON string inserted into the trace column.
8. **Ambiguous admission commit after caller expiry.** The live process attempts one bounded pre-dispatch release keyed by attempt ID, a no-op if the row is absent.
9. **Owner disposition.** The design moves ceilings from environment to operator-CLI records. The work order says ceilings are supplied through the environment at `work-orders/OPUS_STAGE_300.md:25`. Surface this with the pending Q5 session limitation at design lines 145-150.

Required tests beyond the design's own list:

- PROPOSED with a pending trace: authoring create returns not-found, no proposal is created, the client shows its existing honest notice.
- Evaluation composition rejects a state session; runtime composition rejects a run binding.
- Abort-ignoring provider: caller returns at its deadline, the frozen trace shows the pending attempt as cancelled, late usage settles through the journal only, late output is never persisted.
- Byte equality of prepared body and fetched body, with no accounting field or session scalar in body or headers.
- Unknown usage field: UNVERIFIED_BILLING, hold retained, remote admission disabled, one local switch.
- Session closes mid-request: every attempt keeps the captured ID.

Residual risks:

- **Full-context reservations** without a verified byte-bound make paid routes expensive or unusable. The design accepts this; it must be disclosed to the owner.
- **Relevance deadline misses** leave uncertain holds until reconciliation. Measured latency in ADR 0032 sits near the default budget, so a large share of rankings may hold session capacity.
- **Anthropic cache minimums** likely exceed current system-plus-schema sizes, so caching may yield nothing there. Report it as uncached.
- **Fail-closed usage parsing** disables remote admission on any new informational provider field.
- **Operator exclusive lock** can starve live settlements into uncertain holds during long batches.
- **Global serialization** on stage and day locks is acceptable for a single-owner deployment only.

<!-- prettier-ignore-end -->
