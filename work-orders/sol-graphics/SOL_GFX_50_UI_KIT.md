# GFX50 UI foundation

**Model:** GPT-6.1 Sol / HIGH. **Scope:** this job only. See [rules](AGENTS.md).

## Prerequisites

Gate 05 PASS and Stage 200 explicitly authorized; owner-selected visual brief and confirmed target.

## Read first

Read docs/graphics/README.md, docs/graphics/TECHNICAL_SPEC.md, docs/graphics/ACCEPTANCE.md, and the current brief/decision record if present. All plain paths below are relative to the repository root.

Read work-orders/OPUS_STAGE_200.md, the technical specification UI/layout sections, and actual permitted shell projection examples.

## Work

- Create live typography, semantic color/spacing tokens, consistent icon/line grammar, scalable frames, and common control/state sheets.
- Deliver editable SVGs where appropriate and small offline shell/control layouts under mockups/ui-kit/.
- Inspect proposed 1280x720 and 1920x1080 views plus enlarged text; confirm the supported minimum rather than declaring it approved.
- Record font sources/permissions and all common states. Do not implement the later investigation/combat/authoring journeys.

## Deliverables

design/ravenford/ui-kit/; mockups/ui-kit/; UI-family evidence in the register; reports/GFX50_QA.md; reports/GFX50_HANDOFF.md. Report paths above are beneath design/ravenford/ unless already rooted there.

## Completion

VIS03–07/09–11/13–14 have design evidence. Real keyboard behavior and runtime integration are NOT_RUN unless separately exercised in the authorized application task.

Use the QA and handoff templates. Run the structural validator and git diff --check. Report actual artifacts and limitations in Russian; keep repository documents in English.

## Stop

GFX60 requires Stage 210 authorization. Opus integrates the kit into the real shell. Never continue automatically or merge into main.
