# Work Order — Stage 1030: the DM's book is the DM's screen

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`): the
whole interface as a book, replaced at once («Заменять сразу»), the demo accepted («Принимаю,
дальше»). Program `docs/BOOK_INTERFACE_PLAN.md` (section 1030); ADR 0075 §3, written with the
stage. Branch `claude/stage-1030-dm-book-shell`, stacked on Stage 1020's.

## Deliver

1. In the DM's perspective the dock is replaced by the book: seven parts at the fore-edge in the
   campaign's icons, the open part's pages as tabs, every section of the dock a page of one part
   (`apps/web/src/shell/book-parts.tsx`); the dock keeps only a player's items.
2. Every DM section laid on paper inside the campaign's binding; the stage inside the binding.
3. The DM's book's own bookmarks reduced to its pages and contents.
4. Journeys reach a DM section through its part (`tests/e2e/support/shell.ts`); the DM's dock
   journeys become the book's (`tests/e2e/dm-book-parts.spec.ts`).
5. ADR 0075 §3; `reports/STAGE_1030_COMPLETION.md`.

## Boundaries

No contract, route, migration or rule changes; a player's screen is unchanged. Nothing is
deployed: the owner rehearses on his tablet before this stage is deployed (the plan's risk).

## Checks

Typecheck, lint, format, the context budget, unit, every journey on Chromium, WebKit and the iPad
project; every part at 1440, 1024 and 390 px looked at.
