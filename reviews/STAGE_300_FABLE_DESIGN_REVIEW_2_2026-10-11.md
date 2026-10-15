# Stage 300 remediation design 2 — FABLE review

Date: 2026-10-11. Verdict: CHANGES REQUIRED.
Artifact SHA256: `ad700826921b809a150a577d76607a0c40d6f918fadbf10b410f0713428ddd7c`.
Source baseline: `bc6c1162073f6c1c1e7bfb5b775d88a50b639181`.
Actual transport response model: `claude-fable-5-1`; explicitly configured effort: `high`.
Fresh native Anthropic session; read-only; no other reviewer verdict supplied.
Receipt: `STAGE_300_DESIGN_REVIEW_2_RECEIPTS_2026-10-11.json`.
The response below is preserved verbatim. Architecture review only; no code acceptance or paid-call authorization.

---

**Verdict: CHANGES REQUIRED** (narrow). The design is close to approvable: its safety posture is sound, and I found no invariant it weakens. Three gaps need pinning in the artifact before implementation because an implementer would otherwise decide them silently, one of which can defeat the central admission guarantee.

Reviewer: Fable 5.1, requested effort high. The orchestrator records the actual response model. I read the artifact content as it exists on disk and did not compute its hash. I did not read reviews/, prior verdicts, .env files, or full directories.

## Blocking issues

**1. Lock-then-read is only correct under READ COMMITTED on a pinned connection** (`docs/STAGE_300_REMEDIATION_DESIGN.md:31`-`35`). The design takes advisory transaction locks and then reads settled spend plus holds. Under REPEATABLE READ or SERIALIZABLE, PostgreSQL fixes the snapshot at the first statement, which is the lock acquisition itself. A waiter that acquires the lock after the competitor commits would still read the pre-commit totals and admit the same capacity. The design also does not say the whole sequence must run on one checked-out client. The current trace store uses pool-level queries, and advisory transaction locks are per-session, so a pooled implementation would silently take locks on different connections.
Resolution: state that admission, settlement and release each run on a single checked-out client, in one transaction at READ COMMITTED (explicitly set, not assumed), with the global approval lock first, then sorted bucket locks, then totals. Require the two-connection barrier test at line 38 to assert the second transaction observes the first commit after acquiring the lock, and to fail under REPEATABLE READ so the guard is proven, not asserted.

**2. Refusal is a new terminal class with no pinned public mapping, and it changes an owner-approved policy** (`:150`-`155`, `:177`-`179`). Today a refusal is thrown as `BAD_RESPONSE` and the fallback loop treats any thrown error as a provider failure, so it switches to local (`apps/server/src/ai/anthropic-provider.ts:113`, `packages/ai/src/fallback.ts:76`). The design makes refusal terminal with no switch. That removes the local template reply for NPC dialogue and the template render for Chronicle in exactly the injection cases Gate 04 cares about. ADR 0017 §5 is an owner decision, so this needs a recorded owner choice, not only an ADR 0032 technical note. The design also says refusal maps to "existing capability failure behavior" without naming the status. The public status set has two failure statuses, and the attempt outcome enum has three values (`packages/contracts/src/ai-gateway/intents.ts:41`, `:58`).
Resolution: pin, per capability, the public status for `PROVIDER_REFUSAL` (my recommendation: `INVALID_OUTPUT` with the fixed issue, which preserves the existing Chronicle template path and the existing DM wording), pin the attempt outcome value, and state that a refusal is returned as a response envelope carrying usage rather than a thrown error. Record the no-switch decision as an owner-approved amendment to ADR 0017 §5, or keep the one switch to local for refusal and say so.

**3. Who creates approvals, and where ceilings come from, is inconsistent** (`:40`-`44`, `:89`, `:124`, `:200`-`202`). Line 42 says the environment selects an approval ID and cannot override its limits. Line 200 says the evaluation CLI "requires explicit stage/session budget configuration". Line 124 describes a CLI that appends reconciliation, disable and enable records but not approvals or revisions. The approval creation path is the single authorization root for every paid call, so it cannot be left implicit.
Resolution: state that the documented operator CLI is the only path that appends approval and revision rows, that it takes ceilings as explicit microdollar arguments, and that both runtime and the evaluation CLI accept only an approval ID and a run or session ID. Remove the daily-budget environment default entirely rather than leaving it non-authorizing.

## Material risks (non-blocking, resolve in the same revision)

- **Tiered pricing at the reserved bound** (`:60`-`72`). Reserving the full model input limit is a deliberate constraint and I accept it. But some providers price input above a context threshold at a higher rate. A catalog entry that reserves the full limit must price it at the worst tier that applies anywhere inside that bound, including cache-write multipliers at the worst tier. Add this to the "catalog bound dominates" documentation requirement at line 72.

- **Per-session ceilings are circumventable by minting IDs; only the stage ceiling is hard** (`:46`-`54`). A DM can end and start play sessions, and an evaluation rerun gets a new run ID, each opening a fresh session bucket. The stage allowance still bounds total spend, which is correct. Say explicitly that the session ceiling is a rate guard, not an authorization bound, and require evaluation run IDs to be appended to the approval store by the CLI before admission so "operator-approved" at line 50 is literal.

- **Product consequence of session attribution** (`:48`-`49`). DM intents and Chronicle rendering typically happen outside an active play session. Under this design they run local-only unless a session is open. That is a safe default, but the owner should be told in the design, since it changes what paid mode delivers for authoring and Chronicle. The route already loads the campaign snapshot per request (`apps/server/src/http/routes/ai-routes.ts:34`), so attribution is implementable as written.

- **Cache breakpoint placement** (`:186`-`188`). Provider prefix caching cannot leak across requests, but a breakpoint placed after perspective-specific text would cache NPC context and defeat the "stable instructions only" rule. Require the cached segment to be byte-identical across NPCs and campaigns for a capability, and add a test that it contains no source IDs or perspective text.

- **Pre-dispatch release proof** (`:159`-`161`). The design relies on the adapter emitting a distinct outcome strictly before transport. Any failure thrown before transport that is not that outcome, including a key-reveal error, holds the reservation. That is conservative and acceptable, but give the outcome a name in the provider error code set so the admission wrapper matches on a code, not on message text.

- **Settlement after response** (`:121`-`126`, `:140`-`143`). Returning the preallocated trace ID at the deadline means the historical trace read can return 404 until the terminal insert lands. The diagnostic endpoint covers this. Say so in the client-facing behavior for the relevance route so the UI does not treat a transient 404 as a missing trace.

## What is sound

- **Atomic grants and crash accounting.** Reservation plus attempt-start in one transaction, no foreign key to the completed trace, append-only transitions with unique keys, no automatic refund of ambiguous attempts, late settlement to the admission period, and overrun disabling admission. This is the right shape and matches the migrations rule of append-only operational tables.

- **Deadline and cancellation.** The deadline covering admission, provider wait and persistence, no dispatch after expiry, no new repair or switch after abort, and no untracked call to meet a deadline. Implementable within the fallback loop and the relevance use case without touching context builders.

- **Decline envelope.** The discriminated union for the intent tool, validated into the existing `INVALID_OUTPUT` with a fixed issue, is additive and keeps the canonical command schema. It fixes the evaluation predicate that currently matches on issue text (`apps/server/src/testing/eval/eval-cli.ts:113`-`117`).

- **Evaluation truthfulness.** Reading the real deadline instead of the hardcoded value at `eval-cli.ts:249`, separating semantic correctness from safe decline from technical success, lexical checks labeled as lexical, negative controls including guarded content, and the blind key held outside the comparison directory.

- **Routing and billing scope.** Full-limit reservation or disabled route pending verified catalog bounds is a legitimate safety constraint. Rejecting three-entry and multi-remote routes closes the unreachable-fallback finding. Separate admission per repair and per switch under the same parent budget is correct.

- **Checkpoints.** A, B and C are separable. In A, before adapters emit the pre-dispatch outcome, every failure holds conservatively, which is safe. PostgreSQL integration test infrastructure already exists for traces, so the two-connection test is feasible. The owner assignments match the current workflow.

## Recap

The design is safe in intent and nearly complete. Pin the transaction isolation and connection model for the lock-then-read admission, pin the public mapping and owner decision for terminal refusal, and make the approval creation path and ceiling authority unambiguous. With those three edits and the listed risk notes folded in, I would expect to approve the next hash. This is architecture review only, not code acceptance and not authorization for any paid call.
