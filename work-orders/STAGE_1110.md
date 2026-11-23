# Work Order — Stage 1110: the manuscript — the desk and the pages

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`), the
demo accepted («Принимаю, дальше»); program `docs/BOOK_INTERFACE_PLAN.md` (section 1110, decision
13); ADR 0075 §11, written with the stage. Branch `claude/stage-1110-desk`, stacked on Stage 1100's.

## Deliver

1. The workshop on the writer's desk: the desk picture in the product's set
   (`scripts/book-materials/build.ts`), drafts as manuscripts, a new draft as a blank sheet,
   confirmed campaigns as bound books (`workshop/app.tsx`, `drafts.tsx`, `campaigns/list.tsx`,
   `styles/workshop.css`, `styles/workshop-desk.css`).
2. The scenario on the manuscript's paper with its contents and page as a spread; the sections as
   bookmarks (`workshop/editor.tsx`).
3. The library's cards in a new manuscript on their own paper; revisions compared as proofs side by
   side.
4. ADR 0075 §11; `reports/STAGE_1110_COMPLETION.md`.

## Boundaries

No workshop request, nonce, lock, conflict or owner check changes; no provider is called; no
picture is drawn by the app.

## Checks

Typecheck, lint, format, build, unit, context budget; every workshop journey and the shelf's; the
desk, a draft, a comparison and the library pick looked at and audited at 1440, 1024, 768, 390
and 320 px.
