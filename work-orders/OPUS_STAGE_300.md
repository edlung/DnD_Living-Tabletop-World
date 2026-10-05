# Opus Work Order — Stage 300: Live AI

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 300 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 310 — Opus effort MAX  
> **NO SCHEDULED ASTRA SWITCH AT THIS STAGE; GATE 06 REVIEWS THIS STAGE'S SURFACES AFTER STAGE 350.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 300)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- ADR 0017 (gateway, fallback policy), ADR 0020 §3 (NPC replies), ADR 0021 (relevance), ADR 0024 §3 (Chronicle prose)
- `packages/ai/AGENTS.md`, `apps/server/src/ai/`, `apps/server/src/platform/config/config.ts`
- Gate 04 report and retest (the NPC isolation cases to replay against live models)
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Run real models behind the existing gateway and measure, in Russian, whether they are good enough, fast enough, and affordable.

## Required Deliverables
- Owner inputs first (Q5): the spending ceiling for this stage and per session, and the keys, supplied through the environment only. Keys never enter the repository, logs, traces, or chat. No paid call happens before the ceiling is set.
- Make the Anthropic adapter work with current models. It forces a tool call (`tool_choice` of type `tool`), which Anthropic's API reference says Claude Opus 5.5 and Sonnet 5.5 reject with a 400; if so, with the default model every call falls back to the local provider and the server runs on templates without saying so. Confirm with the first live call. Use structured outputs or an unforced strict tool; handle thinking, output-token limits, and refusals; decide in an ADR whether to adopt the official SDK or keep `fetch`. Prove each capability with a live smoke call.
- Add an adapter for OpenAI-compatible chat APIs and configure DeepSeek through it.
- Route each capability to its own provider and model through configuration; one global model setting is not enough. Starting assignment decided by the owner (Q5): DM intents and Chronicle prose use Claude Opus 5.5; NPC dialogue uses Claude Sonnet 5.5 as baseline with DeepSeek V4.1 Flash as challenger; relevance uses DeepSeek V4.1 Flash.
- Traces record provider, model, latency, token usage, and computed cost for every attempt. Enforce spending ceilings per campaign and per day; when one is reached, the capability fails closed to its deterministic fallback.
- An evaluation harness that runs on demand and never inside `pnpm validate` or CI, with Russian cases for every AI use: (a) DM intent to schema-valid, correct proposals across varied phrasings, including destructive and ambiguous requests that must not yield a committable proposal; (b) NPC replies whose content stays within the supplied context, that decline guarded topics in character, and that keep attitude and voice; (c) injection and jailbreak attempts against live models, replaying the Gate 04 cases; (d) Chronicle prose that cites its entries and hedges accounts; (e) relevance that answers within its budget and never changes the action set. Report pass rates, latency percentiles, and cost per 45-minute session for each model.
- A blind comparison for NPC dialogue: both models answer the same cases, the owner sees the answers unlabeled and chooses, and the choice is recorded in the ADR.
- Prompt caching for the stable part of each prompt where the provider supports it. Stream NPC replies only if measured latency calls for it.
- Client: only what makes a live reply usable (a visible replying state and an honest failure state).
- What a provider receives does not change: the reviewed context builders stay as they are. Any change to them reopens Gate 04 coverage.

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Ask the owner the open questions named below before implementation; never self-approve a product decision.
- Record every change to a boundary reviewed by Gates 01–05 in the completion report and in `docs/GATE_COVERAGE.md` for Gate 06.

## Validation Gate
Deterministic suites pass unchanged with no key present. With keys, each capability's smoke call succeeds and falls back correctly on outage, invalid output, timeout, refusal, and an exhausted budget. The evaluation report exists and records the owner's choice of NPC-dialogue model. The stage's spending stays under the approved ceiling.

## Owner Acceptance
Per `AGENT_WORKFLOW.md` (Product Acceptance): the owner plays the affected flows on this stage's build, and the completion report records the owner's disposition. Without it the stage is not complete.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence in `reports/STAGE_300_COMPLETION.md`.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Hard Stop
STOP after this stage; wait for explicit authorization for any subsequent work.

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 310 in this work order.

**Required final message from Opus, only after successful completion:**  
`STAGE 300 COMPLETE — next: OPUS_STAGE_310.md — switch/set Opus effort to MAX`
