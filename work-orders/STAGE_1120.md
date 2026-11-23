# Work Order — Stage 1120: the manuscript — writing on the page

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`), the
demo accepted («Принимаю, дальше»); program `docs/BOOK_INTERFACE_PLAN.md` (section 1120); ADR 0075
§12, written with the stage. Branch `claude/stage-1120-writing`, stacked on Stage 1110's.

## Deliver

1. The structured editor and the protections as the manuscript's page: words in the column,
   what is chosen in the margin with leaders, a margin line, the characters left beside each text
   (`workshop/editing/field-controls.tsx`, `styles/workshop-writing.css`).
2. A protection's note in the margin where it begins.
3. ADR 0075 §12; `reports/STAGE_1120_COMPLETION.md`.

## Boundaries

No editing request, lock, conflict, nonce or save rule changes (`workshop/editing/`).

## Checks

Typecheck, lint, format, build, unit, context budget; every workshop journey; the editor's
sections and the protections looked at and audited at 1440, 1024, 768 and 390 px.
