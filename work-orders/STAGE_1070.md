# Work Order — Stage 1070: Heroes, World, Journal as spreads

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`), the
demo accepted («Принимаю, дальше»); program `docs/BOOK_INTERFACE_PLAN.md` (section 1070); ADR 0075
§7, written with the stage. Branch `claude/stage-1070-parts-as-spreads`, stacked on Stage 1060's.

## Deliver

1. The hero's sheet as a spread on the book's paper (`apps/web/src/styles/book-spreads.css`).
2. The two-part sections (Places, Add to the world, Encounter) as spreads with the fold.
3. A phone's Scene as one page of the book on paper (`world/scene.tsx`).
4. ADR 0075 §7; `reports/STAGE_1070_COMPLETION.md`.

## Boundaries

No command, route, rule or projection changes; every control of the sections stays where it is.

## Checks

Typecheck, lint, format, build, unit, the parts' journeys, every section and the hero's sheet
looked at at 1440 and 1024 px, the phone at 390 px.
