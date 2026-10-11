# Stage 300 remediation design — draft 4

Date: 2026-10-11. Baseline code: `bc6c116`. Status: DRAFT, NOT APPROVED.
This is completion of the existing Stage 300 contract, not a new runtime feature stage.
No paid runtime calls are authorized by this document. Current policy: `docs/PROJECT_WORKFLOW.md`.
Drafts 1–3 and their CHANGES REQUIRED assessments are preserved in `reviews/`. This revision
incorporates their findings but has not received renewed architecture approval.

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
dollars. Compute ceil(tokens × rational rate) once per billing dimension per attempt, then sum;
never round each token separately. Budget admission atomically reserves a worst-case amount across global UTC day, campaign UTC
day, cumulative approved stage and mandatory play/evaluation-session ceilings before any outbound
provider request. Use stable lock ordering and one transaction so two processes cannot both admit
the same remaining capacity. Persist
attempt ID, campaign, billing period, pricing version, bound and state. Budget-store failure denies
the remote attempt and preserves deterministic fallback. In-memory implementation is test-only.

Store approvals and reservation/accounting transitions as append-only rows in new tables. No mutable
canonical world data or edits to applied migrations. Record this operational-store decision in ADR
0032 before implementation. Each admission, settlement, release and operator mutation runs on one
checked-out PostgreSQL client with `BEGIN ISOLATION LEVEL READ COMMITTED`; pool-level transaction
queries and REPEATABLE READ are forbidden. Admission/settlement/release take a shared advisory
transaction lock on the reserved policy key `-1`; operator approval/revision/disable/enable and
reconciliation that clears a block take that key exclusively. Automatic restrictive stops for
overruns, suspect model/billing and discrepancies are appended atomically with accounting evidence
under the existing shared policy lock plus the attempt's bucket locks: never upgrade a shared lock
to exclusive or defer the stop to a later transaction. Admission checks for any uncleared stop on
its approval after acquiring all locks; only exclusive operator reconciliation/enable may clear it.
Already-admitted reservations may still dispatch when a stop commits; their ceilings still apply.
Test two concurrent automatic-stop settlements without deadlock, followed by denied admission.
Acquire the policy lock in its own statement, then read the latest
approval revision and database UTC time. Derive bucket lock IDs as nonnegative 63-bit integers,
deduplicate them and sort numerically using bigint, then acquire exclusive transaction locks in
separate statements **before** reading their totals. The policy key cannot collide with a bucket.
Read settled spend plus outstanding holds under those locks; insert reservation and attempt-start
atomically only when every ceiling admits. All settlement/release paths take the same locks. Hash
collisions may serialize unrelated buckets but must not allow extra spending. Unique transition keys
and guarded derived-state checks prevent duplicate settlement/refund. Test two real PostgreSQL
connections with a barrier that forces competing admissions to the same remaining capacity. Assert
the waiter sees the competitor's committed hold after obtaining its lock. Test a forced REPEATABLE
READ snapshot as a negative control and verify production rejects that isolation. Set LOCAL
lock_timeout and statement_timeout from the remaining admission deadline (also on waiting lock
statements); exhausted time denies admission, with no subsequent dispatch. Never set a zero timeout
(PostgreSQL interprets it as disabled): when no positive deadline remains, do not start database work.
Bound pool checkout by that same remaining deadline and recheck expiry before BEGIN; a client
obtained after cancellation must be released without running a transaction or dispatching transport.

Each request creates one deadline/AbortController before request-start or admission. Intent,
dialogue and Chronicle use a new validated `LTW_AI_REQUEST_TIMEOUT_MS` (default 60,000 ms, allowed
1,000–300,000 ms); relevance uses `LTW_AI_RELEVANCE_BUDGET_MS` (default 2,000 ms, allowed
100–30,000 ms). Carry that one signal through every admission, repair/switch, provider call and
terminal persistence wait. Existing `LTW_AI_TIMEOUT_MS` remains the per-attempt transport bound,
clamped to the remaining request time. Missing deadline is a construction error; no zero/unbounded
mode. Only server deadline expiry or explicit application cancellation aborts this workflow, not
HTTP disconnect alone. Expiry follows CALLER_CANCELLED rows below and prevents any new dispatch.
Settlement/release/recovery/operator transactions outside the caller lifetime have a fixed 5,000 ms
transaction deadline including pool checkout; retry only settlement as specified below, not admission
after caller expiry. No accounting write delays the caller beyond its whole-request deadline.

An operator-created, immutable approval ID identifies an explicitly authorized cumulative stage
allowance. Both runtime and every evaluation/rerun share this bucket across days and restarts.
Revisions update ceilings centrally without resetting consumption; process environment selects an
approval ID and cannot override its limits. An appended disabled/reconciliation state blocks calls
across processes. No approval record is created from silence or from the presence of an API key.
The documented operator CLI is the only application path that appends approvals, ceiling revisions,
approved evaluation-run bindings, reconciliation and enable/disable records; no HTTP endpoint creates
these. It requires explicit integer-microdollar ceiling arguments plus stage/campaign bindings,
a uniform per-play-session ceiling and explicit evaluation-run bindings. Runtime and evaluation accept only existing approval and session/run IDs, resolve
ceilings centrally and cannot create or raise them. Remove daily-budget environment defaults and
overrides entirely. Operator actions require recorded owner spending authorization; the CLI's
existence does not supply it. Approval IDs cannot be rotated to bypass the authorized stage grant:
revisions retain its identity, and any additional grant requires new explicit owner authorization.

Runtime session identity is `WorldState.activeSessionId`, captured from the authorized campaign
snapshot when the request begins, not browser login or process lifetime. Its bucket key includes
approval ID and campaign ID. An approval binds allowed campaigns and a uniform ceiling that applies
to every play session created by StartSession in those campaigns; no CLI step registers individual
play sessions. Eligibility requires a bound campaign and a non-null activeSessionId. For NPC dialogue,
capture the route's authorized `before` snapshot, before its command executes. No eligible active
play session means local/deterministic behavior;
no paid setup session is silently created. All attempts of an already-started request retain that
session even if it closes during the call. New requests re-resolve the active session. Evaluation
uses an operator-approved immutable run/session ID in its manifest, stored under the same stage
approval and pinned campaign ID. The operator CLI registers each evaluation run binding before
admission; the evaluation CLI cannot mint approved bindings or change their campaign. Rerunning with
a new run ID cannot reset the stage allowance. Session ceilings are rate guards within the cumulative
stage authorization: ending/starting sessions does not authorize any additional stage spending.
Define limits per such
session class in the approval record before paid mode. Settlement always uses the attempt's persisted
campaign/session/period buckets, never the current world snapshot. Test session closing/changing and conflicting
process configuration as well as cumulative multi-day/runtime/evaluation admission.
Product limitation: DM preparation and Chronicle rendering after a play session closes are local-only
under this contract. Paid campaign-preparation sessions would require a separately reviewed explicit
grant; neither a browser login nor the presence of a key creates one. This Q5 product limitation
requires explicit owner disposition before checkpoint C product completion; it is pending, not
accepted by architecture review. Live Chronicle evaluation must use an approved active session or
registered evaluation run. Offline implementation does not establish acceptance of this limitation.

Carry campaign and attempt identity as trusted application metadata, never as model prompt content.
Do not derive a campaign from user prose or expose cross-campaign totals to players. Each repair and
provider switch requires a separate admission under the same parent request/session budget.

Only route a model with a verified, explicit pricing/bounds entry. Remove the generic unknown-model
price fallback. Reserve a verified upper bound on input and output for the exact serialized request,
not an average estimate from previous replies. Without a verified offline input-token bound, reserve
the full model input limit or deny the attempt; do not substitute a guessed token heuristic. Enforce
outbound output bounds and a request-size limit. A catalog entry may use serialized UTF-8 bytes plus
an explicit framing/tool allowance only with a documented tokenizer byte-bound and allowance proof
for that model/request shape. A few successful samples or a character-count heuristic are not proof.
Until such an entry is verified, use the documented full-context limit or keep that route disabled;
report this usability limitation rather than weakening admission to fit a small budget. Cache-write
multipliers and output/reasoning ceilings are part of the reservation. Each catalog entry is a
versioned pricing function covering every accepted billing dimension: context-tier thresholds,
uncached input, cache reads, cache creation by TTL (including 5-minute and 1-hour classes), output
and reasoning, and any permitted service tier/region/inference geography/batch/tool charges.
Reserve at the highest applicable rate over the whole bound, including long-context tiers and
cache-write multipliers; settle at the tier implied by validated actual usage. Build outbound
requests from an allowlist: unpriced request options and server-side tools are disabled. Unknown
usage fields or unexpected billing-option values retain the hold and disable remote admission
until explicitly verified/reconciled; do not silently ignore or price them as zero. Each catalog
version also allowlists known informational usage fields and their permitted values (including
nested cache/service/server-tool metadata); unknown additions still fail closed. Time-dependent
pricing uses the reserved peak rate unless dispatch and completion both prove discount eligibility.
Test tier-boundary
crossing, 1-hour cache writes and unknown usage fields. Catalog verification is a
separate explicitly authorized activity, not a paid runtime experiment;
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
Enforce exactly one terminal accounting row per attempt using `UNIQUE(attempt_id)` across
`settled`, `released_pre_dispatch` and `reconciled` kinds, rather than uniqueness per kind. Subsequent
evidence is a separate append-only `evidence` row, excluded from terminal uniqueness. The operator
CLI and automatic settlement select this kind when a terminal row exists. Every terminal/evidence
charge is an absolute amount, not a delta: effective settled charge is MAX of that attempt's absolute
charge rows. The bucket total sums that maximum for terminal attempts plus each still-open hold;
never sum evidence as increments or subtract a hold twice. Later evidence may raise effective charge
with a discrepancy/overrun stop, never lower it. If usage is known but its settlement fails, retain
the full hold and retry in the live process after 100, 500 and 2,000 ms, with the separate bounded
transaction deadline, stopping on success or shutdown. Exhausted retries leave an uncertain hold
for explicit operator reconciliation; never silently refund or retry indefinitely.
Pre-dispatch release requires the same live process's explicit transport-not-started outcome;
startup recovery cannot produce that proof. Test reconcile-then-late-settle and settle-then-reconcile.

Late completion is settled to its admission period even across midnight. Restart reads the same
store; lowering a ceiling does not erase existing spending. An actual charge above its bound records
an overrun, disables further remote admission and requires explicit reconciliation. No claim of a
strict cap may conceal an invalid model-bound assumption.

Configuration requires explicit positive centrally approved ceilings for paid mode; no default $5 approval. No keys or
missing/zero approvals yields deterministic/offline routing. The owner's $20 OpenRouter key ceiling
does not authorize Anthropic/DeepSeek runtime use. Do not modify the owner's `.env.local`.

## 2. Every dispatched attempt remains observable

Add additive billing metadata to attempt views: attempt ID, configured/actual model, reservation,
estimated/known cost, usage status and pricing version. Preserve historical traces without migration
rewrite: absent metadata means legacy/unknown, never zero. Local attempts explicitly cost zero;
unknown remote charges remain unknown and retain a conservative reservation.

Add required trusted `ProviderRequest.accounting` metadata: campaign ID, preallocated parent trace
ID, session/approval IDs, attempt ID, capability and attempt kind. Use cases allocate the parent trace
before calling fallback; fallback allocates each attempt identity. Adapters never serialize this
metadata into provider payloads. Only admission-wrapped adapters may be registered in the runtime
or evaluation router; test every construction path. Make this a branded `AdmittedProvider` type
constructible only by the admission wrapper; the router accepts it or the explicitly local provider.
Direct injected-fetch adapter unit tests remain
allowed. Accounting identity is never accepted from the player's request body.
Enforce composition at runtime as well as with types: the server wrapper keeps a module-private
WeakSet of wrapped providers, checked by gateway/evaluation composition (with an explicit local
exception). An architecture check restricts raw adapter construction imports to that module and
adapter unit tests; a forged TypeScript brand cannot bypass composition checks.

Keep a durable append-only attempt journal with separate request, caller-outcome and accounting
transitions. Register the parent trace/attempt identity before dispatch; request-start may share the
first admission transaction. Refusal, provider errors and any completion received despite cancellation
cannot disappear because the capability timed out first. Existing insert-only capability traces stay
insert-only; their attempt references can resolve current accounting from the separate journal on
authorized DM reads. Budget reservations and attempt-start records must share one atomic transaction.
The request-start record contains campaign/actor, purpose/capability, scope, source IDs, approval/
session identity, configured model, creation time and deadline. Attempt-start contains reservation
and pricing identity. There is no foreign key requiring a completed `ltw_ai_traces` row: orphan starts
are legitimate held spending after a process kill. A separate DM-only accounting diagnostic read
(`GET /campaigns/:campaignId/ai/accounting/:traceId`, existing 401/400/404/403 order) returns unfinished
request/attempt metadata even if the parent trace never arrived. Its additive DTO is explicitly
read-only, marks incomplete/unknown state, excludes bucket totals/remaining capacity and other
campaigns' data, and is never accepted as an authoring source. Completed
normal trace reads can resolve linked accounting without mutating historical capability traces.

Caller timeout/completion events and billing settlement are independent append-only transitions.
Exactly one successful accounting settlement may reduce a hold; a timeout is not a second settlement.
Recovery derives unfinished requests from durable starts, keeps uncertain holds, and never invents
a proposal or provider output. A documented operator CLI appends reconciliation/disable/enable
records after independently verifying charges; it never deletes history or automatically refunds
crash-held attempts. Startup reports disabled admission and outstanding uncertain holds without
exposing campaign details to players. An unexpected returned model discards output and disables
remote admission until such reconciliation.
Store provider request/message IDs when available. The operator CLI supports a batch evidence
record (provider/model, closed billing window, invoiced total, evidence reference, included attempt
IDs) with per-attempt absolute allocations. Verify the window is complete with no still-running
attempts and covers those calls; unverified aggregate totals cannot release holds. In one transaction,
append a terminal reconciliation or non-reducing evidence per included attempt; effective charges
across the covered window must be at least its verified invoice total and never below prior terminal
charges. Preserve per-attempt history and batch identity; no deletion or anonymous bulk refund.

Do not expose the journal outside existing DM trace authorization. Persist only fixed failure codes
and validated billing metadata, not credentials or raw transport errors.

The relevance endpoint still returns deterministic actions at its time budget. Retain ADR 0017's
hard-abort behavior: caller expiry aborts admission and the in-flight HTTP transport, blocks all new
dispatch, and returns without waiting for cancellation or settlement. A post-dispatch abort with no
usage is an uncertain full hold requiring operator reconciliation; routine deadline misses can
therefore exhaust a session's capacity. This usability cost is deliberate, not a promise that late
usage will arrive. Do not detach a background HTTP request to obtain usage. An adapter/provider that
ignores abort may still finish; only then can actual usage settle the hold, with output discarded.
Abort prevents new
repair/fallback dispatch after cancellation, and does not erase a previously dispatched attempt.
Late output never changes the returned ranking or world state. The relevance deadline covers
admission, provider waiting and final trace-persistence waiting, not just model latency. Abort cancels
or bounds admission database work. If admission resolves after expiry, do not dispatch; any durable
reservation remains conservatively held until a proven pre-dispatch release is appended. If no
request-start was persisted, return deterministic actions with no trace ID and no provider dispatch.
If a durable start exists, return its preallocated trace ID at the deadline without awaiting a slow
terminal write; diagnostic reads expose the incomplete lifecycle and recovery can append the missing
outcome. The normal trace endpoint may temporarily return 404 until terminal insertion; the client
uses the authorized diagnostic read to distinguish an unfinished trace and does not label it lost.
Never start an untracked remote call to meet a deadline. The journal may settle later without
delaying the player's response. Test stalled storage before admission and after dispatch, process
kills before parent trace insertion, and a provider that ignores AbortSignal.

## 3. Adapters, routing, caching and client

Separate transport/accounting metadata from structured-output validity. Preserve safe response usage
on refused/malformed/truncated output. Validate numbers before cost arithmetic. Normalize provider
identity without accepting arbitrary cheaper returned model names. Define the following transitions in ADR 0032 and test them against ADR 0017:

- Transport outage/HTTP failure: provider failure, at most one switch.
- Provider-signalled refusal: response envelope with validated model/usage and fixed
  `PROVIDER_REFUSAL`; attempt outcome `error`, error code `PROVIDER_REFUSAL`. Preserve ADR 0017
  provider-failure behavior: at most one switch to the configured local provider with identical
  context, never repair the refusing provider and never switch to another paid provider. With no
  permitted local route, end `AI_UNAVAILABLE`. Do not throw away usage in a transport exception.
- Missing/wrong tool, malformed structured JSON or truncation: invalid output, at most one repair
  on the same provider with preserved usage and separate admission. Still invalid ends INVALID_OUTPUT.
- Valid deliberate decline: terminal safe decline, no repair or switch.
- Exhausted budget: deterministic/local fallback, no unauthorized paid attempt.
- Initial admission disabled/store failure uses fixed `ADMISSION_DISABLED`/`ADMISSION_UNAVAILABLE`
  and the same zero-cost fallback as initial budget denial. A denied repair is not provider failure:
  retain the previous invalid output, record a non-dispatched repair with `BUDGET_DENIED`,
  `ADMISSION_DISABLED` or `ADMISSION_UNAVAILABLE`, end INVALID_OUTPUT without a local switch.
- Unexpected model or unverified billing: discard output without validation/repair, keep the hold,
  atomically append a restrictive stop and classify the attempt as `error` with `UNEXPECTED_MODEL`
  or `UNVERIFIED_BILLING`. Only the one local switch is permitted, using repair=null and the original
  context. No paid switch, no raw suspect output in the next request.
- Caller cancellation: no further repair/switch dispatch; preserve existing attempts/holds.
  Only the fixed adapter outcome `TRANSPORT_NOT_STARTED`, emitted strictly before invoking transport (including
  already-aborted signal), proves that a reservation may be released. Other failures are ambiguous.
  Validate configured provider availability and route length against the one-switch invariant. A
  missing key must not silently promote a different paid route. Cancellation must stop further attempts.

For normal paid runtime, intent/dialogue/narrative routes are `remote,local` or `local`; relevance is
one explicit remote route or none, with its existing deterministic Context Engine fallback. Reject
three-entry and multi-remote runtime routes rather than silently truncating them. Evaluation may use
one explicitly selected remote without local so measurements cannot hide a fallback. No implicit
paid relevance route from a global Opus setting. Startup reports resolved capability/model names,
never keys, prompts or private campaign spending.

Non-game and ambiguous intents may deliberately decline to propose. The intent tool's provider wire
schema becomes a discriminated union: `{kind:"proposal", proposal:<existing CommandProposal>}` or
`{kind:"decline", reason:"not_game"|"ambiguous"|"unsupported"}`. The proposal branch reuses existing
command validation/directory checks; canonical command schemas remain unchanged. Both local and
remote intent providers use this envelope. Only intents have a valid decline branch. Provider tool
schemas must remain top-level objects with a `kind` discriminator and branch fields, never a
top-level `oneOf`; enforce exact branch combinations in Zod and test both adapters' wire requests.
A validated decline maps to the existing public
`INVALID_OUTPUT`, null proposal, committable false and the fixed issue `NO_PROPOSAL`; its additive
trace metadata records the decline reason. Its attempt outcome is `invalid`, error null, with the
fixed issue `NO_PROPOSAL`; it returns the existing FallbackResult `INVALID_OUTPUT` without repair.
A refusal retains the provider-failure mapping pinned below, never arbitrary provider prose. The
public response status set is unchanged. No-proposal is terminal and cannot trigger a paid attempt
that asks the model to invent a command.
Preserve existing public failure/no-proposal behavior and canonical command schemas; do not expose
a new public status without separate reviewed contract approval. Record the prompt delta in Gate 06
coverage. Evaluation labels a safe decline separately from a schema-valid, semantically correct
proposal, rather than calling all invalid output a successful intent.

### Outcome contract

The table pins FallbackResult, public result and trace status. `VALID` below means the configured
zero-cost local provider's validated result; if it fails or cannot supply a valid result, retain
its actual `INVALID_OUTPUT`/`AI_UNAVAILABLE` failure and corresponding trace status. Never invent a
successful local result. All local calls retain the same context and count toward the one-switch
limit. No listed failure authorizes another paid provider. Fixed codes belong to attempt/journal
metadata; existing public failure issue fields may also carry them without changing status sets.
For Chronicle, public fallback is template paragraphs, not a new public status. For relevance,
public failure actions always come unchanged from Context Engine, with source `deterministic`.

| Capability / event                                | FallbackResult                                 | Public result                                    | Fixed code                                                 | Local call / trace status                                              |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Intent / refusal                                  | VALID / INVALID_OUTPUT / AI_UNAVAILABLE        | PROPOSED / INVALID_OUTPUT / AI_UNAVAILABLE       | PROVIDER_REFUSAL                                           | One permitted local switch; PROPOSED / INVALID_OUTPUT / AI_UNAVAILABLE |
| Dialogue / refusal                                | VALID / INVALID_OUTPUT / AI_UNAVAILABLE        | REPLIED / INVALID_OUTPUT / AI_UNAVAILABLE        | PROVIDER_REFUSAL                                           | One permitted local switch; REPLIED / INVALID_OUTPUT / AI_UNAVAILABLE  |
| Chronicle / refusal                               | VALID / INVALID_OUTPUT / AI_UNAVAILABLE        | Local prose or template paragraphs               | PROVIDER_REFUSAL                                           | One permitted local switch; RENDERED / INVALID_OUTPUT / AI_UNAVAILABLE |
| Relevance / refusal                               | AI_UNAVAILABLE                                 | Deterministic actions, AI_UNAVAILABLE            | PROVIDER_REFUSAL                                           | None; AI_UNAVAILABLE                                                   |
| Intent / valid decline                            | INVALID_OUTPUT                                 | INVALID_OUTPUT, null proposal, committable false | NO_PROPOSAL                                                | None; INVALID_OUTPUT                                                   |
| Dialogue, Chronicle, relevance / decline envelope | Invalid output, one repair then INVALID_OUTPUT | Existing invalid-output behavior below           | WRONG_OUTPUT_KIND                                          | No decline branch; follow invalid-output row                           |
| Intent / invalid after repair                     | INVALID_OUTPUT                                 | INVALID_OUTPUT, null proposal, committable false | INVALID_STRUCTURED_OUTPUT                                  | None; INVALID_OUTPUT                                                   |
| Dialogue / invalid after repair                   | INVALID_OUTPUT                                 | INVALID_OUTPUT, null text                        | INVALID_STRUCTURED_OUTPUT                                  | None; INVALID_OUTPUT                                                   |
| Chronicle / invalid after repair                  | INVALID_OUTPUT                                 | Template paragraphs                              | INVALID_STRUCTURED_OUTPUT                                  | Direct template, no provider switch; INVALID_OUTPUT                    |
| Relevance / invalid after repair                  | INVALID_OUTPUT                                 | Deterministic actions, INVALID_OUTPUT            | INVALID_STRUCTURED_OUTPUT                                  | None; INVALID_OUTPUT                                                   |
| Intent / outage                                   | VALID / INVALID_OUTPUT / AI_UNAVAILABLE        | PROPOSED / INVALID_OUTPUT / AI_UNAVAILABLE       | PROVIDER_FAILURE                                           | One permitted local switch; PROPOSED / INVALID_OUTPUT / AI_UNAVAILABLE |
| Dialogue / outage                                 | VALID / INVALID_OUTPUT / AI_UNAVAILABLE        | REPLIED / INVALID_OUTPUT / AI_UNAVAILABLE        | PROVIDER_FAILURE                                           | One permitted local switch; REPLIED / INVALID_OUTPUT / AI_UNAVAILABLE  |
| Chronicle / outage                                | VALID / INVALID_OUTPUT / AI_UNAVAILABLE        | Local prose or template paragraphs               | PROVIDER_FAILURE                                           | One permitted local switch; RENDERED / INVALID_OUTPUT / AI_UNAVAILABLE |
| Relevance / outage                                | AI_UNAVAILABLE                                 | Deterministic actions, AI_UNAVAILABLE            | PROVIDER_FAILURE                                           | None; AI_UNAVAILABLE                                                   |
| Intent / budget denial                            | VALID / INVALID_OUTPUT / AI_UNAVAILABLE        | PROPOSED / INVALID_OUTPUT / AI_UNAVAILABLE       | BUDGET_DENIED                                              | One permitted local switch; PROPOSED / INVALID_OUTPUT / AI_UNAVAILABLE |
| Dialogue / budget denial                          | VALID / INVALID_OUTPUT / AI_UNAVAILABLE        | REPLIED / INVALID_OUTPUT / AI_UNAVAILABLE        | BUDGET_DENIED                                              | One permitted local switch; REPLIED / INVALID_OUTPUT / AI_UNAVAILABLE  |
| Chronicle / budget denial                         | VALID / INVALID_OUTPUT / AI_UNAVAILABLE        | Local prose or template paragraphs               | BUDGET_DENIED                                              | One permitted local switch; RENDERED / INVALID_OUTPUT / AI_UNAVAILABLE |
| Relevance / budget denial                         | AI_UNAVAILABLE                                 | Deterministic actions, AI_UNAVAILABLE            | BUDGET_DENIED                                              | None; AI_UNAVAILABLE                                                   |
| Intent / repair admission denied                  | INVALID_OUTPUT                                 | INVALID_OUTPUT, null proposal, committable false | BUDGET_DENIED / ADMISSION_DISABLED / ADMISSION_UNAVAILABLE | None; INVALID_OUTPUT                                                   |
| Dialogue / repair admission denied                | INVALID_OUTPUT                                 | INVALID_OUTPUT, null text                        | BUDGET_DENIED / ADMISSION_DISABLED / ADMISSION_UNAVAILABLE | None; INVALID_OUTPUT                                                   |
| Chronicle / repair admission denied               | INVALID_OUTPUT                                 | Template paragraphs                              | BUDGET_DENIED / ADMISSION_DISABLED / ADMISSION_UNAVAILABLE | Direct template, no provider switch; INVALID_OUTPUT                    |
| Relevance / repair admission denied               | INVALID_OUTPUT                                 | Deterministic actions, INVALID_OUTPUT            | BUDGET_DENIED / ADMISSION_DISABLED / ADMISSION_UNAVAILABLE | None; INVALID_OUTPUT                                                   |
| Intent / suspect model or billing                 | VALID / INVALID_OUTPUT / AI_UNAVAILABLE        | PROPOSED / INVALID_OUTPUT / AI_UNAVAILABLE       | UNEXPECTED_MODEL / UNVERIFIED_BILLING                      | One permitted local switch; corresponding intent status                |
| Dialogue / suspect model or billing               | VALID / INVALID_OUTPUT / AI_UNAVAILABLE        | REPLIED / INVALID_OUTPUT / AI_UNAVAILABLE        | UNEXPECTED_MODEL / UNVERIFIED_BILLING                      | One permitted local switch; corresponding dialogue status              |
| Chronicle / suspect model or billing              | VALID / INVALID_OUTPUT / AI_UNAVAILABLE        | Local prose or template paragraphs               | UNEXPECTED_MODEL / UNVERIFIED_BILLING                      | One permitted local switch; RENDERED / INVALID_OUTPUT / AI_UNAVAILABLE |
| Relevance / suspect model or billing              | AI_UNAVAILABLE                                 | Deterministic actions, AI_UNAVAILABLE            | UNEXPECTED_MODEL / UNVERIFIED_BILLING                      | None; AI_UNAVAILABLE                                                   |
| Intent / caller cancellation                      | AI_UNAVAILABLE                                 | AI_UNAVAILABLE, null proposal, committable false | CALLER_CANCELLED                                           | None; AI_UNAVAILABLE                                                   |
| Dialogue / caller cancellation                    | AI_UNAVAILABLE                                 | AI_UNAVAILABLE, null text                        | CALLER_CANCELLED                                           | None; AI_UNAVAILABLE                                                   |
| Chronicle / caller cancellation                   | AI_UNAVAILABLE                                 | Template paragraphs                              | CALLER_CANCELLED                                           | Direct template, no provider dispatch; AI_UNAVAILABLE                  |
| Relevance / deadline cancellation                 | AI_UNAVAILABLE internally; caller timeout wins | Deterministic actions, TIMEOUT                   | CALLER_CANCELLED                                           | None; TIMEOUT                                                          |

An initial local-only route invokes its local provider once without a fictitious denied remote
attempt; the budget-denial rows describe an attempted remote admission. Evaluation's remote-only
route never runs local and records refusal/outage/budget denial as AI_UNAVAILABLE. Intent refusal
retains the existing owner-approved local switch, including a validated local proposal when possible;
this design does not adopt the alternative terminal refusal policy. Deliberate semantic decline is
terminal because it is a valid choice of the new wire envelope, not provider failure. For malformed
decline envelopes, normal invalid-output repair applies.
The initial budget-denial rows also cover disabled admission and store failure, with the distinct
fixed codes above. Repair denial is intentionally the invalid-output branch, because its preceding
output already failed validation; it never upgrades to a provider-failure switch. Test denied repair
and suspect responses through both adapters and all capability use cases. When Chronicle's whole
deadline expires, return template prose to the existing unchanged GenerateChronicle command path;
the AI cannot commit a chapter or bypass canonical validation.

Apply supported prompt caching to stable instructions/schema only, with no broadening of scoped
context. Keep NPC/character data in its original isolated prompt scope.
The cached prefix must be byte-identical across campaigns and NPCs for a given capability/language. Test
that no source IDs, actor/NPC identity, perspective text or scoped data precedes its breakpoint.
Price cache writes/reads conservatively and record usage; do not claim cache hits from configuration alone. Capture Anthropic
uncached input, cache-creation input, cache-read input and output separately; capture DeepSeek cache
hit/miss and output separately. Prevent double-counting totals. DeepSeek automatic caching needs
accounting and stable prompt ordering, not an invented cache-control directive. Provider-specific
cache semantics/rates must be checked against official docs before approval of the implementation.
Record cache-block framing in Gate 06 coverage. Fixed fixtures prove rendered system/prompt text
is unchanged apart from the reviewed intent-envelope delta; cache metadata cannot alter text or
scoped content. A stable prefix below the model's cache minimum is reported as uncached, not padded
with private context to force a hit.

Verify the existing resolving UI for live NPC requests. Add localized replying and honest failure/
fallback feedback only where the current flow does not provide it. Do not add streaming without
measured need. Preserve drafts and prevent stale replies across perspective changes.

## 4. Evaluation integrity

The evaluation CLI accepts only an existing approval ID and operator-registered run/session ID
with its pinned campaign binding; it resolves every ceiling from that approval, never CLI/env dollar
limits. It shares one durable PostgreSQL ledger across all models, capabilities and reruns.
Refuse live evaluation without the database. Refuse to run live if approval configuration
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
At checkpoint A append a correction to ADR 0032's earlier measured 6/6 intents and 18/18 NPC
results: their semantic correctness/quality is unverified because the old predicates could pass
wrong outputs. Preserve original history and distinguish structural transport evidence from quality.

The report separates semantic proposal correctness, safe decline, technical provider success and
quality/voice judgment. Record end-to-end request latency (including admission, repair, fallback and
persistence wait) separately from individual attempt latency. Publish the effective relevance
deadline and assert its deterministic timeout/action-set contract with negative controls. Add
Chronicle wrong-citation and missing-hedge negative controls. Compute the 45-minute session estimate
per routing/model configuration from a disclosed workload (initial comparison: 60 NPC replies,
5 DM intents, 2 chapters and 100 rankings); publish the sample basis, known charges, outstanding
holds and range/unknowns separately. This is a workload estimate, not a measured session bill.
Store the blind-key artifact outside the owner-facing comparison directory until choice is recorded;
never inspect it while soliciting a blind voice preference.

## Allowed source boundaries

- `apps/server/src/ai/`: budget store/ledger, adapters, gateway, trace persistence, focused tests.
- `apps/server/src/platform/config/`, `apps/server/src/main.ts`, `.env.example`: configuration/wiring.
- New migration after `0004`, following `apps/server/migrations/AGENTS.md`; never edit applied SQL.
- `packages/ai/src/providers.ts`, `fallback.ts`, `intent.ts`, `dialogue.ts`, `chronicle.ts`,
  `relevance.ts`, `prompt.ts`, `validation.ts`, local-provider intent handling and focused lifecycle
  ports: trusted accounting, cancellation, attempt observability and the specified intent envelope/
  terminal-decline/adapter outcome transitions only. Context builders remain unchanged.
- `packages/contracts/src/ai-gateway/`: additive attempt/accounting diagnostic contract and historical
  readers; no new public intent statuses or weakened canonical command schema.
- `apps/server/src/http/routes/ai-routes.ts`: authorized DM accounting diagnostic read only.
- `apps/server/src/testing/eval/`: admission, immutable evidence, exact semantic cases/oracles,
  negative controls, latency/session-cost report and private blind key. No live runs in validation.
- Narrow affected UI files only if required for replying/failure behavior; relevant Russian catalogs.
- Current ADR, reports and context routing. Do not change world commands or context builders.

## Checkpoints and required evidence

A. Persistent admission, trusted metadata and accounting journal. Opus 5.5 high owns writing because
this touches migrations, atomicity, concurrency and recovery. Before implementation: fresh-session Opus 5.5
xhigh and Fable 5.1 high approval of the same exact design/hash. After implementation: fresh-session Opus 5.5 xhigh
acceptance of the actual diff and checks before dependent checkpoint B.
Remove the legacy SpendLedger/budgeted composition, daily-budget defaults and implicit paid routes
at A. Keys present without a stored approval must produce zero outbound requests at A, B1 and B2;
the incomplete build is technically offline, not merely labelled offline. Append the historical
evaluation caveat at A; the corrected report implementation remains C.
At A/B1 composition rejects all remote dispatch even if an approval exists; B2 may remove that
temporary construction guard only after every remote path uses durable admission and journaling.

B1. Adapter outcome classification, fallback transitions, terminal intent decline and routes.
Opus high owns contracts; obtain fresh-session Opus 5.5 xhigh acceptance before dependent B2 work.

B2. Journal/gateway integration, whole-request deadlines and hard-abort recovery, diagnostic read
and cache accounting. Opus high owns recovery/contracts. Obtain fresh-session Opus 5.5 xhigh
acceptance before C. The incomplete B1 build remains offline-only until B2 connects all admission
and accounting paths; no intermediate checkpoint authorizes live calls.

C. Evaluation admission/oracles/reporting and client feedback. Use Opus high where recovery/contracts
are touched, a separate bounded Sonnet medium writer for isolated presentation/oracle work. Finish
required deterministic validation and fresh-session Opus 5.5 xhigh acceptance. Live evaluation and owner NPC choice
remain pending until separately authorized; an offline pass is not evidence of new live results.

Tests must reproduce concurrent/multi-process oversubscription, restart, midnight crossing, independent
campaign ceilings, idempotent settlement, unknown/negative/NaN usage, malformed billed responses,
refusal, unknown returned model, storage failure, caller cancellation before/after dispatch,
unresponsive provider, late relevance response, and repair/fallback under the same ceilings. Include
PostgreSQL integration tests for actual transactions and durable recovery, legacy trace reads,
campaign/DM trace isolation, no-key configuration, immutable eval output and existing scoped context
regressions. Run full `pnpm validate` at checkpoints without paid runtime calls.
