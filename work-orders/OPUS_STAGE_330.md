# Opus Work Order — Stage 330: Images

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 330 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 340 — Opus effort MAX  
> **NO SCHEDULED ASTRA SWITCH AT THIS STAGE; GATE 06 REVIEWS THIS STAGE'S SURFACES AFTER STAGE 350.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 330)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- ADR 0022 (asset identity), ADR 0023 (world visual state), the Stage 320 ADR (art direction)
- `packages/domain/src/assets/AGENTS.md`, `packages/ai/src/images.ts`, `apps/server/src/assets/`
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Give Ravenford real, consistent images.

## Required Deliverables
- Owner inputs first (Q6): the spending ceiling and the key, supplied through the environment only.
- An OpenAI image adapter behind the existing image port (owner decision Q6: OpenAI only). The placeholder generator stays for tests and offline use. Cost is recorded per job and the ceiling is enforced.
- The art direction from Stage 320 as a fixed style prompt and reference images.
- Variants (rain, night, wounded, and the others ADR 0023 resolves) are generated from the entity's approved canonical reference as an input image, so that identity carries over. Measure and report how well identity holds on the Ravenford cast: the provider's documentation warns that recurring characters can drift.
- A curated Ravenford set generated once and approved by the owner as DM: the seven locations with their day, night, and weather variants; Elowen, Mira, Orin, Thorne, and the goblins. A fresh install obtains the same set without generating it again.
- On-demand generation only for what the DM authors in play (Tomas), through the existing request, worker, candidate, and approval flow, with the approval and replacement controls the client lacks.
- Decide in an ADR where image content lives in production (PostgreSQL as now, or object storage as `ARCHITECTURE.md` anticipates) and how it is backed up.
- Image requests are built from what an entity's description holds; DM-only details enter only at the DM's explicit request. No image reaches a player before DM approval. Refusals, timeouts, and provider failures leave the neutral fallback.

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Ask the owner the open questions named below before implementation; never self-approve a product decision.
- Record every change to a boundary reviewed by Gates 01–05 in the completion report and in `docs/GATE_COVERAGE.md` for Gate 06.

## Validation Gate
`pnpm validate` passes with the provider stubbed at the HTTP boundary; a live smoke run generates, approves, and shows an image. Lineage, approval, undo-hold, and player-visibility suites are unchanged in strength. The stage's spending stays under the approved ceiling.

## Owner Acceptance
Per `AGENT_WORKFLOW.md` (Product Acceptance): the owner plays the affected flows on this stage's build, and the completion report records the owner's disposition. Without it the stage is not complete.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence in `reports/STAGE_330_COMPLETION.md`.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Hard Stop
STOP after this stage; wait for explicit authorization for any subsequent work.

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 340 in this work order.

**Required final message from Opus, only after successful completion:**  
`STAGE 330 COMPLETE — next: OPUS_STAGE_340.md — switch/set Opus effort to MAX`
