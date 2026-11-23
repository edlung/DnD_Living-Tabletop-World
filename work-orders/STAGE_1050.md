# Work Order — Stage 1050: Scene and Story

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`), the
demo accepted («Принимаю, дальше»); program `docs/BOOK_INTERFACE_PLAN.md` (section 1050, decisions
7 and 12); ADR 0075 §5, written with the stage. Branch `claude/stage-1050-scene-story`, stacked on
Stage 1040's.

## Deliver

1. The Scene as a spread in both books on a screen at least 1024 px wide and 600 px tall: the
   place on the left page, the plate and the card of what is chosen on the right
   (`apps/web/src/world/scene-spread.ts`, `apps/web/src/styles/scene-spread.css`).
2. The DM's ribbon at the spine of the Scene's spread; the story's place opens the Scene
   (`apps/web/src/book/scene-ribbon.tsx`, `book-sheet.tsx`).
3. A book for every campaign: the server assembles one from a published campaign's package or from
   a world with no package, with no model and no word of its own
   (`apps/server/src/book/assembled-book.ts`, `book-source.ts`; `assembled` in
   `packages/contracts/src/campaign/book.ts`).
4. Unit tests of the assembled book; `tests/e2e/scene-spread.spec.ts`; the journeys that expected
   a campaign without a book follow it.
5. ADR 0075 §5; `reports/STAGE_1050_COMPLETION.md`.

## Boundaries

One read route gains a second source; no command, rule or projection changes. The book stays the
DM's: a player's and the table's projections are unchanged. No model is called and no text is
written for a book.

## Checks

Typecheck, lint, format, build, unit, every journey in every project, the Scene at 1440, 1180,
1024, 834 and 390 px looked at, light pages and contrast measured by the accessibility checks.
