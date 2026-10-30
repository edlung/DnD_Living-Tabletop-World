# Work Order — Stage 370: AI Campaign Contract

## Authorization and boundary

The owner requested the Stage 370–450 campaign-generation program in this chat on
2026-10-30, then instructed: «выполняй реализацию всех этапов». The preceding
correction was: «правка по AI-бюджету. Сними их. Бюджет пока неограничен».
These instructions authorize work on the program and supersede earlier monetary
ceilings as a product requirement. They do not attest to unperformed implementation
or verification. Existing checkpoint stops in `AGENT_WORKFLOW.md` remain in force.

**Current scope: Stage 370 only.** Produce the detailed product/architecture contract
for the requested feature. Stages 380–450 have implementation authorization from
the chat, but remain behind this checkpoint's owner disposition and their own
approved detailed designs/work orders. No session may approve a design for the owner.

## Read first

- `docs/AI_CONTEXT_MAP.md`, `AGENTS.md`, `AGENT_WORKFLOW.md`.
- `docs/PROJECT_WORKFLOW.md`, `ARCHITECTURE_INVARIANTS.md`.
- `PRODUCT_BLUEPRINT.md`, relevant portions of `EXECUTION_PLAN.md`.
- ADRs 0018 (authoring), 0025 (quests), 0032 (AI), 0035 (images), 0036 (sign-in).
- The relevant contracts and existing implementation entry points, narrowly.

## Objective

Make an AI-generated, privately versioned campaign reviewable as both a scenario
and a visual world before the owner confirms a specific revision for play.
Define the complete path without weakening World Engine authority, knowledge
isolation, stable identity, deterministic rules, or player agency.

## Required deliverables

1. `docs/STAGE_370_DESIGN.md`: lifecycle, ownership before a campaign exists,
   content model, generation/recovery, both previews, selective revision,
   activation, compatibility and the acceptance matrix for Stages 370–450.
2. A concrete Russian non-Ravenford example showing starting facts, scoped
   knowledge, clue access, optional consequences and both previews.
3. A proposed ADR recording the architecture deltas and the owner's unlimited
   monetary policy, with approval status stated honestly.
4. Update the execution plan, prerequisite/coverage ledgers and context map.
   Record current authorization and preserve earlier historical evidence.
5. Run `pnpm validate` offline, document actual results and unavailable checks;
   perform a design adversarial pass and prepare report and checkpoint handoff
   using `HANDOFF_TEMPLATE.md`, with reproducible artifact identity.

## Excluded from this work order

Runtime code, routes, migrations, provider calls, credentials, model replacement,
production dependency additions, deployment, publishing, and release tagging.
The existing runtime ceilings remain until the Stage 380 implementation changes
them; describing the new policy must never claim that code already implements it.

## Acceptance and hard stop

The contract covers each owner requirement with a concrete example and an assigned
implementation/verification stage. All invariants are assessed, gaps remain visible,
and no future surface is reported as tested. Publish a local handoff with status
`AWAITING_OWNER_DISPOSITION`, then **STOP** for the owner's disposition as required
by `AGENTS.md` and `AGENT_WORKFLOW.md`. Do not start Stage 380 in this work order.
