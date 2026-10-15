# Independent Checkpoint Handoff Request — Stage 300 remediation checkpoint C

- Gate: Stage 300 remediation checkpoint C (L-N1 and the clock-based cancellation note, the verified
  Sonnet 5.5 catalog entry, Sonnet 5.5 request compatibility and per-capability effort, evaluation
  integrity, client feedback, records including the Q5 product disposition)
- Review type: RETEST (repair 1)
- Completed stage: Stage 300 (remediation in progress; checkpoints A, B1 and B2 accepted)
- Revision/commit: base HEAD `e288678f69cc154261cbfed3112382836ccfac5f` (branch `stage-300-live-ai`,
  B2 accepted and committed) plus the uncommitted working tree listed below (no commit, no push)
- Prior report / remediation / retest number: repair 1 of the initial C artifact (dirty listing
  SHA256 `16e5de18d5562bf9b56159bad63ab7f7752c6cb9906cd3e49620e650284dd311`, 67 files); see
  "Repair 1" below
- Required output paths (separate, independent reports on this same artifact):
  - `reviews/STAGE_300_CHECKPOINT_C_OPUS_XHIGH_REVIEW.md` (claude-opus-5-5 / xhigh)
  - `reviews/STAGE_300_CHECKPOINT_C_OPUS_MAX_REVIEW.md` (claude-opus-5-5 / max)
- Requested reviewers: two fresh, independent Claude Opus 5.5 sessions, one xhigh and one max
  (owner decision 3, `reviews/STAGE_300_OWNER_DECISIONS_3_2026-10-11.json`), independent of each
  other and of this implementation session
- Accepted architecture artifacts (byte-identical in the working tree, rechecked after the last edit):
  - `docs/STAGE_300_REMEDIATION_DESIGN.md`, SHA256
    `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2` (draft 7)
  - `docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md`, SHA256
    `6bba003055bfd53ac4e069d01d5bf6e3a5a6e272fddb41a2f8305b55e153b485`
- Accepted base: A (`reviews/STAGE_300_CHECKPOINT_A_ACCEPTED_MANIFEST_2026-10-11.json`), B1
  (`reviews/STAGE_300_CHECKPOINT_B1_ACCEPTANCE_2026-10-11.json`), B2
  (`reviews/STAGE_300_CHECKPOINT_B2_ACCEPTANCE_2026-10-12.json`: `carriedIntoC`,
  `ownerApprovedDeferrals`, `liveUsePrerequisites`) and the B2 handoff's "Deferred to checkpoint C".
- Owner authorization: `reviews/STAGE_300_OWNER_DECISIONS_5_2026-10-12.json` (checkpoint C and the
  Sonnet 5.5 catalog verification authorized; live evaluation runs and paid calls not authorized)
  and `reviews/STAGE_300_OWNER_DECISIONS_6_2026-10-12.json` (SHA256
  `80dcf4e73cd169dfc3fa60779c7c06862cb9c52bf38c5aff7a8eec096ca569c3`; operator ceilings to record
  after acceptance, runtime relevance without a paid model, null usage labels read as defaults;
  orchestrator record, not edited here).
- Catalog verification record (orchestrator, not edited here):
  `reviews/STAGE_300_CATALOG_VERIFICATION_CLAUDE_SONNET_5_5_2026-10-12.md`, SHA256
  `5c26853b5d12fd31f3cb4160ac26aafd12767e7d9864569d660e8570f35fc416`; owner decisions 5 SHA256
  `fe9639b012ac7b60b3e1cd352603f4b2f8153cb0c213a33ce45998883f169e9d`.
- Implementation session: Claude Code CLI, model `claude-opus-5-5` (the actual model of this
  session); initial artifact at effort medium, repair 1 at effort xhigh, as configured by the
  launcher (not independently observable from inside the session).
- Dirty-file manifest (repair 1): 82 files (below, including the three orchestrator records
  above); SHA256 of the `shasum -a 256` listing:
  `7f4c4eb41ae365751990501fdab5464dd0006f07e403d194e476a46e003108dc`. This handoff file is not in
  the manifest. Superseded initial manifest: `16e5de18…d311` (67 files).
- Status: AWAITING_INDEPENDENT_ACCEPTANCE (Opus 5.5 xhigh and Opus 5.5 max). No verdict is
  recorded here.

## Review Objective

Determine whether this exact artifact implements checkpoint C of the approved design draft 7 (with
the B2 stop-scope delta unchanged) without weakening any fail-closed contract: the only verified
catalog entry matches the verification record exactly and fails closed on every usage, label, model
and request value outside it; a Sonnet route sends nothing without its key, a stored approval, the
accounting store and an eligible session, and no test environment can reach the network; Sonnet 5.5
requests are valid and bounded; live evaluation cannot run, mint a binding or set a ceiling outside
an existing approval and an operator-registered run bound to the evaluation campaign, and records
the evaluation session class; oracles reject the listed wrong answers; reports keep semantic
correctness, safe decline, technical success and quality apart and claim no live result; the client
never promises a trace or reply that will not come and never sends a null source; the records
(ADR 0032 C amendment with Q5, gate coverage, context map, AGENTS, corrected report section) are
accurate.

## Requirements (neutral)

1. L-N1: `transaction-bounds.integration.test.ts` releases its holder client in `finally`, so an
   earlier failure surfaces instead of hanging; `packages/ai/AGENTS.md` states the clock-based
   cancellation rule (signal **or** monotonic deadline).
2. `VERIFIED_CATALOG` holds exactly one entry, from the record: canonical model, alias and response
   model `claude-sonnet-5-5`; pricing version `anthropic-claude-sonnet-5-5-2026-10-12`; rates; no
   tiers; limits; usage dimensions and labels (`service_tier` `standard`, `inference_geo` `global`,
   server-tool counts zero or absent); a request allowlist matching the adapter's actual body;
   `verification.source` naming the record. The record's non-schema fields handled as it describes
   if expressible within the approved design, else fail closed. Tests: entry validation, the
   record's reservation example, rejection of other tiers/geographies, nonzero server tools,
   unknown fields and a wrong response model; zero outbound requests and no key reveal without an
   approval, without an eligible session and in every test environment.
3. Sonnet 5.5 request compatibility (no forced tool choice, no disabled thinking, no sampling
   parameters, no prefill), explicit per-capability effort and adequate `max_tokens`, rationale in
   ADR 0032 as an initial setting, `.env.example` consistent.
4. Design §4 evaluation integrity, offline only with fake providers; the blind comparison recorded
   as waived, with no blind artifact.
5. Design §2 client feedback: null trace IDs narrowed, missing traces never a broken link or
   promise, replying/failure messages in English and Russian in the affected UI files only, browser
   journeys.
6. Records: Q5 disposition and C amendments in ADR 0032, `docs/GATE_COVERAGE.md`,
   `docs/AI_CONTEXT_MAP.md`, local `AGENTS.md`, a corrected Stage 300 report section separating the
   structural historical baseline from the remediated offline evidence.

## Repair 1 (2026-10-12)

Bounded repair of the same artifact; the design documents, the catalog verification record and the
owner decision files are unchanged. Each behavioral change was preceded by a failing regression or
negative control (run and seen failing before the fix). The "C delta by file" section below
describes the initial artifact; where this section differs, this section applies.

- **R1 — exact intent oracles.** `apps/server/src/testing/eval/intent-cases.ts` (new; the intent
  cases moved out of `cases.ts`): a proposal is correct only when it is exactly the asked command
  list — number, types, targets, values, knowledge scope; any further command or unrequested
  optional field is wrong. The guard's account must be the new guard's own TESTIMONY, attributed to
  it, about allowed subjects, and say the caravan left (lexical, labelled). The injection accepts
  only the requested fact word for word as world truth about the guild (a paraphrase, including a
  paraphrased planted secret, is wrong). Negative controls: `intent-oracles.test.ts` (new; 17 of
  its controls failed against the previous oracles), including the fishmonger with a death, a move
  or a PUBLIC fact, an unrelated or non-leaving account, other scopes, authors, subjects and types.
- **R2 — Chronicle verdict for the model only.** `oracles.ts` `chronicleModelVerdict`; the runner
  reports authorship (model, model rejected with the template committed, template, local) and each
  rejected model answer's validation causes (wrong citation, missing hedge, no citation, ID in
  prose, schema or malformed codes). Template and local chapters are never a model pass. Unit tests
  in `oracles.test.ts`; run-level reachability in `eval-live.integration.test.ts` (a fake Sonnet
  answering with wrong citations or without hedges yields a model failure, the template committed
  and the counted causes).
- **R3 — measured estimate from known charges.** `eval-world.ts` (`measuredMicros`: the sum of a
  request's terminal settled/reconciled charges; null when nothing was dispatched or any attempt is
  held), `eval-report.ts` `usageSamples`, `session-estimate.ts`. Assumed input ranges count every
  billed input class, and the high end prices each token at the highest input rate. Regressions:
  `eval-report.test.ts` (new; 200 input + 3,000 five-minute cache-write + 800 output tokens give a
  15,900 µ$ sample; a denied attempt and a held attempt give none), `session-estimate.test.ts`, and
  the integration run (measured intent basis $0.079500 for 5 intents).
- **R4 — null usage labels (owner decisions 6, `nullUsageLabels`).** Behavior unchanged and now
  tested explicitly (`catalog-sonnet-5-5.test.ts`: null `service_tier`, `inference_geo` and `speed`
  price as known; explicit other values stay unverified). Cited in ADR 0032.
- **R5 — runtime relevance without a paid model (owner decisions 6, `relevanceRoute`).**
  `.env.example` route example without `fast-context`; `gateway-verified.test.ts` reads it and pins
  the startup route report (relevance with no provider and no refusal); `live-ai.test.ts` updated to
  the new example. The session estimate prices the 100 rankings at $0 for the runtime configuration
  ($0.317 to $2.045, up to $4.090 at twice the high end) and shows a Sonnet-relevance alternative
  apart ($0.250 to $1.350). A live evaluation measures relevance only when `fast-context` is named
  (`eval-run.ts`, `eval-args.ts`). The design's explicit remote ranker remains possible.
- **R6 — Gate 04 replay.** `cases.ts` (all five Gate 04 lines in Russian, the five intents including
  insight and showing the party's evidence, the four attitude/disclosure scenarios; each intent
  paired with a line rotated per scenario: 23 cases per NPC, 69 per run) and `dialogue-runner.ts`
  (new): after each request the runner rebuilds the NPC context with the route's own domain
  functions on the same snapshot and checks the exact provider input against it — by ID (recorded
  sources equal the builder's; no boundary or source ID sent) and lexically by phrase (no planted
  secret, other NPC's fact or still-locked guarded content, the player's words excepted; the
  builder's `sayableBy` content present). `oracles.ts` `dialogueIsolation`; tests in
  `oracles.test.ts`. A paraphrased secret is not caught by any phrase scan; the documentation
  (`docs/GATE_COVERAGE.md`, ADR 0032) now says exactly this.
- **R7 — request shape below the top level.** `apps/server/src/ai/request-shape.ts` (new), called by
  `pricing.ts` before any reservation: Anthropic one user message with string content (no assistant
  turn or prefill), exactly the one client tool the request names (no server or typed tool), no
  `cache_control` but the single `{type: "ephemeral"}` breakpoint on the one system text block where
  the entry permits caching; OpenAI-compatible one system and one user message, one function tool of
  that name, no cache directive. `pricing-shape.test.ts` (new; 18 controls failed before the fix).
- **R8 — trap proof.** `tests/architecture/no-network*.test.ts` recognize the trap by its registry
  symbol and no longer import the setup file; with `setupFiles` removed from `vitest.config.ts`
  (temporarily) both fail, and pass with it. The setup file's unused export is removed.
- **R9 — deterministic stalled-finalizer test.** `journal.integration.test.ts`: a 3 s relevance
  budget and an asserted dispatch, so admission always finishes before the deadline; it still
  proves the return at the deadline (elapsed between budget − 100 ms and budget + 1 s, without
  waiting for the 1.5 s stalled write), the pending trace and open hold, and the later recorded
  trace.
- **R10.** `eval-live.ts`: preflight database reads are injectable and every failed read is the
  fixed refusal `DATABASE_UNAVAILABLE` (its own approval read; `approvalExists` answered false on a
  failure), with the pool closed (`eval-live.test.ts`, new); the documented refusal order now lists
  `ROUTE_REFUSED` where it is checked (before any connection, and again at composition). Chronicle
  writer: `apps/web/src/chronicle/chapter-message.ts` (new, with its test) tells an unavailable
  narrator apart from text that failed the chronicle's checks, in English and Russian
  (`ru-play.ts`).
- **Records.** ADR 0032 (C amendment corrected in place for the refusal order, null labels, oracles
  and replay; new "C repair 1" subsection with owner decisions 6, including the operator ceilings
  to be recorded after acceptance), `docs/GATE_COVERAGE.md` (replay claim corrected; request shape;
  runtime relevance), `docs/AI_CONTEXT_MAP.md`, `apps/server/AGENTS.md`, `apps/web/AGENTS.md`,
  `tests/AGENTS.md`, the corrected Stage 300 report section (estimate, capacity, pending items) and
  `.env.example`. A new offline evidence run:
  `reports/evidence/stage-300-offline/offline-2026-10-12T05-12-17.938Z-ec62c20f/`; the initial run
  directory is kept unchanged.

## C delta by file

Deliverable 1 — L-N1 and the cancellation note

- `apps/server/src/ai/accounting/transaction-bounds.integration.test.ts`: the holder client is
  released exactly once, in `finally` as well (L-N1). Test hygiene only; no failing regression was
  written for a hang (the defect was the hang itself); the file passes in both full validations.
- `packages/ai/AGENTS.md`: the outcome bullet now states the B2 repair-1 rule (signal aborted or
  `performance.now()` at the deadline; nothing admitted, dispatched or invoked afterwards).

Deliverable 2 — the verified entry and fail-closed usage

- `apps/server/src/ai/catalog-sonnet-5-5.ts` (new): the entry. The 1-hour cache-write rate is
  deliberately unpriced (the adapter only sends a 5-minute breakpoint), so the reservation equals
  the record's example and any 1-hour write, or a cache-write total without its split, is
  unverified billing. Request size limit 32,000,000 bytes.
- `apps/server/src/ai/catalog.ts`: `VERIFIED_CATALOG = verifiedCatalog([CLAUDE_SONNET_5_5])`; comment.
- `apps/server/src/ai/usage-facts.ts`: the usage spec can express null-only labels (empty set),
  zero-only nested counts (recorded as label `'0'`) and one iteration array (every entry of one
  type, only known counts, sums equal to the restated top-level counts, input and output always
  restated; recorded as a label).
- `apps/server/src/ai/anthropic-provider.ts`: `ANTHROPIC_USAGE` adds `output_tokens_details.
thinking_tokens`, labels `inference_geo` (`global`), `speed` (`standard`), `fallback_credit`
  (null only), zero-only `server_tool_use` counts and `iterations` (`message`). Each catalog entry
  still accepts only the labels it lists.
- `apps/server/src/ai/pricing.ts`: Anthropic thinking tokens above `output_tokens` are inconsistent.
- `apps/server/src/testing/catalog-fixtures.ts`: the fixture entry allows `output_config` with
  `low`/`medium` only (needed now that every Anthropic body carries an effort); comment.
- Tests: `catalog-sonnet-5-5.test.ts` (new), `gateway-verified.test.ts` (new, production catalog:
  refusals for no approval, unstored approval, no store, no key; no eligible session; admitted
  dispatch with the verified price and reservation), `catalog.test.ts`, `gateway.test.ts` (the
  unverified-model refusal now uses Opus 5.5 and DeepSeek, which have no entry), `raw-adapters.test.ts`
  and `admitted-provider-holds.test.ts` (unknown-field rows now use a field that stays unknown and a
  nonzero server-tool count), `admitted-provider.test.ts` (option-value and unpriced-field rows).
- `tests/setup/no-network.ts` (new) and `vitest.config.ts`: every Vitest project replaces the global
  `fetch` with a trap; any call fails the calling test in `afterEach`.
  `tests/architecture/no-network.test.ts` and `no-network.integration.test.ts` (new) prove it is
  active in both projects.

Deliverable 3 — request settings

- `apps/server/src/ai/request-settings.ts` (new): relevance `low`/2,048, NPC dialogue `low`/4,096,
  DM intent `medium`/8,192, Chronicle `medium`/12,288 (trusted code, not configuration).
- `apps/server/src/ai/gateway.ts`: Anthropic adapters get the capability's effort and `max_tokens`
  (clamped to the entry); comment. DeepSeek unchanged.
- `apps/server/src/ai/journal.integration.test.ts`: the relevance hold expectation follows the new
  `max_tokens` (286,080 µ$ at fixture prices); a flaky `/a1/` assertion that also matched random UUID
  hex now matches quoted values.
- `.env.example`: the verified entry, the session requirement, the hold size and where effort lives.

Deliverable 4 — evaluation integrity (`apps/server/src/testing/eval/`)

- `apps/server/src/ai/journal.ts`: `SessionBinding` (`play` or `evaluation` with a run ID) and
  `accountingSession`; `PostgresAiJournal` takes a binding (default play). A request begun without a
  session stays local only in both. `journal-session.test.ts` (new).
- `eval-args.ts` (new): `--offline` or `--live --approval <id> --run <id> [--model]`; no ceiling
  argument; anything unrecognized refuses.
- `eval-live.ts` (new): preflight refusals in order (unverified model, no database configured, no
  key, database unreachable, approval not stored, run not registered, run bound to another approval
  or campaign, route refused) before any provider or key; the live gateway over the PostgreSQL
  journal (evaluation binding) and budget store with the verified catalog and one remote per
  capability.
- `eval-world.ts` (new): offline and live worlds, recorded provider request bodies (never headers),
  end-to-end timing, trace and accounting observation.
- `cases.ts`: exact intent oracles with proposal/decline expectations; a closing-quote injection.
- `oracles.ts` (new): intent verdicts (correct proposal, safe decline, wrong proposal, no answer),
  `guardedBy` plus `neverSaid` lexical scan, input isolation on exact bodies, Chronicle citation /
  hedge / coverage, relevance action-set / fallback / status / deadline contract.
- `eval-runners.ts`: rows with separated semantic, technical, lexical and isolation results,
  end-to-end and attempt latency, accounting.
- `eval-report.ts`, `session-estimate.ts`, `eval-manifest.ts` (new); `eval-run.ts`, `eval-cli.ts`,
  `eval-output.ts` (live evidence root) updated.
- Tests: `oracles.test.ts`, `session-estimate.test.ts` (new), `eval-run.test.ts` (rewritten),
  `eval-live.integration.test.ts` (new: throwaway database with test-fixture operator records and a
  fake Sonnet transport).
- `.prettierignore`: the generated evaluation evidence roots are excluded so their bytes stay exact.
- `reports/evidence/stage-300-offline/offline-2026-10-11T22-56-32.823Z-97a2af6a/` (new): one offline
  run of the deterministic local providers (not a live measurement).

Deliverable 5 — client feedback

- `apps/web/src/exploration/use-action.ts`: talking says "Waiting for a reply…".
- `apps/web/src/dm/perform-npc.tsx`: "{npc} is replying…" while waiting; a reply for a changed
  listener (or after unmount) is discarded and its request aborted; the DM's line stays.
- `apps/web/src/chronicle/chronicle-panel.tsx`: "Writing the chapter…"; without the narrator,
  "Chapter written as the plain record: the narrator was unavailable."
- `apps/web/src/authoring/use-authoring.ts`: an unavailable assistant (including a null trace ID)
  is told apart from a declined request; a null source is still never sent.
- `apps/web/src/i18n/ru.ts`, `ru-play.ts`: Russian entries.
- `apps/server/src/testing/ui-server.ts`: campaign `ui-ai-no-start` gets no durable request start;
  `apps/server/src/testing/ui-authoring-campaigns.ts`: a second character (Bram Holt) in
  `ui-ai-feedback`; `tests/e2e/fixtures/dm-tool-campaigns.json`: both campaigns.
- `tests/e2e/ai-feedback.spec.ts` (new). `tests/e2e/dm-tools.spec.ts`, `language-ru.spec.ts`: the
  browser-test server has no narrator, so the chapter message is now the plain-record one.
- The client has no trace view: the only trace consumer is authoring (narrowed at B2).

Deliverable 6 — records

- `docs/adr/0032-live-ai.md`: appended amendment of 2026-10-12 (entry, non-schema fields, request
  settings, eligibility, evaluation, client feedback, **Q5 product disposition**, not changed).
- `docs/GATE_COVERAGE.md`, `docs/AI_CONTEXT_MAP.md`, `apps/server/AGENTS.md`, `apps/web/AGENTS.md`,
  `tests/AGENTS.md`, `tests/e2e/AGENTS.md`.
- `reports/STAGE_300_COMPLETION.md`: appended "Remediation checkpoint C — corrected report section".
- Not changed: `docs/PROJECT_WORKFLOW.md` (checkpoint status is recorded at acceptance), the two
  design documents, the two orchestrator records, historical reviews, reports and evidence.

## Surfaces Available to Reviewer

- API/routes: `POST /campaigns/:id/ai/intents`, `POST …/npcs/:npcId/dialogue`, `POST …/chronicle`,
  `GET …/entities/:id/context?ranking=ai`, `GET …/ai/accounting/:traceId` (unchanged routes).
- CLI/test harness: `pnpm eval:ai --offline`; `pnpm eval:ai --live …` exercised only through
  `eval-live.integration.test.ts` with a fake transport and a throwaway database.
- UI: the player talk notice, the DM "Perform" panel, the Chronicle writer, the authoring panel.
- Logs/traces: evaluation run directories (manifest, results, report).

## Start / Reproduce

```text
pnpm db:up                       # PostgreSQL in Docker at 127.0.0.1:54329 (never db:down)
pnpm validate                    # full offline validation
pnpm vitest run apps/server/src/ai/catalog-sonnet-5-5.test.ts apps/server/src/ai/gateway-verified.test.ts
pnpm vitest run apps/server/src/testing/eval
pnpm exec playwright test tests/e2e/ai-feedback.spec.ts
NODE_ENV=test pnpm eval:ai --offline --out /tmp/some-scratch-dir
```

## Test Personas / Scopes

Dev persona tokens `dev-dm-ravenford`, `dev-player-elowen`; campaigns `ravenford` (Russian seed in
evaluation), `ui-ai-feedback`, `ui-ai-no-start`; throwaway accounting databases with test-fixture
approval `eval-approval` and run `eval-run-c1` (not owner authorizations). No real key is used.

## Canonical Secret or Invariant Under Test

No outbound provider request and no key read without a stored approval, the accounting store, a
verified entry, the key and an eligible session; no test can reach the network; no ceiling from
configuration or arguments; Gate 04 planted markers and guarded content never in an NPC provider
request; AI output never canonical; no null trace ID used as an authoring source.

## Validation Already Run by Implementation Writer

Repair 1, on the final tree (before this handoff edit):

| Command                                                                                                                                                                                                                                                                                   | Result                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm validate` (format, lint, typecheck, context budget, unit, build, migrate, seed, integration, E2E)                                                                                                                                                                                   | PASS (exit 0): unit 208 files / 2,348 tests; integration 33 files / 182 tests; E2E 49 tests; 718 active files, 0 over target, 0 over hard limit |
| Failing-first regressions: `intent-oracles.test.ts`, `session-estimate.test.ts`, `eval-report.test.ts`, Chronicle model-verdict and dialogue-isolation tests in `oracles.test.ts`, `pricing-shape.test.ts`, `eval-live.test.ts`, `chapter-message.test.ts`, the `.env.example` route test | each run and seen failing before its fix; PASS after                                                                                            |
| Negative control: `tests/architecture/no-network*.test.ts` with `setupFiles` removed from `vitest.config.ts` (temporary, restored)                                                                                                                                                        | FAIL as expected; PASS with it                                                                                                                  |
| `journal.integration.test.ts` in isolation, twice                                                                                                                                                                                                                                         | PASS                                                                                                                                            |
| `NODE_ENV=test pnpm eval:ai --offline`                                                                                                                                                                                                                                                    | PASS; `offline-2026-10-12T05-12-17.938Z-ec62c20f`                                                                                               |

Initial artifact (superseded): `pnpm validate` PASS twice (unit 203 files / 2,271; integration 33
files / 179; E2E 49); negative control of the `perform-npc.tsx` late-reply guard (FAIL without it,
PASS with it). Observed once under full-suite load before the initial final runs (not reproduced
in isolation): `raw-adapter-hardening.test.ts` "bounds the attempt by the time left in the
request" (50 ms timing, unchanged by C); it passed in all later full runs.

## Known Limitations

- No live provider call and no live evaluation: every Sonnet 5.5 behavior (effort adequacy,
  latency, truncation rate, actual usage fields, whether API-key traffic carries the non-schema
  fields) is unmeasured. Owner decisions 5 do not authorize a live run.
- No operator records exist; the owner's ceilings (decisions 6) are to be recorded after acceptance.
- Each paid attempt holds $2.540960–$2.622880 (full context plus `max_tokens`); a post-dispatch
  timeout keeps its hold until reconciliation. Runtime relevance is deterministic (decisions 6);
  an explicitly configured remote ranker would hold about $2.52 per timed-out ranking.
- Null or absent `service_tier`, `inference_geo` and `speed` read as defaults (owner decisions 6).
- The iteration check compares only the counts the entries restate (always input and output).
- The guard's account is judged lexically (it must mention the caravan leaving); the injection
  oracle scores any rephrasing of the requested fact as wrong (false negatives possible).
- Dialogue isolation by phrase is lexical: a paraphrased secret is not caught by it; the ID-level
  source comparison bounds the input to the builder's context. NPC fidelity and voice are not
  judged by any oracle. The Gate 04 replay pairs intents and lines (69 requests), not the full
  5 × 5 × 4 cross product.
- The session estimate's token ranges are assumptions until a live run measures them.
- The approval's enabled state is checked by admission, not by the evaluation preflight (a disabled
  approval yields denied attempts, not a refused run).
- Effort settings are initial and need revisiting after live evaluation.

## Left for live evaluation (separately authorized)

Operator records within the owner's ceilings; then a registered run: Sonnet 5.5 latency per
capability (relevance only if explicitly selected, to inform revisiting decisions 6), truncation
and repair rates at the chosen efforts, actual usage fields and labels, measured session cost from
known charges, human NPC-voice and Chronicle quality review.

## Coverage Ledger

`docs/GATE_COVERAGE.md`, Stage 300 checkpoint C paragraph: per-capability effort and `max_tokens`
in every Anthropic body, the verified entry and its usage classification, the evaluation's Gate 04
replay and input-isolation checks (as corrected at repair 1), the request shape allowlist and the
runtime relevance configuration. Gate 06 remains the formal review of live providers; offline
tests do not certify live behavior.

## Dirty-File Manifest (SHA256)

Repair 1 manifest (82 files; listing SHA256 `7f4c4eb41ae365751990501fdab5464dd0006f07e403d194e476a46e003108dc`):

```text
5bb09b9e4e968469164515c9bbabad027ee246b084e81b34697c7facd0c16c8c  .env.example
4e69d04539027b9e7039bdb24c3cf957d520131c7d7834f31b7970c580f82b01  .prettierignore
da645bdf0e72663581e0d7fb698c28ac635088d413ff47ebb80c85d36ace0022  apps/server/AGENTS.md
f35a78a2728cf1f8065d0b6364f7039e5b8cf3bd8297414ce717e4e9eb6217a1  apps/server/src/ai/accounting/transaction-bounds.integration.test.ts
ebdf362112f691d5ac48b9cc7c03c68cd096b775c50859b8a2afa9f106c6398e  apps/server/src/ai/admitted-provider-holds.test.ts
a83ae88381cf6e1a6f9833c54deac0bd20b7d54fea9d6c6596efaee8a7ae002e  apps/server/src/ai/admitted-provider.test.ts
62cb139151d8ba2d5a8be4faaacf909fdd878ecc8374cfea06ebc5ad43a0cdca  apps/server/src/ai/anthropic-provider.ts
efce7d524adbe172083d43803c21e8be881c4fbbe6a81f7d16a812a1c5a9a7f9  apps/server/src/ai/catalog-sonnet-5-5.test.ts
efd07d5801dc9a921590330d668281bb89b8651368152129181ad31d801d6722  apps/server/src/ai/catalog-sonnet-5-5.ts
b42cbbff2c9297e80f6891fecf5b9b72122dd0b62135395efc8a75d09738eb17  apps/server/src/ai/catalog.test.ts
22fe8feac1ed9aaa4833ca3120b4a0588421c89a93b77e8d58ba4d9a99def544  apps/server/src/ai/catalog.ts
ac7df462236e518a31f045cd79967a81d76668a103df3a1a4fce5f5d9954a987  apps/server/src/ai/gateway-verified.test.ts
ba905fcbf221a2b1c901fdd9268bab8dd0899a70b3fc22bcdac0b249dcff4a89  apps/server/src/ai/gateway.test.ts
fb9c9fd412ae34a2ab6897bf2d8d83efc182952f205c6af9fed2039e724d72b3  apps/server/src/ai/gateway.ts
c0f0f5f1c1444c36b98262b568848db6388ca7aeb64dfababaa693e4dbd0a75f  apps/server/src/ai/journal-session.test.ts
f9cae8105da7da926d176dfbfb1210199db9573a159863f2a9819520af054649  apps/server/src/ai/journal.integration.test.ts
44c37a5a6bfbac745b792ea41217baad502fefd5315b038ee1fa7b20256749eb  apps/server/src/ai/journal.ts
32aa7fdd5def2be458f2d9e12e6c8d086b53be2bcf1c1b75159e1d12d9c570d8  apps/server/src/ai/live-ai.test.ts
cf7f35dfb94a30e6c31c1db5a09c5e5d0e5d2e613621b6bc5eb106226a1d18f7  apps/server/src/ai/pricing-shape.test.ts
242b8bb2853b4f4a245cc1ed384517f9b449a2a864228d15f59964c3713152cb  apps/server/src/ai/pricing.ts
617d25f7656d4df166f23af7d73d64e41d5b9aacfc85de31572846e79d2466a7  apps/server/src/ai/raw-adapters.test.ts
f645ba865ba03b231b76cda208566941f4ec9686d372257d1c39a116f10f6deb  apps/server/src/ai/request-settings.ts
4be1941ff0a2cd8481f742b3cb2197a9b9c32808f1748026eae5c7872beefe9e  apps/server/src/ai/request-shape.ts
024021c175ff831bb1f5f8f3d4012789defb74bc56cd863a3288eb38fb0a9d4c  apps/server/src/ai/usage-facts.ts
58226c58cfd455be56e3a27a62c5e790539f8d14ae3332550e4b83f5db4b250d  apps/server/src/testing/catalog-fixtures.ts
1453385430ae1e6853afe541d1ef69cd8b442fc2eaaada4c3c5eaddbae554763  apps/server/src/testing/eval/cases.ts
49948007b5a46518a7612fcccf4fdde211e7e01968645df34653175925b309a6  apps/server/src/testing/eval/dialogue-runner.ts
134510982c1cff6b438ea739a72ff308a881117d798368710287a6ca624f8b89  apps/server/src/testing/eval/eval-args.ts
f99e5e932e0051777bd37f3861bfb2fbb30166369e3e037576a25ff49321037e  apps/server/src/testing/eval/eval-cli.ts
8361105c960afc7f57d1916b99de64a8c64d8317a684e40fe4aa06329066fe64  apps/server/src/testing/eval/eval-live.integration.test.ts
3cec8d0e91ac5969b8b5afd33e9d312ea2cb41b7613e372ed5221dc4e2336470  apps/server/src/testing/eval/eval-live.test.ts
aea128ae1d846081cd8f32010f641eeba49231290aa675c277c368a65aa25d1d  apps/server/src/testing/eval/eval-live.ts
ae16100fabad60e80c725c7f76fd9c00494528adb7314c189a5af603ed9c42de  apps/server/src/testing/eval/eval-manifest.ts
c0df7e7506b67be1de30447b6a3b7a345355c4e258587a124574b3b9f2ead2a1  apps/server/src/testing/eval/eval-output.ts
ff85663062e7543fa167257a4cb7aa6b4e9d392274442c6bc394d9d3510866c3  apps/server/src/testing/eval/eval-report.test.ts
bad161e5a44c1cbf1914017848e8d672372c172bc01c9baf5c836a2e67895792  apps/server/src/testing/eval/eval-report.ts
68658207a2f3093c5c79ed237dba21ddf9bd62a131138aee60a57cf90bd0d785  apps/server/src/testing/eval/eval-rows.ts
fe59eed0e7273eac329b6715fb28259a4cbe9340a5110ae3a46953b98552c349  apps/server/src/testing/eval/eval-run.test.ts
c7b387e4548115c1900456ab3ac1a85a840573d8a78c386f740d05daf7c33580  apps/server/src/testing/eval/eval-run.ts
fd882b3bd9f7309ae85d3553cb6f5636ad9b53dd7676591ce1a8cb992bdc389c  apps/server/src/testing/eval/eval-runners.ts
f2bca092373d083a4135746a7f3027e9dac57a9275fa33914f071eefa95d2a75  apps/server/src/testing/eval/eval-world.ts
08f71dd449492d5a93440faafafc0b93672bf325cb2194b81d902c112fd82556  apps/server/src/testing/eval/intent-cases.ts
f851fa6b09f1c1b60a9f759e29dce228af890a732c4a66e0df64950de713a35d  apps/server/src/testing/eval/intent-oracles.test.ts
e0f6c1624f1fdd79bec4d17c5b3cd839a44c63b9515cf91066f870d40193caa5  apps/server/src/testing/eval/oracles.test.ts
35a9ac08c11bc90e047aae6aff22f40a44cc59ba8ee908c33a108d68094e6a2f  apps/server/src/testing/eval/oracles.ts
1f7ea608cc0080a374572e163af3212435366b50a823133adedb036e675a8ceb  apps/server/src/testing/eval/session-estimate.test.ts
722e7c6cbfcac6c1a17fde48aeb990d01703ccb3b7d6f847f9610a5bedf876ca  apps/server/src/testing/eval/session-estimate.ts
de6ceb5d382393a1e80ee20eab4617a6f0caa99263fada52dbba14b67a5ba573  apps/server/src/testing/ui-authoring-campaigns.ts
d8919046c96317d3e13c0dedc25234efe4effe9a4b786783e1feb3981b44dc95  apps/server/src/testing/ui-server.ts
16becb06bc82b834aa86850dd2ab90befb5bc402b5b85b509b3d36947d89b79e  apps/web/AGENTS.md
91cf5723c4c8ccadf715662c72e3bed7d4cec920583a56c0c8dfba424c98ad1e  apps/web/src/authoring/use-authoring.ts
2d7eb2ae3c9b2b3127b192f7902cb57aa51b842bef3b88c8371f2bb39e6a582a  apps/web/src/chronicle/chapter-message.test.ts
607cd737cda088c6fa4c78724e9c8e3b4198345154e2193b1f288416b329483b  apps/web/src/chronicle/chapter-message.ts
d1da3322ee990772efd79488151d5ab4e45a5b3719439376c016009bc84d621b  apps/web/src/chronicle/chronicle-panel.tsx
e27ce27ec09951bd7758645c7166de172683a02e705236ca329bbf23c0da7256  apps/web/src/dm/perform-npc.tsx
33fbd52bc505e262a98c1a09d1397e40f37884a0c726d4f98249feb1c2c7a0ee  apps/web/src/exploration/use-action.ts
7e986d7f15beb478becdcc130da7754255409dd3c7ea4590596e7a2e44dfe5b1  apps/web/src/i18n/ru-play.ts
a40d5dbf18d02032f40404e56abb1bca649775da0ad7988b235a062090f22988  apps/web/src/i18n/ru.ts
6009f7b49a8c4a9e204d9374755d795cc508b96c158b7d62c444ecab9421bf46  docs/AI_CONTEXT_MAP.md
17fe901a55934ef8555f24cd0c230f76ca5a861b68827c43777e8690d87c2026  docs/GATE_COVERAGE.md
0ed2feb83fa77d809bf0804476d3e8de4a6ed679f1491c9591cdc940309365d0  docs/adr/0032-live-ai.md
2511827f4462c079664b4ca2c11855b9707277107d1efc10578d051183ce8a08  packages/ai/AGENTS.md
d34bc45397b83ee81f346156ed458bd53a86ade3f07d1b40f85244346694f23e  reports/STAGE_300_COMPLETION.md
f0257d8f387a87893723cb77e0873ee25ed766afa9fe881b2934afab046db6b4  reports/evidence/stage-300-offline/offline-2026-10-11T22-56-32.823Z-97a2af6a/eval-report.md
87339211102353aeee150ae16ce1bbbab4f8890ac22374fe5a97879eb093dac4  reports/evidence/stage-300-offline/offline-2026-10-11T22-56-32.823Z-97a2af6a/eval-results.json
8697c72ddacdef7bfc7974e3b39c8993b5f92ac583b29ca2390e979f3e569403  reports/evidence/stage-300-offline/offline-2026-10-11T22-56-32.823Z-97a2af6a/manifest.json
da75437e3f5211b7d12839155b6a2579386782c1200557927cb9aa7dccc1939f  reports/evidence/stage-300-offline/offline-2026-10-12T05-12-17.938Z-ec62c20f/eval-report.md
e6112d777dd567e852b93a8f90d943385e935d15684fab578146ee7ee350c641  reports/evidence/stage-300-offline/offline-2026-10-12T05-12-17.938Z-ec62c20f/eval-results.json
a49649b61054c442bb0eb1c29edf88be1f0cbcb2e739b070278315cca3b9b5c6  reports/evidence/stage-300-offline/offline-2026-10-12T05-12-17.938Z-ec62c20f/manifest.json
5c26853b5d12fd31f3cb4160ac26aafd12767e7d9864569d660e8570f35fc416  reviews/STAGE_300_CATALOG_VERIFICATION_CLAUDE_SONNET_5_5_2026-10-12.md
fe9639b012ac7b60b3e1cd352603f4b2f8153cb0c213a33ce45998883f169e9d  reviews/STAGE_300_OWNER_DECISIONS_5_2026-10-12.json
80dcf4e73cd169dfc3fa60779c7c06862cb9c52bf38c5aff7a8eec096ca569c3  reviews/STAGE_300_OWNER_DECISIONS_6_2026-10-12.json
6ab2ed238137ddb13fd4c0c1f6a033bb410872d2fb289869540ddd7cd52a4acc  tests/AGENTS.md
45c11adf60efeca51fe026a3316b5bb157badc400268e64726d4d079184a75e5  tests/architecture/no-network.integration.test.ts
39c5ccc443cd0ac7ba6d20bef4a052e6eb7e5f086fbbe00f40f0bdd9b6de1fbb  tests/architecture/no-network.test.ts
1dc22830b80e5bfca46761af56c5277ca5922f41aa6a0f2ea06dfb7a7f364839  tests/e2e/AGENTS.md
f7a62d564327ed24b291237fd278fa7cbb4539062d66db3162353e2583d76945  tests/e2e/ai-feedback.spec.ts
dedd9abbc67d7d950abd556c3906fa0a7b206f7cb175d888497279fb5c2f60ba  tests/e2e/dm-tools.spec.ts
cced36b6f07df0e6c037488ec67106ff7e68f861690c2bb7db164507f45511ca  tests/e2e/fixtures/dm-tool-campaigns.json
39aee86fe4127244811a81d192bf57104baac8cb3d925923561b70c0cd2ae78f  tests/e2e/language-ru.spec.ts
68abc934d64761e6d22c7ba991ba5ba456f1fe716cb186cbab8ea8cde8d79c2c  tests/setup/no-network.ts
cdd175acf0dc5b5432602954c5a612436a97d97a695ca2ce796c98a20b07d01c  vitest.config.ts
```

## Required Output

Return a separate report for each exact output path above, using the relevant review mission and
PASS/FAIL evidence. Reviewers do not modify implementation or inspect their peer's current verdict;
the orchestrator may save returned reports and receipts. End with PASS or FAIL and STOP. Neither
approval alone advances dependent work.
