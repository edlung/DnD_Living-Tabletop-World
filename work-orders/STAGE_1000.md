# Work Order — Stage 1000: the whole interface as a book, foundation

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`): the
brief, three choices in a question card, «Да, открываем» to Stages 1000 and 1010. Program
`docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §1, written with the stage. Branch
`claude/book-interface-plan`. Documents only.

## Deliver

1. `reviews/OWNER_BOOK_INTERFACE_2026-11-23.json` — the owner's words and choices.
2. `docs/BOOK_INTERFACE_PLAN.md` — the program, Stages 1000–1140, which are authorized.
3. `docs/adr/0075-book-interface.md` §1 and its row in `docs/adr/README.md`.
4. `docs/BOOK_INTERFACE_MAP.md` — every control and view of today, read from the code, with the
   book, part and page it goes to: the program's acceptance table.
5. `work-orders/STAGE_1000.md`, `work-orders/STAGE_1010.md`.
6. The owner's paragraph in `AGENTS.md`, the section in `docs/PROJECT_WORKFLOW.md`, the row in
   `docs/AI_CONTEXT_MAP.md`.
7. `reports/STAGE_1000_COMPLETION.md`.

## Boundaries

No code, no contract, no migration, no package. Nothing is merged or deployed.

## Checks

Format, the context budget; every repository path named in the new documents exists; the map's
rows are counted per section against the code's sections.
