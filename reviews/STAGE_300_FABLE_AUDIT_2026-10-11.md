# Independent Fable audit — Stage 300

Date: 2026-10-11. Baseline: `bc6c1162073f6c1c1e7bfb5b775d88a50b639181`.
Native Anthropic Claude Code, Max authentication, explicit `claude-fable-5-1 / high`;
actual assistant message models: `claude-fable-5-1`. Elapsed: 337.6 s. Read-only, no live calls.
Transport receipt: `reviews/STAGE_300_REVIEW_RECEIPTS_2026-10-11.json`.
This is an audit report, not architecture approval or an implementation work order.

Finished reading. I have inspected the adapters, ledger, routing, fallback, traces, config, the evaluation harness, the evidence files, the client paths, and the tests. Writing the review now.

## Stage 300 independent review (baseline `bc6c116`)

**Verdict: FAIL for checkpoint acceptance.** The adapters, routing, and key handling are sound. The spending ceiling, trace cost deliverable, prompt caching, client state, and owner-input process do not meet the work order. Stage 310 should not depend on the ledger or trace shape as they stand.

Scope and method: read-only inspection of the committed source. No live providers, no `.env` files, no test runs. The report correction of 2026-10-11 is treated as administrative only.

### Findings by severity

**HIGH 1. The daily ceiling is not a cap.** `apps/server/src/ai/budget.ts:61-68` checks `exhausted` before the call and records after it, so any number of concurrent requests pass the gate together. The ledger is a process-local `Map` (`budget.ts:24-25`) with no persistence, so a restart or crash loop resets spend to zero. Nothing hydrates it from the trace table, although every trace already stores token usage. The evaluation harness builds a fresh gateway, and therefore a fresh ledger, per capability and model (`apps/server/src/testing/eval/eval-cli.ts:54-60`), so the ceiling it sets at `eval-cli.ts:58` applied ten times over, not once per run. That same line raises the ceiling to $20 by default, above the server default of $5 (`config.ts:92`), without an owner-recorded figure.

**HIGH 2. Billed failures escape both the ledger and the traces.** `anthropic-provider.ts:110-122` throws on `max_tokens`, `refusal`, and a reply without the tool call, discarding the `usage` block the provider returned. `openai-compatible-provider.ts:107-111` does the same for `length` and a missing tool call. `fallback.ts:77-86` then records the attempt with `model: null, usage: null`. A refusal or a truncated answer is a paid call that no ledger or trace counts. The work order requires token usage and cost "for every attempt".

**HIGH 3. Computed cost is not in any trace.** `AiAttemptView` (`packages/contracts/src/ai-gateway/intents.ts:61-73`) has no cost field. `costUsd` is computed only inside `budgeted()` (`budget.ts:63-67`) and again, separately, in the harness (`eval-cli.ts:100`). Neither value is persisted. In addition, the relevance use case drops all attempts on timeout (`packages/ai/src/relevance.ts:154`, `answered?.attempts ?? []`), so a ranking call that returns after the budget is billed, recorded in the ledger when it lands, and absent from the trace. The deliverable "traces record ... computed cost for every attempt" is not met for any capability, and "every attempt" is not met for relevance.

**HIGH 4. Owner inputs and acceptance.** The work order (`work-orders/OPUS_STAGE_300.md:25`) says no paid call happens before the owner sets the ceiling. The report records that paid runs happened without that approval and that silence was treated as consent (`reports/STAGE_300_COMPLETION.md:5-7`). Owner play acceptance and the NPC voice choice are pending (`:3`, `:31-34`; `docs/PROJECT_WORKFLOW.md:19, 29`). Independent of code quality, the Validation Gate and Owner Acceptance sections are unmet.

**MEDIUM 5. Ledger prices by the wrong key.** `budget.ts:17-19` looks up `PRICES[response.model]`, where `response.model` is the string the provider returned. The adapter's own test fixture shows Anthropic returning a dated identifier, `claude-opus-5-5-20261001` (`anthropic-provider.test.ts:46`), which misses the table and falls to the `[10, 50]` default. That overprices Opus 2.5× and Sonnet 5×. The direction is conservative, but the ceiling number no longer means what the owner set, and the harness prices by the requested model (`eval-cli.ts:100`), so the report's cost figures and the ledger's disagree.

**MEDIUM 6. Per-campaign and per-session ceilings are absent.** Acknowledged in ADR 0032 §4 and the report, but the work order requires per campaign. The root cause is structural: `ProviderRequest` (`packages/ai/src/providers.ts:56-64`) carries no account scope, so nothing below the use case can meter by campaign.

**MEDIUM 7. Prompt caching was not implemented and is not listed as a limitation.** No `cache_control`, `cache_read`, or `cached_tokens` appears anywhere in the repository. The Anthropic body sends `system` as a plain string (`anthropic-provider.ts:49`). ADR 0032 §4 says "cache discounts ignored", which is true only because none exist. The streaming decision the work order asks for is also unrecorded. The Limitations section (`STAGE_300_COMPLETION.md:36-42`) omits caching.

**MEDIUM 8. The client deliverable is unmet.** The player path shows the generic "Resolving your action…" notice (`apps/web/src/exploration/use-action.ts:56`) and collapses `AI_UNAVAILABLE` and `INVALID_OUTPUT` into "No spoken reply is available" (`use-action.ts:70`). The DM perform panel does distinguish unavailability (`apps/web/src/dm/perform-npc.tsx:71-73`). There is no reply-specific waiting state for players and no journey test. The report admits this at `:41`.

**MEDIUM 9. The intent prompt contradicts the contract it feeds.** `packages/ai/src/prompt.ts:31` instructs the model to return an empty commands list for a non-game request. `proposalCommandsSchema` requires at least one command (`packages/contracts/src/authoring/commands.ts:48-51`). Every correct empty answer is therefore invalid, triggers a paid repair attempt, and ends as `INVALID_OUTPUT`. The harness counts that as a pass (`eval-cli.ts:113-116`). The Sonnet failure in the evidence (`eval-report.md:11`, a command with no name) is the repair loop inducing exactly the invention the instruction forbids. This is a prompt change to what the provider receives and is not recorded for Gate 06.

**MEDIUM 10. Anthropic adapter gaps.** `tool_choice: auto` is sent with no `strict` flag on the tool (`anthropic-provider.ts:51-58`), although ADR 0032 §1 describes "an unforced strict tool". The refusal path (`:113-115`) has no unit test; the `it.each` at `anthropic-provider.test.ts:119-135` covers overload, rate limit, bad key, non-JSON, no tool, wrong tool, and truncation only. The Haiku effort omission (`gateway.ts:57`) is untested. The claim that current models reject a forced tool call with a 400 (`:7-9`, ADR 0032 Context) has no captured artifact in the evidence directory; a live assertion should be preserved as a trace or response excerpt with the key redacted.

**MEDIUM 11. Default routing bills Opus for relevance.** With an Anthropic key and no `LTW_AI_ROUTES`, `gateway.ts:83-87` routes `fast-context` to `claude-opus-5-5` (`config.ts:87`) under a 2 second budget (`config.ts:89`). Opus median latency in the evidence is about 4 seconds (`eval-report.md:9`), so nearly every ranked context request would pay for a call whose result is discarded. Startup logs only the reasoning route (`main.ts:60`). ADR 0032 notes "set routes" but the code does not protect against this.

**MEDIUM 12. Harness evidence is weaker than the deliverable text.** One run per case (report `:37`). Chronicle passes on "rendered by a non-local provider and contains Cyrillic" (`eval-cli.ts:213-216`); citation and hedging rely entirely on `validateChronicle`, which the harness does not assert separately. Relevance has one case and does not assert that the action set is unchanged (`eval-cli.ts:243-250`). The intent `mustNotCommit` check accepts any 4xx from the authoring route as a pass (`eval-cli.ts:130`), so an unrelated validation error would count as protection. Cost per 45 minute session is computed by hand in the report (`:28-29`), not by the harness. `String(error)` is written into committed evidence (`eval-cli.ts:301`); `ProviderError` messages are fixed, but other exception types could carry hostnames.

**MEDIUM 13. Documentation obligations.** `docs/AI_CONTEXT_MAP.md` has no row for live AI, routes, the ledger, or the harness. `packages/ai/AGENTS.md:34` and `apps/server/AGENTS.md:19` still name only the Anthropic adapter. `docs/GATE_COVERAGE.md:29` lists Stage 300 as a future obligation with no introduction evidence section, unlike Stage 290 at `:85`. The system suffix at `anthropic-provider.ts:49` and the instruction at `prompt.ts:31` both change what a provider receives and belong in that section. `README.md` has no `eval:ai` entry.

**LOW 14. Data residency.** The player's words and the NPC context go to DeepSeek when routed there (`npc-routes.ts:100-109` into `dialogue.ts`). `docs/IMPLEMENTATION_PREREQUISITES.md:78` leaves disclosure open under Q11. Not a code defect, but Gate 06 should see it named.

**LOW 15. Blind comparison.** `reports/evidence/stage-300/blind-key.json` is committed beside the blind document. The blind holds only by discipline. Keep the key out of the published artifact until the choice is recorded in the ADR.

### What passes

- **Key handling.** Keys live in `Secret` (`config.ts:63-85`), are read lazily at send time (`gateway.ts:53, 70`), and never enter error messages (`providers.ts:83-91`, both adapters). `.env.*` is ignored (`.gitignore:14-16`). Config errors name variables, not values. Logs carry statuses and trace IDs only (`npc-routes.ts:110-119`).
- **Authorization.** Unchanged from Stage 100. Intents are DM-only (`ai-routes.ts:60-62`); dialogue passes `checkTalk` before and after the command.
- **Fallback and abort.** Both adapters honour the caller's signal through `AbortSignal.any` and map it to `TIMEOUT`. The one-switch, one-repair policy is unchanged (`fallback.ts:60-112`). Exhausted budget surfaces as `UNAVAILABLE` and so falls to the next provider.
- **Context builders.** The dialogue, relevance, and chronicle request builders are untouched; only instruction text changed.
- **Harness isolation.** `eval:ai` is a plain script (`package.json:29`), excluded from the build (`apps/server/tsconfig.build.json:10`), and not a `*.test.ts`, so `pnpm validate` and CI never reach it.

### Required fixes and tests

1. **Reserve-then-settle ledger.** Reserve an upper-bound estimate before the call (prompt tokens estimated from character count, output bound from `max_tokens`), settle to actual usage after, refuse when reserved plus spent would cross the ceiling. Test: ten concurrent calls against a ceiling that admits one. Test: a provider that throws after billing still settles.
2. **Persist spend.** Hydrate the ledger at startup from `ltw_ai_traces` usage by day and campaign, or add an `ltw_ai_spend` table written in the same path as the trace. Test: restart with a near-exhausted day refuses the next call.
3. **Usage on failure.** Give `ProviderError` an optional `usage` and `model`; set them in both adapters before throwing on refusal, truncation, or missing tool call. Record them in `fallback.ts:77-86`. Test: a refusal response decrements the ceiling and appears in the attempt with tokens.
4. **Cost in traces.** Add `costUsd` and `requestedModel` to `AiAttemptView` (additive contract change). Compute in one place and pass through `runWithFallback` via a pricing callback. Test: every trace attempt has a non-null cost whenever usage is present.
5. **Late attempts for relevance.** Have `runWithFallback` emit each attempt through a callback as it completes, so a ranking that returns after the budget is appended as a `late` attempt on the same trace, or as a linked follow-up trace. Test: a provider that answers after the budget produces a `TIMEOUT` ranking and a traced, priced attempt.
6. **Price by requested model** with alias normalization. Refuse a route whose model has no price unless an explicit override allows it. Test: a dated response model prices as its alias.
7. **Campaign and session scope.** Add an `account: { campaignId, sessionId }` field to `ProviderRequest`, set by each use case, never rendered into the prompt. Add `LTW_AI_CAMPAIGN_BUDGET_USD` and a per-session ceiling. Test: campaign A exhausted leaves campaign B serving.
8. **Default routing.** Without `LTW_AI_ROUTES`, route `fast-context` to nothing, and log the full route table at startup. Test: key set, routes unset, relevance list is empty.
9. **Empty proposal.** Decide with the owner: either a `NOTHING_TO_PROPOSE` intent status validated before repair, or remove the instruction at `prompt.ts:31`. Record the change in `GATE_COVERAGE.md`. Test: an empty commands list yields the new status with one attempt and no repair.
10. **Anthropic adapter.** Add `strict: true` to the tool definition if the owner accepts the ADR text, add a refusal unit test, add tests for effort presence and Haiku omission, and preserve a redacted artifact of the forced-tool 400.
11. **Caching.** Mark the system block and tool definition with `cache_control: ephemeral` for Anthropic. Extend `usage` with cache read and write token counts for both providers and price them at the published discounted rates. Test: cached tokens are recorded and priced separately.
12. **Client.** A player-visible replying state keyed on the dialogue request, a failure message that distinguishes unavailable from invalid output, and one journey test under `tests/e2e/`.
13. **Harness.** Assert the Chronicle citation and hedge rules explicitly, assert the relevance action set is unchanged by ID, tighten `mustNotCommit` to a specific refusal code, compute cost per session in the script, run each case at least three times, and write only `ProviderError.code` into committed evidence.
14. **Documentation.** Add the Stage 300 row to `AI_CONTEXT_MAP.md`, update both `AGENTS.md` files, add a Stage 300 introduction evidence section to `GATE_COVERAGE.md`, and add `eval:ai` to the README.

### Remediation architecture

The defects share one cause: metering lives in a provider wrapper that sees neither the account nor failures, and the trace is assembled afterwards from whatever survived. The fix is to make metering a first-class port in `@ltw/ai` and to treat the trace as the ledger's source of truth.

- **Port.** `SpendMeter { reserve(account, estimate): Reservation; settle(reservation, actual): void }`, defined in `@ltw/ai` next to `AiTraceStore`. Pure interface, no I/O.
- **Attempt record.** `runWithFallback` becomes the single place that builds an attempt. It receives `price(model, usage)` and the meter, reserves before `generate`, settles after success or after a `ProviderError` that carries usage, and emits each attempt through `onAttempt` so late completions still land.
- **Server implementation.** `PostgresSpendMeter` keeps reservations in memory and writes settled spend as part of the trace row, hydrating totals at startup with one query over `ltw_ai_traces` by day and campaign. The existing append-only table stays canonical for spend. No new migration is strictly required; a materialized total table is an optimization.
- **Account scope.** `ProviderRequest.account` carries campaign and session identifiers for metering only. Adapters never read it. The dialogue isolation test already asserts the exact request body, so a regression that leaked it into the prompt would fail that test.
- **Pricing table.** Keyed by requested model alias, with cache read and write columns. Unknown model refuses by default.
- **Routing.** No implicit remote route for any capability. The server logs the resolved table once.

This keeps the gateway pure, keeps the World Engine out of reach, changes one contract additively, and gives Stage 310 a ledger it can rely on for the DM proxy and recovery work.
