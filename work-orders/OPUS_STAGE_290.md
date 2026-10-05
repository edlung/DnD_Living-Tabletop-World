# Opus Work Order — Stage 290: Language Foundation and Russian Ravenford

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** MAX  
> **AUTHORIZED STAGE:** 290 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 300 — Opus effort HIGH  
> **NO SCHEDULED ASTRA SWITCH AT THIS STAGE; GATE 06 REVIEWS THIS STAGE'S SURFACES AFTER STAGE 350.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 290)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- ADR 0007 (event model and versions), ADR 0010 (memory recall), ADR 0013 (investigation), ADR 0024 (Chronicle prose rules), ADRs 0026–0030 (client)
- `fixtures/ravenford/AGENTS.md`, `fixtures/history/AGENTS.md`
- Relevant sections of `PRODUCT_BLUEPRINT.md`, `ARCHITECTURE.md`, and `RAVENFORD_SPEC.md`
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Make the play language a property of a campaign and deliver Ravenford playable end to end in Russian, with English still supported.

## Required Deliverables
- Owner decisions first (Q7): approval of the glossary of names and terms before any content is translated, and how Russian sentences handle the grammatical case of proper names, including names the DM authors in play.
- Before implementation, record an ADR: how a campaign's language is declared and enters history; which recorded text depends on language and how replay stays identical, including for histories earlier revisions wrote (`fixtures/history/`); what stays English in both languages (identifiers, error codes, logs). Obtain owner approval where product semantics are affected.
- Inventory and cover every place that produces text a Player or DM reads: client and `@ltw/ui` strings; sentences the World Engine and domain record or project (memories of conversations and discoveries, quest text, continuity explanations, undo blockers, rejections that reach the client); deterministic templates of the local provider (NPC replies, Chronicle prose, the offline interpreter); world-time formatting; labels for kinds, statuses, weather, and day phases. No raw identifier or enum value reaches a Russian reader as text.
- Give the language-dependent rules Russian equivalents with the same guarantees: the Chronicle hedging rule (`packages/domain/src/chronicle/prose.ts`) and lexical memory recall (ADR 0010), including Russian word forms. English behavior and its reviewed tests do not change.
- AI prompts state the output language. Evaluating live models in Russian belongs to Stage 300. The offline interpreter may understand a documented set of Russian phrasings; anything else degrades as ADR 0017 requires.
- A Russian Ravenford seed for every seeded domain (kernel, knowledge, memories, investigation, contradiction, combat, quests, Day 2). Secrets keep their meaning: every boundary and isolation test that asserts the absence of a secret has a Russian counterpart with Russian markers.
- Client: language follows the campaign. All existing journeys keep running in English; add Russian journeys for the acceptance flows (investigation with contradiction and Orin, combat with Counterspell, authoring Tomas with secrecy and undo, Day 2, Chronicle and flashback).

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Ask the owner the open questions named below before implementation; never self-approve a product decision.
- Record every change to a boundary reviewed by Gates 01–05 in the completion report and in `docs/GATE_COVERAGE.md` for Gate 06.

## Validation Gate
`pnpm validate` passes and every existing suite passes unchanged in English. The Russian Ravenford scenario passes over HTTP and on PostgreSQL across a restart. Boundary, isolation, hedging, and recall suites pass in Russian. A scan of the Russian player's DOM and responses finds no English text outside the glossary's names. Histories written by earlier revisions load, replay, and undo identically.

## Owner Acceptance
Per `AGENT_WORKFLOW.md` (Product Acceptance): the owner plays the affected flows on this stage's build, and the completion report records the owner's disposition. Without it the stage is not complete.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence in `reports/STAGE_290_COMPLETION.md`.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Hard Stop
STOP after this stage; wait for explicit authorization for any subsequent work.

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 300 in this work order.

**Required final message from Opus, only after successful completion:**  
`STAGE 290 COMPLETE — next: OPUS_STAGE_300.md — switch/set Opus effort to HIGH`
