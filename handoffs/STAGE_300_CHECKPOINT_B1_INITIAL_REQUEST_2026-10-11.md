# Independent Checkpoint Handoff Request — Stage 300 remediation checkpoint B1

- Gate: intermediate checkpoint — Stage 300 remediation B1 (adapter outcome classification,
  fallback transitions, terminal intent decline, routes). Not Gate 06.
- Review type: INITIAL
- Completed stage: Stage 300 remediation checkpoint B1 only (B2 and C not started)
- Revision/commit: uncommitted working tree on branch `stage-300-live-ai` over HEAD
  `406904343bfe8542640035564d3e044561824125` (source baseline `bc6c116`). No commit or push.
- Base: the accepted checkpoint A artifact, manifest SHA256
  `0c5e7373fee933f92b259798531cd51401022bc7c6446da16535435dffe5e63e`
  (`reviews/STAGE_300_CHECKPOINT_A_ACCEPTED_MANIFEST_2026-10-11.json`). Every accounting and
  migration file of that manifest (32 files: `apps/server/src/ai/accounting/**`,
  `apps/server/migrations/0005_ai_accounting.sql`, `0006_ai_outcome_window.sql`) is byte-identical.
- Required output paths: `reviews/STAGE_300_CHECKPOINT_B1_SOL_REVIEW.md` and
  `reviews/STAGE_300_CHECKPOINT_B1_OPUS_REVIEW.md` (same artifact and checks)
- Requested reviewers: gpt-6.1-sol / xhigh and claude-opus-5-5 / xhigh, independent clean sessions
- Accepted architecture artifact: `docs/STAGE_300_REMEDIATION_DESIGN.md` SHA256
  `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2` (unchanged; its header still
  says DRAFT to preserve the approved identity). Architecture approval evidence:
  `reviews/STAGE_300_ASTRA_DESIGN_REVIEW_7_2026-10-11.md`,
  `reviews/STAGE_300_FABLE_DESIGN_REVIEW_7_2026-10-11.md`, review 7 receipts.
- Implementation: one writer session, `claude-opus-5-5`, Claude Code CLI, native Anthropic
  subscription, medium effort as assigned. No paid, network or provider call; no `.env.local`
  read; no other agent; no operator records; no B2/C, Stage 310 or 320 work.
- Dirty-file hashes: transfer baseline `/tmp/ltw-stage300-checkpoint-b1-baseline.json` (88 entries,
  verified without mismatch before work). Final manifest of every dirty file except this request,
  hashed before the final validation run: `/tmp/ltw-stage300-checkpoint-b1/pre-validate-manifest.txt`
  (133 lines, SHA256 `f99adf943457f8f1e885b846766e573a8a3ed4e8d54aaab432212ed1b6250933`); the B1
  delta is listed below. The manifest script is `/tmp/ltw-stage300-checkpoint-b1/manifest.py`.
- Status: AWAITING_SOL_AND_OPUS_REVIEW

## Review Objective

Try to break checkpoint B1 as a whole, and these contracts in particular:

1. A raw remote adapter's `prepare(request)` builds the complete serialized body with no transport
   and no key; `dispatch(prepared, signal, onStart)` sends exactly that body and nothing else, accepts
   only a request the same adapter prepared, and calls `onStart` synchronously immediately before
   `fetch`. `TRANSPORT_NOT_STARTED` is reported only when transport provably did not start; every
   later failure is uncertain. No remote `generate` path or other dispatch bypass remains.
2. Responses keep safe usage, model and provider request ID on success, refusal, truncation, missing
   tool and unreadable arguments, and never carry provider prose, error bodies, prompts or keys. An
   unexpected returned model or any unrecognized usage/billing field yields no output (fail closed).
3. For every capability, transitions follow the approved outcome table (design §3): at most one
   switch, only to the zero-cost local provider; at most one repair, on the same remote provider;
   never another paid provider. Invalid output after repair, a denied repair, a valid intent decline
   and Chronicle/relevance failures end as the table says, with the fixed codes. A local-only route
   makes exactly one actual attempt. Once the caller's signal has aborted nothing new is dispatched
   (including local), late output is discarded, and a coinciding attempt timeout is
   `CALLER_CANCELLED`.
4. The intent tool envelope is one top-level object with a `kind` discriminator (no top-level
   `oneOf`) on both adapters; exact branch combinations are enforced; a valid decline is terminal
   public `INVALID_OUTPUT`, null proposal, `committable: false`, `NO_PROPOSAL`, and can never seed
   authoring; canonical command schemas and public status sets are unchanged.
5. Runtime and evaluation routers admit only the genuine local provider (object identity) and
   registered admitted wrappers (none exist at B1). A forged brand, copy, wrapper or test fixture
   cannot reach them. Composition still constructs no remote adapter and reveals no key whatever
   keys, routes or approvals exist; live evaluation still refuses before configuration.
6. Route configuration rejects three entries, two remotes, remote-only non-relevance routes,
   duplicates and remotes without keys at runtime; evaluation mode allows exactly one remote.

## Changes in this checkpoint (against the transfer baseline)

`A` added, `M` modified since the baseline (SHA256 of the current content).

```text
M  113cb290fc5f869248b513f4ee380c3a03714345b692da1aec4e7eca3dd39904  .env.example
M  feec21943aad54ddd5b20c170b1c0a1dbbf00b326407bc1206fdad7dd63f02ec  apps/server/AGENTS.md
M  841f0ca9d17527c1e96d914fd00ee27827b534ced75dc2fee1a3a2db898a5d29  apps/server/src/ai/ai-traces.integration.test.ts
M  3bae28a81fb30055448801bcdb185f1e57b0cfd76d7485c97a55a42010fdc329  apps/server/src/ai/anthropic-provider.test.ts
M  f9cf8eae7dfd88553c593c5edb2f9dcaaa4fe07f3611dbaa6f8668b741d290f1  apps/server/src/ai/anthropic-provider.ts
A  28d3f54bc5a31e4ad10bf8b8a6170aa52a3cb099cc7d49cf797add5ade718be8  apps/server/src/ai/composition.ts
M  0ce76b4cb41b3bf0813b3552647ea4986a7e9402a295c64ab5667b5461fbd049  apps/server/src/ai/gateway.test.ts
M  b227225007890e2720939c870c8e0502a0f7b845b2f9a473ae51702119c39367  apps/server/src/ai/gateway.ts
M  0870e4d454bd7465d540967a4c23077073382dac664a26edb072ba6aabaafb4b  apps/server/src/ai/live-ai.test.ts
M  231489a01c04cf4b5d1cf284f6650d19850b43d50e22f31be1b52f602fb73d5e  apps/server/src/ai/openai-compatible-provider.ts
A  511538acb1de83a3e0d0e5bd7ff9ac6882287611d47d9340521e145cb41899cf  apps/server/src/ai/raw-adapters.test.ts
A  9677c5b0dfd602444cc20c32a664401f1df871d779d384c7fe456f09c1845786  apps/server/src/ai/raw-provider.ts
A  eb2359322ca3d6eeaeb45682cc4455795d13e404230ba00cc872b985cd5dc737  apps/server/src/ai/usage-facts.ts
M  661b8f2991a01b2135083705352ba9c5b9bfb243a4a6e75edb633177a873e0ed  apps/server/src/http/ai-routes.test.ts
M  c5fd5c15bfd6a8d1bc31fa79d0298af50fb315826dbd17dec968fece348dd881  apps/server/src/http/authoring-routes.test.ts
M  ef85e2aae08208a68c595e340243c7ab15f7561ee4994c63196da9cb3f3c7e0f  apps/server/src/http/context-ranking.test.ts
M  6e25e84b088faf18aa6e0404f088dd5d61d87207160c6a2ca588c01ae41b873d  apps/server/src/http/npc-isolation.test.ts
M  65de7bb7a0ec89517f62a864b70f1b835b1c1d255c38584b19b11babd8fef0c3  apps/server/src/http/russian-boundary.test.ts
A  6303b2277da397741d82cf7f839a738167516a63feda288c58d59285c1ee3c61  apps/server/src/platform/config/ai-routes.ts
M  6687c0610f3324d80da2654b4452b432e03cd15b52665d0fb1e7ac69ce89fd8f  apps/server/src/platform/config/config.ts
M  dfe6e465cc0f294d4539411edee7fa891b5fd4b8f33b1abe1e0b0d54572d373f  apps/server/src/scenario/ravenford-acceptance.test.ts
A  af2a1dede5cab30e7ec346de21f9a847d5673a88a897f2378f6375d60810efd6  apps/server/src/testing/fake-fetch.ts
M  151c34ee73ba6b3f337f04857c95759ff7e4d645e36f4c4b3731a7c4ebccdd8c  apps/server/src/testing/ravenford-app.ts
M  52387ee715eea3f02c7a8ebe69eba9180a46c6f0a1b225f34d0888223e8abfb9  apps/server/src/testing/scenario/session.ts
M  f429bb1233a49f1f3245b7c9cc73d7b68eac9d6a58bb8246bfb63a64420aad0f  docs/AI_CONTEXT_MAP.md
M  7be63f878707d0a50bef04aa669ae6cf947ad670bcc1e5b9f4ec6a3a58faefaa  docs/GATE_COVERAGE.md
M  2f1c715ca623b6b297aac1383a9834da639e8224d1a539ba6d87a16badb53a07  docs/adr/0017-ai-gateway.md
M  47af6dcc9ac9a819ca89be621a3a44a43c1cb8e2e293462ab62e315e9e4ee834  docs/adr/0032-live-ai.md
M  8878ae5e8da1667ae1713d1e74c6218e35a31683489145cf0eb007c8d93098b4  packages/ai/AGENTS.md
M  cd431cfb02080b5479c5ec59b6afbdc7bd404bad176c12624d54e7d66efc9c26  packages/ai/src/chronicle.test.ts
M  a568d781de62ccf659826b0f23d0a88fa2db7fffa55c5d9c3d82bbfccdd42d5b  packages/ai/src/dialogue-isolation.test.ts
M  bdc6305c50815c66ef1b24344cdf7d082e627f966236ba4e956e93741e75b74d  packages/ai/src/dialogue.test.ts
A  876047e3e94e8188b285271bd35b71fa2dc64de281ad126c0d33ff2aaee8cbe2  packages/ai/src/fallback-cancellation.test.ts
M  6dabfb38806a9dc489d1ded5378eb2eb42a070371b0d05612970095e9257abdc  packages/ai/src/fallback.test.ts
M  d0f48cb1b900568741ae7a3e851eba0bc8b69408acf4dffaca0649d9495e3ff2  packages/ai/src/fallback.ts
M  9cba7c52c0a03ef27091b8a185d8958cf50f8d344130743d7c4e75ab4a2370ab  packages/ai/src/index.ts
A  b3278babc0cdaf75b886c9a41c40856a7efe1bcc352a3ec9d094fbf60d370eed  packages/ai/src/intent-envelope.test.ts
M  92f90c3b21ce35db62dd15e304d3e46f2f7a2b6b0a09f2e06f98ac6e90e5c88a  packages/ai/src/intent.test.ts
M  5afc0b4211ec4ac632b775fca973f19afe80d3146cfb01a9f6633c508425d550  packages/ai/src/intent.ts
M  0ac8641b630ca2ef8141934757c9e3b18ab054682fc9b5d3e89f300c1109aeed  packages/ai/src/local-provider-ru.ts
M  36f5bf6b52ac089bb6b030da6b3afd54bd0080946a8d233a87e963c521f8c23a  packages/ai/src/local-provider.ts
A  52415c2e4b23b00e7a1cc7e95184159d140fe84851f88133564cdc46f2444fc9  packages/ai/src/outcome-table.test.ts
M  6474b08bff7711dfecd8019e4a00ea1936c625af89b035c86b4370cb79f3228e  packages/ai/src/prompt.ts
M  129bb21a50f58683f469cb48c5da38ad8390cc37408dded77ef5607d4499ec2a  packages/ai/src/providers.ts
M  66d435158ebeb7fac8d21a4db77e3e35bd793be4664b83061d1fb8c13a514d1b  packages/ai/src/relevance-prompt.ts
M  edaa7b1da3fd8c1e4e1606f6354287724fbad452cd44dea64512f93aaabc1978  packages/ai/src/relevance.test.ts
M  ae2342f47981c8e85ec680b98ca0c5a0eb84af5b39490ca57e5e2cac8ddbfe09  packages/ai/src/relevance.ts
M  2d1ae3d0876331c2a72f5cc6fe17cfe10a03dfbc7c2c2d54f4b2e9a0de7b4b56  packages/ai/src/router.ts
A  9ce26065073d3be940b878081036b3044de3a6ea7a9f5a4033acfc2e33099e5c  packages/ai/src/testing/capabilities.ts
M  9a2d2baec6ab6248c3ad87792900ddab49a8ef22517c863d72d70db1d9bffbcc  packages/ai/src/testing/providers.ts
M  4768f849e6544f1ee2c0afb5f1534d329e8d035a69f8195a2161689353e2f0fb  packages/ai/src/validation.ts
M  590869a6466ed589861c15df19b1df9d1d089f798bc7c90d7351e335b9020061  packages/contracts/src/ai-gateway/intents.ts
M  4c9835a55feb5ed473606df0c26a2a95e8f9db2a1df5060abeacd4b2f6b85dc8  packages/contracts/src/index.ts
A  48411b9ea8166a78c5e9a9ee59697fbfdd991dacebbe07c30c21ce3de53e8712  tests/architecture/test-support-imports.test.ts
```

Behavioral deltas, each recorded in ADR 0017 (amendment 2026-10-11, B1), ADR 0032 (section
"Adapter outcomes, fallback transitions, intent decline and routes") and `docs/GATE_COVERAGE.md`:

- Missing tool calls, truncation and unreadable structured arguments are invalid output with one
  newly admitted (potentially paid) repair on the same remote provider, no longer a free local
  switch. No allowance or extra retry is implied.
- The intent prompt replaces the empty-commands instruction with the decline instruction, and the
  repair line reads "Return a corrected answer.". The local provider declines unreadable requests
  as `unsupported` in one attempt, where it previously failed schema validation twice. Only the
  affected deterministic expectations were updated.
- A timed-out relevance trace now lists the attempt in flight as `CALLER_CANCELLED` rather than an
  empty attempt list.
- `DmIntentTraceView.declineReason` and `INTENT_DECLINE_REASONS` are additive contract fields. A
  denied attempt records zero usage and no model.
- `LTW_AI_ROUTES` shapes that were previously accepted (three entries, two remotes, remote without
  key) are now startup errors. `OpenAiCompatibleOptions.extraBody` is replaced by the allowlisted
  `thinking` option. The `AiProvider` port is replaced by branded `RoutedProvider`; test fakes
  are now branded explicitly (`packages/ai/src/testing/providers.ts` `testBrand`, server
  `apps/server/src/testing/ravenford-app.ts` `testProvider`).

## Authoritative Documents

- `ARCHITECTURE_INVARIANTS.md`
- `docs/STAGE_300_REMEDIATION_DESIGN.md` §1 (prepare/dispatch, catalog-facing facts), §2 (trusted
  metadata, branded admitted providers, cancellation), §3 (outcome contract table, routes, intent
  envelope), "Checkpoints and required evidence" (B1)
- `docs/adr/0017-ai-gateway.md` §5 and its 2026-10-11 amendment
- `docs/adr/0032-live-ai.md`, the checkpoint A and B1 sections of the 2026-10-11 amendment
- `docs/GATE_COVERAGE.md` (Stage 300 rows and B1 paragraph)
- `packages/ai/AGENTS.md`, `apps/server/AGENTS.md`, `work-orders/OPUS_STAGE_300.md`

## Surfaces Available to Reviewer

- Pure package: `packages/ai/src/{providers,router,fallback,intent,prompt,validation,local-provider,relevance}.ts`
- Server: `apps/server/src/ai/{raw-provider,usage-facts,anthropic-provider,openai-compatible-provider,composition,gateway}.ts`,
  `apps/server/src/platform/config/{ai-routes,config}.ts`, `apps/server/src/main.ts`
- Contracts: `packages/contracts/src/ai-gateway/intents.ts`
- HTTP: `POST /campaigns/:campaignId/ai/intents`, `GET /campaigns/:campaignId/ai/traces/:traceId`,
  NPC dialogue, Chronicle and `…/context?ranking=ai` routes (local provider only in this build)
- CLI: `pnpm eval:ai` (live refused; `--offline` only)
- Test harness: raw adapters only through injected `fetch` (`apps/server/src/testing/fake-fetch.ts`);
  each use case over a scripted route (`packages/ai/src/testing/capabilities.ts`)

## Start / Reproduce

```text
cd /Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2
git rev-parse HEAD            # 406904343bfe8542640035564d3e044561824125
python3 -I /tmp/ltw-stage300-checkpoint-b1/manifest.py "$PWD" | diff - /tmp/ltw-stage300-checkpoint-b1/pre-validate-manifest.txt
pnpm exec vitest run --project unit packages/ai apps/server/src/ai apps/server/src/platform \
  apps/server/src/http/authoring-routes.test.ts tests/architecture
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm run context-budget
pnpm db:up                    # healthy docker-compose PostgreSQL on 127.0.0.1:54329
env -u ANTHROPIC_API_KEY -u DEEPSEEK_API_KEY -u LTW_AI_ROUTES pnpm validate
```

The manifest diff must print nothing apart from any reviewer report files. Integration tests use
throwaway databases (`apps/server/src/testing/throwaway-database.ts`); `pnpm validate` also runs
the standard `db:migrate` and idempotent `seed:ravenford` against the development database.

## Test Personas / Scopes

Ravenford fixtures and development personas (`fixtures/ravenford/personas.json`): DM, players,
outsider; NPC boundary markers `fixtures/ravenford/npc-boundary.json`. Provider keys in tests are
fake strings; the gateway tests use a `Secret` whose `reveal()` throws and a global `fetch` spy.

## Canonical Secret or Invariant Under Test

No provider key is revealed or sent by composition; no outbound request leaves the process. No
fallback reaches a second paid provider or more than one switch/repair. A decline or invalid
output never becomes a committable proposal or an authoring source. Canonical commands, context
builders, knowledge scope and public status sets are unchanged (invariants 1, 2, 5, 6, 16, 17, 21).

## Validation Already Run by Implementation Writer

Run on the tree hashed in the pre-validate manifest, with no provider key or route variable in the
environment (checked: none present).

| Command                        | Result                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run format:check`        | PASS                                                                                                                                   |
| `pnpm run lint`                | PASS (0 warnings)                                                                                                                      |
| `pnpm run typecheck`           | PASS                                                                                                                                   |
| `pnpm run context-budget`      | PASS: 644 active files, 0 over target, 0 over hard limit                                                                               |
| `pnpm run test` (unit)         | PASS: 181 files, 1857 tests                                                                                                            |
| `pnpm run build`               | PASS                                                                                                                                   |
| `pnpm run db:migrate`          | PASS: 0 applied, 6 already applied (127.0.0.1:54329/ltw)                                                                               |
| `pnpm run seed:ravenford`      | PASS: 0 accepted, 91 duplicate (idempotent)                                                                                            |
| `pnpm run test:integration`    | PASS: 28 files, 138 tests (throwaway databases)                                                                                        |
| `pnpm run test:e2e`            | PASS: 45 tests                                                                                                                         |
| Whole `pnpm validate`          | exit 0; log `/tmp/ltw-stage300-checkpoint-b1/validate.log` (SHA256 `f1f1e3bda3027b8e5abacfcf96e50ba1989122ec746f5b38cbb18433a4657f23`) |
| Manifest recheck after the run | identical to the pre-validate manifest                                                                                                 |

The `db:migrate` and `seed:ravenford` package scripts start Node with
`--env-file-if-exists=../../.env.local` (existing scripts); a `.env.local` exists. The
writer did not open, print or inspect it; those two CLIs construct no AI provider and connected
only to the local development database shown above. Every other step ran with no provider key or
route variable in its environment.

Mutation check (manual, reverted): adding a module under `apps/server/src/testing/eval/` that
re-exports `createAnthropicProvider` makes the gateway import guard fail as intended.

## Known Limitations

- B1 builds no admission wrapper; the admitted-wrapper registry in `composition.ts` is empty, so no
  remote provider is routable. Admission, the request journal, whole-request deadlines for intents,
  dialogue and Chronicle, outcome freeze, recovery wiring, the diagnostic read, nullable trace IDs
  and cache metadata/accounting are B2. Evaluation admission, oracles, reports and client feedback
  are C.
- Usage facts are allowlisted by field name and value shape only; no pricing catalog, tier or
  reservation is computed, and the allowlists (Anthropic `service_tier: standard`, cache creation
  fields; DeepSeek cache hit/miss and token details) are not verified against current provider
  documentation. Unrecognized fields fail closed as `UNVERIFIED_BILLING`. Catalog verification is a
  separately authorized activity.
- Adapter classification is tested only against fixed fake responses; no live provider response
  was observed at B1.
- Whole-request caller cancellation is exercised through the fallback policy and the relevance
  deadline; intent, dialogue and Chronicle receive a caller signal only in B2.
- Pending decisions unchanged by B1: the account/model scope of proven pricing-overrun stops (before
  B2/live), ceiling entry through the operator CLI, and the local-only preparation/closed-session
  Chronicle limitation (owner product disposition before checkpoint C completion).

## Coverage Ledger

| Surface                                                                                           | Status at B1                         | Evidence / next review                                                                              |
| ------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Raw adapter prepare/dispatch, start boundary, byte equality, key handling                         | Due, tested                          | `apps/server/src/ai/raw-adapters.test.ts` (both adapters)                                           |
| Response classification and safe facts                                                            | Due, tested                          | `raw-adapters.test.ts`, `anthropic-provider.test.ts`, `live-ai.test.ts`                             |
| Outcome table, all four capabilities                                                              | Due, tested                          | `packages/ai/src/outcome-table.test.ts`, `fallback.test.ts`                                         |
| Caller cancellation, coincident timeout, late output, progress                                    | Due, tested (fallback and relevance) | `fallback-cancellation.test.ts`, `relevance.test.ts`                                                |
| Intent envelope, decline, local decline, authoring refusal                                        | Due, tested                          | `intent-envelope.test.ts`, `outcome-table.test.ts`, `apps/server/src/http/authoring-routes.test.ts` |
| Composition identity, forged/test brands, no remote/key/fetch                                     | Due, tested                          | `apps/server/src/ai/gateway.test.ts`, `tests/architecture/test-support-imports.test.ts`             |
| Route validation (runtime, evaluation)                                                            | Due, tested                          | `apps/server/src/ai/live-ai.test.ts`                                                                |
| Provider prompt/envelope deltas                                                                   | Recorded                             | `docs/GATE_COVERAGE.md`; Gate 06 after Stage 350                                                    |
| Admission wrapper, journal, deadlines, freeze, recovery wiring, diagnostic read, cache accounting | NOT YET IN SCOPE                     | B2                                                                                                  |
| Evaluation admission, oracles, reporting, client feedback                                         | NOT YET IN SCOPE                     | C                                                                                                   |
| Live provider behavior                                                                            | NOT YET IN SCOPE                     | Requires explicit text-provider ceilings; Gate 06                                                   |

## Required Output

Return a separate report for each exact output path above, with PASS or FAIL, severity, exact
evidence, violated invariant, required regression and limitations. Preserve earlier reports and
requests. Reviewers do not modify implementation or inspect another reviewer's current verdict;
the orchestrator may save returned reports and receipts. End with PASS or FAIL and STOP. Neither
approval alone advances dependent work (B2).

## Ownership

The implementation writer has stopped at CHECKPOINT_READY and releases ownership of this checkout.
No self-acceptance; no B2 work. Related repairs, if requested, stay with this B1 writer session at
xhigh after ownership is explicitly transferred back.
