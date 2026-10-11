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
2. **OpenAI-compatible adapter** (`openai-compatible-provider.ts`) serves DeepSeek: a forced function
   call, thinking disabled, usage from `usage`. Errors carry a code and a fixed message only.
3. **Routes.** `LTW_AI_ROUTES` gives each capability an ordered `provider:model` list, ending in
   `local` where an offline fallback is wanted. Unset, the previous default holds (Anthropic then local).
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
