# Work Order — Stage 1080: Table, Rules and the dice at the foot

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`), the
demo accepted («Принимаю, дальше»); program `docs/BOOK_INTERFACE_PLAN.md` (section 1080, decision
6); ADR 0075 §8, written with the stage. Branch `claude/stage-1080-table-rules-foot`, stacked on
Stage 1070's.

## Deliver

1. The dice at the foot of every page in both books (`apps/web/src/dice/book-foot.tsx`,
   `apps/web/src/styles/book-foot.css`); every page's lower edge above it.
2. A journey of it (`tests/e2e/book-foot.spec.ts`, its own campaign).
3. ADR 0075 §8; `reports/STAGE_1080_COMPLETION.md`.

## Boundaries

A die pressed sends the same free roll the Dice page sends; no command, route, rule or projection
changes.

## Checks

Typecheck, lint, format, build, unit, the pages' and the dice's journeys, the foot looked at at
1440, 1024 and 390 px.
