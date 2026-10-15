# Independent Checkpoint Handoff Request — Stage 300 remediation checkpoint B1 (repair 2)

- Gate: intermediate checkpoint — Stage 300 remediation B1 (adapter outcome classification,
  fallback transitions, terminal intent decline, routes). Not Gate 06.
- Review type: RETEST of the repaired artifact (repair 2)
- Completed stage: Stage 300 remediation checkpoint B1 only (B2 and C not started)
- Revision/commit: uncommitted working tree on branch `stage-300-live-ai` over HEAD
  `406904343bfe8542640035564d3e044561824125` (source baseline `bc6c116`). No commit or push.
- Prior requests and reports (preserved unchanged):
  - Initial: `handoffs/STAGE_300_CHECKPOINT_B1_INITIAL_REQUEST_2026-10-11.md`,
    `reviews/STAGE_300_CHECKPOINT_B1_SOL_REVIEW.md`, `reviews/STAGE_300_CHECKPOINT_B1_OPUS_REVIEW.md`.
  - Repair 1: `handoffs/STAGE_300_CHECKPOINT_B1_REPAIR_1_REQUEST_2026-10-11.md`,
    `reviews/STAGE_300_CHECKPOINT_B1_SOL_REVIEW_REPAIR_1_2026-10-11.md`,
    `reviews/STAGE_300_CHECKPOINT_B1_OPUS_REVIEW_REPAIR_1_2026-10-11.md`, their receipts, and the
    repair-1 review manifest `/tmp/ltw-stage300-checkpoint-b1-repair1/review-manifest.json`
    (SHA256 `1dd2e148…6b3550`).
- Base: the accepted checkpoint A artifact, manifest SHA256
  `0c5e7373fee933f92b259798531cd51401022bc7c6446da16535435dffe5e63e`. All 30 accounting and
  migration entries of that manifest (`apps/server/src/ai/accounting/**`,
  `apps/server/migrations/0005_ai_accounting.sql`, `0006_ai_outcome_window.sql`) are byte-identical.
- Required output paths: `reviews/STAGE_300_CHECKPOINT_B1_SOL_REVIEW_REPAIR_2_2026-10-11.md` and
  `reviews/STAGE_300_CHECKPOINT_B1_OPUS_REVIEW_REPAIR_2_2026-10-11.md` (same artifact and checks)
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
- Dirty-file hashes: repair-2 transfer baseline `/tmp/ltw-stage300-checkpoint-b1-repair2/baseline.json`
  (168 entries, verified without mismatch and with no extra dirty file before work). Manifest of
  every dirty file except this request, before and after the final validation run (identical):
  `/tmp/ltw-stage300-checkpoint-b1-repair2/pre-validate-manifest.txt` and `post-validate-manifest.txt`
  (168 lines, SHA256 `4c40ba802118c5aa0cf5e4d090476365b2f5219349e6781dae2aed43916472e7`), made by
  the unchanged `/tmp/ltw-stage300-checkpoint-b1-repair1/manifest.py` (SHA256 `b66a0d8e…ab3`).
- Status: AWAITING_SOL_AND_OPUS_REVIEW

## Review Objective

Try to break checkpoint B1 as a whole, as repaired. The contracts are those of the earlier requests,
with the fallback's result selection and invocation boundary stated precisely:

1. A raw remote adapter's `prepare(request)` builds the complete serialized body with no transport
   and no key; `dispatch(prepared, signal, onStart)` sends exactly that body, accepts only a request
   the same adapter prepared, and calls `onStart` synchronously immediately before `fetch`.
   `TRANSPORT_NOT_STARTED` is reported only when transport provably was not invoked.
2. Responses keep safe usage, model and provider request ID on every classified outcome and never
   carry provider prose, error bodies, prompts or keys; an unexpected model or any unrecognized own
   usage field yields no output.
3. For every capability, transitions follow the approved outcome table (design §3): at most one
   switch, only to the zero-cost local provider; at most one repair, only on the same remote provider;
   one local call per request. Once the caller's signal has aborted, from anywhere including
   `validate` and other callbacks, nothing more is invoked and no usable output, value or decline is
   selected; the invoked attempt is recorded as `CALLER_CANCELLED` with safe metadata only.
4. An attempt is recorded if and only if a provider was invoked, exactly once per invocation.
   Exceptions from code the caller supplies (`build`, `validate`, `nowMs`, the progress listener)
   never become a provider attempt, a repair or a switch; every `start` notice is closed by exactly
   one `abandoned` or `end`. An invoked provider's own `TRANSPORT_NOT_STARTED` stays a real attempt.
5. The intent envelope, terminal decline, authoring refusal, composition identity on one frozen route
   snapshot, no remote adapter/key/fetch in composition, and route validation are unchanged from
   repair 1.

## Counterexamples addressed in this repair

| Reported counterexample (repair-1 artifact)                                                                                                                                                                                      | Root fix (`packages/ai/src/fallback.ts`)                                                                                                                                                                                                                                                            | Regressions (failed before the fix)                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate` aborted the caller and returned a valid proposal or a terminal decline; the run still returned `VALID` (or the decline) with the value and serialized output                                                          | The signal is rechecked as soon as `validate` returns; the attempt becomes `CALLER_CANCELLED` (output discarded, safe metadata kept) and the run ends cancelled, before any result is selected                                                                                                      | `fallback-cancellation.test.ts`: valid output and terminal decline with a validation abort; the existing invalid-output abort case now also asserts the discarded output                                                                                                                                                                                                        |
| `build`, the `start` notice or the `abandoned` notice aborted and threw before any invocation; an attempt was recorded (and an unmatched `end` published) although `generate` was never called                                   | Explicit invocation boundary: `nowMs`/`build` run outside any provider `try` and their exceptions propagate; listener exceptions are returned by `notify`, never caught as provider failures; a `start` that throws or is followed by cancellation is closed by `abandoned` and nothing is recorded | `fallback-callbacks.test.ts`: `build` throwing with and without abort; `start` throwing with and without abort; `abandoned` throwing after a start-notice abort; first error kept when both throw                                                                                                                                                                               |
| `start` throwing without abort recorded a fictitious remote attempt and switched to local; a throwing repair `build` recorded a fictitious repair and switched; a throwing `end` recorded a duplicate attempt for one invocation | Exceptions from the caller's code wait until the invocation's single attempt is recorded and its `end` published once, then the first propagates; no transition follows                                                                                                                             | `fallback-callbacks.test.ts`: repair `build` throwing (one genuine attempt, no switch); `end` throwing after an outage, valid and invalid output (one attempt, one `end`, no switch); `dispatched` throwing (actual attempt recorded, then propagation); `validate` throwing (`INTERNAL_ERROR` attempt with safe metadata); `nowMs` throwing after the invocation (one attempt) |

Preserved and asserted: an invoked provider rejecting with `TRANSPORT_NOT_STARTED` is a recorded
attempt and an ordinary provider failure that may switch to local; every `start` notice in these
tests is closed by exactly one `abandoned` or `end`.

Fail-first run (before the fix, same final test files):
`/tmp/ltw-stage300-checkpoint-b1-repair2/fail-first.log` (SHA256
`a2fa80dbfcc4d391f0d8711360ea76dbd4c3da2bd773b87bfef80ac051f31f7f`): 15 failed, 16 passed across
`fallback-callbacks.test.ts` and `fallback-cancellation.test.ts`.

## Changes in this repair (against the repair-2 transfer baseline)

`A` added, `M` modified (SHA256 of current content). This request itself is rewritten (the repair-1
request is preserved as the dated copy above). List also at
`/tmp/ltw-stage300-checkpoint-b1-repair2/repair2-delta.txt`.

```text
M  4ce384372cf9a6c120fd1e53a0bb6849283cba863a9cab6b19c6f78ce3ee46d7  .prettierignore
M  7ea9f3d6956ca73bcdb3851c0f83030d4e2a2756c30776413fae1ebf1f1d705e  docs/GATE_COVERAGE.md
M  21f49b9e872041a2537e812ee47de03324e591cf698bd78fc27c2b2e7a718d4e  docs/adr/0017-ai-gateway.md
M  d3fd1e8642c8b6a1b4e48a87e6e39a24fd5d5341d4493a8ab4b888b3aa78abd8  docs/adr/0032-live-ai.md
M  edfb22737e0300239451ffd9846a5e6b791d54e73ef6b1456f3fee23251b32d6  packages/ai/AGENTS.md
A  c2ef9600b4f298fb14e8163298c276411179fd0af57983233885ff0d265d316c  packages/ai/src/fallback-callbacks.test.ts
M  878fb678c35e1b43b43641abecff6fbd15e7fd8c64ab5462fe1f82fc6359c1ea  packages/ai/src/fallback-cancellation.test.ts
M  3ed83b3b7320a5d0c442de322e097c4e47fa47a880293f5185b5993d51fafd06  packages/ai/src/fallback.ts
```

Contract and interface deltas (recorded in ADR 0032 "B1 repair 2", the ADR 0017 B1 amendment,
`docs/GATE_COVERAGE.md` and `packages/ai/AGENTS.md`; no provider-facing envelope or prompt changed):

- Exception contract for caller-supplied code: before an invocation it propagates unchanged with
  nothing recorded; after an invocation it propagates once that invocation's one attempt is recorded
  and its `end` published. Previously such exceptions inside the provider `try` were recorded as
  provider failures and could switch to local; production callbacks (prompt builders, validators,
  the relevance progress handler) do not throw. No public status, outcome-table row or canonical
  contract changes; a use case whose callback throws now rejects (as an internal error) instead of
  continuing on a fabricated failure.
- New exported attempt code `INTERNAL_ERROR` (`packages/ai/src/fallback.ts`), used only when
  `validate` throws on a provider's response; the run then rejects, so no trace carries it at B1.
- A progress listener failure inside a provider's start hook no longer reaches the provider; it is
  rethrown after the attempt is recorded.
- `.prettierignore`: three exact paths added for the orchestrator's repair-1 receipts
  (`reviews/STAGE_300_CHECKPOINT_B1_{IMPLEMENTATION,OPUS,SOL_DESKTOP}_REPAIR_1_RECEIPT_2026-10-11.json`).
  These verbatim evidence files failed `format:check` in the first final-validation attempt; they
  were not edited (hashes unchanged from the baseline). This follows the file's existing pattern
  for verbatim review evidence. The failed attempt's log is kept as
  `/tmp/ltw-stage300-checkpoint-b1-repair2/validate-attempt-1-format-fail.log`.

## Authoritative Documents

- `ARCHITECTURE_INVARIANTS.md`
- `docs/STAGE_300_REMEDIATION_DESIGN.md` §2 (cancellation, attempt observability), §3 (outcome table)
- `docs/adr/0017-ai-gateway.md` §5 and its 2026-10-11 B1 amendment
- `docs/adr/0032-live-ai.md`, the B1 section and its "B1 repair 1" and "B1 repair 2" subsections
- `docs/GATE_COVERAGE.md` (Stage 300 rows and the B1 paragraphs)
- `packages/ai/AGENTS.md`, `work-orders/OPUS_STAGE_300.md`

## Surfaces Available to Reviewer

- Pure package: `packages/ai/src/fallback.ts` (repaired), with `providers.ts`, `router.ts`,
  `intent.ts`, `relevance.ts`, `validation.ts`, `local-provider.ts`
- Server (unchanged by this repair): `apps/server/src/ai/{raw-provider,usage-facts,anthropic-provider,openai-compatible-provider,composition,gateway}.ts`,
  `apps/server/src/platform/config/{ai-routes,config}.ts`
- HTTP: intents, traces, NPC dialogue, Chronicle and `…/context?ranking=ai` (local provider only)
- Test support: `packages/ai/src/testing/{providers,capabilities}.ts`,
  `apps/server/src/testing/{fake-fetch,raw-adapter-fixtures}.ts`

## Start / Reproduce

```text
cd /Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2
git rev-parse HEAD            # 406904343bfe8542640035564d3e044561824125
python3 -I /tmp/ltw-stage300-checkpoint-b1-repair1/manifest.py "$PWD" \
  | diff - /tmp/ltw-stage300-checkpoint-b1-repair2/post-validate-manifest.txt
pnpm exec vitest run --project unit packages/ai/src/fallback-callbacks.test.ts \
  packages/ai/src/fallback-cancellation.test.ts packages/ai/src/fallback.test.ts \
  packages/ai/src/outcome-table.test.ts packages/ai/src/relevance.test.ts
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
selected after the caller's signal aborts; no attempt is recorded for a provider that was not
invoked. A decline or invalid output never becomes a committable proposal or an authoring source
(invariants 1, 2, 5, 11, 16, 17, 18, 21).

## Validation Already Run by Implementation Writer

Run on the tree hashed in the pre-validate manifest (identical afterwards), with no provider key or
route variable in the environment (checked: none present).

| Command                                                                                            | Result                                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure package suites during repair (`packages/ai`)                                                  | PASS: 16 files, 241 tests                                                                                                                      |
| `pnpm run format:check`                                                                            | PASS (after the `.prettierignore` entries above)                                                                                               |
| `pnpm run lint`                                                                                    | PASS (0 warnings)                                                                                                                              |
| `pnpm run typecheck`                                                                               | PASS                                                                                                                                           |
| `pnpm run context-budget`                                                                          | PASS: 649 active files, 0 over target, 0 over hard limit                                                                                       |
| `pnpm run test` (unit)                                                                             | PASS: 185 files, 1975 tests                                                                                                                    |
| `pnpm run build`                                                                                   | PASS                                                                                                                                           |
| `pnpm run db:migrate`                                                                              | PASS: 0 applied, 6 already applied (127.0.0.1:54329/ltw)                                                                                       |
| `pnpm run seed:ravenford`                                                                          | PASS: 0 accepted, 91 duplicate (idempotent)                                                                                                    |
| `pnpm run test:integration`                                                                        | PASS: 28 files, 138 tests (throwaway databases)                                                                                                |
| `pnpm run test:e2e`                                                                                | PASS: 45 tests                                                                                                                                 |
| Whole `pnpm validate`                                                                              | exit 0; log `/tmp/ltw-stage300-checkpoint-b1-repair2/validate.log` (SHA256 `b2d8a65f81cf26f1130c0ebc000bf7cb54786ec7f12eb416fb04b03045f1f3d2`) |
| Manifest recheck after the run                                                                     | identical to the pre-validate manifest                                                                                                         |
| Accepted A accounting/migrations (30), both design hashes, 57 pinned review/handoff evidence files | unchanged                                                                                                                                      |

The `db:migrate` and `seed:ravenford` package scripts start Node with
`--env-file-if-exists=../../.env.local` (existing scripts); a `.env.local` exists. The writer did
not open, print or inspect it; those two CLIs construct no AI provider and connected only to the
local development database shown above.

## Known Limitations

- If the caller's signal aborts during the `end` notice after a result has been selected, the
  selected result is still returned; the durable outcome-freeze boundary is B2.
- When caller code throws after an invocation, the run rejects, so the recorded attempt is visible
  only through its `end` notice; no trace is written for that request at B1 (the request journal is
  B2).
- Admission, the request journal, whole-request deadlines for intents, dialogue and Chronicle,
  outcome freeze, recovery wiring, the diagnostic read, nullable trace IDs, cache metadata and
  accounting, and the approved stop-scope delta are B2; evaluation admission, oracles, reports and
  client feedback are C. No remote provider is routable at B1.
- Unchanged from repair 1:
  - Prepared requests are not single-use (B2's wrapper must dispatch once per reservation).
  - The router-construction pin is a source text scan.
  - A denial resolved after the caller has gone is recorded as `CALLER_CANCELLED`.
  - Usage allowlists are not verified against provider documentation.
  - Classification is tested against fake responses only.

## Coverage Ledger

| Surface                                                                                                | Status at B1 repair 2                | Evidence / next review                                                                                   |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Fallback invocation boundary and callback exceptions                                                   | Due, tested                          | `fallback-callbacks.test.ts`                                                                             |
| Caller cancellation incl. validation and callbacks, coincident timeout, late output, progress          | Due, tested (fallback and relevance) | `fallback-cancellation.test.ts`, `relevance.test.ts`                                                     |
| Outcome table, all four capabilities; one local call                                                   | Due, tested                          | `outcome-table.test.ts`, `fallback.test.ts`, `intent-envelope.test.ts`, `gateway.test.ts`                |
| Raw adapters, classification, own-name usage allowlists                                                | Due, tested (unchanged)              | `raw-adapters.test.ts`, `raw-adapter-hardening.test.ts`, `anthropic-provider.test.ts`, `live-ai.test.ts` |
| Intent envelope, decline, authoring refusal                                                            | Due, tested (unchanged)              | `intent-envelope.test.ts`, `apps/server/src/http/authoring-routes.test.ts`                               |
| Composition identity on one frozen snapshot, no remote/key/fetch                                       | Due, tested (unchanged)              | `router.test.ts`, `composition.test.ts`, `gateway.test.ts`, `tests/architecture/`                        |
| Route validation                                                                                       | Due, tested (unchanged)              | `live-ai.test.ts`                                                                                        |
| Provider prompt/envelope deltas                                                                        | Recorded (none in this repair)       | `docs/GATE_COVERAGE.md`; Gate 06 after Stage 350                                                         |
| Admission wrapper, journal, deadlines, freeze, recovery, diagnostic read, cache accounting, stop scope | NOT YET IN SCOPE                     | B2                                                                                                       |
| Evaluation admission, oracles, reporting, client feedback                                              | NOT YET IN SCOPE                     | C                                                                                                        |
| Live provider behavior                                                                                 | NOT YET IN SCOPE                     | Requires explicit text-provider ceilings; Gate 06                                                        |

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
