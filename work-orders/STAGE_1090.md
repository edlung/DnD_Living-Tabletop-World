# Work Order — Stage 1090: the open book on the table

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`), the
demo accepted («Принимаю, дальше»); program `docs/BOOK_INTERFACE_PLAN.md` (section 1090, decision
9); ADR 0075 §9, written with the stage. Branch `claude/stage-1090-table-book`, stacked on Stage
1080's.

## Deliver

1. The table's screen as the campaign's open book (`apps/web/src/styles/display-book.css`,
   `apps/web/src/display/display-app.tsx`).
2. ADR 0075 §9; `reports/STAGE_1090_COMPLETION.md`.

## Boundaries

The casts' contract (`packages/contracts/src/display/display.ts`) and content do not change; the
screen still shows only what the DM casts.

## Checks

Typecheck, lint, format, build, unit, the table screen's journeys, every main cast looked at at
1920 × 1080 and 960 × 540.
