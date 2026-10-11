# Independent Checkpoint Handoff Request — Stage 300 remediation checkpoint B1 (repair 1)

- Gate: intermediate checkpoint — Stage 300 remediation B1 (adapter outcome classification,
  fallback transitions, terminal intent decline, routes). Not Gate 06.
- Review type: RETEST of the repaired artifact (repair 1)
- Completed stage: Stage 300 remediation checkpoint B1 only (B2 and C not started)
- Revision/commit: uncommitted working tree on branch `stage-300-live-ai` over HEAD
  `406904343bfe8542640035564d3e044561824125` (source baseline `bc6c116`). No commit or push.
- Prior reports and request (initial review of this checkpoint, preserved unchanged):
  `reviews/STAGE_300_CHECKPOINT_B1_SOL_REVIEW.md`, `reviews/STAGE_300_CHECKPOINT_B1_OPUS_REVIEW.md`,
  `handoffs/STAGE_300_CHECKPOINT_B1_INITIAL_REQUEST_2026-10-11.md`, reviewed manifest
  `reviews/STAGE_300_CHECKPOINT_B1_REVIEWED_MANIFEST_2026-10-11.json` (SHA256 `077be8cd…f357`).
- Base: the accepted checkpoint A artifact, manifest SHA256
  `0c5e7373fee933f92b259798531cd51401022bc7c6446da16535435dffe5e63e`. All 30 accounting and
  migration entries of that manifest (`apps/server/src/ai/accounting/**` plus
  `apps/server/migrations/0005_ai_accounting.sql` and `0006_ai_outcome_window.sql`) are
  byte-identical. (The initial request said 32; it had counted two adjacent files,
  `apps/server/migrations/AGENTS.md` and `apps/server/src/testing/accounting.ts`, which are also
  unchanged.)
- Required output paths: `reviews/STAGE_300_CHECKPOINT_B1_SOL_REVIEW_REPAIR_1_2026-10-11.md` and
  `reviews/STAGE_300_CHECKPOINT_B1_OPUS_REVIEW_REPAIR_1_2026-10-11.md` (same artifact and checks)
- Requested reviewers: gpt-6.1-sol / xhigh and claude-opus-5-5 / xhigh, independent clean sessions
- Accepted architecture artifact: `docs/STAGE_300_REMEDIATION_DESIGN.md` SHA256
  `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2` (unchanged). Architecture
  approval evidence: `reviews/STAGE_300_ASTRA_DESIGN_REVIEW_7_2026-10-11.md`,
  `reviews/STAGE_300_FABLE_DESIGN_REVIEW_7_2026-10-11.md`, review 7 receipts. The separately
  approved B2 stop-scope delta `docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md` (SHA256
  `6bba003055bfd53ac4e069d01d5bf6e3a5a6e272fddb41a2f8305b55e153b485`) is unchanged and not
  implemented.
- Implementation: the same B1 writer session (`15ae1625-61f1-4101-94e2-bfab23ace5cb`),
  `claude-opus-5-5`, Claude Code CLI, native Anthropic subscription, assigned xhigh for this review
  remediation (effort is not observable from inside the session). No paid, network, catalog or
  provider call; no `.env.local` read by the writer; no agent; no Codex CLI; no operator records; no
  B2/C work.
- Dirty-file hashes: repair transfer baseline `/tmp/ltw-stage300-checkpoint-b1-repair1/baseline.json`
  (157 entries, verified without mismatch and with no extra dirty file before work). Manifest of
  every dirty file except this request, before and after the final validation run (identical):
  `/tmp/ltw-stage300-checkpoint-b1-repair1/pre-validate-manifest.txt` and `post-validate-manifest.txt`
  (160 lines, SHA256 `09661b071c6d3d9267d93ebaaaddfdc5b75853c59d1c4924c90403b9fe92c719`), made by
  `/tmp/ltw-stage300-checkpoint-b1-repair1/manifest.py` (SHA256 `b66a0d8e…ab3`). The repair delta
  is listed below.
- Status: AWAITING_SOL_AND_OPUS_REVIEW

## Review Objective

Try to break checkpoint B1 as a whole, as repaired. The contracts are unchanged from the initial
request:

1. A raw remote adapter's `prepare(request)` builds the complete serialized body with no transport
   and no key; `dispatch(prepared, signal, onStart)` sends exactly that body and nothing else, accepts
   only a request the same adapter prepared, and calls `onStart` synchronously immediately before
   `fetch`. `TRANSPORT_NOT_STARTED` is reported only when transport provably was not invoked; every
   later failure is uncertain. No remote `generate` path or other dispatch bypass remains.
2. Responses keep safe usage, model and provider request ID on success, refusal, truncation, missing
   tool and unreadable arguments, and never carry provider prose, error bodies, prompts or keys. An
   unexpected returned model or any unrecognized own usage/billing field yields no output (fail
   closed).
3. For every capability, transitions follow the approved outcome table (design §3): at most one
   switch, only to the zero-cost local provider; at most one repair, only on the same remote provider;
   never another paid provider. A local-only route and the local switch each make exactly one local
   call. Once the caller's signal has aborted, from anywhere including callbacks, nothing more is
   invoked (provider, local or transport), late output is discarded, and a coinciding attempt timeout
   is `CALLER_CANCELLED`.
4. The intent tool envelope is one top-level object with a `kind` discriminator on both adapters;
   exact branch combinations are enforced; a valid decline is terminal public `INVALID_OUTPUT`, null
   proposal, `committable: false`, `NO_PROPOSAL`, and can never seed authoring; canonical command
   schemas and public status sets are unchanged.
5. Runtime and evaluation routers admit only the genuine local provider (object identity) and
   registered admitted wrappers (none exist at B1), checked on the same snapshot the router keeps; no
   getter, Proxy, iterable, later input change or write through a returned route can add another.
   Composition constructs no remote adapter and reveals no key whatever keys, routes or approvals
   exist; live evaluation refuses before configuration.
6. Route configuration rejects three entries, two remotes, remote-only non-relevance routes,
   duplicates, remotes without keys and clauses with other than one `=` at runtime; evaluation mode
   allows exactly one remote.

## Counterexamples addressed in this repair

| Reported counterexample (initial artifact)                                                                                                                                                              | Root fix                                                                                                                                                                                                                                                                                                                        | Regressions (failed before the fix)                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `composeRouter` checked one read of its routes and the router read them again (getter/iterable); `providersFor` returned the stored mutable array, so a write after composition reached an HTTP request | `packages/ai/src/router.ts` `snapshotRoutes`: one read per capability, one pass per route, frozen arrays; `CapabilityRouter` checks and keeps that snapshot; `apps/server/src/ai/composition.ts` checks identity on its snapshot and builds from it; composed router and gateway are frozen; identity alone decides genuineness | `packages/ai/src/router.test.ts`; `apps/server/src/ai/composition.test.ts` (getter, iterable, Proxy, later input change, write through route/router/gateway, HTTP intent with no injected invocation)                                |
| Usage allowlist lookups matched inherited names (`constructor`, `__proto__`, `toString`…): accepted silently, or threw `TypeError` and lost the safe facts                                              | `apps/server/src/ai/usage-facts.ts`: `usageSpec` builds `Set`/`Map` allowlists; only own fields (`Object.entries`) are read; adapters' allowed names unchanged                                                                                                                                                                  | `apps/server/src/ai/raw-adapter-hardening.test.ts`: both adapters, seven inherited names × `null`/`{}`/populated/number, raw JSON text so `__proto__` is an own field, plus inherited names inside nested groups                     |
| A caller aborted by the key reader still got `onStart` and `fetch`; an abort from the fallback's start notice or `build` still invoked the provider                                                     | `apps/server/src/ai/raw-provider.ts`: signal rechecked after reading the key and after the start hook, immediately before `fetch`; `packages/ai/src/fallback.ts`: rechecked after `build`, after the start notice (withdrawn as `abandoned`) and immediately before invoking a provider                                         | `raw-adapter-hardening.test.ts` (key reader abort, start hook abort and throw: no `fetch`); `packages/ai/src/fallback-cancellation.test.ts` (start notice, `build`, repair `build`, end and dispatch notices: no further invocation) |
| Invalid local-only intent output was attempted twice (`initial`, `repair`), e.g. `Advance time by 0 minutes.`                                                                                           | `fallback.ts`: repair only on a remote provider; local output is final after its one call                                                                                                                                                                                                                                       | `fallback.test.ts` (local-only and after the switch); `intent-envelope.test.ts` (genuine local provider, zero and oversized values); `gateway.test.ts` (HTTP through `createAiGateway`)                                              |
| `LTW_AI_ROUTES` dropped text after a second `=`                                                                                                                                                         | `apps/server/src/platform/config/ai-routes.ts`: a clause must split into exactly two pieces                                                                                                                                                                                                                                     | `apps/server/src/ai/live-ai.test.ts` (the three reported strings and a clause with no `=`)                                                                                                                                           |

Fail-first run (before any fix): `/tmp/ltw-stage300-checkpoint-b1-repair1/fail-first.log` (SHA256
`e01b7f9ec05b1dcddfe9ea3ffd6599b0f8b833387622787f5ebfca4ba8976826`): 65 failed, 99 passed across
the eight affected test files.

## Changes in this repair (against the repair transfer baseline)

`A` added, `M` modified (SHA256 of current content). This request itself is rewritten (the initial
request is preserved as the dated copy above). List also at
`/tmp/ltw-stage300-checkpoint-b1-repair1/repair1-delta.txt`.

```text
M  eb34284cb75d80fef8d2fb5b47fbd0d3307e8fc5c0ee7739bacc86dc1b65adea  apps/server/src/ai/anthropic-provider.ts
A  dd223c6d949717e0736b6a80ba76b1637f3d2cb56bcad378b44bdc72e1cef7a2  apps/server/src/ai/composition.test.ts
M  349dc64bd95be605f27b94800bc039216c34ff91d186fced897d7d1f5377f4f7  apps/server/src/ai/composition.ts
M  e958ba0deec5ac2163004967c0a296f0493675ee7916c0e1e4610a2e36813c45  apps/server/src/ai/gateway.test.ts
M  851cd2cf33dcdbc427f8cfc9a8aee2afe1a376f6c02da7882f4bb6b3da04f7eb  apps/server/src/ai/gateway.ts
M  51271f50bb5e07d8eb098f9c1300f662ea752a190e2cf007f4c36a66f6173853  apps/server/src/ai/live-ai.test.ts
M  9aeea5a4c69fc5fea25f364b2343659a24c3e8d09e1cfdbede2aa874af1edb4e  apps/server/src/ai/openai-compatible-provider.ts
A  53175e2e8943eb784e51f7c7b529f0871cfd2ab15c40d8b2bf3c1a0fe686044b  apps/server/src/ai/raw-adapter-hardening.test.ts
M  1a02003d7a2876f960bc68c1450751c8ab138da4df2aa6785bfbee9d9d0998c4  apps/server/src/ai/raw-adapters.test.ts
M  a1de74fb565aeafc5b951946d4358059a614dab9835502142701af39364b4db0  apps/server/src/ai/raw-provider.ts
M  cef54bd4fd72b5c19e126a9ed9b4f5485af3c81b305fad9c29059e964639a32b  apps/server/src/ai/usage-facts.ts
M  c3668ce8ffb92e25038b07e5292952a0beb66677c993f0926d223150d249aa25  apps/server/src/platform/config/ai-routes.ts
A  5d18877394140e910da1e0a587f45ce94ea35c9b13c7e5db023ff6d29fcfbdaa  apps/server/src/testing/raw-adapter-fixtures.ts
M  52dfdf6f0db29b8594e28efec556ea1d2893985193fe1322f3b2c3d4d7cd586d  docs/GATE_COVERAGE.md
M  948aa6a88e6639d5a2d2ddc76647222b8020a52e81e9fad9b4d1ac3ca67f1de2  docs/adr/0017-ai-gateway.md
M  8e9c70d49b268b01b470c52aa1188495a952ccb7ba5b6bac79920ab6985ca380  docs/adr/0032-live-ai.md
M  c631a29c05e63ad8641291088cc30b24e8ce2d402fac6c4391c57c09712b48f8  packages/ai/AGENTS.md
M  cd6f832f46055b4d83598a5c059b53deaf744e73968648f75a93942c8733cc0e  packages/ai/src/fallback-cancellation.test.ts
M  55b8e4b1edd7b4f5925dcccae92bf2b929a92495a984e7f28ab399f71fa28b2f  packages/ai/src/fallback.test.ts
M  259e0150f3540f2ee2a0cab3e8c36a9f2fa6aa5400cffb5b7a65fa55f9536adc  packages/ai/src/fallback.ts
M  a2ad7a9bce19b82b12cb66b66d335d18acb481c8360941b079da4044bfb08227  packages/ai/src/index.ts
M  75054955464e1fbe6cdb9f53fc1c3f5ca9292170fa0fc9d62b098d5ff0bfae3f  packages/ai/src/intent-envelope.test.ts
M  f7f6da8a17e9f897e0c74e6ba8c572a67335499b20220c0caee49ad6dd8275d7  packages/ai/src/intent.test.ts
M  cfc8e6d7c595583e27a677ef17915f8c8f0de8de9143a27f8023e2ae9bffef70  packages/ai/src/relevance.ts
A  b9e2d5c1475c0f791e12885a2a7660f7767973efa7cb3372c9a693f74fe4b11c  packages/ai/src/router.test.ts
M  6917bd084ead0d5209e46d0bf150595478e02dd6a107db74caa2629bfb98833e  packages/ai/src/router.ts
```

Behavioral and interface deltas (recorded in ADR 0017's B1 amendment, ADR 0032 "B1 repair 1" and
`docs/GATE_COVERAGE.md`; no provider-facing envelope or prompt changed):

- The local provider is never repaired. Besides the local-only route, this applies after the local
  switch: remote failure, then invalid local output now ends `INVALID_OUTPUT` after that one local
  call (it was previously repaired locally). Remote repair and the switch are unchanged. The one
  affected existing test (`intent.test.ts`, directory identity) now exercises a remote repair
  followed by the switch.
- When the caller's signal is found aborted after the start hook, the adapter does not invoke
  `fetch` and reports `TRANSPORT_NOT_STARTED`, since transport was provably not invoked (design §3:
  emitted strictly before invoking transport).
- `AttemptProgress` gains `abandoned`; `@ltw/ai` exports `snapshotRoutes`, `Routes` and
  `RouteSnapshot`; `UsageSpec` is built by `usageSpec` (sets and maps); the composed router and the
  `createAiGateway` result are frozen.
- Raw adapter response fixtures moved to `apps/server/src/testing/raw-adapter-fixtures.ts`, which
  imports no adapter (tests construct adapters); `raw-adapters.test.ts` assertions are unchanged.

## Authoritative Documents

- `ARCHITECTURE_INVARIANTS.md`
- `docs/STAGE_300_REMEDIATION_DESIGN.md` §1 (prepare/dispatch), §2 (branded admitted providers,
  composition, cancellation), §3 (outcome table, routes, intent envelope), "Checkpoints" (B1)
- `docs/adr/0017-ai-gateway.md` §5 and its 2026-10-11 B1 amendment
- `docs/adr/0032-live-ai.md`, the B1 section and its "B1 repair 1" subsection
- `docs/GATE_COVERAGE.md` (Stage 300 rows, B1 and repair 1 paragraphs)
- `packages/ai/AGENTS.md`, `apps/server/AGENTS.md`, `work-orders/OPUS_STAGE_300.md`

## Surfaces Available to Reviewer

- Pure package: `packages/ai/src/{providers,router,fallback,intent,prompt,validation,local-provider,relevance}.ts`
- Server: `apps/server/src/ai/{raw-provider,usage-facts,anthropic-provider,openai-compatible-provider,composition,gateway}.ts`,
  `apps/server/src/platform/config/{ai-routes,config}.ts`, `apps/server/src/main.ts`
- Contracts: `packages/contracts/src/ai-gateway/intents.ts` (unchanged by this repair)
- HTTP: `POST /campaigns/:campaignId/ai/intents`, `GET /campaigns/:campaignId/ai/traces/:traceId`,
  NPC dialogue, Chronicle and `…/context?ranking=ai` (local provider only in this build)
- CLI: `pnpm eval:ai` (live refused; `--offline` only)
- Test support: `apps/server/src/testing/{fake-fetch,raw-adapter-fixtures}.ts`,
  `packages/ai/src/testing/{providers,capabilities}.ts`

## Start / Reproduce

```text
cd /Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2
git rev-parse HEAD            # 406904343bfe8542640035564d3e044561824125
python3 -I /tmp/ltw-stage300-checkpoint-b1-repair1/manifest.py "$PWD" \
  | diff - /tmp/ltw-stage300-checkpoint-b1-repair1/post-validate-manifest.txt
pnpm exec vitest run --project unit packages/ai apps/server/src/ai apps/server/src/platform \
  apps/server/src/http/authoring-routes.test.ts tests/architecture
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm run context-budget
pnpm db:up                    # healthy docker-compose PostgreSQL on 127.0.0.1:54329
env -u ANTHROPIC_API_KEY -u DEEPSEEK_API_KEY -u LTW_AI_ROUTES pnpm validate
```

The manifest diff must print nothing apart from reviewer report files. Integration tests use
throwaway databases; `pnpm validate` also runs the standard `db:migrate` and idempotent
`seed:ravenford` against the local development database.

## Test Personas / Scopes

Ravenford fixtures and development personas (`fixtures/ravenford/personas.json`): DM, players,
outsider; NPC boundary markers `fixtures/ravenford/npc-boundary.json`. Provider keys in tests are
fake strings; gateway tests use a `Secret` whose `reveal()` throws and a global `fetch` spy.

## Canonical Secret or Invariant Under Test

No provider key is revealed or sent by composition; no outbound request leaves the process. No
fallback reaches a second paid provider or more than one switch/repair; no provider or transport is
invoked after the caller's signal aborts. A decline or invalid output never becomes a committable
proposal or an authoring source. Canonical commands, context builders, knowledge scope and public
status sets are unchanged (invariants 1, 2, 5, 6, 16, 17, 21).

## Validation Already Run by Implementation Writer

Run on the tree hashed in the pre-validate manifest (identical afterwards), with no provider key or
route variable in the environment (checked: none present).

| Command                                                                                                              | Result                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused suites during repair (`packages/ai`, `apps/server/src/ai`, `apps/server/src/platform`, `tests/architecture`) | PASS: 32 files, 532 tests                                                                                                                      |
| `pnpm run format:check`                                                                                              | PASS                                                                                                                                           |
| `pnpm run lint`                                                                                                      | PASS (0 warnings)                                                                                                                              |
| `pnpm run typecheck`                                                                                                 | PASS                                                                                                                                           |
| `pnpm run context-budget`                                                                                            | PASS: 648 active files, 0 over target, 0 over hard limit                                                                                       |
| `pnpm run test` (unit)                                                                                               | PASS: 184 files, 1959 tests                                                                                                                    |
| `pnpm run build`                                                                                                     | PASS                                                                                                                                           |
| `pnpm run db:migrate`                                                                                                | PASS: 0 applied, 6 already applied (127.0.0.1:54329/ltw)                                                                                       |
| `pnpm run seed:ravenford`                                                                                            | PASS: 0 accepted, 91 duplicate (idempotent)                                                                                                    |
| `pnpm run test:integration`                                                                                          | PASS: 28 files, 138 tests (throwaway databases)                                                                                                |
| `pnpm run test:e2e`                                                                                                  | PASS: 45 tests                                                                                                                                 |
| Whole `pnpm validate`                                                                                                | exit 0; log `/tmp/ltw-stage300-checkpoint-b1-repair1/validate.log` (SHA256 `11f1a5a1dc0462d26770205d7d0181a5e9cf4da032cdace70f519bccc9e9bf7b`) |
| Manifest recheck after the run                                                                                       | identical to the pre-validate manifest                                                                                                         |
| Accepted A accounting/migrations (30) and both design hashes                                                         | unchanged                                                                                                                                      |

The `db:migrate` and `seed:ravenford` package scripts start Node with
`--env-file-if-exists=../../.env.local` (existing scripts); a `.env.local` exists. The writer did
not open, print or inspect it; those two CLIs construct no AI provider and connected only to the
local development database shown above.

## Known Limitations

- B1 builds no admission wrapper; the admitted-wrapper registry is empty, so no remote provider is
  routable. Admission, the request journal, whole-request deadlines for intents, dialogue and
  Chronicle, outcome freeze, recovery wiring, the diagnostic read, nullable trace IDs, cache
  metadata/accounting and the approved stop-scope delta are B2; evaluation admission, oracles,
  reports and client feedback are C.
- A prepared request is not single-use: dispatching the same prepared object twice sends twice. B2's
  admission wrapper must dispatch at most once per reservation.
- An unexpected exception thrown while classifying a response after the start would surface as a
  generic post-start failure without its safe facts; no such path is known after this repair.
- The router-construction pin in `gateway.test.ts` is a source text scan for `new CapabilityRouter(`;
  runtime safety rests on `composeRouter` being the only production construction site.
- A denied admission resolved after the caller has gone is recorded as `CALLER_CANCELLED` (zero
  usage) rather than its denial code; nothing was reserved.
- Usage allowlists match field names and value shapes only and are not verified against current
  provider documentation; unrecognized fields fail closed. Classification is tested against fixed
  fake responses only; no live response was observed.
- The owner product decisions of 2026-10-11 (ceilings through operator CLI records; local-only DM
  preparation and closed-session Chronicle) are recorded in
  `reviews/STAGE_300_PRODUCT_DECISIONS_2026-10-11.json` and are not changed by B1.

## Coverage Ledger

| Surface                                                                                                       | Status at B1 repair 1                | Evidence / next review                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Raw adapter prepare/dispatch, start boundary, byte equality, key handling, cancellation before transport      | Due, tested                          | `raw-adapters.test.ts`, `raw-adapter-hardening.test.ts` (both adapters)                                       |
| Response classification, own-name usage allowlists, safe facts                                                | Due, tested                          | `raw-adapters.test.ts`, `raw-adapter-hardening.test.ts`, `anthropic-provider.test.ts`, `live-ai.test.ts`      |
| Outcome table, all four capabilities; one local call                                                          | Due, tested                          | `outcome-table.test.ts`, `fallback.test.ts`, `intent-envelope.test.ts`, `gateway.test.ts`                     |
| Caller cancellation incl. callbacks, coincident timeout, late output, progress                                | Due, tested (fallback and relevance) | `fallback-cancellation.test.ts`, `relevance.test.ts`                                                          |
| Intent envelope, decline, local decline, authoring refusal                                                    | Due, tested                          | `intent-envelope.test.ts`, `outcome-table.test.ts`, `apps/server/src/http/authoring-routes.test.ts`           |
| Composition identity on one snapshot, frozen routes/router/gateway, no remote/key/fetch                       | Due, tested                          | `router.test.ts`, `composition.test.ts`, `gateway.test.ts`, `tests/architecture/test-support-imports.test.ts` |
| Route validation (runtime, evaluation, clause syntax)                                                         | Due, tested                          | `live-ai.test.ts`                                                                                             |
| Provider prompt/envelope deltas                                                                               | Recorded (none in this repair)       | `docs/GATE_COVERAGE.md`; Gate 06 after Stage 350                                                              |
| Admission wrapper, journal, deadlines, freeze, recovery wiring, diagnostic read, cache accounting, stop scope | NOT YET IN SCOPE                     | B2                                                                                                            |
| Evaluation admission, oracles, reporting, client feedback                                                     | NOT YET IN SCOPE                     | C                                                                                                             |
| Live provider behavior                                                                                        | NOT YET IN SCOPE                     | Requires explicit text-provider ceilings; Gate 06                                                             |

## Required Output

Return a separate report for each exact output path above, with PASS or FAIL, severity, exact
evidence, violated invariant, required regression and limitations. Preserve earlier reports and
requests. Reviewers do not modify implementation or inspect another reviewer's current verdict;
the orchestrator may save returned reports and receipts. End with PASS or FAIL and STOP. Neither
approval alone advances dependent work (B2).

## Ownership

The implementation writer has stopped at CHECKPOINT_READY and releases ownership of this checkout.
No self-acceptance; no B2 work. Further related repairs, if requested, stay with this B1 writer
session at xhigh after ownership is explicitly transferred back.
