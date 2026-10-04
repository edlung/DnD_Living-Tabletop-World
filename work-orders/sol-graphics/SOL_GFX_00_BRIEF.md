# GFX00 Brief and inventory

**Model:** GPT-6.1 Sol / HIGH. **Scope:** this job only. See [rules](AGENTS.md).

## Prerequisites

Documentation preparation only; no parent implementation stage is opened.

## Read first

Read docs/graphics/README.md, docs/graphics/TECHNICAL_SPEC.md, docs/graphics/ACCEPTANCE.md, and the current brief/decision record if present. All plain paths below are relative to the repository root.

Read RAVENFORD_SPEC.md, PRODUCT_BLUEPRINT.md, docs/UI_GRAPHICS_PLAN.md, and docs/graphics/DECISIONS.md. Use the original discussion only for candidate reference identification; do not treat an accessible image as an approved reference.

## Work

- Create design/ravenford/visual-brief.md from the brief template.
- Reconcile the 19 world/character/clue register rows with the slice; retain canonical_entity_id=null where it has not been verified.
- Create design/ravenford/decisions.md, citing existing selections and recording only relevant unresolved choices.
- Identify actual reference URLs/files or record their absence. No generation, mockup implementation, or game execution.

## Deliverables

design/ravenford/visual-brief.md; design/ravenford/decisions.md; updated asset-register.json; reports/GFX00_HANDOFF.md. Report paths above are beneath design/ravenford/ unless already rooted there.

## Completion

All seven locations, seven character/archetype identities, and five clues remain accounted for; style assumptions and reference availability are honest. Run structural validation. Artwork and UI checks are NOT_RUN.

Use the QA and handoff templates. Run the structural validator and git diff --check. Report actual artifacts and limitations in Russian; keep repository documents in English.

## Stop

GFX10 requires explicit authorization tied to Stage 150 and usable reference selection. Never continue automatically or merge into main.
