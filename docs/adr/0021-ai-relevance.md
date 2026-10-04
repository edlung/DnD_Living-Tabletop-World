# 0021. AI relevance: ranking already-computed context actions

- Status: Accepted
- Date: 2026-10-04
- Stage: 140; reviewed at Astra Gate 05 with the integrated backend
- Decision type: product (owner-approved scope, trigger, inputs, and presentation) and technical
- Owner approval: on 2026-10-04, before implementation, the owner chose:
  1. the AI re-rates the legal actions only (§1);
  2. ranking runs on request, within a time budget (§2);
  3. the ranker sees the actions and what the character knows (§3);
  4. no AI text reaches the player (§4).

## Context

Invariant 9: AI ranks relevance; the rules decide legality. `EXECUTION_PLAN.md` (Stage 140): AI may rank already-computed available actions, and deterministic fallback is mandatory. ADR 0012 anticipated "a later AI ranker (Stage 140)" refining relevance "using the same scoped inputs only". The stage's validation gate: an AI outage or failure leaves valid deterministic context behavior.

## Options considered

1. **Let AI compute or filter the actions.** Rejected: legality and the set of actions belong to the Context Engine and the rules.
2. **Rank every context request with AI.** The owner declined it: a model call on every selection adds latency and cost.
3. **On request, re-rate the Context Engine's legal actions within a budget, deterministic otherwise.** Chosen.

## Decision

### 1. What the ranker may change (owner decision)

- Only the `relevance` (high, medium, low) and the order of the **legal** actions. Nothing else changes:
  - illegal actions keep their deterministic relevance;
  - every action's legality, reason, resolution, cost, hints, area, topic, and evidence stay as computed;
  - no action is added or removed.
- The response's actions stay sorted by relevance. Within a level, the ranked legal actions come first in the ranker's order, then the illegal ones in their deterministic order.
- A ranking must name every offered action exactly once, by its key, and nothing else. Anything else is invalid output.

### 2. When it runs (owner decision)

- `GET /campaigns/:campaignId/entities/:entityId/context?perspective=…&ranking=ai`. Without `ranking=ai` the context is the deterministic one and no provider is asked.
- The request waits at most `LTW_AI_RELEVANCE_BUDGET_MS` (default 2000 ms; 100–30000). At the budget the provider call is aborted: the Anthropic adapter honors the request's signal. A provider that ignores the signal is left behind, and its answer is never used.
- With fewer than two legal actions there is nothing to rank (`NOTHING_TO_RANK`), and no provider is asked.

### 3. What the ranker sees (owner decision)

- **The legal actions**, under opaque keys `a1…an`, in fixed words (for example "Ask them about Merchant Guild caravan"), with their cost and hints.
- **The selected entity as the character sees it:**
  - its name only if the character knows it;
  - its kind, whether it is present, and its status;
  - the party's own hit points;
  - the distance in combat.
- **The acting perspective's own visible records and memories** (ADR 0008, ADR 0010) that concern the target, an offered topic, or offered evidence, plus its open questions (UNKNOWN, HYPOTHESIS, RUMOR, CONTRADICTION). These are the Context Engine's inputs (ADR 0012). At most 30 records and 15 memories.
- **Never sent:** an entity, record, or memory ID; DM data; WORLD_TRUTH; another holder's knowledge; an illegal action.
- Data is JSON-quoted with angle brackets escaped, so text written into records cannot open or close a block.

### 4. What the player sees (owner decision)

- No AI text. The response adds `ranking: { source: 'ai' | 'deterministic', status, traceId }`.
- `status` is one of:
  - `NOT_REQUESTED`;
  - `NOTHING_TO_RANK`;
  - `RANKED` (the only status with source `ai`);
  - `AI_UNAVAILABLE`;
  - `INVALID_OUTPUT`;
  - `TIMEOUT`.
- Any status but `RANKED` leaves the context exactly as the deterministic request returns it.

### 5. Providers, fallback, and traces

- **Capability `fast-context`:** Anthropic when `ANTHROPIC_API_KEY` is set; no provider otherwise. The deterministic fallback is the Context Engine itself, so the local provider has no ranker.
- **The owner's fallback policy** (ADR 0017 §5: one switch, one repair) applies within the budget.
- **Traces.** Every ranking request that reaches the gateway is traced:
  - purpose `relevance`, and scope the acting perspective;
  - source IDs;
  - the key-to-action map;
  - attempts, status, and the ranking applied.

  Traces are DM data and can never seed an authoring proposal.

- **Purity.** `@ltw/context` stays pure and deterministic, and imports no AI. The ranker lives in `@ltw/ai`; the server composes the two.

## Consequences

- **Stages 220–230:** a client may first render the deterministic context, then ask for `ranking=ai`.
- **Gate 05** reviews this surface (`docs/GATE_COVERAGE.md`, row 140).
- **Live latency and cost** stay unmeasured until a key is configured: the ranker has not been run against the live API.

## Invariants affected

Implements 9 (AI ranks relevance; the rules decide legality) and 18 (AI output is traceable). Preserves:

- 5 (scoped context);
- 7 (AI output is never a fact);
- 20 (a legal choice stays legal and offered).

No invariant is weakened.
