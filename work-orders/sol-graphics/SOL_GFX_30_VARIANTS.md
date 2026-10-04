# GFX30 State variants

**Model:** GPT-6.1 Sol / HIGH. **Scope:** this job only. See [rules](AGENTS.md).

## Prerequisites

Stage 160 authorized; usable base world resources; actual canonical-to-visual contract.

## Read first

Read docs/graphics/README.md, docs/graphics/TECHNICAL_SPEC.md, docs/graphics/ACCEPTANCE.md, and the current brief/decision record if present. All plain paths below are relative to the repository root.

Read the selected Day 2 decision, work-orders/OPUS_STAGE_160.md, and only the asset/state fields that the consumer exposes.

## Work

- Produce the minimum variants for one supported Day 1/Day 2 demonstration.
- Preserve identity, composition, and unchanged layers. Record each derivative's actual parent asset_id.
- Provide a state-to-resource mapping note based on the real contract; do not create a second world-state schema.
- Include a visual comparison and explain reuse/fallback when the state has no dedicated variant.

## Deliverables

Variant exports; derivative register rows; notes/state-variants.md; reports/GFX30_QA.md; reports/GFX30_HANDOFF.md. Report paths above are beneath design/ravenford/ unless already rooted there.

## Completion

VIS01/02/07/09/10/12/14 are evidenced. The chosen difference corresponds to actual supported state. No expanded weather or world simulation.

Use the QA and handoff templates. Run the structural validator and git diff --check. Report actual artifacts and limitations in Russian; keep repository documents in English.

## Stop

GFX40 requires Stage 170 authorization. Never continue automatically or merge into main.
