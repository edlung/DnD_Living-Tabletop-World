# GFX70 Combat layouts

**Model:** GPT-6.1 Sol / HIGH. **Scope:** this job only. See [rules](AGENTS.md).

## Prerequisites

Stage 220 authorized; GFX50 kit; approved combat/reaction projection and battlefield data.

## Read first

Read docs/graphics/README.md, docs/graphics/TECHNICAL_SPEC.md, docs/graphics/ACCEPTANCE.md, and the current brief/decision record if present. All plain paths below are relative to the repository root.

Read work-orders/OPUS_STAGE_220.md, permitted combat/reaction views, and relevant ADR 0015/0016 lifecycle rules only.

## Work

- Produce battlefield/token layouts and geometry-driven movement/range/cover/AoE overlays.
- Cover legal and illegal targeting, ally AoE warning without prohibition, pending/stale outcomes, and Counterspell CAST/IGNORE/closed states.
- Include DM start/end/close controls from the existing domain lifecycle.
- Keep illustrative geometry labeled; animation does not create timing or decide legality.

## Deliverables

mockups/combat/; combat SVG/graphic exports; register updates; reports/GFX70_QA.md; reports/GFX70_HANDOFF.md. Report paths above are beneath design/ravenford/ unless already rooted there.

## Completion

VIS03–11/13–14 have design evidence. No non-party hidden HP, private initiative data, or spell details beyond the permitted view. Do not invent an expiry timer.

Use the QA and handoff templates. Run the structural validator and git diff --check. Report actual artifacts and limitations in Russian; keep repository documents in English.

## Stop

GFX80 requires Stage 230 authorization. Never continue automatically or merge into main.
