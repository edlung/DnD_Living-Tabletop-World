# Stage 300 remediation design 2 — OPUS review

Date: 2026-10-11. Verdict: CHANGES REQUIRED.
Artifact SHA256: `ad700826921b809a150a577d76607a0c40d6f918fadbf10b410f0713428ddd7c`.
Source baseline: `bc6c1162073f6c1c1e7bfb5b775d88a50b639181`.
Actual transport response model: `claude-opus-5-5`; explicitly configured effort: `xhigh`.
Fresh native Anthropic session; read-only; no other reviewer verdict supplied.
Receipt: `STAGE_300_DESIGN_REVIEW_2_RECEIPTS_2026-10-11.json`.
The response below is preserved verbatim. Architecture review only; no code acceptance or paid-call authorization.

---

<!-- prettier-ignore-start -->

**Verdict: CHANGES REQUIRED**

Reviewer identity: I am `claude-opus-5-5`. The requested effort was xhigh. I can't see my own effort setting or `message.model`, so please record both from the transport. I had no shell, so I could not check the SHA256 myself and am relying on your before/after check.

**What I read:** the design, `docs/PROJECT_WORKFLOW.md`, `EFFORT_MATRIX.md`, `work-orders/OPUS_STAGE_300.md`, ADR 0017, ADR 0032 and `apps/server/migrations/AGENTS.md`. On the code side I read `budget.ts`, `gateway.ts`, both adapters, `providers.ts`, `fallback.ts`, `intent.ts`, `relevance.ts`, `chronicle.ts` and its route, the trace store, `contracts/ai-gateway/intents.ts`, and where `activeSessionId` is defined in the domain. I did not open `reviews/`, any `.env` file, or other reports.

**What's sound:** integer microdollars, append-only rows, no automatic refund of in-flight attempts, orphan starts counted as held spending, accounting metadata kept out of provider payloads, rejecting three-entry and multi-remote routes, and the cumulative stage allowance tied to an approval ID. I accept the full-context reservation and disabled routes as a deliberate choice. The five items below are mechanics the design leaves to the implementer, where a reasonable choice is unsafe or contradicts the work order.

Line numbers below are in `docs/STAGE_300_REMEDIATION_DESIGN.md` unless another file is named.

## Blocking issues

### 1. The admission transaction's isolation level and lock modes are not specified (L22–25, L31–38)

"One transaction" plus "lock before reading totals" is only correct under READ COMMITTED.
- **REPEATABLE READ breaks it.** The snapshot is taken by the first statement, which is the advisory-lock wait. The totals read then misses a competitor's committed reservation, and both admit the same remaining capacity.
- **The global approval lock's mode is not stated.** It is not said whether admission takes it shared or exclusive.
- **"Sorted order" is ambiguous.** If the code sorts bucket key strings but locks hashed integers, a hash collision gives two transactions opposite orders on the same integers. PostgreSQL then aborts one with a deadlock, so admission fails closed but randomly denies requests.

**Fix:**
- Pin `BEGIN ISOLATION LEVEL READ COMMITTED`, and acquire each lock in its own statement before any read of approvals or totals. Alternatively, use SERIALIZABLE with a bounded retry and deny when retries run out. State that REPEATABLE READ is forbidden.
- Admission and settlement take `pg_advisory_xact_lock_shared` on the policy key. Revision, disable and reconcile take it exclusive.
- Compute 64-bit lock IDs, remove duplicates, and sort numerically.
- Bound database waiting with `SET LOCAL lock_timeout` and `statement_timeout` taken from the remaining deadline. This makes L137 ("abort cancels or bounds admission database work") concrete.
- Run the barrier test (L37–38) at the pinned isolation level.

### 2. Nothing guarantees only one hold-reducing record per attempt (L36–37, L82, L121–127)

"Unique transition keys" could be read as one per kind. Settlement and operator reconciliation are different kinds, so both can be recorded for the same attempt.

Concrete race:
1. A timed-out attempt stays held.
2. The operator CLI reconciles it.
3. A late completion from a provider that ignored the abort signal (L144) then settles the same attempt.

The hold is reduced twice, or the verified reconciliation amount is overwritten.

**Fix:**
- Allow exactly one terminal accounting row per attempt, enforced by a database constraint. For example, `UNIQUE(attempt_id)` on a table whose `kind` is one of `settled`, `released_pre_dispatch` or `reconciled`.
- Any later evidence is appended as a separate non-reducing record. It may raise the recorded charge (with a discrepancy or overrun flag and disable), never lower it.
- A pre-dispatch release may only come from the same live process's in-process pre-dispatch outcome, never from startup recovery.
- Add tests for reconcile-then-late-settle and settle-then-reconcile.

### 3. The pricing model doesn't cover every billing dimension (L60–75, L186–192)

Cost is computed locally as usage times catalog rates. Any billing dimension the catalog omits is silently undercounted, and the overrun check (L85) can't detect it because it compares against that same computed cost. The design names cache writes and reasoning tokens but leaves out:
- **Tiered or long-context input rates.** These matter most because the design reserves the full input limit, and a full-context reservation priced at the base rate under-reserves.
- **Cache-write TTL variants.** Anthropic reports 5-minute and 1-hour cache-creation tokens separately, at different rates.
- **Request options that change the rate:** service or priority tier, region or inference geography, batch, and server-side tools.

**Fix:**
- Each catalog entry is a versioned pricing function covering every usage field the provider returns.
- The reservation uses the highest applicable rate for each token class over the reserved quantity.
- Settlement uses the tier that the actual usage implies.
- Adapters build request bodies from an allowlist, so no unpriced billing option can be sent.
- An unrecognised usage field in a response is treated as unknown usage: the hold is kept and remote admission is disabled.
- Add tests for crossing a tier boundary, the 1-hour cache-write field and an unknown usage field.

### 4. The caller's deadline and transport cancellation contradict each other (L108–109, L133–144, L158; ADR 0017 Stage 140 amendment; `anthropic-provider.ts:71-74`)

L108–109 says a late relevance completion "cannot disappear". Today, though, the caller's signal aborts the `fetch` itself, so no late completion or usage ever arrives.

As written, every relevance ranking that misses the deadline becomes a permanent uncertain hold that needs manual reconciliation. ADR 0032 records DeepSeek at 1.1–2.1 s against a 2 s budget, so this is a routine path, not an edge case. The design never says whether the deadline still aborts the HTTP request.

**Fix: separate two signals.**
- **Caller deadline:** stop waiting, block any further admission or dispatch, and abort admission database work.
- **Transport cancellation:** only the adapter's own timeout and process shutdown.

After dispatch, the attempt keeps running in the background up to the adapter timeout. It then settles from real usage, and its output is discarded. Cap the number of background attempts per process, and deny admission beyond that cap. Record this as an amendment to ADR 0017 and ADR 0032. If the owner prefers a hard abort instead, the design must say that every aborted dispatch stays a held uncertain charge, and drop the "late completion" claim.

### 5. Refusal and decline are not mapped to concrete outcomes per capability (L150–160, L171–184; work order L46)

"Maps to existing capability failure behavior" (L177–178) is ambiguous:
- **Intents:** a refusal could become either `INVALID_OUTPUT` or `AI_UNAVAILABLE`.
- **Dialogue:** on a `remote,local` route, a terminal refusal means no local template reply. Today a refusal becomes `BAD_RESPONSE`, which switches to the local provider and does produce a reply.
- **Work order:** it requires each capability to "fall back correctly on … refusal".
- **Evaluation:** `FallbackResult` needs new terminal variants, and evaluation counts depend on how they are labelled.

**Fix:** add a table to the design: each capability crossed with {refusal, valid decline, invalid after repair, outage, budget denial, cancellation}. For each cell, give the `FallbackResult` variant, the public status, the fixed issue code, whether the zero-cost local provider may run, and the trace status.

Recommended rule:
- Refusal and decline forbid any further **paid** dispatch.
- Each capability's existing deterministic fallback still applies: the dialogue template, the Chronicle template, and the Context Engine's deterministic relevance.
- An intent refusal or decline returns `INVALID_OUTPUT` with `PROVIDER_REFUSAL` or `NO_PROPOSAL`, and never asks the local provider for a proposal, so a refused request can't come back as a proposal.
- State explicitly that only intents have a decline branch.

## Material risks (not blocking)

- **Session gating (L46–49).** Remote calls only happen inside an active play session. Chronicle chapters generated after a session closes, and DM intents during prep, will always use templates. In practice that goes against the owner's assignment of Opus to intents and Chronicle. Either get the owner's explicit acceptance, or add a DM-only "campaign prep" bucket with its own ceiling to the approval record.
- **Held error responses (L80–82, L159–160).** A received 429, 4xx or 5xx is treated as ambiguous. Combined with full-context reservations, a few rate-limit responses can lock a session's ceiling until someone reconciles by hand. This is acceptable as a deliberate choice. Show outstanding holds at startup and in the evaluation report.
- **Intent envelope wire schema (L172–174).** Anthropic's tool `input_schema` must be a top-level object. Encode the union as an object with a `kind` field plus branch fields, validated with Zod, rather than a top-level `oneOf`. Test both adapters' request bodies offline.
- **Evaluation truthfulness.**
  - The pass rates under ADR 0032 "Measured" (intents 6/6, NPC replies 18/18) came from the evaluation checks that the audit found give false positives. Checkpoint C should append a correction marking them unverified, keeping the history.
  - Also pin the evaluation campaign identity (L50–53, L200). Otherwise a fresh run ID or seeded campaign gets new campaign-day capacity each time; only the stage and global-day ceilings would still apply.
- **Wrapper enforcement (L103–104).** Have the router accept only a branded `AdmittedProvider` type (or the local provider) that only the admission wrapper can construct. Then "only admission-wrapped adapters" is type-checked, not just tested.
- **Diagnostic read (L115–118).** State that the DTO never includes bucket totals, remaining capacity or data from other campaigns.
- **Relevance latency (L111–113, L135–136).** Writing the request-start and running the first admission costs at least two database round trips inside a 2 s budget. Allow the request-start to be written in the same transaction as the first admission.
- **Checkpoint B is too big (L252–253).** It bundles outcome classification, the fallback transitions, routes, journal integration, the deadline and background-attempt handling, recovery, the diagnostic route and cache accounting. Split it into:
  - B1: outcome classification, fallback transitions and routes.
  - B2: journal integration, the deadline, the diagnostic route and caching.

  Each part gets its own fresh-session Opus xhigh acceptance.

Once items 1–5 are written into the design and its hash is updated, a renewed review of that exact artifact should be able to approve it. This is an architecture assessment only; it does not accept any code or authorize any paid calls.

<!-- prettier-ignore-end -->
