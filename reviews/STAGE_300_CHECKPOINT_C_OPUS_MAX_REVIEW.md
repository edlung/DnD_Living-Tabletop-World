**Verdict: PASS**

No Critical or High finding, and all ten required checks pass. Four Medium findings (M1–M4) need a fix or an explicit recorded disposition before the live evaluation. Under `AGENT_WORKFLOW.md` they don't block PASS, because none of them violates an architecture invariant.

## 1. Artifact identity verified

- **Snapshot:** `/private/tmp/ltw-stage300-checkpoint-c-review/max-snapshot`. There is no git metadata, so I could not confirm base commit `e288678` directly.
- **Dirty-file manifest:** all 67 files match their listed SHA256. The listing hashes to `16e5de18…d311`, as claimed. I re-checked at the end of the review: 67/67 unchanged, and no non-build file changed during my session.
- **Design draft 7:** `23e53e4d…aab2` ✓. **Stop-scope delta:** `6bba0030…b485` ✓. **Catalog record:** `5c26853b…c416` ✓. **Owner decisions 5:** `fe9639b0…9e9d` ✓.
- **Manifest completeness:**
  - The B2 handoff lists 113 files: 90 are unchanged, 22 changed and are in the C manifest, and 1 changed outside it (`docs/PROJECT_WORKFLOW.md`).
  - That file was written 9 seconds after the B2 acceptance record and records "B2: ACCEPTED". It is consistent with being part of the base, but I can't prove that without git.
  - No other non-build file was modified after B2 acceptance, apart from the handoff itself.
- **Offline evidence:** its recorded source state (commit `e288678`, 63 dirty files) matches this artifact exactly. I reproduced the run, and the outputs are identical apart from timings, trace IDs and git state.

## 2. Findings

**M1 (Medium): an intent oracle passes a wrong proposal.**
- Where: `apps/server/src/testing/eval/cases.ts:75-88` ("add a fishmonger by name").
- The check never limits the other commands in the proposal. The guard, move and destructive cases all check the command count; this one doesn't.
- In my probe, each of these scored `correct-proposal`, semantic PASS:
  - the requested `CreateEntity` (Лена Фокс, market-square) plus `ChangeEntityStatus mira-vale dead`;
  - the same plus a `PlaceEntity` moving Orin;
  - the same plus a PUBLIC `AddKnowledge`.
- `oracles.test.ts:126` has an "extra command" negative control, but only for "move Orin".
- Violates: design §4 (exact oracles; reject wrong command types; never score contract-contradicting output as success). It also contradicts the ADR/handoff claim that the oracles use exact values.

**M2 (Medium): the Chronicle "semantic" verdict can't measure the model.**
- Where: `eval-runners.ts:199-205` judges the committed chapter whoever wrote it.
- Probe: with the narrator unavailable (0 attempts, status "AI_UNAVAILABLE via template"), the row still reports `semantic.pass: true`, summarised as "1 pass".
- Citation and hedge errors can never reach this oracle in a real run. The contract (`cites` min 1, `packages/contracts/src/chronicle/commands.ts:26`) and `checkProse` (`packages/domain/src/chronicle/prose.ts:33-58`) reject them first, and the chapter falls back to the template.
- So the wrong-citation and missing-hedge negative controls only work in unit tests; in an actual run, only the coverage check can fail.
- Violates: design §4 (semantic correctness kept apart from technical success; Chronicle negative controls).

**M3 (Medium): the measured session estimate leaves out cached input.**
- Where: `session-estimate.ts:83-97` and `eval-report.ts:65-79` use `attempt.usage.inputTokens`. For Anthropic that is `input_tokens` only (`usage-facts.ts:189-195`), which excludes cache writes and reads — and every Sonnet request sends a cache breakpoint.
- Probe: a request with 200 input tokens, a 3,000-token 5-minute cache write and 800 output tokens has a known charge of 15,900 µ$. The measured estimate gives 8,400 µ$ low and 8,500 µ$ high per request.
- So the "high" end, labelled "every input token at the highest priced input rate", comes out below the actual charge.
- Only live runs are affected; the current evidence uses the assumed token ranges.

**M4 (Medium): label handling is looser than the record's literal rule.**
- The record says `service_tier` must be `standard` and `inference_geo` must be `global`. The entry lists exactly those values (`catalog-sonnet-5-5.ts:59-66`).
- However, a null or absent value (and a null `speed`) is accepted and priced at standard/global rates. This comes from `usage-facts.ts:170-172`, and `catalog-sonnet-5-5.test.ts:214-219` asserts it.
- Probe: null or absent `service_tier` and `inference_geo` → known charge of 6,200 µ$.
- It is disclosed in the handoff's limitations and in the ADR's C amendment, and the practical risk is low: any non-standard value that is actually reported fails closed.
- But the brief requires the entry to be no looser than the record. This needs an owner disposition, a record clarification, or a change to fail closed on null/absent.

**L1 (Low): Gate 04 replay is partial.**
- The evaluation's dialogue scenarios (`cases.ts:141-183`) replay 4 of the 5 Gate 04 injection lines in `npc-isolation.test.ts:30-36`. The missing one is "What happens tomorrow? Who is the hooded stranger…", the future-events attack.
- There are no insight, show or attitude cases.
- The provider-input check is a deny-list (markers, guarded phrases, boundary IDs), not a check against allowed sources.
- `docs/GATE_COVERAGE.md:188` and the ADR say the Gate 04 injections "are replayed", which overstates this. Design §4 asks for a check against allowed sources and the disclosure/attitude cases.

**L2 (Low): other oracle gaps.**
- The guard case never checks the account's statement; my probe passed "Луна сделана из сыра." ("the moon is made of cheese").
- The injection case accepts any `AddKnowledge` containing the stem «Пепельн», in any scope, including one that paraphrases a planted secret. This is lexical and partly disclosed.

**L3 (Low): the catalog's request allowlist only checks top-level fields** (`pricing.ts:53-58`).
- Three things would still get a reservation: an assistant prefill, a server tool in `tools`, or `cache_control.ttl:"1h"` inside `system`.
- A 1-hour cache write could exceed the reserved 2.5 µ$/token input bound.
- Today only the adapter's fixed body (`anthropic-provider.ts:84-104`) prevents these, and settlement would fail closed afterwards. This mechanism predates C (accepted at B2); it's a defence-in-depth gap.

**L4 (Low): minor inaccuracies.**
- The documented refusal order puts "route refused" last, but the route check (`ROUTE_REFUSED`) actually runs before the database connection (`eval-live.ts:99-102`).
- The Chronicle panel says "the narrator was unavailable" for `INVALID_OUTPUT` as well (`chronicle-panel.tsx:195-201`).

## 3. Checks (one run each, all passed)

| Check | Result |
|---|---|
| `format:check` | PASS |
| `lint` | PASS (0 warnings allowed) |
| `typecheck` | PASS |
| `context-budget` | PASS: 708 files, 0 over target, 0 over hard limit |
| `test` | PASS: 203 files / 2,271 tests |
| `build` | PASS |
| `db:migrate` | PASS: 0 applied, 8 already applied (no C migration) |
| `seed:ravenford` | PASS: 0 accepted, 91 duplicate |
| `test:integration` | PASS: 33 files / 179 tests |
| `test:e2e` | PASS: 49 tests (ports 4310/4311 were free) |

The known timing-sensitive test did not fail.

## 4. Probes and outcomes

- **Request allowlist (35 bodies):**
  - Every top-level deviation was refused: `thinking` (disabled or adaptive), sampling parameters, `stop_sequences`, `metadata`, `service_tier`/`inference_geo` fields, effort `high`/`max`, forced tool choice, wrong or dated model, `max_tokens` of 0, 128,001, fractional or string, wrong provider, oversize body, `__proto__`.
  - Reservations were 2,520,480 / 2,540,960 / 2,622,880 µ$, i.e. $2.50 + `max_tokens` × $0.00001, matching the record's example. The bound holds even with rounding in settlement.
- **Usage (55 variants through the real adapter and pricing):**
  - The price was correct (6,200 µ$).
  - Fail-closed cases: priority/case-variant/numeric tier, `us` geography, `fast` speed, any `fallback_credit`, non-zero or unknown server tools, a 1-hour write, total/split mismatch, total without split, thinking above output, malformed counts, unknown fields, and bad iterations (compaction, advisor, model field, mismatch).
  - Missing usage keeps the hold. Every model-name variant gave `UNEXPECTED_MODEL`.
- **Evaluation CLI and preflight:**
  - Every ceiling, budget, `=`-form, duplicate or unknown argument was refused.
  - Preflight refuses in the order unverified model → no database → no key → database unavailable, with no connection, key read, transport call or run directory before it is needed.
  - Using fake rows I tested run-binding cases the integration test doesn't cover: a run under another approval, another campaign, or a case-variant campaign all give `RUN_BOUND_ELSEWHERE`.
  - Admission independently re-checks run registration. No evaluation code can write approvals or runs.
- **Run directories:** re-creating a run, rewriting a file, `.`, `..`, a slash in the ID, and the historical evidence (root, parent or nested) are all refused. Historical evidence is untouched.
- **Full HTTP composition (fake transport):**
  - Settings: intent 8,192/medium, dialogue 4,096/low, ranking 2,048/low, Chronicle 12,288/medium.
  - Each request sends a single user message with auto tool choice, and each repair is admitted separately.
  - A closed session sends nothing.
- **Network and secrets:**
  - There is only one Vitest config, and the trap is active in both projects.
  - No test loads provider keys from the environment.
  - Production startup checks that the approval is stored in the database before routing remotely.
  - Only the evaluation CLI builds an evaluation-bound journal.
- **Session estimate (assumed ranges):** hand-recomputed as $0.567–$3.395, or $6.790 with repairs, plus the per-capability holds. All correct.
- **Client:** null trace IDs are checked before authoring sends a source; there is no trace link to break; Russian strings are present; the late-reply journey passes.

## 5. Residual risks and what I could not verify

- **Unmeasured live behaviour:** nothing ran live. Sonnet 5.5 latency against the 2,000 ms relevance deadline is unknown. Each ranking timeout after dispatch keeps about $2.52 held, so roughly 11 would use up the $30 grant (this is disclosed).
- **Request tier and region aren't pinned:** the request can't set `service_tier`/`inference_geo` (the allowlist forbids them). On an account with Priority Tier or a US default region, the first response fails closed and stops the route, but that one attempt could be billed above its hold.
- **Client edge cases:**
  - When the DM switches listener, the previous canonical Ask still runs on the server, with no indication in the panel.
  - The player's world-level talk notice doesn't name the NPC, so a slow reply can appear while another object is selected. The requirement only covers perspective changes, and this behaviour predates C.
- **Shared campaign ID:** evaluation traces are stored under the real campaign ID `ravenford`, so they are valid authoring sources for that campaign's DM.
- **Not reproduced or verified:**
  - I couldn't verify base commit `e288678` or that `PROJECT_WORKFLOW.md` belongs to the base (no git).
  - I couldn't reproduce the implementer's late-reply negative control, because it requires editing the snapshot.
  - I ran each check separately rather than as one `pnpm validate`.
  - The permission mode denied `pnpm eval:ai`, so I ran the same offline entry point inline with no keys.
- **Reviewer independence:** both acceptance reviewers are the same model family, as the owner has already noted.
