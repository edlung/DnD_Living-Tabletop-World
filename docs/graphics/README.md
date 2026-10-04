# Ravenford graphics development pack for GPT-6.1 Sol

This package turns the [graphics plan](../UI_GRAPHICS_PLAN.md) into bounded assignments for **GPT-6.1 Sol / HIGH**. It provides the specification, initial asset inventory, work orders, templates, checks, and a prompt for starting the first assignment.

**Version:** 0.1, 2026-10-04.
**Application baseline:** commit `341e21fece5949cab6ccda5ac871862b4360769e`, with the separate graphics-plan commit `95745b0`. Uncommitted Opus implementation was not copied. Later execution must read the current approved contracts of its consuming stage.

## Start here

1. Use a separate chat with GPT-6.1 Sol and reasoning effort HIGH.
2. Use this isolated checkout or a fresh managed worktree containing the package. Keep Opus's checkout separate.
3. Send the [start prompt](START_PROMPT.md). Sending that prompt authorizes **GFX00 only**: documentation, reference inventory, and unresolved choices. It does not authorize image generation.
4. Review the resulting brief and reference selection. Production jobs remain tied to their numbered application stage and explicit owner authorization.
5. Run `python3 docs/graphics/tools/validate_pack.py` from this package root. This validates package structure and register entries; it does not certify artwork or UI behavior.

The packet itself creates no task and launches no future stage. GFX job numbers are local assignment IDs, not new application stages.

## Documents

| File | Use |
|---|---|
| [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md) | What Sol must produce, technical constraints, formats, and scope. |
| [ACCEPTANCE.md](ACCEPTANCE.md) | Visual and handoff checks, evidence, and what only application integration can prove. |
| [DECISIONS.md](DECISIONS.md) | Decisions to settle at the point of use; no invented approvals. |
| [Work order index](../../work-orders/sol-graphics/README.md) | Select one job and its parent stage. |
| [Asset register](../../design/ravenford/asset-register.json) | Nineteen planned world/character/clue assets and separate UI families. |
| [Output routing](../../design/ravenford/AGENTS.md) | Where Sol saves its deliverables. |
| [Brief template](templates/VISUAL_BRIEF.md) | Reference/style selection and technical intent. |
| [Review template](templates/QA_REPORT.md) | Evidence and remaining defects. |
| [Handoff template](templates/HANDOFF.md) | Exact files, checks, integration notes, and next boundary. |

## Responsibilities

- **Sol / HIGH:** selected visual-production job, art direction proposals, images through available image tools, SVG graphics, offline layouts, export checks, and handoff. This is a supporting design role.
- **Opus:** production application code and integration in the one authorized numbered stage, under EFFORT_MATRIX.md.
- **Astra:** independent invariant review at the existing gates. Sol's visual QA is not a formal gate PASS.
- **Owner:** visual direction and material product choices. Routine variants and exports follow the accepted brief without repeated approval requests.

Sol may write only the outputs named by its work order, the design register, and its own design notes/reports. It must not modify apps/, packages/, migrations, production API contracts, approved ADRs, main, or formal gate artifacts.

## Archive use

A ZIP distribution contains this package plus a small read-only snapshot of authoritative project documents. Extract it into a new empty folder for inspection; do not unpack it over Opus's checkout. It contains no application source or installed dependencies and cannot start the game. The included root AGENTS.md and EFFORT_MATRIX.md still apply.

For later production, use a separate actual project checkout and reconcile against the consuming stage's current approved contracts. Treat the archive's backend details as a dated snapshot. The package model assignment applies only to the isolated graphics jobs, not to Stage 150–230 implementation.

## Completion

GFX00 is complete when the brief, inventory, and decision record can guide the sample job, with missing references honestly marked. Each later job ends with its named assets, a QA report, and a handoff. A missing external capability is reported as a concrete gap; it is never represented by a fabricated generated image or a claimed successful export.
