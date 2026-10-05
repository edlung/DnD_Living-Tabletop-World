# Opus Work Order — Stage 320: Visual Language and Scene

> [!IMPORTANT]
> **MODEL:** Claude Opus 5.5  
> **EFFORT:** HIGH  
> **AUTHORIZED STAGE:** 320 ONLY  
> **NEXT ACTION AFTER PASS:** Stage 330 — Opus effort HIGH  
> **NO SCHEDULED ASTRA SWITCH AT THIS STAGE; GATE 06 REVIEWS THIS STAGE'S SURFACES AFTER STAGE 350.**

## Read First
- `EFFORT_MATRIX.md`
- `AGENT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`
- `EXECUTION_PLAN.md` (Stage 320)
- `docs/IMPLEMENTATION_PREREQUISITES.md` and `docs/GATE_COVERAGE.md` (current stage obligations)
- `PRODUCT_BLUEPRINT.md` (pillars, Combat, Success Definition) and `RAVENFORD_SPEC.md` (Player and DM acceptance)
- ADRs 0026–0030, `apps/web/AGENTS.md`, `packages/ui/AGENTS.md`
- The prior stage's completion evidence and applicable gate reports; do not load historical reports wholesale.

## Objective
Make the client feel like the world rather than a page of panels.

## Required Deliverables
- Owner decision first (Q8): two or three prototypes of the key screens, in Russian (Market Square with Mira, a conversation, the Old Trade Road fight at the Counterspell moment, the DM adding Tomas, the Chronicle). The owner picks a direction; record it in an ADR with the design tokens. It also fixes the art style for Stage 330.
- Scene-first layout: the place and who is present fill the view; details and actions appear in context beside what was selected; the result of an action appears where it happened.
- NPC speech appears in the scene, attributed, and stays distinct from recorded knowledge. What was learned is shown as its typed record.
- The battlefield is a map with readable tokens, terrain, cover, area preview, and turn order, with no permanent action bar.
- The Chronicle reads as a book and a flashback as a scene. DM tools stay within reach without covering the world.
- Both languages. Keyboard operation, focus order, contrast, and reduced motion. Phone, tablet, and desktop widths.
- Presentation only: no change to contracts, rules, projections, or what any perspective receives. Image slots show approved images once Stage 330 provides them and an honest neutral state until then.

## Rules
- Implement only this explicitly authorized stage and preserve all architecture invariants.
- Reuse validated domain commands/projections; Rules and World Engine retain authority. Frontend clients never call external AI providers directly.
- Follow `AGENTS.md` module/context limits and update `docs/AI_CONTEXT_MAP.md` for new entry points.
- Add meaningful behavior/journey tests for introduced behavior and run relevant prior regressions.
- Record material undecided technical choices as ADRs. If a change conflicts with a protected contract, stop for an owner decision.
- Ask the owner this stage's open questions (Required Deliverables; `docs/IMPLEMENTATION_PREREQUISITES.md`) before implementation; never self-approve a product decision.
- Record every change to a boundary reviewed by Gates 01–05 in the completion report and in `docs/GATE_COVERAGE.md` for Gate 06.

## Validation Gate
`pnpm validate` passes. All existing journeys pass in both languages; where selectors change, assertions are not weakened. Perspective-isolation journeys keep their strength. Layout is checked at three widths.

## Owner Acceptance
Per `AGENT_WORKFLOW.md` (Product Acceptance): the owner plays the affected flows on this stage's build, and the completion report records the owner's disposition. Without it the stage is not complete.

## Completion Artifacts
- Stage-specific implementation/artifacts and meaningful validation evidence in `reports/STAGE_320_COMPLETION.md`.
- Exact commands/results and revision/build identifier.
- Relevant ADRs, limitations, and concise completion summary; never claim unperformed checks passed.

## Hard Stop
STOP after this stage; wait for explicit authorization for any subsequent work.

# 🛑 HARD STOP — STAGE COMPLETE

Do not start Stage 330 in this work order.

**Required final message from Opus, only after successful completion:**  
`STAGE 320 COMPLETE — next: OPUS_STAGE_330.md — switch/set Opus effort to HIGH`
