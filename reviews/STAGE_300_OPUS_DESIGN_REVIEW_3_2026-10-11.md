# Stage 300 remediation design 3 — OPUS review

Date: 2026-10-11. Verdict: CHANGES REQUIRED.
Artifact SHA256: `8ac06844adfdd33cf878870f6656fee245ee6ebe583b2116374f1e85faa68a2d`.
Source baseline: `bc6c1162073f6c1c1e7bfb5b775d88a50b639181`.
Actual transport response model: `claude-opus-5-5`; explicitly configured effort: `xhigh`.
Fresh native Anthropic session; read-only; no other reviewer verdict supplied.
Receipt: `STAGE_300_DESIGN_REVIEW_3_RECEIPTS_2026-10-11.json`.
The response below is preserved verbatim. Architecture review only; no code acceptance or paid-call authorization.

---

<!-- prettier-ignore-start -->

**Verdict: CHANGES REQUIRED.** I found four blocking issues and eight material risks. Each has a concrete fix below.

- **Review identity:** I am `claude-opus-5-5` at xhigh effort, in a fresh session; you record the actual `message.model`.
- **Artifact:** I read `docs/STAGE_300_REMEDIATION_DESIGN.md`. I could not check its SHA256 without a shell, so the hash check before and after is yours.
- **What I read:** `docs/PROJECT_WORKFLOW.md`, `EFFORT_MATRIX.md`, `work-orders/OPUS_STAGE_300.md` and ADRs 0017 and 0032. I also read `apps/server/migrations/AGENTS.md`, the provider/fallback/budget/gateway code (`providers.ts`, `fallback.ts`, `budget.ts`, `gateway.ts`), `intent.ts`, `relevance.ts`, `chronicle.ts`, the contracts in `contracts/ai-gateway/intents.ts`, and the call sites in the NPC and Chronicle routes.
- **What I did not touch:** I read nothing in `reviews/` and no `.env` files. I made no writes and ran no tests.

## Blocking issues

**1. Automatic shutdowns contradict the lock rules** (`docs/STAGE_300_REMEDIATION_DESIGN.md:33-35`)
- **Problem:** Lines 33–35 put disable and reconciliation under the exclusive policy lock. But settlement, which holds the *shared* lock, must also disable remote calls in five cases: an overrun, an unknown usage field or billing value, an unexpected returned model, or a discrepancy (`:101-102`, `:107-108`, `:119-120`, `:125-126`, `:171-172`).
  - Doing that inside the same transaction means upgrading shared to exclusive. Two concurrent settlements then deadlock, or time out and lose the disable.
  - Doing it in a separate transaction means a crash between the two commits also loses the disable.
- **Fix:**
  - Keep the exclusive lock for operator actions that grant or relax spending: approval, ceiling revision, enable, and reconciliation that clears a block. Operator disable may stay exclusive too.
  - Write the automatic stops as restrictive append-only rows inside the settlement transaction, under the shared policy lock and that attempt's bucket locks.
  - Admission, after taking its locks, treats any uncleared restrictive row for the approval as disabled.
  - Document the accepted bounded race: one admission on unrelated buckets may commit at the same moment and still dispatch, and the ceilings still hold.
  - Test two concurrent overrun settlements (no deadlock, both recorded), followed by an admission (denied).

**2. Which play sessions may spend money is ambiguous** (`:55-58`, `:64-66`, `:74-75`)
- **Problem:** The text supports two readings, and they lead to different table layouts, admission checks and operator steps:
  - Lines 55–58 and 66 say each session needs an operator-registered binding ("approved session/run bindings", "no active approved play session").
  - Lines 64–65 and 74–75 suggest any `activeSessionId` of a bound campaign qualifies, with per-session limits taken from the approval.
  - Session IDs are created by StartSession during play, so the first reading would need an operator CLI step mid-game.
- **Fix:** Pin one reading. I recommend:
  - The approval binds the stage, the campaign IDs and a per-session ceiling that applies to every session.
  - A runtime request is eligible only if its campaign is bound and the snapshot taken at request start has a non-null `activeSessionId`.
  - The bucket key is (approval, campaign, session). Only evaluation runs need CLI registration.
  - For NPC dialogue, name the `before` snapshot (`apps/server/src/http/routes/npc-routes.ts:62`), which is loaded before the command runs.
  - Settlement takes its buckets from the stored attempt row, never from current world state.

**3. The outcome table leaves out cases the cautious reservation will make common** (`:203-219`, table `:258-281`)
- **Problem:** The table claims to pin every outcome, but three cases are missing:
  - **(a) Repair attempt not admitted.** Each repair needs its own admission (`:83`), which can be denied, fail because the budget store is down, or hit a disabled approval. With full-context reservations, this will happen often.
  - **(b) Suspect response with otherwise valid output.** The design discards output for an unexpected model or unknown usage/billing field (`:107`, `:171`), but doesn't say what happens next: switch, repair, or fail.
  - **(c) Budget-store failure.** Line 26 denies the call but gives no code, and the table only has `BUDGET_DENIED`.
- **Fix:** Add rows for each:
  - **(a)** Treat it as a provider failure of that attempt: one permitted switch to the local provider with a fresh request (`repair=null`, same context), otherwise `AI_UNAVAILABLE`. Relevance falls back to its deterministic actions; Chronicle to local prose or the template. This matches the current error path in `packages/ai/src/fallback.ts:76-92`.
  - **(b)** Never validate or use the output. Record the attempt as `error` with `UNEXPECTED_MODEL` or `UNVERIFIED_BILLING`, keep the hold, and write the stop row from issue 1. Allow only the local switch: no repair and no switch to another paid provider.
  - **(c)** Give it a fixed code (for example `ADMISSION_UNAVAILABLE`) that follows the budget-denial behavior.
  - Test each case through both adapters.

**4. Intent, dialogue and Chronicle have no deadline, so `:46-48` can't be built as written**
- **Problem:** Every admission sets its lock and statement timeouts from "the remaining admission deadline", and the table has caller-cancellation rows for these three capabilities (`:278-280`). Only relevance has a deadline (`relevanceBudgetMs`). Neither the value nor the source of cancellation (a deadline, or the client disconnecting) is stated. An implementer may leave the timeouts unset, which in PostgreSQL means lock waits with no limit.
- **Fix:**
  - Define a configured whole-request deadline for each capability, created at request start and carried as one AbortSignal through admission, the HTTP call and persistence. For example: the adapter timeout plus a bounded margin for admission and persistence.
  - State the cancellation source. I recommend the deadline only, not client disconnect.
  - A missing deadline should be a construction error.
  - For Chronicle, state that cancellation yields template prose and then the unchanged `GenerateChronicle` path (`chronicle-routes.ts:109-132`).

## Material risks (fix during implementation; acceptance should check them)

- **R1. Meaning of later evidence rows** (`:117-121`). Say whether they store absolute charges (effective charge = the maximum of all rows) or nonnegative increments (effective charge = terminal charge plus the sum). Pin the one SQL sum that admission uses. Increments combined with a maximum would under-count.
- **R2. Reconciliation may not be practical** (`:114-115`, `:167-170`, `:179-181`).
  - Provider consoles mostly report totals, so verifying a single aborted call independently may be impossible.
  - Meanwhile, full-context holds from routine relevance timeouts keep piling up.
  - Store provider request or message IDs whenever they arrive.
  - Define a batch reconciliation record (provider, model, time window, invoiced total, evidence reference) that closes a set of open attempts and never goes below the provider's reported total.
  - Without this, held capacity is effectively permanent.
- **R3. `AdmittedProvider` can't be enforced by a type alone** (`:143-146`). The router lives in the pure `@ltw/ai` package, which can't import the server wrapper, and a TypeScript brand can be forged. Enforce it in server composition:
  - a module-private WeakSet in the wrapper, checked when `gateway.ts` builds the router;
  - an architecture test that only the admission module and tests import adapter constructors;
  - tests for both runtime and evaluation construction.
- **R4. "Offline-only" between checkpoints is only a policy statement** (`:365-370`). Make it technical at checkpoint A:
  - delete `SpendLedger`/`budgeted`, `LTW_AI_DAILY_BUDGET_USD` and the default Anthropic routes (`gateway.ts:43-87`, `budget.ts`);
  - test that keys present with no approval record produce zero outbound requests at A, B1 and B2.
- **R5. Caching wording and prompt drift** (`:291-299`).
  - System text varies by language (`dialogue-prompt.ts:173`, `chronicleSystem(language)`), so "byte-identical per capability" should read "per capability and language".
  - A prefix below the provider's minimum cacheable length won't cache at all. That is acceptable, but must be reported.
  - Add fixed fixtures proving the rendered `system` and `prompt` text is unchanged apart from the reviewed intent-envelope change.
- **R6. Time-of-day pricing.** DeepSeek's peak and off-peak rates can't be inferred from usage (`:98-99`). Settle at the reserved peak rate unless both dispatch and completion are proven inside a discount window.
- **R7. Product deviation needs owner sign-off** (`:77-79`). Making DM preparation and post-session Chronicle local-only noticeably narrows the owner's Q5 assignment (Opus for intents and Chronicle). Record explicit owner acceptance in ADR 0032 before checkpoint C, and run the live Chronicle smoke call inside an approved session or run.
- **R8. Waiting for a database connection isn't time-limited** (`:46-48`). `statement_timeout` doesn't cover waiting for `pool.connect()`. Limit that wait by the remaining deadline, and check the deadline again after getting a connection, before `BEGIN`.

## Sound as designed

These parts need no change:
- integer microdollars;
- READ COMMITTED with locks taken before totals are read, in separate statements;
- sorted, deduplicated bucket locks with a separate policy key (`-1` doesn't collide with the migrator's key or the two-integer authoring lock space);
- reservation and attempt-start in one atomic transaction;
- exactly one terminal row per attempt via `UNIQUE(attempt_id)`;
- no automatic refund of ambiguous attempts, and full holds after a hard abort;
- unchanged public status sets;
- a deliberate decline ending as `INVALID_OUTPUT`/`NO_PROPOSAL` with no repair;
- the cautious full-context reservation or disabled route while catalog bounds are unverified;
- the evaluation truthfulness corrections and blind-key handling;
- the A → B1 → B2 → C order.

This is an architecture review only. It is not code acceptance and does not authorize paid calls.

<!-- prettier-ignore-end -->
