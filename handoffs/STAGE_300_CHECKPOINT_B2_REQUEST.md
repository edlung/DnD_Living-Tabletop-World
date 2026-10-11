# Independent Checkpoint Handoff Request — Stage 300 remediation checkpoint B2

- Gate: Stage 300 remediation checkpoint B2 (journal/gateway integration, whole-request deadlines,
  hard-abort recovery, diagnostic reads, cache accounting, approved stop-scope delta, pricing-catalog
  mechanism, B1 carry-overs, owner decision 3 route example)
- Review type: RETEST (repair 1)
- Completed stage: Stage 300 (remediation in progress; checkpoints A and B1 accepted)
- Revision/commit: base HEAD `9be13071914755abb78006b054cce83eb4038978` (branch `stage-300-live-ai`)
  plus the uncommitted working tree listed below (no commit, no push)
- Prior report / remediation / retest number: repair 1 of the initial B2 artifact (dirty manifest
  hash `980b1f67e5df3fa5a6f913afb299a8b588c96c7cf70b404e5b0f309f5e1f22cf`); see "Repair 1" below
- Required output paths (separate, independent reports on this same artifact):
  - `reviews/STAGE_300_CHECKPOINT_B2_OPUS_XHIGH_REVIEW.md` (claude-opus-5-5 / xhigh)
  - `reviews/STAGE_300_CHECKPOINT_B2_OPUS_MAX_REVIEW.md` (claude-opus-5-5 / max)
- Requested reviewers: two fresh, independent Claude Opus 5.5 sessions, one xhigh and one max
  (owner decision 3, `reviews/STAGE_300_OWNER_DECISIONS_3_2026-10-11.json`), independent of each
  other and of this implementation session
- Accepted architecture artifacts:
  - `docs/STAGE_300_REMEDIATION_DESIGN.md`, SHA256
    `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2` (draft 7; Astra/Fable xhigh
    approval: `reviews/STAGE_300_{ASTRA,FABLE}_DESIGN_REVIEW_7_2026-10-11.md`)
  - `docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md`, SHA256
    `6bba003055bfd53ac4e069d01d5bf6e3a5a6e272fddb41a2f8305b55e153b485` (approved by Astra and Fable
    xhigh; records `reviews/STAGE_300_B2_STOP_SCOPE_*`; its "DRAFT" header is frozen for identity)
  - Both files are byte-identical to these hashes in the working tree (rechecked after the last edit).
- Accepted base: checkpoint A (`reviews/STAGE_300_CHECKPOINT_A_ACCEPTED_MANIFEST_2026-10-11.json`)
  and checkpoint B1 (`reviews/STAGE_300_CHECKPOINT_B1_ACCEPTANCE_2026-10-11.json`, commit `f7518a6`).
- Implementation session: Claude Code CLI, model `claude-opus-5-5` (actual model of this session),
  session `c5c1ac6f-12d0-4b1b-b072-bca3075ef38d`; initial artifact at effort medium, repair 1 at
  effort xhigh, as configured by the launcher.
- Dirty-file manifest (repair 1): 113 files (below); SHA256 of the `shasum -a 256` listing:
  `589b980e3be3787ac41f7d6a29c6dff8514806355bf482c7b8d7b9d288feb20e`. This handoff file is not in the manifest. Superseded initial manifest hash:
  `980b1f67e5df3fa5a6f913afb299a8b588c96c7cf70b404e5b0f309f5e1f22cf` (106 files).
- Status: AWAITING_INDEPENDENT_ACCEPTANCE (Opus 5.5 xhigh and Opus 5.5 max). No verdict is
  recorded here.

## Review Objective

Determine whether this exact artifact implements the B2 scope of the approved design draft 7 and
the approved stop-scope delta without weakening any fail-closed contract: every remote attempt
passes durable admission, the request journal and settlement through the one admitted dispatch
path; no outbound request and no key reveal is possible without a stored approval, an accounting
store and a verified catalog entry (the verified catalog is empty); whole-request deadlines bound
start, admission, attempts and persistence; the frozen caller result and its trace agree and are
written once; recovery and diagnostics expose only the requesting campaign's facts; stop scope,
identity resolution and malformed rows deny as specified; and the listed B1 carry-overs are closed.

## Requirements (neutral)

1. Design §1–§3 B2 assignments: journal/gateway integration, whole-request deadlines
   (`LTW_AI_REQUEST_TIMEOUT_MS`, relevance budget), hard-abort recovery (outcome freeze, unique
   atomic caller-outcome/trace finalization, bounded recovery, permanent diagnostic-only record),
   diagnostic reads (DM campaign scope vs trusted operator scope), cache accounting, nullable trace
   IDs and the no-start responses, and the design's B2-relevant test list.
2. The approved stop-scope delta: one immutable stop, two effective restrictions (OR), reason-specific
   predicates, fail closed on unexpected row shapes and identity gaps, stable canonical identity,
   single clearance, Fable's clarifications.
3. Pricing-catalog mechanism per design §1 (versioned pricing functions over every billing
   dimension, usage/option allowlists, fail closed on unknowns); no verified production entry; tests
   use fixture entries only; with keys present and no stored approval or verified entry: zero
   outbound and no secret reveal. The A/B1 construction guard is removed only because every remote
   path is admitted and journaled.
4. B1 carry-overs from the acceptance record (start boundary, `onStart` once, A1 decision,
   rejected use cases, freeze in the end-hook case, outcome code persisted, resolver-based import
   guard, `redirect: 'error'`, pinned DeepSeek identity/base URL, DeepSeek edge cases, startup route
   report, ADR/Gate 06 documentation fixes).
5. Owner decision 3: `.env.example` `LTW_AI_ROUTES` uses `anthropic:claude-sonnet-5-5` for every
   capability in validated shapes; decision recorded in ADR 0032; DeepSeek adapter code kept.

## Authoritative Documents

- `ARCHITECTURE_INVARIANTS.md`
- `docs/STAGE_300_REMEDIATION_DESIGN.md` (§1–§3, "Allowed source boundaries", "Checkpoints and
  required evidence") and `docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md`
- `docs/adr/0032-live-ai.md` (amendments 2026-10-11; B2 amendment at the end), `docs/adr/0017-ai-gateway.md`
- `reviews/STAGE_300_CHECKPOINT_B1_ACCEPTANCE_2026-10-11.json` (carried items),
  `reviews/STAGE_300_CHECKPOINT_B1_OPUS_MAX_REVIEW_2026-10-11.md`,
  `reviews/STAGE_300_CHECKPOINT_B1_OPUS_REVIEW_REPAIR_2_2026-10-11.md` (A1, residual risks)
- `reviews/STAGE_300_OWNER_DECISIONS_2_2026-10-11.json`, `reviews/STAGE_300_OWNER_DECISIONS_3_2026-10-11.json`
- `docs/PROJECT_WORKFLOW.md`, `work-orders/OPUS_STAGE_300.md`, `docs/GATE_COVERAGE.md` (Stage 300 entries)

## B2 Delta by File

Pure AI package (`packages/ai/src/`):

- `request.ts` (new): one request lifecycle for all use cases — deadline, durable start or
  no-start answer, fallback with trusted accounting identity, local-only when no play session,
  outcome freeze (cancellation row when expired at freeze), bounded wait for the trace write.
- `request-deadline.ts` (new): monotonic whole-request deadline and signal; construction error on an
  invalid duration; waiting no later than the deadline.
- `traces.ts`: the port gains `start`/`finalize` (caller outcome with status, provider, code);
  in-memory store records starts and outcomes, refuses conflicting outcomes (`OutcomeConflict`).
- `providers.ts`: `ProviderPayload`; `ProviderRequest.accounting` (trusted, required);
  `AttemptContext.deadlineAtMs`; `ResponseFacts.charge` (set only by the server wrapper).
- `fallback.ts`, `fallback-answer.ts` (new, extracted): per-attempt IDs and accounting; `onStart`
  counts once per attempt and is ignored after settlement; attempt views add `attemptId` and frozen
  `billing`; start events carry attempt ID and provider kind.
- `intent.ts`, `dialogue.ts` (`accountingSessionId` input), `chronicle.ts`, `relevance.ts`: run on
  `runAiRequest`; no-start responses; nullable trace IDs.
- `prompt.ts`, `dialogue-prompt.ts`, `relevance-prompt.ts`: return type `ProviderPayload` only.
- `index.ts`: exports. Test support: `testing/journal.ts` (new), `testing/capabilities.ts`
  (`runWith`), `testing/providers.ts` (`testAccounting`, `payloadOf`).
- Tests: `request-lifecycle.test.ts`, `fallback-start-hook.test.ts` (new); existing tests updated
  for required deadlines/accounting, payload comparison and nullable IDs.

Contracts (`packages/contracts/src/`):

- `ai-gateway/intents.ts`: `DmIntentResponse.traceId` nullable; additive `AiAttemptView.attemptId`,
  `billing` (`AttemptBillingView`); `INTERNAL_ERROR` documented.
- `ai-gateway/accounting.ts` (new): read-only diagnostic DTO. `npc/dialogue.ts`: `NpcReply.traceId`
  nullable. `index.ts`: exports.

Server (`apps/server/src/`):

- `ai/admitted-provider.ts` (new): the admission wrapper and the module-private admitted set.
- `ai/accounting-tasks.ts` (new): background settlement (retries), releases, stops; fixed issue codes.
- `ai/catalog.ts` (new): catalog entries, validation, configured-name and historical identity
  resolution; `VERIFIED_CATALOG` empty. `ai/pricing.ts` (new): reservation from the prepared body,
  usage pricing and allowlists.
- `ai/journal.ts`, `ai/diagnostics.ts` (new): PostgreSQL request journal and DM diagnostic read.
- `ai/gateway.ts`: composition of admitted remote routes with fixed refusal reasons and a per-capability
  route report; the A/B1 construction guard removed. `ai/composition.ts`: uses the wrapper's set.
- `ai/raw-provider.ts`: start boundary aligned with design §1; `redirect: 'error'`.
- `ai/anthropic-provider.ts`: optional 5-minute cache breakpoint on the fixed system text.
- `ai/openai-compatible-provider.ts`: `createDeepSeekProvider` with fixed identity and endpoint;
  edge cases (non-string refusal, more than one choice, `insufficient_system_resource`/unknown stop).
- `ai/postgres-trace-store.ts`: no longer the AI trace port (legacy reads/test seeding).
- `http/routes/ai-routes.ts`: `GET /campaigns/:campaignId/ai/accounting/:traceId` (DM only).
  `http/routes/npc-routes.ts`: pre-command session capture. `http/routes/chronicle-routes.ts`: doc.
  `http/app.ts`: optional diagnostics dependency.
- `platform/config/config.ts`: `LTW_AI_REQUEST_TIMEOUT_MS`, `LTW_AI_APPROVAL_ID`.
- `main.ts`: production journal, budget store with the catalog resolver, startup approval check,
  per-capability route report, accounting shutdown.
- Test support: `testing/{catalog-fixtures,fake-budget-store,gateways,memory-journal}.ts` (new);
  `testing/{accounting,ravenford-app,raw-adapter-fixtures,ui-server,scenario/session,eval/eval-runners}.ts`.
- New tests: `ai/{admitted-provider,catalog}.test.ts`, `http/{no-start,npc-session}.test.ts`,
  `ai/journal.integration.test.ts`, `ai/accounting/stop-scope.integration.test.ts`; updated:
  gateway, composition, adapters, live-ai, config, and the integration tests named in the manifest.

Accepted checkpoint-A accounting modules changed (as the design/delta require):

- `ai/accounting/admission.ts`: takes the identity resolver; admits only the canonical model of its
  pricing version; stop matching through `stop-scope.ts` (replaces `hasActiveStop`).
- `ai/accounting/spend.ts`: `hasActiveStop` removed (superseded); `appendStop` returns the stop ID;
  comments for the wider scope.
- `ai/accounting/stop-scope.ts`, `ai/accounting/stop-diagnostics.ts` (new).
- `ai/accounting/request-journal.ts`: `FinalOutcome.code` stored with the live outcome.
- `ai/accounting/postgres-budget-store.ts`: constructor takes the resolver; `approvalExists`.
- `ai/accounting/operator-store.ts`, `operator-commands.ts`, `operator-args.ts`: charge commands
  return appended stop IDs; read-only `stops --account <id>` command.
- `migrations/0007_ai_outcome_code.sql` (new, additive): `ltw_ai_request_outcomes.code`.
- Changed in repair 1 (see below): `settlement.ts` (idempotent `holdWithStop`; the bounded retry
  helper made generic), `types.ts` (`BudgetStore.recordResponse`; header), new
  `attempt-responses.ts`, new migration `0008_ai_attempt_responses.sql`.
- Unchanged: `money.ts`, `lock-keys.ts`, `pg-transaction.ts`, `deadline.ts`, `recovery.ts`,
  migrations 0005/0006 (and 0007 since it was first applied).

Web: `apps/web/src/authoring/use-authoring.ts` narrows a null trace ID before authoring.

Documentation: `docs/adr/0032-live-ai.md` (B2 amendment; decisions 1, 3 and a consequences line
marked superseded), `docs/GATE_COVERAGE.md` (B1 tool description, B2 cache framing and envelope
deltas), `docs/AI_CONTEXT_MAP.md`, `docs/PROJECT_WORKFLOW.md` (B2 status line), `.env.example`,
`AGENTS.md` files of `packages/ai`, `apps/server`, `apps/server/src/ai/accounting`,
`apps/server/migrations`. `tests/architecture/raw-adapter-imports.test.ts` (new) replaces the
filename-only guard.

## Repair 1

Bounded repair of the initial B2 artifact. Requirements and changes, by item:

**R1. No dispatch or provider invocation after the whole-request deadline.** Requirement: every
check that decides a dispatch or a provider invocation treats the caller as gone when
`performance.now()` has reached the request's monotonic deadline, not only when its abort signal
(set by a timer that can run late) has fired; an admission that commits after the deadline is never
dispatched and its hold is released live; the local provider is never started after expiry.
Changes:

- `packages/ai/src/fallback.ts`: the caller-gone check reads the signal or the monotonic deadline;
  after a late denial, outage or refusal no switch (local included) is invoked, and a late output is
  never selected.
- `apps/server/src/ai/admitted-provider.ts`: the same check before admission and after it; an
  admission that committed after the deadline is released at once and nothing is dispatched (no key
  read, no `onStart`, no `fetch`); the request deadline is passed to the raw adapter.
- `apps/server/src/ai/raw-provider.ts` (`dispatch` gains the request deadline; `anthropic-provider.ts`,
  `openai-compatible-provider.ts` pass it through): every check before the start boundary reads the
  deadline (`TRANSPORT_NOT_STARTED` when passed, so the wrapper releases live); the per-attempt
  timeout is clamped to the time left; a late transport failure is classified as caller cancellation.
- Regressions (deterministic: the deadline is passed by busy-waiting, so no timer can fire):
  `apps/server/src/ai/admitted-provider-holds.test.ts` (admission committing after the deadline;
  deadline passing while the key is read; no admission once expired), `packages/ai/src/fallback-deadline.test.ts`,
  `packages/ai/src/request-lifecycle.test.ts` (no local provider after a late denial, all four
  capabilities), `apps/server/src/ai/raw-adapter-hardening.test.ts` (both adapters).

**R2. A failed automatic stop is retried, and its route refused meanwhile.** Requirement: the stop
for an unexpected model or unverified billing must not be lost to a transient failure, must never be
duplicated, and the route must not be admitted again before the stop exists. Changes:

- `apps/server/src/ai/accounting/settlement.ts`: `holdWithStop` is idempotent per attempt and reason
  under the attempt's account lock (an existing stop for that attempt and reason, even a cleared
  one, is never appended again); `settleWithRetry` is generic and reused for this write.
- `apps/server/src/ai/accounting-tasks.ts`: the stop write is retried after 100, 500 and 2,000 ms;
  from the suspect response until the stop commits, the process refuses the route (provider and
  canonical model for an unexpected model; the whole provider for unverified billing), and keeps
  refusing it for the life of the process if every retry fails (`STOP_FAILED` reported).
- `apps/server/src/ai/admitted-provider.ts`: such a refused route is denied `ADMISSION_DISABLED`
  before any preparation or admission.
- Regressions: `admitted-provider-holds.test.ts` (retry schedule, in-process refusal and its scope,
  exhausted retries); `apps/server/src/ai/accounting/suspect-records.integration.test.ts` (a stop
  delayed past its 5 s bound by an exclusive policy lock is retried and committed once; ambiguous
  COMMIT answers never duplicate it; a retry after clearance appends nothing).

**R3. Provider request/message IDs kept for every attempt that has one.** Requirement: design §2
"Store provider request/message IDs when available", including responses without usage and suspect
responses. Changes:

- `apps/server/migrations/0008_ai_attempt_responses.sql` (new, additive, append-only): one row per
  admitted attempt with its provider request ID and reported model; safe-identifier checks.
- `apps/server/src/ai/accounting/attempt-responses.ts` (new), `types.ts` (`BudgetStore.recordResponse`),
  `postgres-budget-store.ts`: an idempotent bounded insert; `accounting-tasks.ts` retries it.
- `apps/server/src/ai/admitted-provider.ts`: records the ID for every classified response that
  carries one (settled, without usage, suspect).
- `apps/server/src/ai/diagnostics.ts`: the DM diagnostic shows an attempt's request ID and returned
  model from its accounting rows, else from this record (that campaign's attempts only, as before).
  Traces are unchanged (the design lists no request ID for attempt views).
- Regressions: `admitted-provider-holds.test.ts`, `suspect-records.integration.test.ts`; updated
  call-sequence expectations in `admitted-provider.test.ts` and `gateway.test.ts`.

**R4. Documentation.** `apps/server/src/ai/accounting/types.ts` header; `docs/AI_CONTEXT_MAP.md`
(design status as approved; migration 0008); `docs/adr/0032-live-ai.md` ("B2 repair 1" amendment);
`docs/GATE_COVERAGE.md` (repair 1 changes no provider-facing envelope, prompt or body);
`apps/server/src/ai/accounting/AGENTS.md`, `apps/server/migrations/AGENTS.md`; a stale comment in
`apps/server/src/ai/live-ai.test.ts`.

Owner-approved deferrals (2026-10-11), recorded as known limitations below and not changed here:
an admission denied after its COMMIT was sent but not confirmed keeps any hold until operator
reconciliation, although transport never started, and its trace reports "not dispatched, cost 0";
Sonnet 5.5 usage/model allowlists wait for the separately authorized catalog verification.

Files changed by repair 1 (26): `apps/server/migrations/0008_ai_attempt_responses.sql`,
`apps/server/migrations/AGENTS.md`, `apps/server/src/ai/accounting-tasks.ts`,
`apps/server/src/ai/accounting/{AGENTS.md,attempt-responses.ts,postgres-budget-store.ts,settlement.ts,suspect-records.integration.test.ts,types.ts}`,
`apps/server/src/ai/{admitted-provider-holds.test.ts,admitted-provider.test.ts,admitted-provider.ts,anthropic-provider.ts,diagnostics.ts,gateway.test.ts,live-ai.test.ts,openai-compatible-provider.ts,raw-adapter-hardening.test.ts,raw-provider.ts}`,
`apps/server/src/testing/fake-budget-store.ts`, `docs/adr/0032-live-ai.md`, `docs/AI_CONTEXT_MAP.md`,
`docs/GATE_COVERAGE.md`, `packages/ai/src/{fallback-deadline.test.ts,fallback.ts,request-lifecycle.test.ts}`.

## Surfaces Available to Reviewer

- API/routes: `POST /campaigns/:campaignId/ai/intents`, `POST …/npcs/:npcId/dialogue`,
  `GET …/entities/:entityId/context?ranking=ai`, `POST …/chronicle`, `GET …/ai/traces/:traceId`,
  `GET …/ai/accounting/:traceId`, `POST …/authoring/proposals`.
- CLI/test harness: `pnpm ai:operator` (after `pnpm build`; throwaway databases only via
  `apps/server/src/testing/accounting.ts`); Vitest unit and integration projects; Playwright E2E.
- Logs/traces: startup `AI route` / `remote AI route refused` / `AI accounting status` lines;
  accounting issues logged by fixed code only.

## Start / Reproduce

```text
git checkout stage-300-live-ai   # HEAD 9be13071914755abb78006b054cce83eb4038978 + the manifest below
pnpm install --frozen-lockfile
pnpm db:up                        # PostgreSQL at 127.0.0.1:54329 (already running here)
pnpm validate                     # full offline validation; no provider or network call
pnpm vitest run --project unit packages/ai/src/request-lifecycle.test.ts apps/server/src/ai
pnpm vitest run --project integration apps/server/src/ai/journal.integration.test.ts \
  apps/server/src/ai/accounting/stop-scope.integration.test.ts
# Repair 1 focused regressions
pnpm vitest run --project unit packages/ai/src/fallback-deadline.test.ts \
  packages/ai/src/request-lifecycle.test.ts apps/server/src/ai/admitted-provider-holds.test.ts \
  apps/server/src/ai/raw-adapter-hardening.test.ts
pnpm vitest run --project integration apps/server/src/ai/accounting/suspect-records.integration.test.ts
```

## Test Personas / Scopes

Ravenford development personas (`fixtures/ravenford/personas.json`): DM `dm-ravenford`, player
`player-elowen`; perspectives PLAYER, PARTY, DM. Accounting integration tests create their own
billing accounts/approvals in throwaway databases (`TEST_AUTH`); fixture catalog entries
(`apps/server/src/testing/catalog-fixtures.ts`) carry invented prices, not provider prices.

## Canonical Secret or Invariant Under Test

No provider key may be read, and no outbound request made, unless durable admission has reserved
the attempt under a stored approval with a verified catalog entry; in this build no verified entry
exists. Spending ceilings and stops must never be bypassed by approval rotation, aliasing, day
rollover, process restart or malformed records. Campaign diagnostics must not reveal another
campaign's facts, stops, totals or capacity. Invariants 1, 2, 5, 6, 18, 21 and 22 still hold.

## Validation Already Run by Implementation Writer

Final run on the repair 1 manifest below (`pnpm validate`, exit 0):

| Command                          | Result                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm run format:check`          | PASS                                                                                            |
| `pnpm run lint` (max warnings 0) | PASS                                                                                            |
| `pnpm run typecheck`             | PASS                                                                                            |
| `pnpm run context-budget`        | PASS: 686 active files, 0 over target, 0 over hard limit                                        |
| `pnpm run test` (unit)           | PASS: 197 files, 2170 tests                                                                     |
| `pnpm run build`                 | PASS                                                                                            |
| `pnpm run db:migrate`            | PASS: applied `0008_ai_attempt_responses` to the local development database (7 already applied) |
| `pnpm run seed:ravenford`        | PASS: 0 accepted, 91 duplicates, version 113                                                    |
| `pnpm run test:integration`      | PASS: 31 files, 173 tests                                                                       |
| `pnpm run test:e2e`              | PASS: 45 tests                                                                                  |

Before the repairs, each new behavioral regression was run against the unrepaired code and failed:
the wrapper deadline, stop and request-ID cases (10), the fallback deadline cases (5), the late
denial lifecycle case (4 capabilities) and the raw adapter deadline cases (6). The PostgreSQL
duplicate-stop cases (2) fail when the idempotency check is removed.
Initial artifact run (superseded): unit 195 files / 2144 tests, integration 30 / 168, E2E 45,
681 active files.

The migrate and seed CLIs load `.env`/`.env.local` if present, as the existing scripts always do;
this session did not read those files. No provider, network or paid call was made; no pricing page
was fetched; no operator record was created outside throwaway test databases.

## Known Limitations

- `VERIFIED_CATALOG` is empty because catalog verification is not authorized: every remote route is
  refused at startup and runtime remains local/deterministic. Sonnet 5.5 usage/model allowlists, its
  cache minimum and rates, and the per-model justification that the reservation bound dominates the
  provider's charge need that separate verification. Provider-specific cache semantics are unverified.
- With no verified tokenizer byte bound, the reservation is the full documented context at the
  highest input rate plus `max_tokens` at the highest output rate; this is deliberately expensive
  and may exhaust session/campaign ceilings quickly once enabled (design-accepted usability cost).
- Approval existence is checked once at startup (approvals are never deleted); an approval created
  later needs a restart before remote routes are composed.
- Recovery remains operator-triggered (`pnpm ai:operator recover-incomplete`), as at checkpoint A;
  there is no background sweep. Until it runs, an unfinished request stays `pending` in diagnostics.
- A request without a play session runs only its local provider (no remote attempt is recorded).
- The DM diagnostic shows per-attempt accounting, not stop causes; stop causes are available only
  through the trusted operator `stops` command.
- The in-memory journal's diagnostic (HTTP tests) has lifecycle only, no attempts.
- `LTW_AI_MODEL`/`LTW_DEEPSEEK_MODEL` remain parsed but unused by routing.
- The web change is a type narrowing in `use-authoring.ts`; there is no new hook unit test (the
  server rejects a null source, covered by integration and HTTP tests).
- Owner-approved deferral (2026-10-11): an admission denied because its COMMIT was sent but not
  confirmed keeps any hold until operator reconciliation, although transport never started; the
  trace reports the attempt as "not dispatched, cost 0".
- Owner-approved deferral (2026-10-11): Sonnet 5.5 usage/model allowlists wait for the separately
  authorized catalog verification.
- The in-process refusal of a route whose automatic stop has not committed lives only in that
  process: other processes, and this one after a restart, rely on the committed stop. If every
  retry fails, no stop row exists until the operator acts on the reported `STOP_FAILED`.
- Response records are written in the background after the caller's answer; a record whose retries
  fail is reported (`RESPONSE_NOT_RECORDED`) and its request ID is then only in the provider's logs.
- Deferred to checkpoint C: evaluation admission and registered-run sessions, oracles, reporting,
  latency/session-cost reports, blind key handling, client replying/failure feedback, the Q5 product
  disposition record, and any live measurement. Live calls need catalog verification and operator
  records, both separately authorized.

## Coverage Ledger

`docs/GATE_COVERAGE.md` Stage 300 entries (B1 and B2 paragraphs) list the provider-facing envelope
deltas (intent wire schema and description, cache-block framing, accounting metadata exclusion,
no-start answers, DeepSeek classification) with their evidence files. Gate 06 remains the formal
review of Stage 300 live providers; live provider behavior is not certified by offline tests.

## Dirty-File Manifest (SHA256)

Repair 1 manifest (113 files; listing SHA256 `589b980e3be3787ac41f7d6a29c6dff8514806355bf482c7b8d7b9d288feb20e`):

```text
f7dc4c48b9014b3e860574658150d6e146c1150a5443a2d5904a361c656422ee  .env.example
18295b135e1c7f75acd09903319b39b79a136fc3b732751d9d36feaf67c4b2b0  apps/server/AGENTS.md
48f6c8de00b0051492fee3007885444ac9dba813689bcd50e68d4727c13f63d6  apps/server/migrations/0007_ai_outcome_code.sql
5206273652bf1d535e3b270af4ee8a7a59a48af7670568124caf3476e002203c  apps/server/migrations/0008_ai_attempt_responses.sql
339753175c6d1f293443931504306481e97d0a3cc661ae9ceefba006ad6bd589  apps/server/migrations/AGENTS.md
1c7b56c8b58a3d18c147e2b6392b7ca52b67d5930dfe84c945faee8fd678b264  apps/server/src/ai/accounting-tasks.ts
0025b2b74295ca6635b3c397382a098018908036ac04779f364dde6b81e09a4a  apps/server/src/ai/accounting/admission-ceilings.integration.test.ts
8f6b3b7c6d1a2ee991a55b8e994469bb0eb284fdbd70ccedc468ad17dbbae8f3  apps/server/src/ai/accounting/admission.integration.test.ts
3d0d0e1bf1f71135eb2698f5e37e88cb062cffef497e70df769e30dc4e969da4  apps/server/src/ai/accounting/admission.ts
abb2d66d5a9e82ff124cc7038a1dca46baa0ecaaa383ad3b78ca7def3d1893fa  apps/server/src/ai/accounting/AGENTS.md
b97775645cc3ac582ee21b02f0a6c29559049ba423b0bc9c71c2de3e43699a19  apps/server/src/ai/accounting/attempt-responses.ts
cf198d073987ce3ceedf5d82b0ecb3314dca62301ada6288cbf74c8f418281f5  apps/server/src/ai/accounting/finalizer-window.integration.test.ts
0ad0ff38fb48de33d7df48cab3d601c75c1a01a6e1435e6589110fac28f1cf77  apps/server/src/ai/accounting/operator-args.ts
62966a4096d673c80b3f1570517b5e9f0e56fa3defd9e2c1821146a1f36ad987  apps/server/src/ai/accounting/operator-commands.ts
c27db5ba3a17de9245acdd2a216cdc94378268670bc0ba335146e487c52a92a9  apps/server/src/ai/accounting/operator-store.ts
b4b0a18d6a0c04b539449ca0a3c40372b074a35de5df733b2bcf3d5d825e702e  apps/server/src/ai/accounting/operator.integration.test.ts
64f6aaeec67da9a5dc9cef4a7584a69b60d7b8a085b2922b0775198876022cbc  apps/server/src/ai/accounting/postgres-budget-store.ts
a6fe4df56338cb667a58d78548524b196adb15e8849d49e88894b4c176b4c5ee  apps/server/src/ai/accounting/request-journal.integration.test.ts
751b092aaddfc170b318d94cc067db00621c5f0edca0150419b4b9d1616732e1  apps/server/src/ai/accounting/request-journal.ts
39b227be288372166d4dc8af40dd61b0d1d68e152a9b1cbd7341faa90371560a  apps/server/src/ai/accounting/settlement.integration.test.ts
4a0a9b3c777656b2ad1107f3f282d6b05edcec05cf3c33858ec30785673ebf58  apps/server/src/ai/accounting/settlement.ts
c0705fd4acf3f3467ff5b1f42347ddfc17c3100ddefbaf2d0464d483354638bd  apps/server/src/ai/accounting/spend.ts
81e7ed47ffe1b74636c212c67f79ba0663f5afe2a46d9466b92c2012c7efde6c  apps/server/src/ai/accounting/stop-diagnostics.ts
c1875966bc50708c5c92e0f6a10ca0f9f30665c81a84f41bd7901c7550c95ee4  apps/server/src/ai/accounting/stop-scope.integration.test.ts
efdde7bd1eb5167ca482fa8cc99d19fac0ceffe9780d4280eec4b307e5e3c947  apps/server/src/ai/accounting/stop-scope.ts
e1860d00457e1388640ac6678f0620886777cc91afb3c548373daec2d2680941  apps/server/src/ai/accounting/suspect-records.integration.test.ts
fa9f967b8a461f9a05717127dc107f351e261b88e3f3afc783156e929ab3f64e  apps/server/src/ai/accounting/transaction-bounds.integration.test.ts
b87b3204544d494c8180aded00beb6b17139d0007911080c0fbfd5dd4890f3f3  apps/server/src/ai/accounting/types.ts
fe64cfd4213e7e22ad49baf90d8c890b6fae1f0e03aeaffdf1bb9cd325d8ff45  apps/server/src/ai/admitted-provider-holds.test.ts
6a4c4b0f7336025d810abc4c2c8f586f0e9fed1cf2d6ccad82fa8b4a845ff350  apps/server/src/ai/admitted-provider.test.ts
52e3929433861299a2922df896f518ca98b80eb64e8449e9922a7cd5d997959c  apps/server/src/ai/admitted-provider.ts
6205b653c7c44e3a4e6a94312d50cf1a2465b7a819b57baf913db1718132c465  apps/server/src/ai/ai-traces.integration.test.ts
ef0fa0f991ef24162a51d9884f2b1b1dd98e49f0811578b724e473348b12d5d8  apps/server/src/ai/anthropic-provider.test.ts
63a3baf37bb7322c54569de0db64e1a2a44380f83aef5d2a2ae9c974e9282c3f  apps/server/src/ai/anthropic-provider.ts
478bd8ef2cbf249441bd679e8207747ef9f6f4167bf58bbcfec9a693202ca9ba  apps/server/src/ai/catalog.test.ts
b0afdd972d32e8b036db5deb7fda8dceda494698159545b6884e0c284cd72c52  apps/server/src/ai/catalog.ts
e9ae680c6b99c04348475178a002a93bd5883a8c3749c3b0109be8a38a18bdc4  apps/server/src/ai/composition.test.ts
123a1d7476c6e33a4aa7c8d6116ea781e9f8bf0ae733dc48a5bd4c7b40c8c6af  apps/server/src/ai/composition.ts
7378081aba1a15befb07e19290cf74b359bb11949d065b7374369f5f881282c1  apps/server/src/ai/diagnostics.ts
57262050e80df5532b1b04e0e5f009bef0b0d834ca6cd805fe906388a8ee3794  apps/server/src/ai/gateway.test.ts
8fb84103e8c0262c0135ea11b062324174f954a3aa63e8df3425cdaf12ae61ed  apps/server/src/ai/gateway.ts
a769d65aa736aa670098459a32f622c2674178776d83e3df4578ab8143bc3ff1  apps/server/src/ai/journal.integration.test.ts
1ee4fa22f131a813224eda5cd6fd248ff157a963025846105bbd6d9f076d4db9  apps/server/src/ai/journal.ts
704ffe2d6ec81bf17aca6cbc881c407fac4d0e5f730cb45a8d1c6f1898616b6d  apps/server/src/ai/live-ai.test.ts
1e4e255f36d087e7acc9c059dfd80377c2ca4eb021a7b7eab167394437912696  apps/server/src/ai/openai-compatible-provider.ts
baab3132a37355b6560e25932fdb4daa4287bc62444973701b1bc5da2ab737f0  apps/server/src/ai/postgres-trace-store.ts
c47dc1487c3e8422b459adc6d0fcfec2aaa231d839eb73fe0135a5a8376dff54  apps/server/src/ai/pricing.ts
8f3bca66a8e55870706b261a38200c0e5b2b71f8b353b2fd6b50799ef6ebef31  apps/server/src/ai/raw-adapter-hardening.test.ts
fa9012f451261a44f02c295c2d482b72fabc0430cce25085a5ec6c5d80cd142f  apps/server/src/ai/raw-adapters.test.ts
dfe75e51784549556e7aa9ec53ec04207f508e4dc1e9dc1ca9083d1eb3c5f769  apps/server/src/ai/raw-provider.ts
065d5b4f7e86c1553e6675b9136a25ff2e724974c51d6caaf66cc4af128fc3b6  apps/server/src/chronicle/chronicle.integration.test.ts
b0c1ae6fe7264f46f1e0ecf8f483b2cb8a7621ce969954ab23c3f1686fd394bd  apps/server/src/http/app.ts
4b4c8d7c3de9870d5e4a2631815e51547ee82f39da64da1bf152f9d40a596725  apps/server/src/http/no-start.test.ts
6b153e41243382cf5b615daa3328439a761e1297e19bba82e7cab3ac9ffd9137  apps/server/src/http/npc-session.test.ts
a54a889de128960c4b088d9f46ab2e744f14e31d453c90ef1e07a6d1c90952d7  apps/server/src/http/routes/ai-routes.ts
c8e40e807d383f2f92618227cea6265eafc25e6858ba7a8073e712ec300d7415  apps/server/src/http/routes/chronicle-routes.ts
4bf1f97ae9cac2fbc4dc5dd4b6e16ca295dedef84f422ab34dbb62d674df791e  apps/server/src/http/routes/npc-routes.ts
972dbd25fc195436726b967e3561099da56fdc873b9e5baaa28a2bbbb23b71e4  apps/server/src/main.ts
b8ca9236122398fdf3c8503de5acce0afa1db6de269f800a1469875c7b7ebe97  apps/server/src/platform/config/config.test.ts
effe46569aa40bad0ba4419edcec688bf1c449b56937eed060f23277452af365  apps/server/src/platform/config/config.ts
f8b15ac643d80073a92731c9b8f36ca2d714d3467a9cdd5a50551fbda5c70e4c  apps/server/src/testing/accounting.ts
c62bd3bd8fceed2e0e70651fda103624c987583bfd1250b7d5e1cc65e487b459  apps/server/src/testing/catalog-fixtures.ts
d38fb5b5d115a429ce40d024f28ee6f50aa4a03119689b88593e0375c3e66d95  apps/server/src/testing/eval/eval-runners.ts
6e4d8ff80fcc85448b1477113334d32c31141ca3ad1b486828cbb5b0183d19ce  apps/server/src/testing/fake-budget-store.ts
70c9534c1b950429022c57897825947618246058d0fa38193da5054204a70a5a  apps/server/src/testing/gateways.ts
531aebe88a97ca33805c8c91571f2a6e1dc4849d14e25603f10b2a68d98e2ae9  apps/server/src/testing/memory-journal.ts
39878a897603a19df8b79b0094539919473ecdf819aa06642808e737ed0ea108  apps/server/src/testing/ravenford-app.ts
f7d30480753fe49fe9246b4d36b54d98c6e075be857122c9f31b274908ba1cab  apps/server/src/testing/raw-adapter-fixtures.ts
a6f788f85901d77cc2a11b07228f6a4cac089169a9d9ab278e86794813f2908c  apps/server/src/testing/scenario/session.ts
bdd675121a5611285a7121870cdccab5e3df11e219732b8f24d1945b1b27393f  apps/server/src/testing/ui-server.ts
bf9093a62533e0b06267251c9f22498ddd4154d212d114b0e7de983f11fbbd9b  apps/server/src/world-engine/gate05-regressions.integration.test.ts
212fa82a12a82f29429183cc62bc29be59a5f80e39bb834ebccf4806b2d2b190  apps/web/src/authoring/use-authoring.ts
44c499c9ee04ac6c08f17f871cf485dfe9a259e993c68ff2c34256d22e6eb71d  docs/adr/0032-live-ai.md
455c9ba36766a3c85402842d00c7c997fb696af747cf1e2c8813a23358cadd10  docs/AI_CONTEXT_MAP.md
54f9a9940e9130dfff79a09c9cdcf2c4264d2d49d080a061101c189196889df4  docs/GATE_COVERAGE.md
d6e08ebc00fb1427b4d2d2b95d3064e3536d3eb3194dbb719d7ad14dd5e20392  docs/PROJECT_WORKFLOW.md
065452ec47dc95e7b2de35d6b1d9f9d9bf60df188af60e22a6c0fb4076f3c65a  packages/ai/AGENTS.md
06e6dfbc3683ba7a9c7c5221d0de94bb4c5fd4d7e9078656b0daf1d4817925e5  packages/ai/src/chronicle.test.ts
c5a4e56a0112eb5d3f2379cb6961a29b007c9a70056afb4d6aa0dde02cccb800  packages/ai/src/chronicle.ts
a8524f6b40e3e8b9f018c597eece54fd19b7b98648e30f00260b75799d185108  packages/ai/src/dialogue-isolation.test.ts
e363277118634e877573cc9e717efd3950988d68f168fbe177850c07146e3647  packages/ai/src/dialogue-prompt.ts
fe81a68e11255294a459d862c6fe5a278f9940df0bade277f2a1f4f4849ac287  packages/ai/src/dialogue.test.ts
a68b2e633b04ede42f949fd99b020b85c916c1927f3075f200efe36c20310a0c  packages/ai/src/dialogue.ts
9a221c5933f00ac5a30dfd88a21b3a0e50fc81b3b4f2eac56bbc4c7dc4d10e51  packages/ai/src/fallback-answer.ts
013ad5c0a4ba01e8650e04f1d6dadd2b4966f2f89d6d14bf5b2dcf86ecfa3c3d  packages/ai/src/fallback-callbacks.test.ts
b897ab1a3834e5f31b28aeca48583d2d0a0a998fdfdef2a27de7aeb14bfdff1d  packages/ai/src/fallback-cancellation.test.ts
a414c8db03ee400ee384884b8713b8515c84504ff3ba9b6b7f5329606f5bef9e  packages/ai/src/fallback-deadline.test.ts
9c01eac6a1149a2edfe4b8f9ae836ac6ee5aabf5981984176344b15fea4c4815  packages/ai/src/fallback-nonresponse.test.ts
d7b7884241f7cecab0b3cdc7521a0e221466fdc840ba7d4d1de86e13250f4b3c  packages/ai/src/fallback-rejection.test.ts
00baba77b14a23dcd9a6669413ce24c4190ec2c3d61e45d6fb7cba6e58625c1d  packages/ai/src/fallback-start-hook.test.ts
908de7f80cc72665e98ddac8ebb581a6957cc0c3ce45b77e8535d2a3a16de205  packages/ai/src/fallback.test.ts
08b3423abe33db963f0407f308dc64d0de5d39b1233a6cda67d35286c69214af  packages/ai/src/fallback.ts
70f22597389c3a747391fe0de96846da3b1f9bfffd2a419e03c5efb0162d57da  packages/ai/src/index.ts
b8b7d8566f32a384b6a9bc77e10d313bc2338d049a3bcdb5fcbea01708003ef6  packages/ai/src/intent-envelope.test.ts
66c23d838c3050bfcbcc3e1d2fbf08b36aa31cddeecaef919c7df0e44ed09998  packages/ai/src/intent.test.ts
080728925fbf8ecf18d131c6c12ac06e377f69a05f33d711704cd77446d18649  packages/ai/src/intent.ts
76d5d61755062da21d1bfd623712b93def1b8cd86ffd18603d00c5a29912ab21  packages/ai/src/prompt.ts
a4f0f537ef648c5dc9abf9c4828327de570e6fa2a96be3d6b1139699159e753a  packages/ai/src/providers.ts
ed691fba6266d1ed50d89f8fd91496df5abeb55acf0c0cc079b136c794a1a2dd  packages/ai/src/relevance-prompt.ts
ae60eb31814385538275cf610c34573033d87660f875314950fe768819b8405d  packages/ai/src/relevance.test.ts
abf58c4a6a7e628806cffcd6c2ff5d7b90540319ccec7feb843c08358f3db01f  packages/ai/src/relevance.ts
66c44ec5a02f878ae0d1273bd7e442955421b0b68143d8c63e957c1cf6a6ea9a  packages/ai/src/request-deadline.ts
b19841d2491461dc1e94a14b0571eec736931c27e257e34851e37d76cf82821c  packages/ai/src/request-lifecycle.test.ts
fe49551e653ab22eddffe0fa154f6bec7ba6da400c67fa1457df61d7218d63b6  packages/ai/src/request.ts
fdaeec7969c04c9b1fe909794c953eebc108899f413b22af476dd55d51e879d9  packages/ai/src/testing/capabilities.ts
4ad16d8c0dc1039e73beaeb260a935cd4e43f8159632b08e28cadec861f01d60  packages/ai/src/testing/journal.ts
6eeb69ee551b37756a8cacb1bacc8bcb6f18c8a90653947644643de278a91ddb  packages/ai/src/testing/providers.ts
a60f01bacdeb47e8abd34c9264740465bd9bbdcb78b29ad2120856925d83a86f  packages/ai/src/traces.ts
8d5fdd19953fe48dc6b57796c8c57427b048837eeec6fdd461a7cbc97ac68f43  packages/contracts/src/ai-gateway/accounting.ts
270f5ed243ec73d4e903833b5bce7e685e665a025336a06b77a9fc6feb2db80d  packages/contracts/src/ai-gateway/intents.ts
ea727f8789587cfab1eb5b3e40e313617f9263eb2a98adbabe45bc57f045fd0d  packages/contracts/src/index.ts
53a7091f173bf0c75c3454f8d3217a14d1c7b7ee2f0b5cf370c23b5553659fd2  packages/contracts/src/npc/dialogue.ts
ce9e7607add1561ea39df8a438af1ed293fa882c8c9614ef1675b9becf5f2fa1  tests/architecture/raw-adapter-imports.test.ts
```

## Required Output

Return a separate report for each exact output path above, using the review mission and PASS/FAIL
evidence. Preserve earlier reports and requests. Reviewers do not modify implementation or inspect
their peer's current verdict; the orchestrator may save returned reports and receipts. End with PASS
or FAIL and STOP. Neither approval alone advances dependent work (checkpoint C).
