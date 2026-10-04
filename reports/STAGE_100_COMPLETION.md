# Stage 100 Completion Report — AI Gateway

- Work order: `work-orders/OPUS_STAGE_100.md`
- Builder: Claude Opus 5.5 (matrix: HIGH)
- Implementation revision: `08b7c796670b341d5fcb4fd04066fb18b13f7913` (branch `main`)
- Formal gate: none at this stage (no Astra switch). Gate 04 covers Stages 100–120 (`docs/GATE_COVERAGE.md`).
- Status: **COMPLETE**. Stage 110 is not started and needs explicit authorization.

## Decisions

| ADR                                                      | Decision                                                                                                                                                                                                                                                                                                         | Approval                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0017](../docs/adr/0017-ai-gateway.md)                   | `@ltw/ai` as a pure package with no World Engine path. Provider port and capability router. ContextBuilder from one resolved perspective. Proposals validated with the World Engine's own command schemas and directory references, never committable. Fallback policy. Append-only traces. DM-only HTTP routes. | The owner chose three options on 2026-10-04, before implementation: (1) a Claude adapter, off without a key, plus a deterministic local provider; (2) on failure, the next provider once; on invalid output, one repair; (3) DM intents send only the minimal PUBLIC directory (IDs, kinds, names, world time). |
| Amendment: [0004](../docs/adr/0004-module-boundaries.md) | New edge `@ltw/ai -> domain, contracts`, and `@ltw/server` may use it. New boundary field `forbiddenNames` bars `WorldEngine`, event stores, and decision functions from `@ltw/ai` non-test sources.                                                                                                             | Follows from ADR 0017                                                                                                                                                                                                                                                                                           |

## Delivered

- **`@ltw/ai`** (pure; `packages/ai/AGENTS.md`):
  - provider port and `ProviderError` codes (`UNAVAILABLE`, `TIMEOUT`, `BAD_RESPONSE`);
  - `CapabilityRouter`;
  - `buildContext`, where every item carries a source ID;
  - the fixed prompt and the output tool schema;
  - `validateProposal`;
  - `runWithFallback`;
  - the deterministic local provider;
  - `interpretDmIntent`;
  - the `AiTraceStore` port and an in-memory store.
- **Contracts:** in `packages/contracts/src/ai-gateway/intents.ts`:
  - `commandProposalSchema`: 1–12 of `CreateEntity`, `PlaceEntity`, `UpdateEntityProfile`, `ChangeEntityStatus`, `AdvanceWorldTime`, `AddKnowledge`;
  - the request and response types, with `committable: false`;
  - the trace view.
- **Server:**
  - **Anthropic adapter** (`src/ai/anthropic-provider.ts`): the Messages API over `fetch`, structured output as a forced tool call, with a timeout. Errors carry fixed messages only.
  - **Composition** (`src/ai/gateway.ts`): `reasoning` routes to `[anthropic, local]` when a key is set, `[local]` otherwise.
  - **Configuration:**
    - `ANTHROPIC_API_KEY` is held in a `Secret` that renders as `[redacted]`;
    - `LTW_AI_MODEL` defaults to `claude-opus-5-5`;
    - `LTW_AI_TIMEOUT_MS` defaults to 30 s.
  - **Trace storage:** `PostgresAiTraceStore` plus migration `0002_ai_traces.sql`. Rows are append-only: triggers reject `UPDATE`, `DELETE` and `TRUNCATE`.
  - **Routes:** `POST /campaigns/:campaignId/ai/intents` and `GET /campaigns/:campaignId/ai/traces/:traceId`, both DM only, with the ADR 0009 check order.
- **Docs:** ADR 0017 and its index row, the ADR 0004 amendment, `docs/AI_CONTEXT_MAP.md`, `apps/server/AGENTS.md`, the migrations `AGENTS.md`, `.env.example`, and README.

## Validation gate evidence — "AI cannot mutate canonical state; structured-output validation and fallback tests pass"

| Item                             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No canonical mutation            | **Structural:** `@ltw/ai` cannot import `WorldEngine`, stores, or decide/evolve functions (ESLint plus `tests/architecture/`, with probes). The gateway gets no engine, and no route submits a proposal. **Behavioral:** the stream version is unchanged after each outcome — PROPOSED, INVALID_OUTPUT and AI_UNAVAILABLE (`packages/ai/src/intent.test.ts`, `apps/server/src/http/ai-routes.test.ts`). On PostgreSQL, the `ltw_events` and `ltw_commands` row counts are unchanged and the trace records `canonicalEvents: []` (`apps/server/src/ai/ai-traces.integration.test.ts`).                                  |
| Structured-output validation     | `packages/ai/src/validation.test.ts` checks: schema failures (no commands, non-proposable commands, extra keys, plain text, null); unknown entities; a reference used before its creation; duplicate IDs; NPC scope, subjects and attribution outside the directory; an issue cap. The adapter passes raw output through to validation (`anthropic-provider.test.ts`).                                                                                                                                                                                                                                                 |
| Fallback: provider failure       | `fallback.test.ts` checks that a failure leads to exactly one switch, carrying the identical request (deep-equal). A second failure gives AI_UNAVAILABLE, and a third provider is never called. `intent.test.ts` and `ai-routes.test.ts` check that every attempt reuses the same context object and PUBLIC scope.                                                                                                                                                                                                                                                                                                     |
| Fallback: invalid output         | `fallback.test.ts` checks: one repair on the same provider with its issues and output; INVALID_OUTPUT after a failed repair with no proposal; no repair carried across a switch; at most one switch plus one repair.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Scope and permission preserved   | Role checks run before any provider call: a player gets 403, a non-member or unknown campaign gets 404, and spy providers record zero requests and no trace (`intent.test.ts`, `ai-routes.test.ts`). Tests confirm the DM-intent context holds only entities and world time, with no records (`intent.test.ts`, `context-builder.test.ts`). The Gate 01 forbidden markers never appear in any context, for every perspective, with all sections (`context-builder.test.ts`), nor in any provider request (`intent.test.ts`). The Ashen Circle is outside the directory, so a proposal that names it is INVALID_OUTPUT. |
| Invalid output never committable | Each status returns `committable: false`. Only a validated output is returned as `proposal`; INVALID_OUTPUT and AI_UNAVAILABLE return `proposal: null`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Traces                           | One trace per request, recording: campaign, actor, purpose, capability, scope, source IDs, input, attempts (provider, model, kind, outcome, error code, issues, output cut at 8 KB, latency, usage), result, and `canonicalEvents: []`. DM only over HTTP, scoped per campaign. Provider error messages and the API key never appear in traces or errors (`fallback.test.ts`, `anthropic-provider.test.ts`, `config.test.ts`).                                                                                                                                                                                         |
| First use case                   | The local provider turns "Add a fisherman near the North Gate who saw the guild caravan leave" into two commands: `CreateEntity tomas-reed` placed at `north-gate`, and an `AddKnowledge` TESTIMONY in Tomas's NPC scope. A DM submitting them by hand is accepted by the World Engine (`local-provider.test.ts`). Confirmed on the live server; no API key was configured, so only the local provider ran.                                                                                                                                                                                                            |

**Mutation checks:** I injected 10 defects one at a time and reverted each. 9 were detected on the first run:

- the DM role check removed (in `intent.ts` and in the trace route);
- the PARTY scope used instead of PUBLIC;
- unlimited repairs;
- unlimited switches;
- the repair note carried across a switch;
- the reference check removed;
- a non-empty `canonicalEvents`;
- sections ignored.

The 10th survived: knowledge records added to the DM-intent context. I added an assertion for it, and it is now detected.

## Validation

`pnpm validate:ci-local` exited 0 (`NODE_ENV=test`, docker-compose PostgreSQL 18). It ran:

- frozen install, format, lint, typecheck;
- context budget: 305 files, none over the limits;
- unit tests: 92 files, 1077 tests passed;
- clean build;
- migrate twice, including `0002`;
- seed twice;
- integration tests: 12 files, 51 tests passed.

After the run I added one test assertion. I then re-ran `pnpm vitest run --project unit packages/ai` (48 tests passed) and `prettier --check`.

## Residual risks and notes

- **The Anthropic adapter has not been run against the live API** in this environment; no key was configured. It is covered by fake-`fetch` tests only: request shape, tool-use parsing, status mapping, timeout. A first run with a real key should confirm that the model accepts the generated tool schema.
- **The local provider understands only four phrasings:** add a person who witnessed something, a death, a move, and advancing time. Anything else is INVALID_OUTPUT by design.
- **The ESLint ai-providers group catches more than the SDK.** Its `ai` pattern, meant for the Vercel SDK, also matches any relative path segment named `ai` in a pure package. That is why the contracts folder is `ai-gateway/`. The rule fails safe (false positives only).
- **Traces store the DM's text and the raw model output** (cut at 8 KB). They are DM-only, and there is no retention policy yet.
- **Commits are out of scope.** Stage 110 must re-validate every proposal at commit time, covering permission, rules, continuity and confirmation, and never trust the gateway.
