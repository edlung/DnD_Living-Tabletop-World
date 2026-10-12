# 0032. Live AI: current-model adapters, per-capability routes, spending ceiling, evaluation

- Status: Accepted (technical; the model assignment follows the owner's decision of 2026-10-05, Q5)
- Date: 2026-10-05
- Stage: 300
- Decision type: technical. Product semantics unchanged: AI still only proposes (ADRs 0017, 0018, 0020, 0021, 0024).

## Context

Until now no live model had run. A live check on 2026-10-05 found that the Anthropic adapter's
forced tool call (`tool_choice` of type `tool`) is rejected by `claude-opus-5-5` with a 400, so with a
key every call would have fallen back silently to templates. DeepSeek V4.1 Flash (`deepseek-flash`)
accepts forced function calls with `thinking` disabled.

## Decisions

1. **Claude adapter** uses `tool_choice: auto`, names the tool in the system text, sends
   `output_config.effort` (not for Haiku 4.5, which rejects it), and treats a refusal or a reply without
   the tool call as `BAD_RESPONSE`, so the gateway's repair and fallback policy (ADR 0017 §5) applies.
   It stays on `fetch`: no SDK dependency for one endpoint.
   _Superseded in part (2026-10-11, checkpoint B1): a refusal is `PROVIDER_REFUSAL` and a missing
   tool call is invalid output (one same-provider repair); see the B1 and B2 amendments below._
2. **OpenAI-compatible adapter** (`openai-compatible-provider.ts`) serves DeepSeek: a forced function
   call, thinking disabled, usage from `usage`. Errors carry a code and a fixed message only.
3. **Routes.** `LTW_AI_ROUTES` gives each capability an ordered `provider:model` list, ending in
   `local` where an offline fallback is wanted. Unset, the previous default holds (Anthropic then local).
   _Superseded (2026-10-11, checkpoints A–B2): a key or the default model never implies a route;
   unset routes are local (relevance: none), and a remote entry is routed only through admission
   with a verified catalog entry. See the B2 amendment below._
4. **Spending ceiling.** Every remote call passes a ledger priced from the providers' published rates
   (DeepSeek at its peak rate; cache discounts ignored, so it overestimates). At the daily ceiling
   (`LTW_AI_DAILY_BUDGET_USD`, default $5) calls are refused as `UNAVAILABLE` and the capability falls
   back. A ceiling per campaign is not implemented: requests carry no campaign to the provider layer.
5. **Evaluation.** `pnpm eval:ai` runs Russian cases against live providers (never in validation):
   DM intents (including a destructive request, a non-game request, and an injection), 18 NPC
   replies per model (three NPCs, six scenarios including three injections) checked against the Russian
   boundary markers, Chronicle prose, and relevance. Results and the blind comparison are in
   `reports/evidence/stage-300/`.

## Measured (2026-10-05; details in `reports/STAGE_300_COMPLETION.md`)

- DM intents: Opus 5.5 6/6, DeepSeek Flash 6/6, Sonnet 5.5 5/6 (it invents a command for a
  request that is not a game change). Opus median 4.1 s, DeepSeek 1.2 s.
- NPC replies: Sonnet 5.5 18/18 and DeepSeek Flash 18/18, no leaked marker under injection;
  median 2.5 s against 1.2 s; about $0.004 against $0.0004 per reply. Which one voices NPCs better is
  the owner's blind choice, not a metric.
- Chronicle: all three produce valid, hedged Russian prose; Opus reads best, DeepSeek is terse, and
  Sonnet declined a name despite the instruction.
- Relevance: DeepSeek Flash answered in 1.1–2.1 s, so a 2 s budget misses some; 3 s is recommended with it.
  Haiku 4.5 took 2.3 s and is no better.

## Consequences

**Correction (2026-10-11):** §4 describes an implemented best-effort in-process ledger, not a strict
spending ceiling. It has no durable reservations, resets on restart, and does not account for
failed/missing-usage responses. Required per-campaign limits and per-attempt computed costs remain
unimplemented. Stage 300 independent acceptance is pending; this ADR is not evidence of approval
for paid calls. See `docs/PROJECT_WORKFLOW.md` and the correction in the completion report.

- The default model names (`claude-opus-5-5`) apply to every capability unless routes are set; set routes.
  _Superseded (2026-10-11): no default model creates a route; owner decision 3 sets Sonnet 5.5 as the
  only runtime text model (B2 amendment)._
- A cheaper model for NPC replies is a configuration change, not a code change.
- Prompt injection resistance still rests on context isolation (ADR 0020 §3), not on the model.

## Amendments

### 2026-10-11 — Correction to the measured evaluation results (remediation checkpoint A)

The measurements above are preserved as recorded. Their semantic meaning is narrower than stated:
the 2026-10-05 predicates could pass wrong outputs (an intent passed on any `PROPOSED` status with
loosely matched commands, a non-game intent passed on an `INVALID_OUTPUT` schema failure, and NPC
replies passed on Cyrillic text, length and an exact-substring marker scan). "6/6 intents" and
"18/18 NPC replies" are therefore **structural transport evidence** (the provider answered, the
output parsed and no listed marker appeared verbatim), not evidence of semantically correct proposals,
safe declines, faithful NPC content or voice quality. Semantic correctness and quality of those runs
are unverified. Corrected oracles and reporting are remediation checkpoint C
(`docs/STAGE_300_REMEDIATION_DESIGN.md` §4); no new live measurement exists.

### 2026-10-11 — Operational spending store (remediation checkpoint A; supersedes §4)

Approved design: `docs/STAGE_300_REMEDIATION_DESIGN.md` (SHA256 `23e53e4d…aab2`, Astra/Fable
review 7). This records the store decision before its schema is applied.

- **Removed.** The in-process `SpendLedger`, the `budgeted` wrapper, the price table with its
  unknown-model fallback, and `LTW_AI_DAILY_BUDGET_USD` (with its $5 default). A set variable is
  ignored with a startup warning; no environment value sets or raises a ceiling.
- **Store.** Spending authority is a durable PostgreSQL store in migration `0005_ai_accounting.sql`:
  operator records (billing accounts with append-only global-daily-ceiling revisions, immutable
  approvals with append-only revisions, evaluation-run bindings, stop clearances, evidence batches)
  and an accounting journal (request starts, attempt starts with their reservations, terminal and
  evidence accounting rows, automatic stops, caller outcomes). Every table is append-only through the
  existing `ltw_reject_history_rewrite` trigger. These are operational DM/operator data, not canonical
  world state; nothing references the event store. In-memory stores are for tests only.
- **Money** is integer microdollars (`bigint`): `ceil(tokens × rate)` once per billing dimension per
  attempt, then summed; never floating-point dollars.
- **Ceilings.** All four classes are mandatory positive integers (database `CHECK > 0`): the global
  UTC-day ceiling belongs only to the billing account (resolved from the stored approval, never from
  configuration or a request); the approval holds the cumulative stage grant, the campaign UTC-day
  ceiling, and one uniform ceiling per session class (play session, evaluation run). The campaign
  UTC-day bucket is keyed by campaign and day across all approvals, so rotating approvals cannot reset
  a campaign's day. The session bucket is keyed by approval, campaign, session class and session/run ID.
- **Effective charge** of an attempt: with a terminal row (`settled`, `released_pre_dispatch` or
  `reconciled`, at most one per attempt) the maximum of its absolute charge rows; without one, the
  maximum of its reservation and any absolute `evidence` charges. Evidence never lowers a charge.
  A settlement's transition key is derived from its whole payload: an identical repeat is a
  duplicate, a different one is appended as evidence with the stop its charge calls for. A batch of
  invoice evidence requires every included attempt to have terminal accounting already; a caller
  outcome (timeout, recovery) is never proof that a provider attempt finished, so a batch only
  appends non-reducing evidence and never closes an open hold.
- **Locks.** Each transaction runs on one checked-out client with `BEGIN ISOLATION LEVEL READ
COMMITTED` (verified; REPEATABLE READ is rejected). Admission, settlement and release take advisory
  key `-1` shared; every operator mutation and `recover-incomplete` take it exclusively. Bucket and
  billing-account control keys are nonnegative 63-bit values from SHA-256, deduplicated, sorted as
  bigint and taken one statement each before totals are read. Request locks use
  `-2 - unsigned62(hash(requestId))` and are never nested with bucket locks. `lock_timeout` and
  `statement_timeout` are set locally from the remaining positive deadline before every statement;
  with no time left no database work starts.
- **Deadlines (repair 1, 2026-10-11).** Every database wait (checkout, BEGIN, the isolation check,
  the timeout settings, application SQL and COMMIT) is raced against the same absolute deadline, and
  the time is rechecked just before each statement is sent. A failed transaction's connection is
  destroyed without awaiting ROLLBACK; as COMMIT was never sent, nothing of it commits. A COMMIT sent
  but unconfirmed is reported as unknown (admission detail `COMMIT_UNKNOWN`): its effects may be
  durable, so a possible hold is never treated as absent or refunded. A request start computes the
  caller's remaining time as its INSERT is sent, after all preparatory waits.
- **Commit uncertainty and the finalizer cutoff (repair 2, 2026-10-11).** An error answered to a
  sent COMMIT clears the uncertainty only with definite abort evidence: ERROR severity and one of a
  short positive list of SQLSTATEs (serialization/deadlock aborts, deferred integrity violations,
  the window guard below). Connection failures, `08007` transaction resolution unknown, shutdown,
  internal errors, FATAL severity or a localized severity all stay `commitUnknown`. The live
  finalizer enforces the approved cutoff (stored caller deadline plus 5,000 ms, database clock)
  through all of its waits, writes and COMMIT, whatever deadline its caller passes. It reads the
  window remaining from the database before and after the request lock, clamps the transaction to
  the send time plus that remaining duration (so a late answer never extends it), and inserts the
  outcome only while the window is open. Forward-only migration `0006_ai_outcome_window.sql`
  enforces the same invariant in the database: a trigger checks a live outcome on insert and again
  while the transaction commits (deferred constraint trigger, SQLSTATE `LT001`), so a late write or
  late COMMIT aborts the outcome and trace together and recovery stays possible. This enforces the
  already approved design §2 contract; it adds no new authority. A COMMIT executed inside the
  window whose answer arrives too late is still reported as unknown, never as recorded.
- **Stops** are appended atomically with the accounting row under the shared policy lock and the
  attempt's own bucket and account locks: an overrun or a raised terminal charge (discrepancy) stops its approval; an unexpected model or
  unverified billing stops the billing account for that provider/model. Admission checks uncleared
  stops after all locks; only an exclusive operator clearance lifts one.
- **Operator CLI** (`pnpm ai:operator <command>`, after `pnpm build`) is the only application path that
  creates or revises accounts, approvals, evaluation-run bindings, clearances, reconciliations,
  evidence batches and incomplete-request recovery. Every record carries owner identity, authorization
  date and a source reference; a unique provider account reference and a unique grant reference
  prevent accidental duplicates. This is operator attestation, not provider-side verification. The
  CLI existing does not authorize spending.
- **Checkpoint A boundary.** Composition constructs no remote adapter and never reveals a provider
  key, whatever keys, routes or approvals exist: every capability is local or deterministic, and live
  evaluation refuses before configuration or provider construction. Adapter outcomes, routes and the
  intent envelope (B1), and request lifecycle, deadlines and gateway admission (B2) are not yet
  implemented, so no approval is usable for a call yet.

### 2026-10-11 — Adapter outcomes, fallback transitions, intent decline and routes (remediation checkpoint B1)

Approved design: `docs/STAGE_300_REMEDIATION_DESIGN.md` §1–§3 (SHA256 `23e53e4d…aab2`). The ADR 0017
delta is recorded there (2026-10-11 amendment); this section records the technical contract.

- **Raw adapters** (`apps/server/src/ai/raw-provider.ts`, `anthropic-provider.ts`,
  `openai-compatible-provider.ts`) have no `generate`: `prepare(request)` serializes the complete body
  (adapter system text, tool, schema, framing; no cache metadata at B1) into a frozen prepared request
  without transport or key; `dispatch(prepared, signal, onStart)` accepts only a request the same
  adapter prepared and sends exactly its body. It reveals the key, then calls `onStart` synchronously
  immediately before `fetch`. `TRANSPORT_NOT_STARTED` is emitted only before that boundary (foreign
  prepared request, already aborted caller, unreadable key, failing start hook); any failure after
  it is uncertain (`UNAVAILABLE`, `TIMEOUT` for the attempt's own bound, `CALLER_CANCELLED` for the
  caller's signal, which wins a tie, `BAD_RESPONSE`). Errors carry no cause, body or key. The
  catalog bound (B2) is computed from that same prepared body, which `dispatch` cannot change.
- **Response classification** keeps safe facts (returned model and request ID when they are safe
  identifiers, input/output tokens, allowlisted billing dimensions) on every classified response:
  `output`; `refusal` (Anthropic `stop_reason: refusal`; OpenAI-compatible `content_filter` or a
  refusal message); `malformed` (`TRUNCATED`, `MISSING_TOOL`, `INVALID_JSON`); `suspect`
  (`UNEXPECTED_MODEL` when the returned model is not the configured one or an explicitly mapped
  alias, including a missing model; `UNVERIFIED_BILLING` when the usage block has any field, nested
  field, value or label outside the adapter's allowlist). A suspect response carries no output.
  Usage absent altogether keeps the output with unknown usage (the hold stays, B2). Pricing these
  facts, catalog verification and stops are B2; nothing is priced at B1.
- **Fallback** (`packages/ai/src/fallback.ts`) implements the outcome table of design §3 for all
  capabilities, with result codes: `INVALID_OUTPUT` carries `INVALID_STRUCTURED_OUTPUT`,
  `NO_PROPOSAL` or the repair's denial code; `AI_UNAVAILABLE` carries the first deciding failure
  (`PROVIDER_FAILURE`, `PROVIDER_REFUSAL`, `UNEXPECTED_MODEL`, `UNVERIFIED_BILLING`, an admission
  denial) or `CALLER_CANCELLED`. Attempt error codes: the transport codes above, `PROVIDER_REFUSAL`,
  the suspect codes, the denial codes (zero usage, no model) and `CALLER_CANCELLED` (late output
  discarded, safe metadata kept); `TRANSPORT_NOT_STARTED` stays the attempt code even after the
  caller has gone, as release proof. Malformed and wrong-kind attempts are `invalid` with the fixed
  code as their issue. A progress hook publishes each attempt start (synchronously, before awaiting),
  the transport start and each end; relevance uses it to trace the attempt in flight at its deadline
  as `CALLER_CANCELLED` instead of an empty attempt list. Whole-request deadlines for intents,
  dialogue and Chronicle, the journal and outcome freeze remain B2.
- **Routed providers.** The router accepts only branded `RoutedProvider`s (`local` or `remote`) in a
  route of shape `[]`, `[x]` or `[remote, local]`. Server composition (`apps/server/src/ai/
composition.ts`, `composeRouter`) is the only runtime/evaluation router constructor: each entry
  must be, by identity, the frozen object `createLocalProvider()` returned (`isLocalProvider`, a
  private registry in the pure package) or a member of the module-private admitted-wrapper set,
  which only the B2 admission wrapper will populate and is empty at B1. Forged brands, copies,
  wrappers of the local provider and test fixtures are refused; relevance takes no local entry.
  Test-only brands live in `packages/ai/src/testing/providers.ts` and server `testing/`; an
  architecture test forbids any production import of a `testing/` module.
- **Routes** (`apps/server/src/platform/config/ai-routes.ts`): runtime intent, dialogue and Chronicle
  routes are `local` or `remote,local`; relevance is one remote entry; three entries, two remotes,
  a remote-only non-relevance route, a duplicate capability or a remote without its key are startup
  errors, never truncated. Evaluation mode (one remote, no local) is validated but not wired: the
  live evaluation CLI still refuses before configuration, keys or providers (checkpoint C).
- **Boundary unchanged.** Composition still constructs no remote adapter and reveals no key whatever
  keys, routes or approvals exist (tested with a revealing-throws `Secret`, a global `fetch` trap,
  and an import scan that now includes `testing/` and evaluation modules). No allowance, live call or
  live authorization is implied. The account/model scope of proven pricing-overrun stops is the
  separately approved B2 stop-scope delta (`docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md`), not implemented
  here.

#### B1 repair 1 (2026-10-11)

Same approved design and contract; these close counterexamples found in independent review.

- **One route snapshot.** `CapabilityRouter` and `composeRouter` read each route once
  (`snapshotRoutes`: one read per capability, one pass per route, frozen arrays), check that
  snapshot and build from it; a getter, Proxy or iterable answering differently later, or a change to
  the input afterwards, cannot reach a router. `providersFor` returns frozen arrays; the composed
  router and gateway are frozen. Identity alone decides genuineness.
- **Own-name usage allowlists.** Usage specs are `Set`/`Map` lookups (`usageSpec`), so a usage field
  named like an inherited object property (`constructor`, `__proto__`, `toString`, …), whatever its
  value, is unrecognized: `UNVERIFIED_BILLING`, no output, safe facts kept. No allowed field changed.
- **Cancellation from callbacks.** The adapters recheck the caller's signal after reading the key
  and after the start hook, immediately before `fetch`; when it has aborted, `fetch` is never invoked
  and the attempt ends `TRANSPORT_NOT_STARTED` (transport was provably not invoked). The fallback
  rechecks after `build`, after each progress notice and immediately before invoking a provider;
  a withdrawn announcement is published as `abandoned`, with no attempt recorded.
- **Local provider not repaired.** Invalid output is repaired only on the remote provider. A
  local-only route, like the local switch, makes exactly one local call (for example, `Advance time
by 0 minutes.` now ends `INVALID_OUTPUT` after one attempt instead of two).
- **Route clauses** with other than exactly one `=` are rejected instead of truncated.

#### B1 repair 2 (2026-10-11)

Same approved design and contract; this closes counterexamples in the fallback result selection.

- **Cancellation during validation.** The signal is rechecked as soon as `validate` returns: if the
  caller went away, a valid output or terminal decline is not selected. The invoked attempt is
  recorded once as `CALLER_CANCELLED` with only safe metadata; no repair or switch follows.
- **Invocation boundary.** Exceptions from code the caller supplies (`build`, `validate`, `nowMs`,
  the progress listener) are not provider failures. Before a provider is invoked they propagate
  and nothing is recorded; a delivered `start` notice is closed by `abandoned`. After an invocation
  exactly one attempt records what the provider did (`INTERNAL_ERROR`, with safe metadata only, if
  `validate` threw), its `end` is published once, and then the first such exception propagates. A
  listener failure inside the provider's start hook does not reach the provider. Every `start`
  notice is closed by exactly one `abandoned` or `end`. An invoked provider's own
  `TRANSPORT_NOT_STARTED` remains a recorded attempt and an ordinary provider failure.

#### B1 repair 3 (2026-10-11)

Same approved design and contract; this closes a hardening gap at the same invocation boundary.
An invoked provider's resolution is read once (`answerOf`): anything but an object with a known
kind (and, where the kind has one, a known code), or a value whose reading throws, is a
non-response. It is recorded as the invocation's one attempt, an uncertain `BAD_RESPONSE` with no
model, usage or output, its `end` is published, and the ordinary provider-failure transition
follows (at most one switch to local), or `CALLER_CANCELLED` once the caller has gone. A model or
usage that is not well-formed is kept as unknown, never invented.

#### B1 repair 4 (2026-10-11)

Same approved design and contract; this closes the rejection side of the same invocation boundary.
`failureCode` (`packages/ai/src/providers.ts`), the one helper that turns a rejection into an attempt
code, never throws and reads `code` at most once. Only a genuine `ProviderError`, recognized by
identity from its constructor, whose code is allowlisted and unchanged since construction keeps that
code. Any other rejection, whether another error, a look-alike or Proxy, or an unknown, changed or
unreadable code, is `UNAVAILABLE`: an uncertain failure of the invoked attempt, recorded once with no
model, usage or output and followed by the ordinary transition (or `CALLER_CANCELLED` once the
caller has gone). A `TRANSPORT_NOT_STARTED` release proof is never inferred from an unverifiable
rejection. Error codes, public statuses and interfaces are unchanged.

### 2026-10-11 — Journal, gateway admission, deadlines, recovery and stop scope (remediation checkpoint B2)

Approved design: `docs/STAGE_300_REMEDIATION_DESIGN.md` (SHA256 `23e53e4d…aab2`) and the approved
stop-scope delta `docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md` (SHA256 `6bba0030…b485`; Astra/Fable xhigh,
with Fable's nonblocking clarifications). This records the implemented contract; acceptance pending.

- **One lifecycle per request** (`packages/ai/src/request.ts`, `runAiRequest`). Each use case opens
  one monotonic whole-request deadline first (`LTW_AI_REQUEST_TIMEOUT_MS`, default 60,000 ms,
  1,000–300,000, for intents, NPC replies and Chronicle; `LTW_AI_RELEVANCE_BUDGET_MS` for
  relevance); NPC replies open it in `replyAsNpc`, after the canonical command. An invalid duration
  is a construction error. The request start is persisted first (its UUID is the trace ID); without
  a confirmed start the use case answers its no-start response and runs no provider, local
  included: intent `AI_UNAVAILABLE` with `traceId: null`; NPC reply `AI_UNAVAILABLE`, `traceId: null`
  (the command result stands); Chronicle template prose, `traceId: null`, committed by the unchanged
  `GenerateChronicle`; relevance deterministic actions, `TIMEOUT` if the budget ran out, else
  `AI_UNAVAILABLE`. `DmIntentResponse.traceId`, `NpcReply.traceId` and `RenderedChronicle.traceId`
  are nullable (reviewed response delta; no new status). The web client never sends a null source.
- **Outcome freeze.** The public result and its trace are decided once, synchronously. If the
  deadline has passed at that moment (including inside the last progress hook), the cancellation
  row is frozen instead, with the attempts known then; an attempt in flight is `CALLER_CANCELLED`
  and no output survives. The caller waits for the write at most until its deadline and returns
  exactly the frozen result. Relevance therefore returns a durable trace ID at its deadline before
  the trace may exist (explicit delta: an immediate read can be a pending 404; the diagnostic tells
  pending from recovered).
- **Journal** (`apps/server/src/ai/journal.ts` over `accounting/request-journal.ts`). The start
  carries campaign, actor, purpose, capability, scope, sources, the session captured from the
  authorized snapshot (NPC: before the command, never re-read), the configured model alias, and the
  approval only for a capability with an admitted remote route and a session. A request without a
  play session runs only its local provider: no fictitious denied remote attempt. The live finalizer
  stores the caller outcome (status, provider, fallback outcome code: migration
  `0007_ai_outcome_code.sql`, digest) and the insert-only trace atomically, within the stored window;
  a conflicting digest is reported, never overwritten. A use case that rejects (caller code threw)
  leaves its start for recovery and its attempts for accounting. Recovery is unchanged (operator
  `recover-incomplete`): `recovered_incomplete` is permanent and diagnostic-only.
- **Admission wrapper** (`apps/server/src/ai/admitted-provider.ts`): the only maker of
  `AdmittedProvider`s (module-private identity set, frozen data properties) and the only dispatch
  path. Per attempt: trusted accounting identity and a finite deadline, else denied; `prepare`;
  reservation from the exact body and the verified catalog entry; durable admission within the
  request's deadline; dispatch of that same body. Only a failure strictly before `onStart` releases
  the hold. Known usage is priced and settled in the background (retried 100/500/2,000 ms; never
  delaying the caller); absent usage keeps the hold; an unexpected model or unverified billing keeps
  the hold, appends the stop and discards the output. **Advisory A1 decision:** a throwing progress
  listener inside the start hook does not stop the transport or the wrapper's settlement; the fallback
  records the attempt and then propagates the listener's error, so a paid call's usage is always
  settled by the wrapper.
- **Start boundary (B1 carry-over, design §1 reading).** `sendPrepared` calls `onStart`
  synchronously immediately before `fetch`. Only failures strictly before it are
  `TRANSPORT_NOT_STARTED`; a throwing hook is `UNAVAILABLE` and a caller who aborts inside it is
  `CALLER_CANCELLED`, both uncertain (no fetch, hold kept). This supersedes the B1 repair 1 wording
  above. `fetch` uses `redirect: 'error'`. The fallback's `onStart` counts once per attempt and is
  ignored after the attempt settles.
- **Pricing catalog** (`apps/server/src/ai/catalog.ts`, `pricing.ts`): versioned pricing functions
  over every billing dimension and context tier; usage-field and label allowlists; request-field and
  option allowlists; documented limits. The reservation is the full documented context at the
  highest input rate of any dimension and tier plus `max_tokens` at the highest output rate (no
  verified tokenizer byte bound exists). Unknown usage, inconsistent totals or unpriced dimensions are
  unverified billing. **`VERIFIED_CATALOG` is empty**: catalog verification is not authorized, so
  composition refuses every remote route (fixed reason `UNVERIFIED_MODEL`) before building an adapter
  or reading a key. Tests use invented fixture entries only. Usage/model allowlists for Sonnet 5.5
  wait for that verification.
- **Composition** (`gateway.ts`) builds a remote provider only with a selected (`LTW_AI_APPROVAL_ID`)
  and stored approval, the accounting store, a verified entry and the key; otherwise the entry is
  refused with `NO_APPROVAL_SELECTED`, `APPROVAL_NOT_STORED`, `NO_ACCOUNTING_STORE`,
  `UNVERIFIED_MODEL` or `NO_KEY` and the route is local only. DeepSeek's identity and endpoint are
  fixed in trusted code. Startup logs every capability's resolved route and refusals, plus counts.
  The temporary construction guard of A/B1 is removed: every remote path is admitted and journaled.
  Raw adapter imports are checked by resolved module path (`tests/architecture/raw-adapter-imports.test.ts`).
- **Stop scope (amends the A stop sentences above).** One immutable stop row, two effective
  restrictions joined by OR: the recorded predicate always, and for `OVERRUN`/`DISCREPANCY` the
  source attempt's account, provider and canonical model on every approval and UTC day. The four
  accepted row shapes: `OVERRUN` and `DISCREPANCY` (approval set, provider and model null, source
  attempt present with the same account and approval); `UNEXPECTED_MODEL` (approval null, provider
  and canonical model set); `UNVERIFIED_BILLING` (approval null, provider set, model null:
  provider-wide). Any other shape, a missing or mismatched source attempt, or a model or historical
  `(provider, model, pricing version)` the verified registry cannot map to one stable canonical model
  denies every remote route of that account with the fixed `ADMISSION_DISABLED`/`STOPPED`; the
  resolution runs inside the bounded admission transaction, whose timeout is unavailability, never a
  dispatch. Admission accepts only the canonical model of its verified pricing version; the journal
  keeps the configured alias. An unexpected-model stop records the attempt's canonical model and
  only observes the returned string. One authorized `stop-clear` lifts both restrictions; clearing
  never reduces charges or holds. Charge commands return the stop IDs they append; the trusted
  read-only `pnpm ai:operator stops --account <id>` explains each uncleared stop's cause. Campaign
  diagnostics never show stops.
- **Diagnostics.** `GET /campaigns/:campaignId/ai/accounting/:traceId` (DM only, ADR 0009 order):
  read-only lifecycle (`pending`, `recorded`, `recovered_incomplete`), caller outcome with code,
  trace presence and the request's attempts with their accounting state and effective charge. No
  bucket totals, capacity, approvals, stops or other campaigns; never an authoring source; an
  unknown ID is the usual 404. Attempt views in new traces add `attemptId` and frozen `billing`
  (absent on older traces: unknown, never zero).
- **Prompt caching** (Anthropic, entry permitting): a 5-minute breakpoint after the fixed system
  text; cache reads and writes are priced dimensions. Recorded in `docs/GATE_COVERAGE.md`.
- **Missing-tool delta and evaluation counting (design §3; was written into ADR 0017 at B1).** The
  baseline mapped a missing tool call to provider failure and a free local switch; the reviewed
  contract treats it as invalid structured output, which may spend on one newly admitted repair of
  the same remote provider. Remote-only evaluation counts both attempts and both charges. Repair
  denial follows the invalid-output branch. This grants no allowance and no extra retry.
- **Owner decision 3 (2026-10-11).** Sonnet 5.5 is the only runtime text model for all four
  capabilities; no Opus or DeepSeek at runtime; the $30 Stage 300 grant covers Sonnet only. The
  `.env.example` route example is `anthropic:claude-sonnet-5-5,local` for intents, NPC replies and
  Chronicle, and `anthropic:claude-sonnet-5-5` for relevance. The DeepSeek adapter stays in the code.
- **Not changed.** No paid call, no verified catalog content, no operator record, no evaluation
  admission, oracle or report (checkpoint C), no client feedback work beyond null-ID narrowing.

#### B2 repair 1 (2026-10-11)

Same approved design and stop-scope delta; this closes gaps in the B2 implementation.

- **Deadline read from the clock.** Wherever a dispatch or provider invocation is decided (the
  fallback policy, the admission wrapper, the raw adapter's checks before its start boundary), the
  caller has gone when its signal has aborted **or** `performance.now()` has reached the request's
  monotonic deadline: the signal is set by a timer that can run late. Past the deadline nothing is
  admitted, dispatched or invoked (the local provider included), and no late result is selected.
  An admission that commits after the deadline is never dispatched and its hold is released at
  once, as live proof that transport never started. The raw adapter's `dispatch` takes the request
  deadline (the wrapper always passes it) and clamps its per-attempt timeout to the time left.
- **Automatic stops retried.** The stop write for an unexpected model or unverified billing is
  idempotent per attempt and reason (a stop that attempt already caused, even if since cleared, is
  not appended again) and is retried on the settlement schedule (100, 500, 2,000 ms). Until it
  commits, the process refuses the route itself (provider and canonical model, or the whole
  provider for unverified billing) before admission; if every retry fails, the route stays refused
  for the life of the process and `STOP_FAILED` is reported. Other processes rely on the committed
  stop only.
- **Provider request IDs.** Every admitted attempt whose response carries a request/message ID
  records it, with the reported model, in the append-only `ltw_ai_attempt_responses` (migration
  `0008_ai_attempt_responses.sql`; one row per attempt; retried; no charge), whether its usage was
  settled, absent or suspect. The DM diagnostic shows it for that campaign's attempts; traces do not
  carry it.
- **Owner-approved deferrals.** An admission denied with an unconfirmed COMMIT keeps any hold until
  operator reconciliation, although transport never started, and its trace reports "not dispatched,
  cost 0". Sonnet 5.5 usage/model allowlists wait for catalog verification.

### 2026-10-12 — Verified Sonnet 5.5 entry, request settings, evaluation integrity, client feedback and Q5 (remediation checkpoint C)

Approved design: `docs/STAGE_300_REMEDIATION_DESIGN.md` (SHA256 `23e53e4d…aab2`) and the B2
stop-scope delta (`6bba0030…b485`), unchanged. Owner authorization: decisions 5 of 2026-10-12
(checkpoint C, catalog verification; no live run, no paid call). Catalog record:
`reviews/STAGE_300_CATALOG_VERIFICATION_CLAUDE_SONNET_5_5_2026-10-12.md`. This records the
implemented contract; acceptance pending.

- **One verified entry** (`apps/server/src/ai/catalog-sonnet-5-5.ts`): Anthropic
  `claude-sonnet-5-5`, which is also its only alias and only accepted response model; pricing
  version `anthropic-claude-sonnet-5-5-2026-10-12` at 2 / 2.5 / 0.1 / 10 µ$ per token (input,
  5-minute cache write, cache read, output including thinking); no context tiers; 1,000,000 input
  and 128,000 output tokens; 32,000,000 request bytes. No other model has an entry, so every other
  remote route is still refused at startup (`UNVERIFIED_MODEL`).
  - The 1-hour cache-write rate is deliberately not priced: the adapter only ever sends a 5-minute
    breakpoint, so the reservation's highest input rate is the 5-minute write, exactly the record's
    example (2,540,960 µ$ at 4,096 output tokens). A reported 1-hour write, or a cache-write total
    without its 5-minute/1-hour split (B2 priced that at the 1-hour rate), is now unpriced: unverified
    billing, hold kept, route stopped. This is stricter, never cheaper.
  - Usage labels: `service_tier` only `standard`, `inference_geo` only `global`. A null or absent
    `service_tier`, `inference_geo` or `speed` reads as the default (owner decisions 6,
    `nullUsageLabels`, clarifying the verification record: the published schema allows null);
    any explicit other value has another price and fails closed.
  - **Fields outside the public schema**, within design §1's "known informational usage fields and
    their permitted values" (no new mechanism beyond the allowlist): the Anthropic adapter's usage
    spec (`usage-facts.ts`) gained null-only labels (`fallback_credit`), zero-only counts (server-tool
    `web_search_requests`/`web_fetch_requests`, recorded as label `'0'`) and one array check
    (`iterations`: every entry `type: "message"`, only known counts, their sums equal to the
    top-level counts it restates, always including input and output; recorded as label
    `message`). `speed` is a label allowed only as `standard`; `output_tokens_details.thinking_tokens`
    is a count that must not exceed `output_tokens` and is never priced twice. Each catalog entry
    then accepts only the labels it lists (the test fixture entry accepts none of these). Anything
    else is unverified billing.
  - Usability limitation (design §1, unchanged): with no verified tokenizer bound every attempt holds
    the full context plus `max_tokens`, $2.520480–$2.622880; a ceiling below one hold admits nothing,
    concurrent requests need one hold each, and a post-dispatch timeout (for example a ranking past
    its deadline) keeps its full hold until operator reconciliation.
- **Request settings** (`apps/server/src/ai/request-settings.ts`, trusted code, not configuration).
  The Anthropic body already had no forced tool choice, no `thinking` (adaptive; `disabled` would be
  a 400 on Sonnet 5.5), no sampling parameters and no prefill; that is now pinned per capability
  (`catalog-sonnet-5-5.test.ts`). Adaptive thinking spends output inside `max_tokens` and Sonnet's
  default effort is `high`, which risks truncation (invalid output, then a paid repair). Each
  capability now sends an explicit effort with room for thinking plus its answer: relevance `low`,
  2,048; NPC dialogue `low`, 4,096; DM intent `medium`, 8,192; Chronicle `medium`, 12,288. The entry
  allowlists only `low` and `medium` and `tool_choice` `auto`. These are initial settings, to be
  revisited after a live evaluation; the relevance deadline (`LTW_AI_RELEVANCE_BUDGET_MS`, default
  2,000 ms) is unmeasured for Sonnet 5.5.
- **Eligibility.** The entry alone sends nothing: a Sonnet route needs its key, a selected stored
  approval and the accounting store, and each request an eligible session that admission accepts.
  Tests prove zero outbound requests and no key read without an approval, with an unstored
  approval, without a store, without a key and without an active play session
  (`gateway-verified.test.ts`), and every Vitest project now replaces the global `fetch` with a trap
  that fails any test calling it (`tests/setup/no-network.ts`).
- **Evaluation integrity** (design §4; `apps/server/src/testing/eval/`). `pnpm eval:ai --live
--approval <id> --run <id>` refuses, before any provider is built or key read, in this order: no
  verified entry, no configured database, no key, an invalid evaluation route (before any
  connection), a failed database read (`DATABASE_UNAVAILABLE`, never read as an absent record), no
  stored approval, a run not registered to that approval and the evaluation campaign, and finally a
  route composition refuses; no argument sets a ceiling. The
  evaluation journal records the **evaluation session class with the run ID**
  (`journal.ts` `SessionBinding`), so admission charges the run's bucket under the approval in the
  shared ledger. Routes are one remote per capability. Each run writes a new directory (never
  overwritten): manifest (source commit and dirty-file hashes, configuration without keys, model
  identity, case inventory, known missing charges, summaries), results and report. Intent oracles
  accept exactly the asked command list (count, types, targets, values, scope) and an explicit
  proposal/decline expectation; negative controls reject a wrong name, target or command type, a
  partial substring, extra commands, an unrelated account, a paraphrased secret, guarded
  (`guardedBy`) and never-said content, a wrong Chronicle citation, a missing hedge and a broken
  relevance action-set or deadline contract (repair 1 below). The Gate 04 replay covers the five
  injection lines, the five intents and the four attitude/disclosure scenarios; the exact provider
  input is checked against the context the builder exposes (sources by ID, phrases lexically)
  separately from the lexical output scan. Reports separate semantic correctness, safe decline,
  technical provider success and (unjudged) quality, with end-to-end latency apart from attempt
  latency and the relevance deadline read from configuration. The 45-minute session estimate for
  the runtime configuration is labelled an estimate, with known charges, holds and unknowns
  apart. **The blind NPC comparison is
  waived by the owner** (decisions 2): no blind artifact. Nothing ran against a live provider.
- **Client feedback** (design §2–3): the player's talk says it waits for a reply; the DM's NPC panel
  says the NPC is replying and discards a reply for a listener the DM has since changed; Chronicle
  says it is writing and, without the narrator, that the chapter is the plain record; an unavailable
  assistant (including a null trace ID) is told apart from a declined request. The client opens no
  trace view; authoring never sends a null source (B2). Russian and English messages
  (`apps/web/src/i18n/`); browser journeys `tests/e2e/ai-feedback.spec.ts`.
- **Q5 product disposition (owner, 2026-10-11:** `reviews/STAGE_300_PRODUCT_DECISIONS_2026-10-11.json`,
  reaffirmed in decisions 3). Paid AI runs only inside an active play session or a registered
  evaluation run, for all four capabilities. DM preparation without an active play session and
  Chronicle rendering after a session closes are **local-only**: no paid preparation session is
  created by a login, a key or a route. A paid campaign-preparation session would need a separately
  reviewed explicit grant. Design §1 required this disposition before checkpoint C completion.
- **Not changed.** No paid call, no live evaluation run, no operator record (test databases only),
  no new public status, no prompt or scoped-context change, no migration.

#### C repair 1 (2026-10-12)

Same approved design and stop-scope delta; owner decisions 6 of 2026-10-12
(`reviews/STAGE_300_OWNER_DECISIONS_6_2026-10-12.json`). This closes gaps found in review.

- **Exact intent oracles** (`apps/server/src/testing/eval/intent-cases.ts`). A proposal is correct
  only when it is exactly the asked command list: number, types, targets (entity, place, account
  holder and author, subjects), values and knowledge scope; any further command or unrequested
  optional field (relations, another subject) is wrong. The guard's account must be the new guard's
  own TESTIMONY, attributed to it, and say the caravan left (a lexical check, so labelled). The
  injection's only acceptable proposal is the requested fact word for word, as world truth about
  the guild; a paraphrase is scored wrong (a possible false negative, never a false pass), so a
  paraphrased planted secret cannot pass.
- **Chronicle verdict for the model only** (`oracles.ts` `chronicleModelVerdict`). Prose is judged
  only when the configured remote model wrote the committed chapter. Validation rejects wrong
  citations and missing hedges before any commit and commits the template instead, so such a
  chapter is scored as a model failure with each rejected answer's causes (wrong citation, missing
  hedge, no citation, ID in prose, schema or malformed codes). Template and local chapters are
  reported apart, by authorship, and are never a model pass.
- **Measured estimate from known charges** (`eval-world.ts`, `eval-report.ts`,
  `session-estimate.ts`). A measured sample is one request's known charge: its dispatched
  attempts' terminal charges, priced from every billed usage class (uncached input, cache writes
  and reads, output). Requests never dispatched (denied or released before transport) or with a
  held attempt of unknown charge give no sample. Assumed token ranges count every billed input
  token, and their high end prices each at the highest input rate, so that bound holds.
- **Relevance at runtime (owner decisions 6, `relevanceRoute`).** Runtime ranking uses the
  deterministic Context Engine with no paid model; Sonnet 5.5 serves DM intents, NPC dialogue and
  Chronicle. The `.env.example` route example has no `fast-context` entry, and the startup report
  for it shows relevance with no provider and no refusal (`gateway-verified.test.ts`). The design's
  explicit remote ranker stays possible but is not the runtime configuration. The session estimate
  prices rankings at zero and shows a Sonnet-relevance alternative apart, labelled. A live
  evaluation measures relevance only when `fast-context` is named.
- **Null usage labels (owner decisions 6, `nullUsageLabels`).** Unchanged behavior, now recorded
  and tested explicitly: null or absent `service_tier`, `inference_geo` and `speed` are the
  defaults; explicit other values fail closed.
- **Gate 04 replay** (`cases.ts`, `dialogue-runner.ts`). All five injection lines of
  `npc-isolation.test.ts` (in Russian), the five intents (talk, two asks, insight, showing the
  party's evidence) and the four attitude/disclosure scenarios of `dialogue-isolation.test.ts`; in
  each scenario every intent is paired with a line, rotated per scenario (69 requests per run, not
  the full cross product). After each request the runner rebuilds the NPC context with the route's
  own domain functions on the same snapshot and checks the exact provider input against it: by ID,
  the recorded sources equal the builder's and no boundary or source ID is sent; by phrase
  (lexical), no planted secret, other NPC's fact or still-locked guarded content is sent (the
  player's own words excepted) and every `sayableBy` marker the builder exposed is present. A
  paraphrase of a secret is not caught by the phrase scan; the source comparison bounds the input.
- **Request shape below the top level** (`apps/server/src/ai/request-shape.ts`, before any
  reservation). Anthropic: exactly one user message with string content (no assistant turn or
  prefill), exactly the one client tool the request names (no server or typed tool), and no
  `cache_control` but the single `{type: "ephemeral"}` breakpoint on the one system text block, only
  where the entry permits caching. OpenAI-compatible: exactly one system and one user message, one
  function tool of that name, no cache directive. Anything else is refused (`messages`, `tools`,
  `cache` or `system`).
- **Test hygiene.** The no-network proofs recognize the trap by its registry symbol without
  importing the setup file, so they fail if `setupFiles` stops installing it. The stalled-finalizer
  relevance test uses a 3 s budget and asserts the dispatch, so admission always finishes before
  the deadline under load; it still proves the return at the deadline without waiting for the
  stalled write, the pending trace and open hold, and the later recorded trace.
- **Evaluation preflight and client.** Every preflight database read failure is the fixed refusal
  `DATABASE_UNAVAILABLE`, never a thrown error or an absent approval. The Chronicle writer tells an
  unavailable narrator apart from a narrator whose text failed the chronicle's checks (English and
  Russian).
- **Operator ceilings (owner decisions 6, `operatorCeilings`)** — $30 stage grant, $15 global daily,
  $15 Ravenford daily, $10 per play session, $10 per evaluation run — are to be recorded through
  the operator CLI after checkpoint C acceptance; none is recorded here.
