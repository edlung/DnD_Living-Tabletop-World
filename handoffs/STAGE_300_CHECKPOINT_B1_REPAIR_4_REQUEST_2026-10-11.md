# Independent Checkpoint Handoff Request — Stage 300 remediation checkpoint B1 (repair 4)

- Gate: intermediate checkpoint — Stage 300 remediation B1 (adapter outcome classification,
  fallback transitions, terminal intent decline, routes). Not Gate 06.
- Review type: RETEST of the repaired artifact (repair 4)
- Completed stage: Stage 300 remediation checkpoint B1 only (B2 and C not started)
- Revision/commit: uncommitted working tree on branch `stage-300-live-ai` over HEAD
  `406904343bfe8542640035564d3e044561824125` (source baseline `bc6c116`). No commit or push.
- Prior requests, reports and receipts (preserved unchanged):
  - Initial: `handoffs/STAGE_300_CHECKPOINT_B1_INITIAL_REQUEST_2026-10-11.md`,
    `reviews/STAGE_300_CHECKPOINT_B1_SOL_REVIEW.md`, `reviews/STAGE_300_CHECKPOINT_B1_OPUS_REVIEW.md`.
  - Repairs 1–2: `handoffs/STAGE_300_CHECKPOINT_B1_REPAIR_{1,2}_REQUEST_2026-10-11.md` and
    `reviews/STAGE_300_CHECKPOINT_B1_{SOL,OPUS}_REVIEW_REPAIR_{1,2}_2026-10-11.md`.
  - Repair 3: `handoffs/STAGE_300_CHECKPOINT_B1_REPAIR_3_REQUEST_2026-10-11.md`,
    `reviews/STAGE_300_CHECKPOINT_B1_{SOL,OPUS}_REVIEW_REPAIR_3_2026-10-11.md`, their receipts,
    `reviews/STAGE_300_CHECKPOINT_B1_REPAIR_3_REVIEWED_MANIFEST_2026-10-11.json`,
    `/tmp/ltw-stage300-checkpoint-b1-repair3/review-manifest.json` (SHA256 `a8b75059…bd65db`) and the
    rejection probe `/tmp/ltw-stage300-checkpoint-b1-repair3/sol-rejection-probe.mjs` (SHA256
    `07eb7a5c…d869`).
- Base: the accepted checkpoint A artifact, manifest SHA256
  `0c5e7373fee933f92b259798531cd51401022bc7c6446da16535435dffe5e63e`. All 30 accounting and
  migration entries of that manifest are byte-identical.
- Required output paths: `reviews/STAGE_300_CHECKPOINT_B1_SOL_REVIEW_REPAIR_4_2026-10-11.md` and
  `reviews/STAGE_300_CHECKPOINT_B1_OPUS_REVIEW_REPAIR_4_2026-10-11.md` (same artifact and checks)
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
  provider call; no `.env.local` read by the writer; no agent; no Codex CLI; no B2/C work.
- Dirty-file hashes: repair-4 transfer baseline `/tmp/ltw-stage300-checkpoint-b1-repair4/baseline.json`
  (184 entries, verified without mismatch and with no extra dirty file before work). Manifest of
  every dirty file except this request, before and after the final validation run (identical):
  `/tmp/ltw-stage300-checkpoint-b1-repair4/pre-validate-manifest.txt` and `post-validate-manifest.txt`
  (185 lines, SHA256 `dc1aa2a8fe0ea3bd4db75f50137a6a995b99b73c4be16fec52a0e60a8a5b0f2a`), made by
  the unchanged `/tmp/ltw-stage300-checkpoint-b1-repair1/manifest.py` (SHA256 `b66a0d8e…ab3`).
- Status: AWAITING_SOL_AND_OPUS_REVIEW

## Review Objective

Try to break checkpoint B1 as a whole, as repaired. The contracts are those of the repair-3 request,
with the invocation boundary covering what an invoked provider rejects with:

1. Raw adapters: `prepare` builds the complete body with no transport or key; `dispatch` sends exactly
   it, accepts only its own prepared request, signals `onStart` synchronously immediately before
   `fetch`, and reports `TRANSPORT_NOT_STARTED` only when transport provably was not invoked.
2. Responses keep only safe usage, model and request ID; an unexpected model or any unrecognized own
   usage field yields no output.
3. Transitions follow the approved outcome table for every capability: at most one switch, only to
   the zero-cost local provider; at most one repair, only on the same remote provider; one local call
   per request. After the caller's signal aborts, nothing more is invoked and no usable result is
   selected.
4. An attempt is recorded if and only if a provider was invoked, exactly once per invocation, and
   every `start` notice is closed by exactly one `abandoned` or `end`, whatever the provider resolves
   or rejects with. A rejection keeps its code only as a genuine `ProviderError` whose allowlisted
   code is unchanged since construction. Anything else is one uncertain `UNAVAILABLE` attempt with
   no model, usage or output: another error, a look-alike or Proxy (including a revoked one or one
   whose prototype read throws), or an unknown, non-string, changed or throwing code. That attempt is
   followed by the ordinary provider-failure transition, or `CALLER_CANCELLED` once the caller has
   gone. `TRANSPORT_NOT_STARTED` (release proof) comes only from a genuine, unchanged `ProviderError`.
5. Intent envelope and terminal decline, authoring refusal, callback-exception propagation,
   composition identity on one frozen route snapshot, no remote adapter/key/fetch in composition,
   and route validation are unchanged.

## Counterexample addressed in this repair

| Reported counterexample (repair-3 artifact)                                                                                                                                                                                                                                                                                                      | Root fix (`packages/ai/src/providers.ts`, the one existing helper)                                                                                                                                                                                                                                                                                               | Regressions (failed before the fix)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An invoked provider rejecting with a `ProviderError` whose `code` getter throws, or with a revoked Proxy, made settlement throw outside the invocation guard: one invocation, no attempt, `start`/`dispatched` with no `end`, also after cancellation. A real `ProviderError` with an unknown code (`INVENTED_CODE`) was copied into the attempt | `failureCode` never throws and reads `code` at most once. The `ProviderError` constructor records each instance's code in a module-private `WeakMap`, looked up by identity, so lookup runs no Proxy trap and finds no copy or look-alike. A code is kept only if it equals the constructed one and is in `PROVIDER_ERROR_CODES`; anything else is `UNAVAILABLE` | `packages/ai/src/providers.test.ts`: all five codes kept; Error, plain objects (including one claiming `TRANSPORT_NOT_STARTED`), a prototype look-alike, Proxy over a genuine error, Proxy with throwing `getPrototypeOf`, revoked Proxy, throwing code getter, unknown/non-string/changed code, a never-allowed constructor code, primitives: all `UNAVAILABLE`, never throwing; a changing getter read once. `packages/ai/src/fallback-rejection.test.ts`: seven unknown/unreadable/forged rejections through `[remote, local]` (one `UNAVAILABLE` attempt, its `end`, one switch) and after cancellation (`CALLER_CANCELLED`, no switch); genuine codes kept; genuine `TRANSPORT_NOT_STARTED` kept after cancellation while a plain-object claim is not |

Fail-first, run with the final test files against the exact pre-fix `providers.ts` (rebuilt by
reversing the fix; SHA256 verified equal to the baseline entry), then restored:
`/tmp/ltw-stage300-checkpoint-b1-repair4/fail-first.log` (SHA256
`bb6bea92c5ecc5edb32a067d3d67368a5a68cf99a2373e92c1ffdd4550dc2d68`): 19 failed, 21 passed (the
genuine-code, plain-object and single-read guards). An earlier run of a draft test file, which
rejected through `Promise.reject` before a lint-only change, is kept as `fail-first-draft-tests.log`.
The reviewer's probe `/tmp/ltw-stage300-checkpoint-b1-repair3/sol-rejection-probe.mjs` was re-run
read-only against the fixed source and exits 0 (output
`/tmp/ltw-stage300-checkpoint-b1-repair4/sol-rejection-probe-rerun.log`, SHA256 `c0a8cbb5…0513`).

## Changes in this repair (against the repair-4 transfer baseline)

`A` added, `M` modified (SHA256 of current content). This request itself is rewritten (the repair-3
request is preserved as the dated copy above). List also at
`/tmp/ltw-stage300-checkpoint-b1-repair4/repair4-delta.txt`.

```text
M  11ba09817c566a990a0d5f575909e5604c9191d8314a5c873e2f40dea324e7ea  docs/GATE_COVERAGE.md
M  97a21855c812bd7c53bef2a950c5bafaf8e168b50d04b1c9d8b539cc1dca44aa  docs/adr/0032-live-ai.md
M  831508ff43c15497e13cff4f7627cf734e31c018d255d24e5bae2238c3d85b65  packages/ai/AGENTS.md
A  6b9a5c7b66d95a6aec289aa479a5ed75a5b9d2031c8ab5a2d402d1733d7911a1  packages/ai/src/fallback-rejection.test.ts
A  33eab146812c0226c353c409d7cbc807b0bc8df38921e52e628a447f379b14b2  packages/ai/src/providers.test.ts
M  979ec62a61eb691f977f6cd68b3b31e46034d4aca207460b5c2d047bb883ad84  packages/ai/src/providers.ts
```

`packages/ai/src/fallback.ts` is unchanged; its single `failureCode` call site is now total.
Callers of `failureCode` were checked before the change: the one fallback call site and the
package export, with no other caller (the server raw adapters and their tests construct
`ProviderError` and read `.code` on their own errors, which is unaffected). Contract deltas
(recorded in ADR 0032 "B1 repair 4", `docs/GATE_COVERAGE.md` and `packages/ai/AGENTS.md`):

- `failureCode` is now a total function that returns a code only for a genuine, unchanged,
  allowlisted `ProviderError`. Previously it trusted `instanceof` (which Proxies can fake or make
  throw) and returned whatever `code` held. No error code, public status, interface, outcome-table
  row or accounting rule changed; the `ProviderError` class and `PROVIDER_ERROR_CODES` are the same.
- A rejection that is an `instanceof ProviderError` look-alike or Proxy, or whose code was changed
  after construction, is now `UNAVAILABLE` (uncertain) rather than its claimed code. In particular,
  no such value can produce `TRANSPORT_NOT_STARTED`.

## Authoritative Documents

- `ARCHITECTURE_INVARIANTS.md`
- `docs/STAGE_300_REMEDIATION_DESIGN.md` §1 (transport-not-started proof), §2 (attempt
  observability, cancellation), §3 (outcome table)
- `docs/adr/0017-ai-gateway.md` §5 and its 2026-10-11 B1 amendment
- `docs/adr/0032-live-ai.md`, the B1 section and its "B1 repair 1" through "B1 repair 4" subsections
- `docs/GATE_COVERAGE.md` (Stage 300 rows and the B1 paragraphs)
- `packages/ai/AGENTS.md`, `work-orders/OPUS_STAGE_300.md`

## Surfaces Available to Reviewer

- Pure package: `packages/ai/src/providers.ts` (repaired `failureCode`, `ProviderError`),
  `fallback.ts`, `router.ts`, `intent.ts`, `relevance.ts`, `validation.ts`, `local-provider.ts`
- Server (unchanged since repair 1): `apps/server/src/ai/{raw-provider,usage-facts,anthropic-provider,openai-compatible-provider,composition,gateway}.ts`,
  `apps/server/src/platform/config/{ai-routes,config}.ts`
- HTTP: intents, traces, NPC dialogue, Chronicle and `…/context?ranking=ai` (local provider only)
- Test support: `packages/ai/src/testing/{providers,capabilities}.ts`,
  `apps/server/src/testing/{fake-fetch,raw-adapter-fixtures}.ts`

## Start / Reproduce

```text
cd /Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2
git rev-parse HEAD            # 406904343bfe8542640035564d3e044561824125
python3 -I /tmp/ltw-stage300-checkpoint-b1-repair1/manifest.py "$PWD" \
  | diff - /tmp/ltw-stage300-checkpoint-b1-repair4/post-validate-manifest.txt
pnpm exec vitest run --project unit packages/ai/src/providers.test.ts \
  packages/ai/src/fallback-rejection.test.ts packages/ai/src/fallback-nonresponse.test.ts \
  packages/ai/src/fallback-callbacks.test.ts packages/ai/src/fallback-cancellation.test.ts \
  packages/ai/src/fallback.test.ts packages/ai/src/outcome-table.test.ts
pnpm exec vitest run --project unit packages/ai apps/server/src/ai apps/server/src/platform \
  apps/server/src/http/authoring-routes.test.ts tests/architecture
node --conditions=@ltw/source /tmp/ltw-stage300-checkpoint-b1-repair3/sol-rejection-probe.mjs
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm run context-budget
pnpm db:up                    # healthy docker-compose PostgreSQL on 127.0.0.1:54329
env -u ANTHROPIC_API_KEY -u DEEPSEEK_API_KEY -u LTW_AI_ROUTES pnpm validate
```

The manifest diff must print nothing apart from reviewer report files. Integration tests use
throwaway databases; `pnpm validate` also runs the standard `db:migrate` and idempotent
`seed:ravenford` against the local development database.

## Test Personas / Scopes

Ravenford fixtures and development personas (`fixtures/ravenford/personas.json`): DM, players,
outsider. Provider fakes are test-branded scripted providers; no key exists in any test.

## Canonical Secret or Invariant Under Test

No provider key is revealed or sent; no outbound request leaves the process. No fallback reaches a
second paid provider or more than one switch/repair; nothing is invoked and no usable result is
selected after the caller's signal aborts; every provider invocation, whatever it resolves, rejects
or throws, is recorded exactly once with fixed codes only, and no release proof or trustworthy
metadata is invented from an unverifiable value (invariants 2, 11, 17, 18, 21).

## Validation Already Run by Implementation Writer

Run on the tree hashed in the pre-validate manifest (identical afterwards), with no provider key or
route variable in the environment (checked: none present).

| Command                                                                                            | Result                                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure package suites during repair (`packages/ai`)                                                  | PASS: 19 files, 308 tests                                                                                                                      |
| Reviewer rejection probe (read-only re-run)                                                        | exit 0                                                                                                                                         |
| `pnpm run format:check`                                                                            | PASS                                                                                                                                           |
| `pnpm run lint`                                                                                    | PASS (0 warnings)                                                                                                                              |
| `pnpm run typecheck`                                                                               | PASS                                                                                                                                           |
| `pnpm run context-budget`                                                                          | PASS: 652 active files, 0 over target, 0 over hard limit                                                                                       |
| `pnpm run test` (unit)                                                                             | PASS: 188 files, 2042 tests                                                                                                                    |
| `pnpm run build`                                                                                   | PASS                                                                                                                                           |
| `pnpm run db:migrate`                                                                              | PASS: 0 applied, 6 already applied (127.0.0.1:54329/ltw)                                                                                       |
| `pnpm run seed:ravenford`                                                                          | PASS: 0 accepted, 91 duplicate (idempotent)                                                                                                    |
| `pnpm run test:integration`                                                                        | PASS: 28 files, 138 tests (throwaway databases)                                                                                                |
| `pnpm run test:e2e`                                                                                | PASS: 45 tests                                                                                                                                 |
| Whole `pnpm validate`                                                                              | exit 0; log `/tmp/ltw-stage300-checkpoint-b1-repair4/validate.log` (SHA256 `2dc8b9bda63c90112d3f570e9ca280100ab2be44bcf689e63facc3ee228a17b0`) |
| Manifest recheck after the run                                                                     | identical to the pre-validate manifest                                                                                                         |
| Accepted A accounting/migrations (30), both design hashes, 71 pinned review/handoff evidence files | unchanged                                                                                                                                      |

The timing-sensitive accepted checkpoint A test noted in the repair-3 request
(`apps/server/src/ai/accounting/pg-transaction.test.ts`) did not fail in any run this round; it was
not modified.

The `db:migrate` and `seed:ravenford` package scripts start Node with
`--env-file-if-exists=../../.env.local` (existing scripts); a `.env.local` exists. The writer did not
open, print or inspect it; those two CLIs construct no AI provider and connected only to the local
development database shown above.

## Known Limitations

- `ProviderError` identity is per module instance. The server and the package share one `@ltw/ai`
  instance in each process, so their errors are recognized. A `ProviderError` from a second copy of
  the package would be treated as `UNAVAILABLE`, which is conservative.
- `pg-transaction.test.ts` (accepted A) can be timing-sensitive under heavy parallel load; it is
  outside B1 scope and unchanged.
- Unchanged from earlier repairs:
  - A throwing `dispatched` listener no longer stops transport.
  - An abort in the `end` notice after a selected result still returns it (the outcome freeze is B2).
  - A rejected run writes no trace (the request journal is B2).
- Admission, the request journal, whole-request deadlines for intents, dialogue and Chronicle,
  recovery wiring, the diagnostic read, nullable trace IDs, cache metadata and accounting, and the
  approved stop-scope delta are B2; evaluation admission, oracles, reports and client feedback are C.
  No remote provider is routable at B1.
- Unchanged from repair 1:
  - Prepared requests are not single-use.
  - The router-construction pin is a source text scan.
  - A denial resolved after the caller has gone is recorded as `CALLER_CANCELLED`.
  - Usage allowlists are not verified against provider documentation.
  - Classification is tested against fake responses only.

## Coverage Ledger

| Surface                                                                                                  | Status at B1 repair 4          | Evidence / next review                                                                                             |
| -------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Rejection classification (`failureCode`) and invoked provider rejecting unknown/unreadable/forged errors | Due, tested                    | `providers.test.ts`, `fallback-rejection.test.ts`                                                                  |
| Invoked provider resolving a non-response                                                                | Due, tested (unchanged)        | `fallback-nonresponse.test.ts`                                                                                     |
| Fallback invocation boundary and callback exceptions                                                     | Due, tested (unchanged)        | `fallback-callbacks.test.ts`                                                                                       |
| Caller cancellation incl. validation and callbacks, coincident timeout, late output, progress            | Due, tested                    | `fallback-cancellation.test.ts`, `fallback-rejection.test.ts`, `fallback-nonresponse.test.ts`, `relevance.test.ts` |
| Outcome table, all four capabilities; one local call                                                     | Due, tested                    | `outcome-table.test.ts`, `fallback.test.ts`, `intent-envelope.test.ts`, `gateway.test.ts`                          |
| Raw adapters, classification, own-name usage allowlists                                                  | Due, tested (unchanged)        | `raw-adapters.test.ts`, `raw-adapter-hardening.test.ts`, `anthropic-provider.test.ts`, `live-ai.test.ts`           |
| Intent envelope, decline, authoring refusal                                                              | Due, tested (unchanged)        | `intent-envelope.test.ts`, `apps/server/src/http/authoring-routes.test.ts`                                         |
| Composition identity on one frozen snapshot, no remote/key/fetch                                         | Due, tested (unchanged)        | `router.test.ts`, `composition.test.ts`, `gateway.test.ts`, `tests/architecture/`                                  |
| Route validation                                                                                         | Due, tested (unchanged)        | `live-ai.test.ts`                                                                                                  |
| Provider prompt/envelope deltas                                                                          | Recorded (none in this repair) | `docs/GATE_COVERAGE.md`; Gate 06 after Stage 350                                                                   |
| Admission wrapper, journal, deadlines, freeze, recovery, diagnostic read, cache accounting, stop scope   | NOT YET IN SCOPE               | B2                                                                                                                 |
| Evaluation admission, oracles, reporting, client feedback                                                | NOT YET IN SCOPE               | C                                                                                                                  |
| Live provider behavior                                                                                   | NOT YET IN SCOPE               | Requires explicit text-provider ceilings; Gate 06                                                                  |

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
