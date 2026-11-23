# Work Order — Stage 1020: the book kit, paper and each book's materials

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`): the
demo accepted, «Принимаю, дальше»; «каждая книга имеет свой стиль, согласно арту содержимого …
картинки кампании и книги (страницы, переплет, иконки) должны выглядеть гармонично»; book pictures
by Codex CLI. Program `docs/BOOK_INTERFACE_PLAN.md` (section 1020); ADR 0075 §2, written with the
stage. Branch `claude/stage-1020-book-kit`, stacked on Stage 1010's.

## Deliver

1. **Each book's set** for every library campaign, drawn by Codex CLI with that campaign's pictures
   as references: binding, paper, ribbon, dice tray, the icons of the eight parts. Originals in
   `~/Documents/living-tabletop-world-art/book-sets-2026-11-23/` with prompts and scripts.
2. **The materials pipeline**: `scripts/book-materials/build.ts` → `apps/web/public/book-materials/`,
   `apps/web/src/visual/book-materials/` (manifest with digests, stylesheet of custom properties).
3. **The kit**: `apps/web/src/book-kit/` — the materials' names (`materials.ts`), the theme context,
   the part and moment icons and the ribbon (`kit.tsx`), `styles/book-kit.css`.
4. **Paper** as a scope of the visual tokens, measured.
5. **The DM's book dressed** in its campaign's set.
6. **Four journey shards** in CI.
7. ADR 0075 §2; `reports/STAGE_1020_COMPLETION.md`.

## Boundaries

No contract, route, migration or rule changes. Nothing but the DM's book looks different. No text
is written by a model. Nothing is merged or deployed.

## Checks

Format, lint, typecheck, the context budget, unit (the paper and materials tests among them), the
book's journeys on Chromium and the iPad project, the layout audit of the dressed book at 1440,
1024, 768 and 390 px for campaigns with and without a set.
