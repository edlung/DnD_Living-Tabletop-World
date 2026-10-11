# Stage 300 remediation design — draft 7

Date: 2026-10-11. Baseline code: `bc6c116`. Status: DRAFT, NOT APPROVED.
This is completion of the existing Stage 300 contract, not a new runtime feature stage.
No paid runtime calls are authorized by this document. Current policy: `docs/PROJECT_WORKFLOW.md`.
Drafts 1–6 and their CHANGES REQUIRED assessments are preserved in `reviews/`. This revision
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
attempt ID, campaign, billing period, pricing version, bound and state. All four ceiling classes
are mandatory positive integer microdollars: global UTC day, campaign UTC day, cumulative stage
grant, and play/evaluation session. Missing, zero or negative ceilings deny remote admission.
The global daily bucket is keyed only by deployment billing-account identity and UTC date, never
approval ID, campaign or session. All processes for that billing account share this namespace.
The operator creates one billing-account record with append-only global daily ceiling revisions,
authorization owner/date/source and enabled/stop state. An immutable approval references that record;
it never owns or overrides the global ceiling. Admission reads the account's current ceiling only,
not an approval or environment value. Billing-account identity is resolved from the stored approval,
never process configuration or a player's body. Uniqueness of the operator-attested provider billing-account reference prevents accidental duplicate records;
provider responses do not prove billing-account identity. Recorded owner authorization and the
trusted exclusive operator CLI are the control against intentional aliasing. Do not claim technical
cloning prevention or cryptographic/provider-side account verification. Two approvals with
different attempted global overrides must reject those overrides; both deny once the account's
single ceiling is exhausted. Test approval rotation and account revision across processes.
Provider/model/billing stops are keyed by billing account and affected provider/model independently
of approval. Every admission/settlement/release includes a stable billing-account control lock
in the same sorted nonnegative lock set as bucket locks. Account stops are checked/appended under
that stable lock as well as the relevant daily bucket locks, serializing stops with admission across
midnight; account control cannot depend on date or approval. This resolves previous-day settlement
racing a new-day admission without a shared-policy lock upgrade. Approval rotation cannot
bypass those stops or the global daily ceiling. Budget-store failure denies
the remote attempt and preserves deterministic fallback. In-memory implementation is test-only.

Store approvals and reservation/accounting transitions as append-only rows in new tables. No mutable
canonical world data or edits to applied migrations. Record this operational-store decision in ADR
0032 before implementation. Each admission, settlement, release and operator mutation runs on one
checked-out PostgreSQL client with `BEGIN ISOLATION LEVEL READ COMMITTED`; pool-level transaction
queries and REPEATABLE READ are forbidden. Admission/settlement/release take a shared advisory
transaction lock on the reserved policy key `-1`; operator approval/revision/disable/enable and
every operator CLI mutation, including per-attempt reconciliation and batch evidence, takes that key exclusively. Automatic restrictive stops for
overruns, suspect model/billing and discrepancies are appended atomically with accounting evidence
under the existing shared policy lock plus the attempt's bucket locks: never upgrade a shared lock
to exclusive or defer the stop to a later transaction. Admission checks for any uncleared stop on
its approval and any provider/model/billing stop independent of approval ID after acquiring all locks; only exclusive operator reconciliation/enable may clear it.
Already-admitted reservations may still dispatch when a stop commits; their ceilings still apply.
Test two concurrent automatic-stop settlements without deadlock, followed by denied admission.
Acquire the policy lock in its own statement, then read the latest
approval and account revisions and database UTC time. Derive bucket lock IDs as nonnegative 63-bit integers,
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
Request-start and admission each use a storage-step deadline of MIN(remaining whole-request time,
5,000 ms), including pool checkout, lock waits and SQL. An admission storage timeout before caller
expiry maps to ADMISSION_UNAVAILABLE and the ordinary initial-admission fallback; expiry of the
whole request maps to CALLER_CANCELLED and prevents even a local dispatch. Never restart the
caller timer or retry admission after caller expiry. Bound pool checkout by that same remaining deadline and recheck expiry before BEGIN; a client
obtained after cancellation must be released without running a transaction or dispatching transport.

Each AI use case creates one deadline/AbortController before request-start or admission.
For NPC dialogue this begins at entry to the reply phase (`replyAsNpc`), after the canonical command
and post-command NPC-context construction; World Engine execution/HTTP time is not charged to the
AI deadline. The pre-command accounting session ID remains captured separately, as specified above. Intent,
dialogue and Chronicle use a new validated `LTW_AI_REQUEST_TIMEOUT_MS` (default 60,000 ms, allowed
1,000–300,000 ms); relevance uses `LTW_AI_RELEVANCE_BUDGET_MS` (default 2,000 ms, allowed
100–30,000 ms). Carry that one signal through every admission, repair/switch, provider call and
bounded terminal persistence wait, subject to the outcome-freeze rule below. Existing `LTW_AI_TIMEOUT_MS` remains the per-attempt transport bound,
clamped to the remaining request time. Missing deadline is a construction error; no zero/unbounded
mode. Only server deadline expiry or explicit application cancellation aborts this workflow, not
HTTP disconnect alone. Expiry prevents any new dispatch. Before outcome freeze it follows the
CALLER_CANCELLED rows below; after freeze it cannot change the chosen public result or trace.
Settlement/release/recovery/operator transactions outside the caller lifetime have a fixed 5,000 ms
transaction deadline including pool checkout; retry only settlement as specified below, not admission
after caller expiry. No persistence wait delays the caller beyond its whole-request deadline.

An operator-created, immutable approval ID identifies an explicitly authorized cumulative stage
allowance. Both runtime and every evaluation/rerun share this bucket across days and restarts.
Revisions update ceilings centrally without resetting consumption; process environment selects an
approval ID and cannot override its limits. An appended disabled/reconciliation state blocks calls
across processes. No approval record is created from silence or from the presence of an API key.
The documented operator CLI is the only application path that appends approvals, ceiling revisions,
approved evaluation-run bindings, reconciliation and enable/disable records; no HTTP endpoint creates
these. It requires explicit integer-microdollar ceiling arguments plus stage/campaign bindings,
a uniform per-play-session ceiling and explicit evaluation-run bindings. The global daily ceiling
is supplied only to the billing-account create/revise command, never to an approval command;
approvals hold the other three classes and reference that existing account. Runtime and evaluation accept only existing approval and session/run IDs, resolve
ceilings centrally and cannot create or raise them. Remove daily-budget environment defaults and
overrides entirely. Operator actions require recorded owner spending authorization; the CLI's
existence does not supply it. Approval IDs cannot be rotated to bypass the authorized stage grant:
revisions retain its identity, and any additional grant requires new explicit owner authorization.
Every approval, revision and enable record stores owner identity, authorization date and a durable
source reference to the explicit spending authorization. A unique authorization/grant reference
prevents inserting the same grant twice under different approval IDs; revisions reference that
same grant without adding a new allowance.

Runtime session identity is the existing `WorldState.activeSessionId` (read-only source:
`packages/domain/src/kernel/state.ts:96`; no domain schema change), captured from the authorized campaign
snapshot when the request begins, not browser login or process lifetime. Its bucket key includes
approval ID and campaign ID. An approval binds allowed campaigns and a uniform ceiling that applies
to every play session created by StartSession in those campaigns; no CLI step registers individual
play sessions. Eligibility requires a bound campaign and a non-null activeSessionId. For NPC dialogue,
capture the route's authorized `before` snapshot, before its command executes. Pass only a trusted
scalar `accountingSessionId: string | null` into DialogueInput and the request lifecycle/admission
context. Capture once in npc-routes.ts; never re-read it from the post-command state or a request
body. Do not store it as mutable shared gateway state. Preserve the existing post-command NPC
context. This accounting field must never enter prompt text, structured provider inputs or cache
prefixes, and no full WorldState is added to DialogueInput. No eligible active
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
the approved catalog must bound tool/schema/framing, cache writes and any reasoning tokens.
Split the raw remote adapter port into `prepare(request)` and `dispatch(prepared, signal, onStart)`:
prepare builds the complete immutable serialized provider body, including adapter-added system text,
tool/schema/framing and cache metadata, without transport or secret revelation. Compute the verified
token bound/reservation from that exact prepared body and pinned model/service dimensions before
admission. Only the admitted wrapper may dispatch it; dispatch cannot rebuild/change the body after
reservation. It signals onStart synchronously immediately before invoking fetch. Any failure after
that signal is post-dispatch uncertainty; only a live failure strictly before it proves
TRANSPORT_NOT_STARTED. Raw adapter unit tests may directly exercise prepare/dispatch with injected
fetch, but raw ports cannot enter runtime/evaluation composition. No parallel unguarded generate
path is retained. Test byte-for-byte equality of the bounded body and fetch body, adapter-added text,
no prepare-side fetch/secret reveal, and failures immediately before/after the start boundary. The
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
charge rows. The bucket total sums that maximum for terminal attempts; an open attempt contributes
MAX(its reservation hold, all its absolute evidence charges). Evidence cannot be ignored merely
because no terminal row exists. Test over-bound evidence on a crash-held open attempt before any
terminal settlement;
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
exception recognized by object identity from `createLocalProvider()`, never by the string ID
`local`). An architecture check restricts raw adapter construction imports to that module and
adapter unit tests; a forged TypeScript brand cannot bypass composition checks. Pure-package scripted provider tests
may use a test-only brand constructor in `packages/ai/src/testing/providers.ts`. The runtime WeakSet
check lives in server composition, never in the pure-package router or its tests. Architecture checks
forbid production imports of that test helper, and test brands cannot bypass server composition.

Keep a durable append-only attempt journal with separate request, caller-outcome and accounting
transitions. Use one server-generated UUID as both request ID and preallocated parent trace ID: the
request-start primary key, caller-outcome UNIQUE(request_id), request advisory lock, final
ltw_ai_traces.trace_id and diagnostic :traceId all refer to that same UUID. Attempt IDs are separate.
Persist request-start in its own short READ COMMITTED transaction with no advisory locks, bounded
by the storage-step and whole-request deadlines, and commit it before attempting any admission.
A later admission rollback/timeout/store failure never voids that committed start or its trace ID. Refusal, provider errors and any completion received despite cancellation
cannot disappear because the capability timed out first. Existing insert-only capability traces stay
insert-only; their attempt references can resolve current accounting from the separate journal on
authorized DM reads. Budget reservations and attempt-start records must share one atomic transaction.
Use a monotonic process timer for caller waiting from entry, including pool checkout, so wall-clock
skew never extends the caller's configured duration. In request-start SQL store the database deadline
as `clock_timestamp() + remaining_monotonic_duration`; recalculate that remaining duration immediately
before insertion, rejecting nonpositive time. The finalizer/recovery compare only database
`clock_timestamp()` with this stored deadline, never another process's wall clock or PostgreSQL's
transaction-frozen `now()`. Preserve the caller's original monotonic deadline even if persistence is
slow; the database timestamp coordinates finalizer/recovery, not a fresh caller allowance. Bound
finalizer transactions locally as well as by the stored database deadline. Test skewed process wall
clocks and delayed checkout against the same database clock.
The request-start record contains campaign/actor, purpose/capability, scope, source IDs, approval/
session identity, configured model, creation time and deadline. Attempt-start contains reservation
and pricing identity. There is no foreign key requiring a completed `ltw_ai_traces` row: orphan starts
are legitimate held spending after a process kill. A separate DM-only accounting diagnostic read
(`GET /campaigns/:campaignId/ai/accounting/:traceId`, existing 401/400/404/403 order) returns unfinished
request/attempt metadata even if the parent trace never arrived. Its additive DTO is explicitly
read-only, marks incomplete/unknown state, excludes bucket totals/remaining capacity and other
campaigns' data, and is never accepted as an authoring source. Completed
normal trace reads can resolve linked accounting without mutating historical capability traces.

### No durable request-start

Make the intent and NPC reply DTO `traceId` fields nullable, and `RenderedChronicle.traceId`
nullable; Chronicle's existing public rendering/prose DTOs already allow null. This is an explicit
reviewed response-contract delta, with no new public status. Do not substitute a correlation ID
that looks like a persisted trace. Before any provider work, bound request-start persistence by the
whole-request deadline. If it fails or expires without a confirmed durable start, return:

- Intent: AI_UNAVAILABLE, traceId null, proposal null, committable false, issues empty. Do not run
  a local proposal that cannot become an authorized authoring source.
- Dialogue: AI_UNAVAILABLE, traceId null, text null. The existing canonical NPC command result is
  still returned unchanged; failure to render a reply cannot roll it back or rerun it.
- Chronicle: AI_UNAVAILABLE, traceId null, deterministic template paragraphs, provider template,
  model TEMPLATE_MODEL and prose.traceId null. The existing validated GenerateChronicle path may
  commit this template; no nonexistent AI provenance is recorded.
- Relevance: original deterministic actions, traceId null, TIMEOUT if deadline expired, otherwise
  AI_UNAVAILABLE. No remote or local AI dispatch.

Clients must narrow nullable IDs before opening traces or starting authoring. Render missing trace
as unavailable, without a broken link or a promise that it will appear. Authoring always requires
an existing authorized PROPOSED trace; neither null nor an absent ID is a valid source. Preserve
existing request-validation/authorization order. Normal trace/accounting reads of an absent ID
retain their existing not-found semantics; do not invent a journal record from a client ID.
If a cancelled start transaction commits late, append only its known no-provider lifecycle/evidence
and recover it under the rules below; never dispatch or expose a later proposal. A reservation from
a late admission remains conservatively held until proven pre-dispatch release, as already specified.
The internal preallocated request identity is retained solely for cleanup and diagnostics.

### Caller outcome freeze and recovery

Decide the capability's complete public result exactly once, synchronously, before constructing its
final trace. This is the outcome-freeze point: store the immutable result, output, status, provider,
trace ID and a digest in the request lifecycle. Check the deadline/signal immediately at that point.
If expired, freeze the cancellation result from the table, without late output. If still live,
freeze the selected result and return exactly it, even if the deadline expires during final
persistence. The remaining deadline bounds waiting for persistence, not validity of the frozen
result. Chronicle's returned paragraphs/provider and PROPOSED intent provenance must match that
frozen trace; late provider completion can append only safe accounting/evidence metadata, never replace output.
The frozen trace's attempts array is an immutable snapshot at freeze. No post-freeze completion can
add/replace an attempt or its output, even while the finalizer remains within its persistence window.
A pending attempt has its cancellation/error snapshot in the frozen trace; late usage/model/request
IDs resolve through the journal only, with late output discarded and never persisted there.

Persist one insert-only caller-outcome row per request (`UNIQUE(request_id)`), including status/provider and the digest of the validated final trace payload. Keep output only
in the insert-only trace, not duplicated in the outcome row; live finalization supplies the immutable
in-memory payload to the same atomic transaction. The live finalizer transaction
inserts that outcome and the insert-only capability trace atomically using a request-specific
transaction advisory lock with bigint key `-2 - unsigned62(hash(requestId))`, distinct from
policy key -1, nonnegative bucket/migrator keys and the two-integer authoring lock namespace.
Request-hash collisions serialize unrelated requests but cannot bypass outcome uniqueness. It takes this lock before checking for
an existing outcome. A duplicate with identical digest is harmless; a conflicting digest is an
integrity failure, never an overwrite or a second usable proposal. No trace may be inserted without
its winning outcome. Accounting settlement uses its own bucket locks and is not nested in finalizer
transactions; this avoids request/bucket lock inversion.

The live finalizer has an absolute persistence deadline equal to the stored caller deadline plus
5,000 ms, including pool checkout, transaction/lock waiting and SQL. The caller stops waiting at its
own deadline and returns its frozen result. Recheck the finalizer deadline after checkout and after
acquiring its request lock; never commit a new live outcome after that deadline. A finalizer that
loses to recovery treats the conflict as harmless and records no output. If it observes a different
live digest, surface the integrity failure operationally. No durable start means no public trace ID and no remote dispatch; the capability-specific
no-start responses above override the ordinary local/fallback table. Failure to persist a frozen result is an explicit diagnostic limitation, not a
claim that the result was durably recorded.

Recovery may act only on durable requests with no caller outcome and database time strictly later
than their stored caller deadline plus 5,000 ms. It takes the same request lock, then rechecks time
and absence under READ COMMITTED before appending a unique `recovered_incomplete` outcome. Two recovery
processes cannot both win. A slow live transaction holding the lock must finish/abort within its
fixed finalizer deadline; recovery waits under its own 5,000 ms bound and retries on a later sweep.
Recovery never inserts a capability trace or invents a public result/output: it cannot know whether
a result reached the caller before a crash. The authorized accounting diagnostic is the permanent
record for these requests, explicitly reporting `recovered_incomplete`, caller outcome not recorded
and missing final trace. Do not infer whether the result was delivered or used. A committed Chronicle
chapter can independently prove the returned prose was used, while its trace ID resolves only through
the diagnostic. Preserve the chapter and its trace ID; recovery neither relabels it as template nor
fabricates a trace. Test a stalled finalizer followed by a committed chapter and pending trace 404,
then matching paragraphs/provider when live finalization succeeds; also permanent diagnostic-only
state when it misses its window. The normal trace endpoint permanently returns 404 for such requests. They
cannot be used as authoring sources. A live finalizer that arrives after recovery cannot insert a
trace. This intentionally distinguishes a known persisted caller result from unrecoverable delivery
uncertainty in the journal; do not label the latter a cancellation or a successful rendering.

Caller outcomes and billing settlement are independent append-only transitions. Exactly one
successful accounting settlement may reduce a hold; a timeout is not a second settlement. Recovery
keeps uncertain holds, never refunds crash-held attempts and never invents a proposal/provider output.
A documented operator CLI appends reconciliation/disable/enable
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
charges. For each campaign/session/stage bucket, verified allocations must conservatively cover
that bucket's attributable charge; aggregate invoice coverage alone cannot release holds when
allocation across buckets remains unknown. Preserve those uncertain per-attempt holds until the
attribution is verified. Preserve per-attempt history and batch identity; no deletion or anonymous bulk refund.

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
Late output never changes the frozen ranking or world state. The relevance deadline covers
admission, provider waiting and final trace-persistence waiting, not just model latency. Abort cancels
or bounds admission database work. If admission resolves after expiry, do not dispatch; any durable
reservation remains conservatively held until a proven pre-dispatch release is appended. If no
request-start was persisted, return deterministic actions with no trace ID and no provider dispatch.
If a durable start exists, return its preallocated trace ID at the deadline without awaiting a slow
terminal write; diagnostic reads expose the incomplete lifecycle and recovery can append the missing
outcome under the recovery rules above. The normal trace endpoint returns 404 while finalization
is pending and permanently for `recovered_incomplete`; the authorized diagnostic distinguishes
those states without claiming a trace will necessarily arrive.
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
remote intent providers use this envelope. The local provider wraps supported existing proposals;
currently unparseable input (`commands: []`) becomes `decline/unsupported` in one local attempt,
public INVALID_OUTPUT with NO_PROPOSAL and no repair. This is an explicit reviewed behavioral delta
from the old two-attempt schema failure; update only the affected deterministic expectations. Only intents have a valid decline branch. Provider tool
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
coverage. At B1 append an explicit ADR 0032 delta for missing tool calls: baseline maps them to
provider failure/free local switch; the reviewed contract treats them as invalid structured output
and may spend on one newly admitted repair of the same remote provider. Count both attempts and
charges in remote-only evaluation; repair denial follows the pinned invalid-output branch. This
cost consequence does not authorize any new allowance or extra retry. Evaluation labels a safe decline separately from a schema-valid, semantically correct
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
Every non-dispatched denied admission/repair is recorded as an attempt outcome `error` with the
fixed denial code, zero usage and no reservation charge. Do not create a fake transport start or
label a denied repair a valid/invalid provider response.
The initial budget-denial rows also cover disabled admission and store failure, with the distinct
fixed codes above. Repair denial is intentionally the invalid-output branch, because its preceding
output already failed validation; it never upgrades to a provider-failure switch. Test denied repair
and suspect responses through both adapters and all capability use cases. When Chronicle's whole
deadline expires before outcome freeze, return template prose to the existing unchanged GenerateChronicle command path;
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
At checkpoint A the evaluation CLI must compile after removal of `costUsd`/SpendLedger, refuse
all live mode before credential/provider construction, read the effective relevance deadline,
and use fresh non-overwriting directories for offline evidence. No intermediate build may overwrite
historical evidence or emit apparent live measurements. Test these guards at A, not only C.

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
  ports and `router.ts`: trusted accounting, cancellation, attempt observability and the specified intent envelope/
  terminal-decline/adapter outcome transitions and explicitly nullable `RenderedChronicle.traceId`
  only. Context builders remain unchanged.
- `packages/contracts/src/ai-gateway/`: additive attempt/accounting diagnostic contract, historical
  readers and explicitly nullable DmIntentResponse.traceId; no new public intent statuses or weakened
  canonical command schema. `packages/contracts/src/npc/dialogue.ts`: nullable NpcReply.traceId only.
  Relevant API/UI/test consumers: null-ID handling and prevention of absent-source authoring only,
  specifically `apps/web/src/authoring/use-authoring.ts` before sending its trace-based proposal request.
  Preserve the authoring request schema: it still requires a valid non-null UUID source; do not add
  an untraced AI proposal branch to the authoring service.
- `apps/server/src/http/routes/ai-routes.ts`: authorized DM accounting diagnostic read and nullable
  intent trace response plumbing; existing authorized normal trace reads may resolve linked accounting
  without modifying capability traces. Preserve authorization order and exclude account totals and
  remaining capacity from these responses. `apps/server/src/http/routes/npc-routes.ts`: capture/pass the
  trusted pre-command accountingSessionId and nullable reply trace plumbing only; keep command
  execution, post-command NPC knowledge context and player projections unchanged.
- `apps/server/src/http/routes/chronicle-routes.ts`: nullable rendering trace plumbing only, preserving
  the existing validated GenerateChronicle command and its template prose support.
- `apps/server/src/testing/eval/`: admission, immutable evidence, exact semantic cases/oracles,
  negative controls, latency/session-cost report and private blind key. No live runs in validation.
- Narrow affected UI files only if required for replying/failure behavior; relevant Russian catalogs.
- Current ADR, reports and context routing. Do not change world commands or context builders.

## Checkpoints and required evidence

A. Persistent admission, trusted metadata and accounting journal. Opus 5.5 medium owns writing.
Before implementation: fresh independent Astra xhigh and Fable xhigh approval of the same exact
design/hash. After implementation: fresh independent Sol xhigh and Opus xhigh acceptance of the
actual diff and checks before dependent checkpoint B.
Remove the legacy SpendLedger/budgeted composition, daily-budget defaults and implicit paid routes
at A. Keys present without a stored approval must produce zero outbound requests at A, B1 and B2;
the incomplete build is technically offline, not merely labelled offline. Append the historical
evaluation caveat at A; the corrected report implementation remains C.
At A/B1 composition constructs no remote adapter and never reveals provider Secrets, even if keys
and an approval exist; test with a Secret whose reveal throws. It rejects remote dispatch at runtime; B2 may remove that
temporary construction guard only after every remote path uses durable admission and journaling.

B1. Adapter outcome classification, fallback transitions, terminal intent decline and routes.
Opus medium owns contracts; obtain fresh independent Sol/Opus xhigh acceptance before dependent B2 work.

B2. Journal/gateway integration, whole-request deadlines and hard-abort recovery, diagnostic read
and cache accounting. Opus medium owns recovery/contracts. Obtain fresh independent Sol/Opus xhigh
acceptance before C. The incomplete B1 build remains offline-only until B2 connects all admission
and accounting paths; no intermediate checkpoint authorizes live calls.

C. Evaluation admission/oracles/reporting and client feedback. Use Opus 5.5 medium for all implementation, including presentation/oracle work. Finish
required deterministic validation and fresh independent Sol/Opus xhigh acceptance. Live evaluation and owner NPC choice
remain pending until separately authorized; an offline pass is not evidence of new live results.

For all four capabilities, fail/stall request-start persistence before admission and expire the
deadline during that write. Assert the exact nullable-ID no-start responses, bounded completion,
zero provider dispatch, honest client/diagnostic behavior and absent-source authoring rejection.
NPC route tests must close/change sessions between before/after snapshots and start a session after
a null-before snapshot; every attempt retains the original ID/null and no accounting metadata enters
any provider payload.

For every capability, test deadline expiry during final trace writing: returned frozen result and
persisted trace must agree, including Chronicle paragraphs/provider and intent authoring provenance.
Test cancellation just before freeze, recovery racing a slow live writer, two recovery processes,
permanent diagnostic-only recovery after a crash, late live finalizer rejection and unique outcome/
trace insertion. Verify separate request and accounting lock domains cannot deadlock.
Startup and checkpoint C reports disclose shared player/DM capacity and uncertain holds.

Returning a durable preallocated relevance trace ID before final trace insertion is an explicit
test/diagnostic behavior delta: immediate trace reads may be pending 404, so tests assert matching
frozen output after finalization or the permanent diagnostic-only recovery state, never synchronous
trace availability. Record this beside the intent-envelope/nullable-ID deltas in ADR 0032 and evidence.

With a durable start, test initial admission failure, bounded storage stall and lock timeout for
all capabilities. Before caller expiry the fixed denial row applies, preserves the non-null parent
trace ID and invokes one local switch for intent/dialogue/Chronicle; relevance invokes no local AI
and returns deterministic actions. At whole-request expiry the cancellation row applies and no
new provider (including local) runs. No-start responses apply only when start persistence itself
fails/expires without confirmation. Test orphan-start diagnostics using exactly the relevance ID
returned at its deadline, and normal-trace 404 for an internal no-start UUID with no fabricated body.

Tests must reproduce concurrent/multi-process oversubscription, restart, midnight crossing, independent
campaign ceilings, idempotent settlement, unknown/negative/NaN usage, malformed billed responses,
refusal, unknown returned model, storage failure, caller cancellation before/after dispatch,
unresponsive provider, late relevance response, and repair/fallback under the same ceilings. Include
PostgreSQL integration tests for actual transactions and durable recovery, legacy trace reads,
campaign/DM trace isolation, no-key configuration, immutable eval output and existing scoped context
regressions. Run full `pnpm validate` at checkpoints without paid runtime calls.
