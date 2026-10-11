# Stage 300 B1 repair 2: independent re-review (read-only)

**Verdict: technical PASS on the exact manifest.** I found no Critical, High or Medium issues. There is one Low hardening finding (L1) and one advisory (A1), neither blocking. The new exception contract fits within the approved B1 architecture, so it doesn't need a new design gate; it does add B2 constraints, listed below. This report alone can't satisfy dual acceptance, doesn't advance B2, and the named-model attestation gate is recorded separately as pending.

## Artifact and pins (checked before and after my checks; all matched both times)

| Pin | Result |
|---|---|
| HEAD `406904343bfe…4124125` | match |
| `review-manifest.json` `bcccf113…f20fc31b6` | match. 169 entries: 168 hashes match, 0 mismatches, and `apps/server/src/ai/budget.ts` is absent as expected. The dirty-path set (169) equals the manifest set exactly. |
| Design `23e53e4d…fab23` and B2 stop delta `6bba0030…b485` | unchanged |
| Accepted A manifest `0c5e7373…e63e` | 30 accounting/migration files, 0 changed |
| `validate.log` `b2d8a65f…f1f3d2` | match |
| Pre/post-validate manifest `4c40ba80…472e7` | identical; equals the review tree except the handoff, which was written afterwards |
| `fail-first.log` `a2fa80db…826` | hash only; not read |

**Delta checks:**
- Against the repair-1 artifact I reviewed earlier, all server sources are byte-identical. The source change is `packages/ai/src/fallback.ts`, plus tests and docs. The delta against the repair-2 transfer baseline matches the handoff list exactly.
- The `.prettierignore` addition is three exact receipt paths, no globs, and those receipts are unchanged since the baseline.
- `docs/PROJECT_WORKFLOW.md` changed outside the implementation delta. I didn't read it.

## Design-gate decision
The approved design doesn't address exceptions from caller-supplied code. Repair 2:
- removes the fabricated provider failures and switches I identified in repair 1;
- changes no outcome-table row, public status, provider payload or accounting rule;
- adds `INTERNAL_ERROR`, which is internal only: the run rejects, so it never reaches a trace at B1.

That restores the design's invariants rather than changing them, so it stays within B1. B2 must take on the constraints listed under residual risks.

## Required patterns (my probe `/tmp/opus-b1r1-probe/p6-repair2.mts`, 39 cases)
- **Cancellation inside `validate`** (valid output, terminal decline, invalid output, local valid):
  - The run ends `CALLER_CANCELLED` with the output discarded and no value or decline returned.
  - Safe model and usage are kept.
  - There is no repair or switch.
- **Abort plus throw in `build`, `start` or `abandoned`:** the run rejects, 0 invocations, nothing recorded. Events are empty (for `build`) or `start, abandoned`.
- **Throws without an abort:** 0 or 1 genuine invocations, one attempt and one `end` after any invocation, then rejection with no transition. This holds for:
  - a `start` listener throwing once;
  - a repair `build` throwing;
  - an `end` listener throwing (valid output and outage);
  - a `dispatched` listener throwing;
  - the clock throwing before or after the invocation;
  - `validate` throwing (`INTERNAL_ERROR` attempt, model and usage kept);
  - `throw undefined` / `throw null`, which also propagate.
- **Pre- versus post-selection cancellation:**
  - An abort during the provider call or `validate` cancels.
  - An abort inside the `end` hook after a valid result or decline still returns that result. This is the disclosed limit, and freezing the outcome is B2's job.
  - An abort inside the `end` hook after invalid output or an outage stops further repair or switch.
- **Outcome table preserved:**
  - `TRANSPORT_NOT_STARTED` from an invoked provider is still a real attempt: it switches while the caller waits, and cancels with the code kept once the caller has gone.
  - Repair then invalid ends `INVALID_OUTPUT`; repair then outage switches to local; outage then invalid local output is final.
  - A local-only route makes one call. A suspect response switches to local. A denied repair ends `BUDGET_DENIED`. A decline is terminal, and a non-intent decline gets a `WRONG_OUTPUT_KIND` repair.
  - In every case, every `start` was closed by exactly one `abandoned` or `end`.
- **Real Anthropic adapter behind a stand-in admitted wrapper:**
  - A `dispatched` abort gives `TRANSPORT_NOT_STARTED`, 0 fetches, then cancels.
  - Abort plus throw gives 0 fetches, one attempt, then rejection.

## L1 (Low, hardening): a provider that resolves a non-response leaves no attempt and an unclosed `start`
- **Evidence:** the `try` at `fallback.ts:205-216` covers only `generate`. `settle` runs outside it (`:307`); `factsOf` reads `response.kind` (`:142-145`); and the `switch` at `:246` has no default branch.
- **Reproducer** (in p6): a test-branded remote that resolves `undefined` rejects with a `TypeError`. Resolving `{kind:'weird'}` gives "settle … not iterable". In both cases there's 1 invocation, 0 attempts, and events `start, dispatched` with no `end`. That breaks contract #4 and the ADR's "every `start` … closed" for an invoked provider.
- **Why it's Low:**
  - The types forbid such a response.
  - The only routable provider at B1 is the genuine local one, which always returns a valid response.
  - In repair 1, an `undefined` resolution was caught inside the `try` and recorded.
- **Fix:** in `settle`, map a non-object or unknown-kind resolution to an uncertain `error` attempt (for example `BAD_RESPONSE`, or `CALLER_CANCELLED` if the caller has gone) so its `end` is published. Add regression tests for `undefined` and an unknown kind. Do this no later than B2's admitted wrapper.

## A1 (advisory): a throwing `dispatched` listener no longer stops transport
In repair 1 it reached the adapter's `onStart` and the attempt ended `TRANSPORT_NOT_STARTED`. Now the fetch goes ahead (1 fetch), the attempt is recorded, and then the run rejects, so the result of a paid call is thrown away. This matches the handoff's stated contract and isn't an accounting error, provided the B2 wrapper settles usage itself. B2 should decide whether to accept that or abort transport on listener failure.

## Residual risks deferred to B2/C
- **Rejected use cases:**
  - A use case that rejects after an admitted invocation writes no trace, so B2's journal and recovery must still finalize and account for that request.
  - Add `INTERNAL_ERROR` to the attempt-code vocabulary in `AiAttemptView`'s documentation if it is ever persisted.
- **Outcome freeze:** B2 must apply the freeze to the abort-in-`end`-hook case.
- **HTTP 500 on rejection (pre-existing):** the context and NPC routes don't catch rejections, so they return a 500 (the fixed `INTERNAL` body). The NPC route's 500 comes after the canonical command has already committed.
- **Unchanged from repair 1:**
  - Prepared requests are not single-use.
  - Missing or `null` usage keeps the output with unknown billing; B2 must hold the reservation.
  - Usage allowlists are not verified against provider docs.
  - The router-construction pin is a source-text scan.
  - Admitted wrappers must be frozen with a data-property `kind`.
- **C scope:** evaluation admission, oracles, reports and client feedback. Remote runtime and live evaluation stay off.

## Checks I ran
- **Unit tests** (keys and routes unset):
  - Handoff focused set: 5 files, 141 tests pass.
  - B1 scope including `authoring-routes` and the architecture tests: 34 files, 560 tests pass.
  - `packages/ai`: 241 tests pass, matching the handoff.
- **Static checks:**
  - `format:check` passes repo-wide, which confirms the `.prettierignore` change.
  - `typecheck` exits 0.
  - ESLint passes on 5 files with 0 warnings.
  - Context budget: 649 files, 0 over.
- **Probes** (Node 25.8.1 with type stripping; `/tmp` writes only; in-memory fakes; no network or DB):
  - p6: 39 cases.
  - Repair-1 regression re-runs on the unchanged server code: p1 composition (0 forged calls, no vulnerabilities), p2 usage (283/283), p3 adapter (30/30).
  - The old p4 harness now rejects on its unwrapped repair-`build` case. That's the intended propagation, and p6 supersedes it.

## Writer's full validate (supplied, not re-run)
From the log's summary lines: unit 185 files / 1975 tests, integration 28 / 138, E2E 45, context budget 649 files with 0 over, Prettier pass.

## Limits
I didn't read any peer or prior reviews, implementation reports, streams or briefs, receipts, workflow status or the fail-first log. Two files, `sol-review-report.md` and `sol-review-receipt.json`, appeared in the repair-2 evidence directory during my session. I didn't write them and didn't open them. This report is returned as text only and makes no identity claim. I made no source or report writes, ran no agents, Codex CLI, builds, E2E, DB, network or paid calls, and didn't touch credentials.

**PASS — STOP.**