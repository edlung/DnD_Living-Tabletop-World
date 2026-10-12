**Verdict: PASS**

# Stage 300 remediation checkpoint C: independent acceptance review (claude-opus-5-5, xhigh)

There are no Critical or High findings. I found two Medium defects, both in evaluation reporting rather than in spending or safety enforcement, plus some Low items. Every required check passes. One integration test failed once under full-suite load; it passed when rerun alone and when the whole suite was rerun.

## 1. Artifact identity verified

- **Design hashes match the brief.** `docs/STAGE_300_REMEDIATION_DESIGN.md` is `23e53e4d…aab2` and `docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md` is `6bba0030…b485`.
- **Dirty-file manifest reproduced.** I hashed all 67 listed files in handoff order with `shasum -a 256`. The hash of that output is `16e5de18d5562bf9b56159bad63ab7f7752c6cb9906cd3e49620e650284dd311`, as the handoff claims. The listing includes the catalog record (`5c26853b…`) and owner decisions 5 (`fe9639b0…`).
- **Base commit not checkable.** The snapshot has no git metadata, so I could not verify base commit `e288678`.

## 2. Findings

**M1 (Medium): one intent oracle passes a proposal with extra, unrequested world changes**
- **Where:** `apps/server/src/testing/eval/cases.ts:76-88`, the "add a fishmonger by name" case.
- **Problem:** the check confirms exactly one correct `CreateEntity` but never limits the total number of commands. The "guard" and "move Orin" cases do limit it.
- **Probe result:** each of these was judged `correct-proposal` with `semanticPass: true`:
  - the correct `CreateEntity` for Лена Фокс plus `ChangeEntityStatus mira-vale dead`;
  - the same plus a `PlaceEntity` moving Orin to north-gate.
- **Requirement violated:** design §4 ("false-positive evaluation predicates", "wrong … command type") and the handoff's "exact intent oracles". A live report would count a proposal that also kills an NPC as semantically correct.
- **Related, Low:** in the guard case (`cases.ts:56-73`), the testimony's `statement` is never checked; "Луна голубая." passes.

**M2 (Medium): the "measured" basis of the 45-minute session estimate understates cost**
- **Where:** `apps/server/src/testing/eval/eval-report.ts:65-80` and `session-estimate.ts:82-97`.
- **Cause:** samples come from the attempt views' `usage`. For Anthropic that is `input_tokens` only, which excludes cache-write and cache-read tokens. Admission-denied remote attempts (usage 0/0) also count as samples.
- **Probe result:** one request really billed 11,900 µ$ (100 input + 3,000 five-minute cache write + 2,000 cache read + 400 output). The estimate's "high" figure was 4,250 µ$ per request, and the denied attempt pushed "low" to $0.
- **Consequence:** the report's statement "every input token at the highest priced input rate" (`session-estimate.ts:139-141`) is false once real data exists, which is the configuration in use (Sonnet with the 5-minute cache).
- **Not affected:** the current offline evidence uses the assumed token ranges, and that arithmetic is correct. The run's known charges come from accounting and are also correct.

**L1 (Low): null or absent `service_tier` / `inference_geo` are accepted**
- **Where:** `usage-facts.ts:170-172` (a null label counts as absent).
- **Probe result:** `inference_geo: null`, `service_tier: null` and an absent `service_tier` all priced as known standard usage.
- **Relation to the record:** the record says the labels "must be `standard`" and "must be `global`", while its schema section also allows null. The entry's allowlists match the record exactly; null handling is the earlier-accepted shared mechanism, and the implementer disclosed it in ADR 0032 (lines 424-426) and the handoff.
- **Recommendation:** the orchestrator or owner should confirm this reading or require the labels to be present.

**L2 (Low): the price bound covering the full context depends on the adapter's internal body structure**
- **Where:** `pricing.ts:53-68`.
- **Background:** the request allowlist checks top-level fields only. The probe confirms it rejects `thinking`, `temperature`/`top_p`, forced `tool_choice`, `effort: high`, extra `output_config` keys, other models and `max_tokens` over 128,000.
- **Gap:** it does not check nested content. An assistant prefill, `cache_control.ttl: "1h"` or a server tool inside `tools` all still reserve normally.
- **Why it matters now:** C deliberately leaves the 1-hour write rate unpriced. That is stricter, and matches the record's "5-minute caching only" example. But it means the reserved 2.5 µ$ per token covers a 1-hour write (4 µ$) only because the trusted adapter never sends one. Settlement would still fail closed.

**L3 (Low): the no-network proof tests would pass even without the config**
- **Where:** `tests/architecture/no-network*.test.ts`.
- **Problem:** both tests import `tests/setup/no-network.ts`, and importing it installs the trap. They would still pass if `setupFiles` were removed from `vitest.config.ts`.
- **Status:** the config itself is correct (`vitest.config.ts:15`). The trap covers `fetch` only, which is the only transport the adapters use (`raw-provider.ts:99`).

**L4 (Low, test reliability): a 300 ms relevance-budget test is timing-sensitive**
- **Where:** `apps/server/src/ai/journal.integration.test.ts:190-222`. C changed only its hold expectation (286,080 µ$).
- **What happened:** it failed once under full-suite load: `attempts: []`, meaning no attempt was admitted before the deadline. It passed when rerun alone and in a full rerun.

**Info:**
- The handoff lists `ROUTE_REFUSED` last, but `eval-live.ts:99-100` checks route problems before connecting to the database. All refusals still happen before any provider is built or key read.
- `approvalExists` (`eval-live.ts:112`) is not wrapped in a try/catch, so a database error there throws instead of returning a fixed refusal.

## 3. Checks

| Check | Result |
| --- | --- |
| `pnpm run format:check` | PASS |
| `pnpm run lint` | PASS (exit 0, 0 warnings) |
| `pnpm run typecheck` | PASS |
| `pnpm run context-budget` | PASS: 708 active files, 0 over target, 0 over hard limit |
| `pnpm run test` | PASS: 203 files / 2,271 tests |
| `pnpm run build` | PASS |
| `pnpm run db:migrate` | PASS: 0 applied, 8 already applied |
| `pnpm run seed:ravenford` | PASS: 0 accepted, 91 duplicates, version 113 |
| `pnpm run test:integration` (run 1) | 1 failed / 178 passed (33 files); the L4 test |
| `journal.integration.test.ts` rerun alone | PASS: 9/9 |
| `pnpm run test:integration` (full rerun) | PASS: 33 files / 179 tests |
| `pnpm run test:e2e` | PASS: 49/49 (ports 4310/4311 were free) |

## 4. Probes and outcomes

- **Usage classification and pricing against the record:** all as the record requires.
  - Priced correctly: baseline (700 µ$), 5-minute cache write, cache read.
  - Unverified billing: a 1-hour write; a cache-write total without its split; a split mismatch; `service_tier` priority or batch; `inference_geo` us; nonzero, unknown or malformed server-tool counts; `speed` fast; any non-null `fallback_credit`; thinking above output; an unknown field; `__proto__`; non-integer or negative counts.
  - Iterations: entries of the wrong type, mismatched sums, missing output, unknown fields or an empty array are all rejected.
  - Wrong response models (`opus`, a dated version, a fixture alias, none) are `UNEXPECTED_MODEL` (existing test).
- **Reservations per capability:** 2,520,480 / 2,540,960 / 2,581,920 / 2,622,880 µ$. The 4,096-token value equals the record's example.
- **Unverified pricing in the admitted wrapper:** it still discards output, keeps the hold and stops the route (`admitted-provider.ts:195-204`). C did not weaken this.
- **Evaluation admission:** admission rechecks run registration, approval and campaign binding (`admission.ts:94-99`). Preflight refuses before any provider or key. Run directories use a fresh `mkdir` and exclusive (`wx`) writes, and writing into historical evidence is refused (tests pass).
- **Session estimate (assumed basis):** independently recomputed $0.567 to $3.395 ($6.79 with repairs). M2 covers the measured basis.
- **Client:**
  - Authoring narrows null or non-`PROPOSED` results and never posts a null source.
  - `perform-npc.tsx` aborts and discards a reply when the listener changes or the panel unmounts.
  - The E2E journeys pass.
- **Not run:** two CLI invocations (`pnpm eval:ai --live …` refusals and `pnpm eval:ai --offline`) were blocked by the permission layer, and I did not work around it. The same paths are covered in-process by `eval-run.test.ts` and `eval-live.integration.test.ts`, which both pass.

## 5. Residual risks and what I could not verify

- **No live behaviour verified.** Sonnet 5.5 latency, truncation at the chosen efforts, real usage fields (including whether API-key traffic carries the fields outside the public schema) and the response `model` string are all unmeasured.
- **Holds on relevance timeouts.** With the 2,000 ms relevance default, each post-dispatch timeout holds about $2.52, so about 11 holds would use up the $30 grant. This is disclosed and consistent with the design.
- **Evaluation data shares the Ravenford campaign.** Evaluation traces land in the shared database under campaign `ravenford`, visible to its DM.
- **Untested path.** The approval-mismatch branch of `RUN_BOUND_ELSEWHERE` has no dedicated test; the code is a simple OR condition.
- **Base commit and other sessions.** I could not verify base commit `e288678`, and I cannot see the max-effort reviewer's report.
