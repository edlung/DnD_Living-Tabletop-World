# Stage 300 remediation design 3 — FABLE review

Date: 2026-10-11. Verdict: CHANGES REQUIRED.
Artifact SHA256: `8ac06844adfdd33cf878870f6656fee245ee6ebe583b2116374f1e85faa68a2d`.
Source baseline: `bc6c1162073f6c1c1e7bfb5b775d88a50b639181`.
Actual transport response model: `claude-fable-5-1`; explicitly configured effort: `high`.
Fresh native Anthropic session; read-only; no other reviewer verdict supplied.
Receipt: `STAGE_300_DESIGN_REVIEW_3_RECEIPTS_2026-10-11.json`.
The response below is preserved verbatim. Architecture review only; no code acceptance or paid-call authorization.

---

<!-- prettier-ignore-start -->

**Verdict: CHANGES REQUIRED** (two narrow blockers; the lock, accounting, and transition architecture is otherwise sound).

Reviewer: Claude Fable 5.1, requested model `claude-fable-5-1`, requested effort high. Orchestrator records actual `message.model`. I read the artifact as it exists on disk; I did not compute its SHA256 (no shell), so the orchestrator's before/after hash check is the integrity evidence. I did not read `reviews/` or any prior verdict. Architecture approval, when given, is not code acceptance or paid-call authorization.

## Blocking issues

**B1. Admission deadline is undefined for intent, dialogue and Chronicle, which makes the lock/timeout rule self-denying.** Lines 46–48 set `LOCAL lock_timeout`/`statement_timeout` "from the remaining admission deadline" and forbid starting database work "when no positive deadline remains." Line 157 requires every request-start row to carry a deadline. Lines 278–280 define caller-cancellation rows for all three capabilities. But the design only ever specifies a deadline for relevance (lines 177–197, `relevanceBudgetMs`). Today `interpretDmIntent`, `replyAsNpc` and `renderChronicle` pass no `AbortSignal` at all (`packages/ai/src/intent.ts:70`, `dialogue.ts:60`, `chronicle.ts:83`). As written, an implementer must either invent a deadline policy for checkpoint A or deny every non-relevance admission. Checkpoint B2 ("whole-request deadlines", line 366) names the concept but never pins values or source.
Resolution: add one paragraph to §1 defining a per-capability whole-request deadline (configured, positive, no zero), stating it is the single `AbortSignal` source for intent/dialogue/Chronicle, that it bounds admission + every attempt + terminal persistence wait, and that expiry maps to the existing CALLER_CANCELLED rows. Separately pin a fixed positive bounded timeout for settlement, release and operator transactions that run outside any caller deadline.

**B2. The outcome table omits "invalid first output, then repair admission denied."** Line 82–83 requires separate admission for each repair. Line 214 says exhausted budget means "deterministic/local fallback", but ADR 0017 §5 only permits a provider switch on provider failure, not after invalid output. So the implementer has two materially different safe readings: end INVALID_OUTPUT (no switch), or treat the denied repair as provider failure and switch to local, consuming the one switch. The same gap exists for repair denied by disabled admission or budget-store failure (line 27). This is a common path once a session ceiling is near, and the table (lines 258–281) claims to pin every transition.
Resolution: add rows "Intent/Dialogue/Chronicle/Relevance — repair admission denied." Recommended: record a non-dispatched repair attempt with fixed code BUDGET_DENIED (or ADMISSION_DISABLED/STORE_FAILURE), end at the existing invalid-output result for that capability (INVALID_OUTPUT, template paragraphs, deterministic actions), no switch. State explicitly that a denied repair is not a provider failure.

## Material risks (non-blocking; pin before checkpoint A where marked)

**R1. Runtime session binding ambiguity (lines 55–57, 64–75).** Line 56 lists "approved session/run bindings" as CLI-only; line 74 says "define limits per such session in the approval record." Play sessions are minted by `StartSession` (`packages/domain/src/memory/decide.ts:140`), so an explicit per-session CLI binding would require the operator to act after the DM starts each session. Either reading is safe because the cumulative stage ceiling bounds everything, but they differ in operability. Pin one: I recommend the approval record carries a uniform per-session ceiling applying to any `activeSessionId` of the bound campaign, with evaluation runs still explicitly bound. Pin before A.

**R2. Settlement failure in the live process (lines 111–116, 165).** If the settlement write fails (lock timeout, store outage) after usage is known, the design correctly keeps the full hold, but then the only path to the actual lower charge is manual reconciliation, since recovery "never invents" usage. Add: the live process retries settlement with bounded backoff until success or shutdown; the hold stays conservative otherwise. Pin before A.

**R3. Post-terminal evidence row kinds (lines 117–122).** `UNIQUE(attempt_id)` across `settled`/`released_pre_dispatch`/`reconciled` requires that a reconciliation applied after a settlement, and a late settlement after a reconciliation, both land as a different kind (e.g. `evidence`) excluded from the partial unique index. Name that kind and state that the operator CLI chooses it automatically when a terminal row exists. Otherwise the reconcile-then-late-settle test cannot be written unambiguously.

**R4. Unknown-usage-field fail-closed is operationally fragile (lines 100–102).** Anthropic responses already carry fields such as `cache_creation` sub-objects, `service_tier`, and `server_tool_use`; any provider schema addition disables all remote admission until reconciliation. This is a deliberate safety trade and I do not ask to weaken it, but each pricing version should allowlist known informational fields and their accepted values, so verification happens once per catalog version rather than at first production response.

**R5. Reconciliation workload from routine relevance deadline misses (lines 180–181).** With DeepSeek relevance at 1.1–2.1 s against a 2–3 s budget (ADR 0032), a meaningful fraction of the 100 rankings per session will become uncertain full holds requiring individual operator reconciliation. Deliberate, but the operator CLI should support reconciling a set of held attempts in one period against the provider's reported totals, still per-attempt in the journal. Not a safety issue.

**R6. ADR 0032 correction is deferred to checkpoint C (lines 325–327).** The 6/6 and 18/18 claims remain uncorrected through A, B1, B2. The correction is documentation only and has no code dependency; append it at checkpoint A. Same for the hardcoded 2000 ms report line (line 316).

**R7. Microdollar rounding granularity (lines 20–21).** Rates like $1.32/M are not integer microdollars per token. Specify rounding up once per billing dimension per attempt (ceil of tokens × rate), not per token, or the reservation inflates by up to 50% on cheap models. Conservative either way, so non-blocking.

**R8. Prompt caching changes outbound framing (lines 291–299).** Splitting the system prompt into a cacheable block and adding `cache_control` changes what the provider receives even though context builders do not change. Record this delta in Gate 06 coverage exactly as the intent envelope delta is recorded (line 243). Also note Anthropic's minimum cacheable prefix length varies by model; a prefix below it is silently uncached, which the "do not claim cache hits from configuration" rule already handles.

## What I checked and found sound

- **Lock protocol (lines 31–48):** shared advisory lock on policy key −1, then exclusive bucket locks sorted as bigint, acquired before reading totals, under READ COMMITTED on one checked-out client. The waiter's post-lock read sees the competitor's committed hold because each statement takes a fresh snapshot. Lock ordering is consistent across admission, settlement, release and operator paths, so no deadlock. PostgreSQL queues new shared requests behind a waiting exclusive one, so operator mutations cannot starve. Nonnegative bucket IDs cannot collide with −1.
- **Crash readability (lines 111–127, 149–175):** reservation and attempt-start in one transaction; terminal uniqueness; non-reducing later evidence; release only with live-process pre-transport proof; recovery that holds rather than refunds. Orphan starts without a trace row are correctly treated as held spending.
- **Hard abort (lines 177–197):** consistent with ADR 0017/0021 and the current `rankContextActions` race structure; the "already-aborted signal yields TRANSPORT_NOT_STARTED" mechanism (line 216) gives the admission wrapper a uniform proof path.
- **Transitions (lines 203–289):** refusal as a usage-bearing envelope with one local switch preserves ADR 0017 §5 and the current adapter behavior (`anthropic-provider.ts:113`); terminal decline mapped to INVALID_OUTPUT/NO_PROPOSAL with no repair keeps the public status set unchanged. Implementing "no repair" requires a terminal variant of `OutputCheck` in `fallback.ts`, which is within the allowed boundary.
- **Same scoped context:** no change to context builders; local switch reuses the same `build`; caching restricted to a byte-identical prefix.
- **Billing components (lines 85–109):** full-context reservation at the highest applicable tier with cache-write multipliers, versioned pricing functions, allowlisted request options, catalog verification as a separate authorized activity. The resulting low admission count per session is a documented usability constraint, not a defect.
- **Evaluation truthfulness and checkpoints (lines 305–383):** approval-only ceilings, durable shared ledger, immutable evidence, separation of lexical from semantic claims, and a feasible A → B1 → B2 → C order with offline-only intermediate builds.

Fixing B1 and B2 is a few paragraphs and does not change the architecture. I would expect to approve the next revision of the same artifact if those rows and the deadline paragraph are added and R1–R3 are pinned.

<!-- prettier-ignore-end -->
