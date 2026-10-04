# GFX40 Chronicle resources

**Model:** GPT-6.1 Sol / HIGH. **Scope:** this job only. See [rules](AGENTS.md).

## Prerequisites

Stage 170 authorized; scoped memory inputs and required historical assets available.

## Read first

Read docs/graphics/README.md, docs/graphics/TECHNICAL_SPEC.md, docs/graphics/ACCEPTANCE.md, and the current brief/decision record if present. All plain paths below are relative to the repository root.

Read work-orders/OPUS_STAGE_170.md, docs/adr/0010-memory-and-temporal-retrieval.md consequences, and RAVENFORD_SPEC.md Chronicle.

## Work

- Prepare the reusable chapter/flashback content image, participant crops, and historical resource references.
- Keep dialogue, chapter text, dates, and participant labels as editable structured content.
- Produce a content composition with deliberately permitted sample memory, clearly labeled as a design preview.
- Document gaps in memory/history inputs; do not read a raw private event stream to fill them.

## Deliverables

Chronicle content exports and composition; register updates; notes/chronicle-sources.md; reports/GFX40_QA.md; reports/GFX40_HANDOFF.md. Report paths above are beneath design/ravenford/ unless already rooted there.

## Completion

VIS01/06/07/10/12/14 have evidence. The minimum flashback has image, dialogue placeholder/content reference, participants, and world time. Interactive UI remains for its allocated UX stage.

Use the QA and handoff templates. Run the structural validator and git diff --check. Report actual artifacts and limitations in Russian; keep repository documents in English.

## Stop

GFX50 requires Gate 05 PASS and explicit Stage 200 authorization. Never continue automatically or merge into main.
