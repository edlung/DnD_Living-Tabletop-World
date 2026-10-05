# Opus Work Order — Stage 310: Live Session

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** MAX  
> **AUTHORIZED STAGE:** 310 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 320 — Opus effort HIGH  
> **NO SCHEDULED ASTRA SWITCH AT THIS STAGE; GATE 06 REVIEWS THIS STAGE'S SURFACES AFTER STAGE 350.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 310)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- ADR 0008 (knowledge boundary), ADR 0009 (HTTP and check order), ADR 0016 (reaction windows), ADR 0026 §6 (browser isolation), ADR 0029 §8 (undo and secrecy)
- `reports/STAGE_240_USABILITY.md` (deferred findings 7, 8, and 10)
- `apps/web/AGENTS.md`, `tests/e2e/AGENTS.md`
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Let a DM and players share a session without manual refresh, and keep a session moving.

## Required Deliverables
- Owner decisions first (Q9), recorded in an ADR: what the change signal may reveal to a perspective about changes it cannot read, and what the DM may do for an absent player (skip the turn, act as the character, or neither).
- Server push of a change signal per campaign to authenticated members. The signal carries no world content; each client re-reads its own scoped projections. By default a client is signalled only when something it may read has changed, so that DM-only authoring and hidden entities are not observable through timing.
- Client: automatic refresh on a signal with the existing stale-request guards; the reaction prompt appears for its player without refresh; presence and whose turn it is are visible; reconnection and recovery from missed signals; no credential in a URL.
- The DM's handling of an absent player's turn, as decided, through a World Engine command with authorization, audit, replay, and undo like any other.
- A list of the DM's authoring commits with their undo that survives reload and perspective changes and shows nothing DM-only to other perspectives. It replaces the screen-local control of ADR 0029 §8.
- The control that still offers "Advance to Day 2" after that day has passed reflects the current day.

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Ask the owner this stage's open questions (Required Deliverables; `docs/IMPLEMENTATION_PREREQUISITES.md`) before implementation; never self-approve a product decision.
- Record every change to a boundary reviewed by Gates 01–05 in the completion report and in `docs/GATE_COVERAGE.md` for Gate 06.

## Validation Gate
`pnpm validate` passes. Journeys with two browsers cover a combat turn hand-off, a Counterspell window opened by the DM's action and answered by the player without refresh, and authoring that a player sees only when and as allowed. Per-perspective tests show that the signal leaks nothing. Reconnect, duplicate, and out-of-order signals are handled.

## Owner Acceptance
Per `AGENT_WORKFLOW.md` (Product Acceptance): the owner plays the affected flows on this stage's build, and the completion report records the owner's disposition. Without it the stage is not complete.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence in `reports/STAGE_310_COMPLETION.md`.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Hard Stop
STOP after this stage; wait for explicit authorization for any subsequent work.

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 320 in this work order.

**Required final message from Opus, only after successful completion:**  
`STAGE 310 COMPLETE — next: OPUS_STAGE_320.md — switch/set Opus effort to HIGH`
