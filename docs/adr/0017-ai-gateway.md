# 0017. AI Gateway: providers, capability routing, scoped context, structured proposals, traces

- Status: Accepted
- Date: 2026-10-04
- Stage: 100; extended by Stages 110 (authoring), 120 (continuity), 130 (NPC dialogue), 170 (Chronicle)
- Decision type: technical, with three owner-approved choices
- Owner approval: the owner chose, on 2026-10-04 before implementation: (1) an Anthropic Claude adapter, off unless a key is configured, plus a deterministic local provider; (2) the fallback policy in §5; (3) only a minimal public directory may be sent to an external provider for DM intents (§3)

## Context

Stage 100 adds the AI gateway: provider abstraction, capability router, ContextBuilder, structured output, and traces. Its only use case is turning a DM's natural-language intent into a **proposed** structured command. Nothing is committed: Stage 110 adds the authoring pipeline (invariant 16). Invariants 2 (AI is not authority), 5 (no leakage), 11 and 18 (auditability, provenance), 21 (replaceable providers), and 22 (clients never call providers) apply. ADR 0004 left the placement of AI orchestration to this stage, on the condition that it gains no write path around the World Engine.

## Options considered

1. **Orchestration inside the server.** Simple, but mixes AI policy with I/O and makes the no-mutation boundary harder to check.
2. **A pure package `@ltw/ai`, with provider adapters, trace persistence, and HTTP in the server.** The same split as `@ltw/combat`/`@ltw/context`: decisions are testable without I/O, and the boundary is machine-checked.
3. **A provider SDK.** Adds a dependency for one HTTP call; `fetch` suffices.

## Decision

Option 2.

### 1. Package and boundary

- `@ltw/ai` depends on `@ltw/domain` and `@ltw/contracts` only, with the same forbidden module groups as the other pure packages (no provider SDKs, persistence drivers, or server I/O). `@ltw/server` may depend on it; clients may not.
- `@ltw/ai` source may not import the World Engine, event stores, or decision functions from `@ltw/domain` (`workspace-boundaries.json` `forbiddenNames`, enforced by ESLint and `tests/architecture/`). It reads a `WorldState` snapshot and returns data; it has no path to `WorldEngine.execute`.

### 2. Providers and capability routing

- A provider implements `AiProvider.generate(request)`: the request carries a capability, a system prompt, the user content, and the JSON Schema of the expected structured output; the response carries the parsed output, the model, and token usage when available. Failures are `ProviderError` (`UNAVAILABLE`, `TIMEOUT`, `BAD_RESPONSE`).
- Capabilities are those of `ARCHITECTURE.md` (Provider Routing): `reasoning`, `fast-context`, `continuity`, `npc-dialogue`, `narrative`, `vision`, `image-generation`. Stage 100 routes only `reasoning`. The router maps a capability to an ordered list of providers; domain code never names a model.
- **Anthropic adapter** (server): the Messages API over `fetch`, with structured output as a forced tool call. It is enabled only when `ANTHROPIC_API_KEY` is set; the model (`LTW_AI_MODEL`, default `claude-opus-5-5`) and timeout (`LTW_AI_TIMEOUT_MS`, default 30 s) are configurable. The key is never logged or traced.
- **Local provider** (`@ltw/ai`): a deterministic, offline interpreter of a few slice phrasings (an NPC added near a known place who saw a known thing; a known creature's death; moving a known entity; advancing time). It serves tests, development without a key, and fallback.
- Routing for `reasoning`: `[anthropic, local]` with a key, `[local]` without. Tests never reach the network.

### 3. Context (ContextBuilder)

- Context is built only from a resolved knowledge perspective (ADR 0008) and only from that perspective's projections: the entities it knows, the records it may see, and the world time. Every item carries its source ID for the trace.
- **DM intents use the PUBLIC horizon**, by owner decision: the IDs, kinds, and names of the entities the public may know, plus the world time. No knowledge records, no WORLD_TRUTH or DM data, and no NPC memories leave the server; a secret entity (for example the Ashen Circle) is not in the directory. An intent that names something outside it cannot be resolved and is reported as such.

### 4. Structured output

- The output schema is `commandProposalSchema` (contracts): a summary and 1–12 commands drawn from `CreateEntity`, `PlaceEntity`, `UpdateEntityProfile`, `ChangeEntityStatus`, `AdvanceWorldTime`, and `AddKnowledge`, each validated with the World Engine's own command schema.
- Validation also requires every referenced entity to be in the directory or created earlier in the same proposal.
- A valid proposal is **never committable in Stage 100**: the response says `committable: false`, and no route submits proposals. Stage 110 adds schema, permission, rules, continuity, risk, and confirmation before any commit.

### 5. Fallback policy (owner decision)

- **Provider failure** (error or timeout): the next provider for the capability is tried once, with the identical context and request. If none remains, the outcome is `AI_UNAVAILABLE`.
- **Invalid structured output**: one repair attempt on the same provider, given the validation issues and its own invalid output. If that output is still invalid, the outcome is `INVALID_OUTPUT`.
- Per request: at most one provider switch and one repair. Every fallback keeps the original actor, permission, and knowledge scope; no fallback widens the context, performs a mutation, or makes invalid output committable.

### 6. Permission and HTTP

- `POST /campaigns/:campaignId/ai/intents` with `{ text }`: the DM only (ADR 0009 check order; a player gets 403, a non-member 404). The permission check runs before any provider call. The response is a status (`PROPOSED`, `INVALID_OUTPUT`, `AI_UNAVAILABLE`), the proposal when valid, validation issues, the trace ID, and `committable: false`.
- `GET /campaigns/:campaignId/ai/traces/:traceId`: the DM only.

### 7. Traces

- Every intent request records one trace: request ID, campaign, actor, purpose, capability, context scope, context source IDs, the DM's text, each attempt (provider, model, kind, outcome, issues, latency, token usage), the result, the proposal, and the canonical events produced — always none in Stage 100. Cost is recorded only when a provider reports it.
- Traces are DM data and not canonical state. They are kept append-only in `ltw_ai_traces` (migration `0002`) behind an `AiTraceStore` port; an in-memory store serves tests.

## Consequences

- Stage 110 builds the commit pipeline on these proposals; it must re-validate everything at commit, never trusting the gateway.
- Later capabilities (NPC dialogue, Chronicle) reuse the router, ContextBuilder, and traces with their own perspectives (NPC scope for Stage 130).
- Adding a provider is a new adapter plus a route entry; no domain change.

## Amendments

- 2026-10-04 (Stage 110, ADR 0018):
  - Proposals may also contain `SetDisclosure` (whether an NPC shares a record when asked). The validator accepts a disclosure only for a record the same proposal adds, since the directory holds no records, and the prompt asks for one only when the request does.
  - An intent's proposal is still never committed as is (`committable: false`). The DM turns it into an authoring proposal, whose content the server copies from the trace, and commits that through ADR 0018's pipeline.
  - The local provider also recognises people and things by a distinctive last word (`the caravan`, `Thorne`) when no other directory name ends with it, never places or factions. This lets it read the DM acceptance request of `RAVENFORD_SPEC.md` ("Add a young guard near North Gate who saw the caravan leave.").

- 2026-10-04 (Stage 120, ADR 0019): proposals may also contain `SetClaim` (on a record the same proposal adds; the validator refuses any other target) and `SetRelationship` (an NPC in the directory or created by the proposal). The prompt asks for a relationship only when the request says so.

## Invariants affected

Implements 2, 18, 21, and 22 for this stage; preserves 1, 5, 11, and 17. No invariant is weakened.
