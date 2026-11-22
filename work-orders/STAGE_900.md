# Work Order — Stage 900: the DM's book, foundation

Authority: the owner's words of 2026-11-22 (`reviews/OWNER_DM_BOOK_2026-11-22.json`): the brief,
«Да, развиваем», «мне для всех компаний книжный формат нужен … 55 кампаний», «Да, открываем» and
four choices in a question card. Program `docs/DM_BOOK_PLAN.md`; ADR 0074 §1, written with the
stage. Branch `claude/stage-900-dm-book-foundation`, stacked on
`claude/campaign-editorial-2026-11-22`. Documents only.

## Before the stage

The editorial work another session left uncommitted in the working tree on 2026-11-22 (scope
`work-orders/CAMPAIGN_EDITORIAL_2026-11-22.md`) goes on its own branch,
`claude/campaign-editorial-2026-11-22`, and its own pull request, as it is, with the project's
checks run on it and their results in the pull request. The owner chose this; merging is his.
Nothing in that work is rewritten here. A check that fails is reported, and fixed only where the
fix is mechanical (formatting, a lint rule); anything else is named in the pull request.

## Deliver

1. `reviews/OWNER_DM_BOOK_2026-11-22.json` — the owner's words and choices.
2. `docs/DM_BOOK_PLAN.md` — the program, Stages 900–950, and which of them are authorized.
3. `docs/adr/0074-dm-book.md` §1 — what the book is; the index row in `docs/adr/README.md`.
4. `work-orders/STAGE_900.md`, `STAGE_910.md`, `STAGE_920.md`, `STAGE_930.md`.
5. `docs/design/dm-book-sample/` — the sources of the accepted demo and a README: what each file
   is, where the page is, how its data and pictures were built, what in it is a demo's shortcut
   and must not be carried into the product.
6. The other session's concept, `docs/design/dm-book/` with
   `work-orders/DM_BOOK_CONCEPT_2026-11-22.md`, committed unchanged as the second reference.
7. The owner's paragraph in `AGENTS.md`, the section in `docs/PROJECT_WORKFLOW.md`, the row in
   `docs/AI_CONTEXT_MAP.md`.
8. `reports/STAGE_900_COMPLETION.md`.

## Session's decisions (each may be overruled)

- Plan decisions 9–14 and ADR 0074 §1.7–§1.9.
- Stage numbers 900–950: the next free block after 890.
- The sample's generated data and pictures are not committed; the README says how they are
  rebuilt from the campaigns.

## Boundaries

No code, no contract, no migration, no package changes in this stage. No paid call, no generated
picture. Nothing is merged or deployed.

## Checks

Format, lint, typecheck, the context budget and the unit suite on the stage's branch; every path
named in the new documents exists.
