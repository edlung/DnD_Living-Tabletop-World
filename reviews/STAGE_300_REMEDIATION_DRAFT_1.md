# Stage 300 remediation design — draft 1

Date: 2026-10-11. Baseline code: `bc6c116`. Status: DRAFT, NOT APPROVED.
This is completion of the existing Stage 300 contract, not a new runtime feature stage.
No paid runtime calls are authorized by this document. Current policy: `docs/PROJECT_WORKFLOW.md`.

## Required outcomes

Meet `work-orders/OPUS_STAGE_300.md` without changing scoped context builders, legal actions,
canonical mutation authority, or the one-switch/one-repair policy of ADR 0017.
Independent technical audit of the baseline found concurrent overspending, erased billed failures,
missing timeout attempts/cost fields, false-positive evaluation predicates, unreachable local
fallback for three-entry routes, and missing caching. This draft addresses those contracts;
audit identity/acceptance evidence is recorded separately and is not architecture approval.

## 1. Durable budget admission

Introduce a focused server-side budget-store port and PostgreSQL implementation. Monetary values
use integer microdollars with conservative upward rounding; do not accumulate binary floating-point
dollars. Budget admission atomically reserves a worst-case amount across global UTC day, campaign UTC
day and configured evaluation/session ceilings before any outbound provider request. Use stable lock
ordering and one transaction so two processes cannot both admit the same remaining capacity. Persist
attempt ID, campaign, billing period, pricing version, bound and state. Budget-store failure denies
the remote attempt and preserves deterministic fallback. In-memory implementation is test-only.

Carry campaign and attempt identity as trusted application metadata, never as model prompt content.
Do not derive a campaign from user prose or expose cross-campaign totals to players. Each repair and
provider switch requires a separate admission under the same parent request/session budget.

Only route a model with a verified, explicit pricing/bounds entry. Remove the generic unknown-model
price fallback. Reserve a verified upper bound on input and output for the exact serialized request,
not an average estimate from previous replies. Without a verified offline input-token bound, reserve
the full model input limit or deny the attempt; do not substitute a guessed token heuristic. Enforce
outbound output bounds and a request-size limit;
the approved catalog must bound tool/schema/framing, cache writes and any reasoning tokens. The
implementation must document why the catalog bound dominates each provider's accepted request.
Model aliases/returned versions need explicit mappings; an unexpected response model blocks further
calls and conservatively retains the reservation. This is an application bound under the verified
provider pricing/model contract, not a guarantee against an external provider changing its charges.

Settle reservations using validated nonnegative finite integer usage and the recorded pricing
version. Successful responses, malformed structured output, refusal, truncation and invalid JSON
must not discard known usage. After dispatch, missing usage, disconnect, timeout, crash or uncertain
outcome keeps the full reservation charged/held conservatively. Do not expire/refund an ambiguous
in-flight attempt automatically: the provider may have billed it. Pre-dispatch failures may release
only with proof that the transport did not run. Settlement is idempotent and cannot double refund.

Late completion is settled to its admission period even across midnight. Restart reads the same
store; lowering a ceiling does not erase existing spending. An actual charge above its bound records
an overrun, disables further remote admission and requires explicit reconciliation. No claim of a
strict cap may conceal an invalid model-bound assumption.

Configuration requires explicit positive ceilings for paid mode; no default $5 approval. No keys or
missing/zero approvals yields deterministic/offline routing. The owner's $20 OpenRouter key ceiling
does not authorize Anthropic/DeepSeek runtime use. Do not modify the owner's `.env.local`.

## 2. Every dispatched attempt remains observable

Add additive billing metadata to attempt views: attempt ID, configured/actual model, reservation,
estimated/known cost, usage status and pricing version. Preserve historical traces without migration
rewrite: absent metadata means legacy/unknown, never zero. Local attempts explicitly cost zero;
unknown remote charges remain unknown and retain a conservative reservation.

Keep a durable append-only attempt journal with start and terminal accounting events. Register the
parent trace/attempt identity before dispatch. Refusal, provider errors and late relevance completion
cannot disappear because the capability timed out first. Existing insert-only capability traces stay
insert-only; their attempt references can resolve current accounting from the separate journal on
authorized DM reads. Budget reservations and attempt-start records must share one atomic transaction.
Do not expose the journal outside existing DM trace authorization. Persist only fixed failure codes
and validated billing metadata, not credentials or raw transport errors.

The relevance endpoint still returns deterministic actions at its time budget. Abort prevents new
repair/fallback dispatch after cancellation, and does not erase a previously dispatched attempt.
Late output never changes the returned ranking or world state. The journal may settle later without
delaying the player's response. Record timeout itself even when a provider ignores AbortSignal.

## 3. Adapters, routing, caching and client

Separate transport/accounting metadata from structured-output validity. Preserve safe response usage
on refused/malformed/truncated output. Validate numbers before cost arithmetic. Normalize provider
identity without accepting arbitrary cheaper returned model names. Add explicit tests of the chosen
no-tool/refusal behavior against ADR 0017; do not claim repair when the implementation only switches.
Validate configured provider availability and route length against the one-switch invariant. A
missing key must not silently promote a different paid route. Cancellation must stop further attempts.

For normal paid runtime, intent/dialogue/narrative routes are `remote,local` or `local`; relevance is
one explicit remote route or none, with its existing deterministic Context Engine fallback. Reject
three-entry and multi-remote runtime routes rather than silently truncating them. Evaluation may use
one explicitly selected remote without local so measurements cannot hide a fallback. No implicit
paid relevance route from a global Opus setting. Startup reports resolved capability/model names,
never keys, prompts or private campaign spending.

Non-game and ambiguous intents may deliberately decline to propose. Add a narrowly typed internal
no-proposal result and avoid a paid schema-repair attempt that asks the model to invent a command.
Preserve existing public failure/no-proposal behavior and canonical command schemas; do not expose
a new public status without separate reviewed contract approval. Record the prompt delta in Gate 06
coverage. Evaluation labels a safe decline separately from a schema-valid, semantically correct
proposal, rather than calling all invalid output a successful intent.

Apply supported prompt caching to stable instructions/schema only, with no broadening of scoped
context. Keep NPC/character data in its original isolated prompt scope. Price cache writes/reads
conservatively and record usage; do not claim cache hits from configuration alone. Provider-specific
cache semantics/rates must be checked against official docs before approval of the implementation.

Verify the existing resolving UI for live NPC requests. Add localized replying and honest failure/
fallback feedback only where the current flow does not provide it. Do not add streaming without
measured need. Preserve drafts and prevent stale replies across perspective changes.

## 4. Evaluation integrity

The CLI requires explicit stage/session budget configuration before a paid run and shares one
durable ledger across all models, capabilities and reruns. Refuse to run live if budget configuration
or verified price/model bounds are absent. Keep fake-provider unit tests independent of credentials.

Store immutable run directories with manifest, source commit/dirty hashes, configuration without
keys, model response identity, case inventory, latency/usage/cost and known missing charges. Never
overwrite previous evidence or infer authorization from silence. Read the actual relevance deadline
in output instead of printing a hardcoded 2000. Do not mark non-game intent acceptance as a model
success if it contradicts the response contract. Keep blind labels hidden; NPC voice is an owner
choice. Replay Gate 04 injection cases and inspect context isolation separately from output-marker
checks. Negative controls must reject a wrong requested name, wrong target or command type, partial
substring match, and guarded content from `guardedBy` as well as `neverSaid`. Check provider input
against allowed sources and Gate 04 disclosure/attitude cases; a marker-only output scan cannot prove
semantic fidelity or rule out paraphrased secrets. Record lexical checks as lexical checks, and keep
human/independent quality assessment separate. No new live measurements until the owner supplies
explicit text-provider ceilings.

## Allowed source boundaries

- `apps/server/src/ai/`: budget store/ledger, adapters, gateway, trace persistence, focused tests.
- `apps/server/src/platform/config/`, `apps/server/src/main.ts`, `.env.example`: configuration/wiring.
- New migration after `0004`, following `apps/server/migrations/AGENTS.md`; never edit applied SQL.
- `packages/ai/src/providers.ts`, `fallback.ts`, `intent.ts`, `dialogue.ts`, `chronicle.ts`,
  `relevance.ts`: trusted accounting identity, cancellation and attempt observability only.
- `packages/contracts/src/ai-gateway/`: additive attempt accounting contract; historical readers.
- `apps/server/src/testing/eval/`: admission and immutable evidence; no live runs in validation.
- Narrow affected UI files only if required for replying/failure behavior; relevant Russian catalogs.
- Current ADR, reports and context routing. Do not change world commands or context builders.

## Checkpoints and required evidence

A. Persistent admission, trusted metadata and accounting journal. Opus 5.5 high owns writing because
this touches migrations, atomicity, concurrency and recovery. Before implementation: fresh Astra
xhigh and Fable 5.1 high approval of the same exact design/hash. After implementation: Astra xhigh
acceptance of the actual diff and checks before dependent checkpoint B.

B. Complete adapters, traces, cancellation, route/caching behavior, evaluation admission and client
feedback. Opus high for recovery/contracts; a separate bounded Sonnet medium writer may handle UI.
Finish required deterministic validation and Astra acceptance. Live evaluation and owner NPC choice
remain pending until separately authorized; an offline pass is not evidence of new live results.

Tests must reproduce concurrent/multi-process oversubscription, restart, midnight crossing, independent
campaign ceilings, idempotent settlement, unknown/negative/NaN usage, malformed billed responses,
refusal, unknown returned model, storage failure, caller cancellation before/after dispatch,
unresponsive provider, late relevance response, and repair/fallback under the same ceilings. Include
PostgreSQL integration tests for actual transactions and durable recovery, legacy trace reads,
campaign/DM trace isolation, no-key configuration, immutable eval output and existing scoped context
regressions. Run full `pnpm validate` at checkpoints without paid runtime calls.
