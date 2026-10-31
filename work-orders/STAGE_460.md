# Work Order — Stage 460: Item catalog, possession and in-play item actions

Status: **IMPLEMENTED and locally verified 2026-10-31** (owner: «Да, реализуй»). Report: `reports/STAGE_460_COMPLETION.md`.
Authority: owner decisions 2026-10-31 (original Ravenford catalog; in-play actions included).
Base: `main` after Gate 07 remediation (PR 16/17 merged). Design: `docs/STAGE_460_DESIGN.md`.

## Deliver

1. ADR 0039 (item possession) and the design above, accepted before code.
2. Original item catalog in `packages/rules/src/items/` (≈30 entries, RU/EN keys), typed
   consumable effects, unified catalog lookup including weapons, validation and property tests.
3. Kernel possession commands/events (grant, transfer, equip, unequip, consume), projections,
   integrity checks, undo/history/replay/digest support; old logs replay unchanged.
4. Context-engine item actions (equip, use, give, take, drop) gated by legality, combat timing,
   adjacency and knowledge; AC recomputation from equipped armor; effects via existing rules.
5. Server wiring through the World Engine only; DTOs scrub hidden items; migration `0025` if
   projections need tables.
6. Inventory and item-card UI (RU/EN), on-demand chunk, neutral placeholder art with honest
   text, all states, keyboard/AT, four widths, light/dark, axe clean.
7. Tests: unit, property, PostgreSQL integration, knowledge boundary, e2e journeys; own
   adversarial pass; full isolated validation; report `reports/STAGE_460_COMPLETION.md`.
8. Update `docs/AI_CONTEXT_MAP.md`, add nested `AGENTS.md` for `packages/rules/src/items/`,
   `docs/PROJECT_WORKFLOW.md` status; keep every file ≤ 500 lines.

## Out of scope

Campaign-package items (Stage 470), item art (Stage 480), shops/currency, enforced
encumbrance, crafting, AI-authored possession without DM confirmation.

## Boundaries

No default DB mutation, credential/provider change, image-provider call, deployment,
publishing or human-acceptance claim. Preserve Ravenford and prior-stage behavior (Mira's
AC 17 and longbow flows unchanged). Runtime DM confirmation and architecture invariants apply.
