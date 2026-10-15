# Stage 300 remediation design 4 — OPUS review

Date: 2026-10-11. Verdict: CHANGES REQUIRED.
Artifact SHA256: `beb33666dc682f04719e6ae9a50c1139bf4ff2f09d2d9637ccfef0efbf55ada5`.
Source baseline: `bc6c1162073f6c1c1e7bfb5b775d88a50b639181`.
Actual transport response model: `claude-opus-5-5`; explicitly configured effort: `xhigh`.
Fresh native Anthropic session; read-only; no other reviewer verdict supplied in the brief.
Receipt: `STAGE_300_DESIGN_REVIEW_4_RECEIPTS_2026-10-11.json`.
The response below is preserved verbatim. Architecture review only; no code acceptance or paid-call authorization.

---

<!-- prettier-ignore-start -->

# Architecture review: Stage 300 remediation design, draft 4

**Verdict: CHANGES REQUIRED** — one blocking issue. Everything else I checked holds.

**Reviewer and artifact**
- I ran as `claude-opus-5-5`. I can't see my own effort setting, so the requested xhigh effort is unconfirmed by me; the orchestrator records `message.model`.
- Artifact: `docs/STAGE_300_REMEDIATION_DESIGN.md`. I didn't compute its hash because I had no shell.
- I read only the narrowly relevant files: the workflow, effort matrix, design, work order, ADRs 0017 and 0032, the migration rules, and the source contracts the design touches.
- **Disclosure:** one repo-wide search for `activeSessionId` showed a few matching lines from files under `reviews/`. I didn't open those files or use them.

## Blocking issue

### B1. The design doesn't say which outcome counts when the deadline expires during the final trace write, or how recovery coordinates with a live writer

Relevant lines: 63–67, 194–199, 210–213, 239–247, 309, 346–349, 361–363.

**(a) What the caller is told can differ from what the trace records.**
- The whole-request deadline also covers waiting for the final trace write (line 64), and "Expiry follows CALLER_CANCELLED rows" (line 67).
- Today each use case builds its trace after `runWithFallback` and then waits for `traces.append` (`chronicle.ts:95-136`, `relevance.ts:145-176`, `intent.ts:77-94`). So a valid result can be decided before the deadline, and its insert-only trace write (status RANKED, RENDERED or PROPOSED) can already be running when the deadline fires.
- Read literally, line 67 then returns the cancellation outcome: TIMEOUT for relevance, the template for Chronicle, AI_UNAVAILABLE for intents. The trace that eventually lands says the opposite. That breaks the design's own rule (line 309) that the table pins trace status to the public result.
- **Chronicle:** the permanent game record gets the template prose, tagged `provider: template`, plus a `traceId` whose trace claims RENDERED with different paragraphs (`chronicle-routes.ts:109-131`). The game record would point to a trace that contradicts it.
- **Intents:** a stored PROPOSED trace can still be used to start an authoring proposal (ADR 0017 amendment, ADR 0018), even though the DM was told AI_UNAVAILABLE.
- The other reading, returning the result that was already decided, contradicts line 67. Two careful implementers will build different behaviour.

**(b) Recovery has no rule for when, or which, requests it may finish.**
- "Recovery derives unfinished requests" (line 212) and "recovery can append the missing outcome" (line 244) never say when a request counts as abandoned.
- §1 explicitly supports several processes, and line 243 deliberately leaves a slow final write running after the caller returns. Recovery can therefore race a live writer. It could append a second caller outcome, or insert a trace row first so the real write fails on the `trace_id` primary key (`postgres-trace-store.ts:18-20`).
- The design also never says whether recovery ever inserts a trace row. If it doesn't, the "temporary" 404 at line 245 is permanent for crashed requests.

**Resolution.** Pin all of the following in ADR 0032 and the design:
1. **Fix the result at one point.** Decide the caller's result once, before building the final trace. If the deadline hasn't passed at that point, return exactly that result with its trace ID, even if the write is still pending. The CALLER_CANCELLED rows apply only when the deadline expires before that point. A cancellation trace never contains late output; a late completion only adds accounting or evidence rows.
2. **One caller outcome per request.** Record it as a unique per-request entry. The first writer wins, and the losing writer treats the conflict as harmless.
3. **Recovery rules.**
   - Recovery may act only on requests that have no caller outcome and whose stored deadline plus the 5,000 ms persistence window has passed.
   - It appends a distinct `recovered_incomplete` outcome.
   - Pick one: recovery inserts a fixed-status trace (AI_UNAVAILABLE or TIMEOUT, attempts taken from the journal, no output), or the design states that the diagnostic read is the permanent record.
4. **Tests.**
   - For each capability, the deadline expiring during the final write, asserting the caller's result equals the trace.
   - Recovery racing a slow live writer.
   - Recovery with two processes running.

## Material risks (not blocking)

- **R1. Scope of the "global" daily limit and automatic stops** (lines 23–24, 39–40, 166–167, 216–217).
  - Admission checks stops only on its own approval, and nothing says whether the global daily bucket includes the approval ID.
  - With a second owner-authorised approval, an unexpected-model or unverified-billing stop wouldn't block the same suspect provider. The "global" daily cap could also turn out to be per approval.
  - Fix: key the global daily bucket and model/billing stops without the approval ID, checked under the global daily lock. Alternatively, allow only one active approval at a time.
- **R2. Lock mode for operator changes that don't clear a block** (lines 35–37 against 153–154 and 218–224). Per-attempt reconciliation and batch evidence can release holds or raise charges, but no lock mode is assigned to them. The simplest fix is to require the exclusive policy lock for every operator CLI change.
- **R3. The evaluation CLI between checkpoints A and C.**
  - `eval-cli.ts:14` imports `costUsd` from `budget.ts`, which checkpoint A removes; `eval-cli.ts:249` hardcodes the 2000 ms budget.
  - Until C, the old CLI can produce AI_UNAVAILABLE "results" and write over `reports/evidence/stage-300/`.
  - Fix: from checkpoint A, the eval CLI refuses live mode and never writes over existing evidence.
- **R4. What the local intent provider returns under the new envelope** (line 292; `local-provider.ts:166-168`).
  - Today, text the local provider can't interpret gives `{commands: []}`. That fails validation, the local repair fails too, and the result is INVALID_OUTPUT with schema issues after two attempts.
  - Pin whether the local provider now returns `decline/unsupported` (one attempt, NO_PROPOSAL). If so, record it as a reviewed change, because it alters deterministic suites the work order says must pass unchanged (work order line 46).
- **R5. Players can use up the DM's capacity.** Players' relevance and dialogue requests share the session and campaign buckets with DM intents. With full-context holds, and the deliberate uncertain holds after a hard abort (lines 231–234), ordinary player traffic can exhaust capacity. This cost is accepted, but the startup report and checkpoint C's report should show it.
- **R6. No stored record of owner authorisation** (lines 82–84). The CLI can't check that the owner authorised spending. Require it to store an authorisation reference (owner, date, source document) with every approval, revision and enable record.
- **R7. How the local provider is exempted** (lines 189–191). Recognise the local exception by object identity (the instance returned by `createLocalProvider()`), not by `id === 'local'`. Otherwise a wrapped remote provider could pass as local.

## Checked, no blocking problem found

- **Locking.**
  - Admission takes a shared policy lock and operators take it exclusively, so a shared lock is never upgraded. Sorted bucket locks are taken before any totals are read.
  - Under READ COMMITTED, each statement's snapshot is taken after the locks are held, so it sees holds, stops and revisions committed by competitors.
  - All attempts under an approval share the stage bucket, so admissions and settlements for that approval run one at a time. That is safe.
  - Advisory-lock keys don't collide: the authoring store uses the two-integer form (`postgres-proposal-store.ts:39`), a separate key space, and the migrator uses a positive bigint key.
- **Charge arithmetic.** One terminal row per attempt (`UNIQUE(attempt_id)`), every row an absolute amount, effective charge = MAX, evidence that can raise but never lower, and uncertain holds kept after dispatch. Releasing a reservation requires the live process's own proof that the transport never started. This is coherent, including late settlement after reconciliation.
- **Session attribution.** Capturing the session from the route's `before` snapshot fits `npc-routes.ts:62-100`. Settlement uses the buckets stored with the attempt.
- **Fallback transitions.** Refusal, suspect model or billing, denied repair, caller cancellation and the terminal decline all fit `runWithFallback`'s one-switch/one-repair counters, and the local switch always reuses the original context with no repair note. The three-entry and multiple-remote routes are rejected.
- **Billing.** The dimensions cover cache-write time-to-live classes, context tiers, reasoning tokens, service tier and region, and fail closed on unknown usage fields. Full-model reservation and disabled routes are treated as the deliberate constraint you described.
- **Checkpoints.** The construction guard at A and B1 and the zero-outbound rule are feasible, apart from R3.

Architecture approval isn't code acceptance and doesn't authorise paid calls. This review doesn't resolve the pending owner decision on the Q5 local-only limitation.

<!-- prettier-ignore-end -->
