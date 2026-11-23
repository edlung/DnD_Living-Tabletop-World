# Work Order — Stage 1040: the hero's book

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`), the
demo accepted («Принимаю, дальше»); program `docs/BOOK_INTERFACE_PLAN.md` (section 1040); ADR 0075
§4, written with the stage. Branch `claude/stage-1040-hero-book`, stacked on Stage 1030's.

## Deliver

1. A player's screen is a book of five parts in the campaign's icons; the dock, More and the
   dock's fitting are removed (`apps/web/src/shell/book-parts.tsx`).
2. Every section a player opens on the book's paper; the hero's sheet on the book's paper.
3. Journeys reach a player's section through its part; the dock's fit journey becomes the hero's
   book's (`tests/e2e/hero-book-parts.spec.ts`); `tests/e2e/AGENTS.md` says how.
4. ADR 0075 §4; `reports/STAGE_1040_COMPLETION.md`.

## Boundaries

No contract, route or rule changes. A player receives only the player's own projection, as before.

## Checks

Typecheck, lint, format, build, unit, every journey in every project, the hero's book at 1180,
768 and 390 px looked at.
