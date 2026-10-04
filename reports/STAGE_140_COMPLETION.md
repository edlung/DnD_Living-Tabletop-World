# Stage 140 Completion Report — AI Relevance

- Work order: `work-orders/OPUS_STAGE_140.md`
- Builder: Claude Opus 5.5 (matrix: HIGH)
- Implementation revision: `37729600e592b92a4c6b34b8d96ea5dcc54f53b5` (branch `main`)
- Formal gate: none at this stage. Gate 05, after Stage 180, reviews this surface (`docs/GATE_COVERAGE.md`, row 140).
- Status: **COMPLETE**. Stage 150 is not started and needs explicit authorization.

## Decisions

| ADR                                      | Content                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0021](../docs/adr/0021-ai-relevance.md) | Owner decisions of 2026-10-04: (1) the AI re-rates only the legal actions; (2) on request, within a time budget; (3) it sees the actions and the character's own knowledge; (4) no AI text for players. |
| Amendments                               | [0012](../docs/adr/0012-context-engine.md) (AI refinement on request; `ranking` field), [0017](../docs/adr/0017-ai-gateway.md) (`fast-context` routing, abort signal, `relevance` traces)               |

## Delivered

- **`@ltw/ai`:**
  - `relevance-prompt.ts` builds the ranker's request:
    - only the legal actions, under opaque keys `a1…an`, in fixed words with cost and hints;
    - the target as the character sees it;
    - the perspective's own visible records and memories about the target, the offered topics, or the offered evidence, plus its open questions (at most 30 records and 15 memories);
    - no ID of any kind, with data JSON-quoted.
  - `relevance.ts` (`rankContextActions`):
    - runs the owner's fallback policy over `fast-context`, inside an aborting time budget;
    - accepts a ranking only if it names each offered key exactly once (`validateRanking`);
    - changes only relevance and order (`applyRanking`);
    - traces the request (purpose `relevance`).
  - The local provider has no ranker.
- **Server:**
  - `GET …/entities/:entityId/context?…&ranking=ai`. The response always carries `ranking { source, status, traceId }`.
  - `LTW_AI_RELEVANCE_BUDGET_MS` (default 2000 ms).
  - `fast-context` routes to Anthropic with a key, and to no provider without one.
  - The Anthropic adapter aborts on the request's signal.
- **Unchanged:** the Context Engine (`@ltw/context`) stays deterministic and imports no AI. It is the fallback.

## Validation gate evidence — "AI outage/failure leaves valid deterministic context behavior"

| Item                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outage and failure        | `context-ranking.test.ts`, `AI outage or failure leaves valid deterministic context behavior`. On a real Ravenford context, the response's context deep-equals the plain request's, with `source: deterministic` and the matching status, in five cases: no ranker configured, a provider error, a provider crash, invalid output after the repair, and a provider that never answers (`TIMEOUT` within the budget). `relevance.test.ts` covers the same modes, plus a provider that does stop on the signal. |
| Only legal actions change | Over HTTP, the ranked context equals the plain one except for the legal actions' relevance and order; illegal actions keep their deterministic place and rating. A 200-seed property test checks every field but relevance, illegal actions, and relevance order under random valid rankings.                                                                                                                                                                                                                 |
| Valid rankings only       | `validateRanking` refuses: missing keys, duplicates, keys not offered (including illegal actions'), unknown relevance levels, extra fields, and free text.                                                                                                                                                                                                                                                                                                                                                    |
| Scoped inputs             | The exact provider requests hold no entity, record, or memory ID and no illegal action. They hold no Gate 01 marker forbidden to Elowen's perspective, and none of the Gate 04 planted secrets (truth, DM note, Orin's secret, Mira's records, clues, claims, hidden names, descriptions). Adding hidden truth, an NPC's record, and a description leaves the request identical.                                                                                                                              |
| Opt-in and checks         | A plain request asks no provider (`NOT_REQUESTED`). Fewer than two legal actions ask nobody (`NOTHING_TO_RANK`). A bad query is 400; an outsider gets 404; a perspective without an acting character gets 403 before any call. The DM may rank as a character.                                                                                                                                                                                                                                                |
| Traces                    | DM-only (the player gets 403). Purpose `relevance`, with the key-to-action map and the ranking applied. Stored on PostgreSQL, with no canonical event (`ai-traces.integration.test.ts`).                                                                                                                                                                                                                                                                                                                      |
| Budget at the adapter     | `anthropic-provider.test.ts`: the caller's signal stops a call long before the adapter's own timeout, as `TIMEOUT`. The signal is never sent.                                                                                                                                                                                                                                                                                                                                                                 |

**Mutation checks:** 7 of 7 injected defects detected, one at a time:

- illegal actions offered;
- a partial ranking accepted;
- unknown keys accepted;
- the budget ignored;
- topic IDs sent;
- every record sent instead of the perspective's;
- ranking without being asked.

## Validation

`pnpm validate:ci-local` exited 0 on `3772960` (`NODE_ENV=test`, docker-compose PostgreSQL 18). It ran:

- frozen install, format, lint, typecheck;
- context budget: 383 files, none over the limits;
- unit tests: 119 files, 1290 tests passed (17 more than Stage 130 after remediation);
- clean build;
- migrate twice;
- seed twice;
- integration tests: 15 files, 62 tests passed.

## Residual risks and notes

- **Not run against the live API.** No key is configured here, and providers were scripted in tests. Real ranking quality, latency, and cost are unmeasured.
- **A ranking costs one model call per request with `ranking=ai`.** There is no caching or rate limiting.
- **The ranker's inputs are capped** at 30 records and 15 memories, chosen by relevance to the target and the offered topics. A perspective with more may be ranked from part of it.
- **The UI is not built yet** (Stages 220–230). Rendering deterministically first and then asking for `ranking=ai` is left to the client.
