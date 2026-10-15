# Independent Checkpoint Handoff Request — Stage 300 remediation checkpoint B1 (repair 3)

- Gate: intermediate checkpoint — Stage 300 remediation B1 (adapter outcome classification,
  fallback transitions, terminal intent decline, routes). Not Gate 06.
- Review type: RETEST of the repaired artifact (repair 3)
- Completed stage: Stage 300 remediation checkpoint B1 only (B2 and C not started)
- Revision/commit: uncommitted working tree on branch `stage-300-live-ai` over HEAD
  `406904343bfe8542640035564d3e044561824125` (source baseline `bc6c116`). No commit or push.
- Prior requests, reports and receipts (preserved unchanged):
  - Initial: `handoffs/STAGE_300_CHECKPOINT_B1_INITIAL_REQUEST_2026-10-11.md`,
    `reviews/STAGE_300_CHECKPOINT_B1_SOL_REVIEW.md`, `reviews/STAGE_300_CHECKPOINT_B1_OPUS_REVIEW.md`.
  - Repair 1: `handoffs/STAGE_300_CHECKPOINT_B1_REPAIR_1_REQUEST_2026-10-11.md`,
    `reviews/STAGE_300_CHECKPOINT_B1_{SOL,OPUS}_REVIEW_REPAIR_1_2026-10-11.md`.
  - Repair 2: `handoffs/STAGE_300_CHECKPOINT_B1_REPAIR_2_REQUEST_2026-10-11.md`,
    `reviews/STAGE_300_CHECKPOINT_B1_{SOL,OPUS}_REVIEW_REPAIR_2_2026-10-11.md`, their receipts,
    `reviews/STAGE_300_CHECKPOINT_B1_REPAIR_2_REVIEWED_MANIFEST_2026-10-11.json` and
    `/tmp/ltw-stage300-checkpoint-b1-repair2/review-manifest.json` (SHA256 `bcccf113…20fc31b6`).
- Base: the accepted checkpoint A artifact, manifest SHA256
  `0c5e7373fee933f92b259798531cd51401022bc7c6446da16535435dffe5e63e`. All 30 accounting and
  migration entries of that manifest are byte-identical.
- Required output paths: `reviews/STAGE_300_CHECKPOINT_B1_SOL_REVIEW_REPAIR_3_2026-10-11.md` and
  `reviews/STAGE_300_CHECKPOINT_B1_OPUS_REVIEW_REPAIR_3_2026-10-11.md` (same artifact and checks)
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
- Dirty-file hashes: repair-3 transfer baseline `/tmp/ltw-stage300-checkpoint-b1-repair3/baseline.json`
  (176 entries, verified without mismatch and with no extra dirty file before work). Manifest of
  every dirty file except this request, before and after the final validation run (identical):
  `/tmp/ltw-stage300-checkpoint-b1-repair3/pre-validate-manifest.txt` and `post-validate-manifest.txt`
  (176 lines, SHA256 `571056b8e2b5685abe1038a9e5a8601d6f28b63210002c50b4613d8a2122008b`), made by
  the unchanged `/tmp/ltw-stage300-checkpoint-b1-repair1/manifest.py` (SHA256 `b66a0d8e…ab3`).
- Status: AWAITING_SOL_AND_OPUS_REVIEW

## Review Objective

Try to break checkpoint B1 as a whole, as repaired. The contracts are those of the repair-2 request,
with the invocation boundary covering what an invoked provider resolves:

1. Raw adapters: `prepare` builds the complete body with no transport or key; `dispatch` sends exactly
   it, accepts only its own prepared request, signals `onStart` synchronously immediately before
   `fetch`, and reports `TRANSPORT_NOT_STARTED` only when transport provably was not invoked.
2. Responses keep only safe usage, model and request ID; an unexpected model or any unrecognized own
   usage field yields no output.
3. Transitions follow the approved outcome table for every capability: at most one switch, only to
   the zero-cost local provider; at most one repair, only on the same remote provider; one local call
   per request. After the caller's signal aborts, from anywhere including `validate` and callbacks,
   nothing more is invoked and no usable result is selected.
4. An attempt is recorded if and only if a provider was invoked, exactly once per invocation, and
   every `start` notice is closed by exactly one `abandoned` or `end`. This now includes an invoked
   provider that resolves anything other than a well-formed response (not an object, an unknown kind
   or code, a value whose reading throws): one uncertain `BAD_RESPONSE` attempt with no model, usage
   or output, then the ordinary provider-failure transition, or `CALLER_CANCELLED` once the caller has
   gone. Exceptions from caller-supplied code never become an attempt, repair or switch.
5. Intent envelope and terminal decline, authoring refusal, composition identity on one frozen route
   snapshot, no remote adapter/key/fetch in composition, and route validation are unchanged.

## Counterexample addressed in this repair

| Reported counterexample (repair-2 artifact)                                                                                                                                                | Root fix (`packages/ai/src/fallback.ts`)                                                                                                                                                                                                                                                                                                                                                         | Regressions (failed before the fix)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An invoked provider resolving `undefined` (or `{kind: 'weird'}`) threw outside the provider `try` in result settlement: one invocation, no attempt, `start` and `dispatched` with no `end` | The resolution is read once inside the invocation `try` (`answerOf`): only an object with a known kind (and a known code where the kind has one) is a response; anything else, or a value whose reading throws, becomes an uncertain `BAD_RESPONSE` failure of that invocation. Model and usage are kept only when well-formed. `isDeclineEnvelope` treats an unreadable output as not a decline | `packages/ai/src/fallback-nonresponse.test.ts`: `undefined`, `null`, number, string, array, unknown kind, no kind, denial/malformed/suspect with unknown codes, unreadable object; each through `[remote, local]` (one uncertain attempt, its `end`, one switch) and remote-only (`AI_UNAVAILABLE`/`PROVIDER_FAILURE`); a local non-response (one call, no repair); caller cancellation (`CALLER_CANCELLED`, no switch); ill-formed model/usage on a valid answer kept as unknown; well-formed classified metadata preserved |

Fail-first, run with the final test file against the exact pre-fix `fallback.ts` (rebuilt from the
fix by reversing it; SHA256 verified equal to the baseline entry), then restored:
`/tmp/ltw-stage300-checkpoint-b1-repair3/fail-first.log` (SHA256
`fcb2847305b4680c28d9841e6d20fc52b63d0cd2e26f8b5d913c3d766d67f30e`): 26 failed, 1 passed (the
well-formed-metadata guard). An earlier fail-first run, `fail-first-initial-fixture.log`, used a test
Proxy that also threw on `then`, which the promise machinery reads, so two of its cases tested a
rejection rather than a resolution. The fixture was corrected so that `then` is undefined.

## Changes in this repair (against the repair-3 transfer baseline)

`A` added, `M` modified (SHA256 of current content). This request itself is rewritten (the repair-2
request is preserved as the dated copy above). List also at
`/tmp/ltw-stage300-checkpoint-b1-repair3/repair3-delta.txt`.

```text
M  09b69d86812f44046099589f4205982a2dd9ddaaa0b9f157c2f0d79907feb169  docs/GATE_COVERAGE.md
M  cd969bddf54a4a35b7d45473251a5e3ed81c19623df2c74a227ccb7be552a673  docs/adr/0032-live-ai.md
M  765839f80f6c03a8cbc4a0e16b02c7ed26a754831d7c91241ab7417d194802a0  packages/ai/AGENTS.md
A  ac1525ac7017df6304fb79823b9c55698ab43c3b6d9775743fc257fbffc3e551  packages/ai/src/fallback-nonresponse.test.ts
M  49f7e8e7be79f35cc23539ac652fbe980c3edc9eb3a9f685fa88ec9941c883e4  packages/ai/src/fallback.ts
```

Contract deltas (recorded in ADR 0032 "B1 repair 3", `docs/GATE_COVERAGE.md` and
`packages/ai/AGENTS.md`; no provider-facing envelope, prompt, public status or outcome-table row
changed):

- A resolved non-response is a provider failure of the invoked attempt (`BAD_RESPONSE`, uncertain),
  where it previously threw outside the attempt and the run rejected with no attempt recorded.
- The fallback now copies a resolution once into an internal, well-formed view: a `model` that is not
  a string, or `usage` without nonnegative safe-integer `inputTokens`/`outputTokens`, is recorded as
  unknown (`null`). Adapters and the local provider already produce well-formed values.
- An output whose `kind` cannot be read is treated as not a decline envelope; it then goes through
  `validate` as before.

## Authoritative Documents

- `ARCHITECTURE_INVARIANTS.md`
- `docs/STAGE_300_REMEDIATION_DESIGN.md` §2 (attempt observability, cancellation), §3 (outcome table)
- `docs/adr/0017-ai-gateway.md` §5 and its 2026-10-11 B1 amendment
- `docs/adr/0032-live-ai.md`, the B1 section and its "B1 repair 1", "B1 repair 2" and "B1 repair 3"
  subsections
- `docs/GATE_COVERAGE.md` (Stage 300 rows and the B1 paragraphs)
- `packages/ai/AGENTS.md`, `work-orders/OPUS_STAGE_300.md`

## Surfaces Available to Reviewer

- Pure package: `packages/ai/src/fallback.ts` (repaired), with `providers.ts`, `router.ts`,
  `intent.ts`, `relevance.ts`, `validation.ts`, `local-provider.ts`
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
  | diff - /tmp/ltw-stage300-checkpoint-b1-repair3/post-validate-manifest.txt
pnpm exec vitest run --project unit packages/ai/src/fallback-nonresponse.test.ts \
  packages/ai/src/fallback-callbacks.test.ts packages/ai/src/fallback-cancellation.test.ts \
  packages/ai/src/fallback.test.ts packages/ai/src/outcome-table.test.ts packages/ai/src/relevance.test.ts
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
outsider. Provider fakes are test-branded scripted providers; no key exists in any test.

## Canonical Secret or Invariant Under Test

No provider key is revealed or sent; no outbound request leaves the process. No fallback reaches a
second paid provider or more than one switch/repair; nothing is invoked and no usable result is
selected after the caller's signal aborts; every provider invocation, whatever it resolves or throws,
is recorded exactly once, and nothing trustworthy is invented from a non-response (invariants 2, 11,
17, 18, 21).

## Validation Already Run by Implementation Writer

Run on the tree hashed in the pre-validate manifest (identical afterwards), with no provider key or
route variable in the environment (checked: none present).

| Command                                                                                            | Result                                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure package suites during repair (`packages/ai`)                                                  | PASS: 17 files, 268 tests                                                                                                                      |
| `pnpm run format:check`                                                                            | PASS                                                                                                                                           |
| `pnpm run lint`                                                                                    | PASS (0 warnings)                                                                                                                              |
| `pnpm run typecheck`                                                                               | PASS                                                                                                                                           |
| `pnpm run context-budget`                                                                          | PASS: 650 active files, 0 over target, 0 over hard limit                                                                                       |
| `pnpm run test` (unit)                                                                             | PASS: 186 files, 2002 tests                                                                                                                    |
| `pnpm run build`                                                                                   | PASS                                                                                                                                           |
| `pnpm run db:migrate`                                                                              | PASS: 0 applied, 6 already applied (127.0.0.1:54329/ltw)                                                                                       |
| `pnpm run seed:ravenford`                                                                          | PASS: 0 accepted, 91 duplicate (idempotent)                                                                                                    |
| `pnpm run test:integration`                                                                        | PASS: 28 files, 138 tests (throwaway databases)                                                                                                |
| `pnpm run test:e2e`                                                                                | PASS: 45 tests                                                                                                                                 |
| Whole `pnpm validate`                                                                              | exit 0; log `/tmp/ltw-stage300-checkpoint-b1-repair3/validate.log` (SHA256 `fac70f29bdaae0eb852926df2836c7da80485eac6c489c44403e66bbc3709e3e`) |
| Manifest recheck after the run                                                                     | identical to the pre-validate manifest                                                                                                         |
| Accepted A accounting/migrations (30), both design hashes, 64 pinned review/handoff evidence files | unchanged                                                                                                                                      |

One standalone `pnpm test` run before the final validation had a single failure in the unchanged,
accepted checkpoint A unit test `apps/server/src/ai/accounting/pg-transaction.test.ts` ("reports a
stalled COMMIT as unknown…"). It uses a 60 ms deadline, which expired before `COMMIT` was sent under
full-suite load, so the result was correctly a timeout without commit uncertainty. That file passed
5 of 5 times in isolation, the next full `pnpm test` passed, and the final `pnpm validate` passed.
Log: `/tmp/ltw-stage300-checkpoint-b1-repair3/unit-run-1-accounting-timing-flake.log` (SHA256
`662cf126…ac36`). The test and its subject are byte-identical to the accepted A manifest and were not
modified.

The `db:migrate` and `seed:ravenford` package scripts start Node with
`--env-file-if-exists=../../.env.local` (existing scripts); a `.env.local` exists. The writer did not
open, print or inspect it; those two CLIs construct no AI provider and connected only to the local
development database shown above.

## Known Limitations

- `pg-transaction.test.ts` (accepted A) can be timing-sensitive under heavy parallel load, as noted
  above; it is outside B1 scope and was not changed.
- A throwing `dispatched` listener no longer stops transport: the attempt is recorded, then the run
  rejects. How B2's admission wrapper settles such a paid call is a B2 decision.
- If the caller's signal aborts during the `end` notice after a result has been selected, that result
  is still returned; the outcome freeze is B2. When caller code throws after an invocation, the run
  rejects and no trace is written; the request journal is B2.
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

| Surface                                                                                                | Status at B1 repair 3          | Evidence / next review                                                                                   |
| ------------------------------------------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Invoked provider resolving a non-response                                                              | Due, tested                    | `fallback-nonresponse.test.ts`                                                                           |
| Fallback invocation boundary and callback exceptions                                                   | Due, tested (unchanged)        | `fallback-callbacks.test.ts`                                                                             |
| Caller cancellation incl. validation and callbacks, coincident timeout, late output, progress          | Due, tested                    | `fallback-cancellation.test.ts`, `fallback-nonresponse.test.ts`, `relevance.test.ts`                     |
| Outcome table, all four capabilities; one local call                                                   | Due, tested                    | `outcome-table.test.ts`, `fallback.test.ts`, `intent-envelope.test.ts`, `gateway.test.ts`                |
| Raw adapters, classification, own-name usage allowlists                                                | Due, tested (unchanged)        | `raw-adapters.test.ts`, `raw-adapter-hardening.test.ts`, `anthropic-provider.test.ts`, `live-ai.test.ts` |
| Intent envelope, decline, authoring refusal                                                            | Due, tested (unchanged)        | `intent-envelope.test.ts`, `apps/server/src/http/authoring-routes.test.ts`                               |
| Composition identity on one frozen snapshot, no remote/key/fetch                                       | Due, tested (unchanged)        | `router.test.ts`, `composition.test.ts`, `gateway.test.ts`, `tests/architecture/`                        |
| Route validation                                                                                       | Due, tested (unchanged)        | `live-ai.test.ts`                                                                                        |
| Provider prompt/envelope deltas                                                                        | Recorded (none in this repair) | `docs/GATE_COVERAGE.md`; Gate 06 after Stage 350                                                         |
| Admission wrapper, journal, deadlines, freeze, recovery, diagnostic read, cache accounting, stop scope | NOT YET IN SCOPE               | B2                                                                                                       |
| Evaluation admission, oracles, reporting, client feedback                                              | NOT YET IN SCOPE               | C                                                                                                        |
| Live provider behavior                                                                                 | NOT YET IN SCOPE               | Requires explicit text-provider ceilings; Gate 06                                                        |

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
