# Work Order — Stage 1010: the demo of all the books

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`):
«Сначала демо всех книг», «Да, открываем. Для генераций красивых книжных ассетов интерфейса
обращаемся к Codex CLI.» Program `docs/BOOK_INTERFACE_PLAN.md` (section 1010); ADR 0075 §1. Branch
`claude/stage-1010-book-demo`, stacked on Stage 1000's.

**Ends with a hard stop.** The owner looks at the demo, corrects it and accepts it before any
product code (ADR 0075 §1.5).

## Deliver

1. **Book materials** generated with Codex CLI in the product's own style and in three campaigns'
   own styles (the lighthouse, `rain-check`, `marrow-crown`), each with that campaign's pictures as
   the style reference — the owner's words: «каждая книга имеет свой стиль, согласно арту
   содержимого … картинки кампании и книги (страницы, переплет, иконки) должны выглядеть
   гармонично»: the shelf, the writer's desk, the bookplate, the closed
   cover, the dice tray, a tab, manuscript pieces (proof marks, the seal, the quill) and the icons
   of the books' parts. Originals in `~/Documents/living-tabletop-world-art/book-interface-2026-11-23/`
   with their prompts and the script; nothing generated is committed except what the demo's
   archive needs.
2. **A clickable demo**, a private page of the owner's account, on the engine of the accepted
   sample (`docs/design/dm-book-sample/`), one state shared by every frame:
   - **the shelf**: the bookplate to sign in; the owner's campaigns and the library as books on a
     shelf with their real covers and materials; finished adventures; the account;
   - **the DM's book**: all seven parts and every one of today's DM sections reachable from them,
     the running head, the dice at the foot, slips for what waits, a fight as a fold-out;
   - **the hero's book** in a phone frame: five bookmarks, one page a screen, a roll the DM asked
     arriving as a slip and answered;
   - **the open book on the table**: the closed cover, a plate, a page read aloud, the fold-out of
     a fight, a roll;
   - **the manuscript**, dressed as its campaign: the desk, a draft opened as a book, a page edited in place, a proposed
     page marked unread, a proofreader's marks accepted or refused, binding.
   - **A–Z**: the map of today's controls (`docs/BOOK_INTERFACE_MAP.md`), each row with "shown in
     the demo" or "not shown".
3. Text: campaign text as the campaigns wrote it; no model writes text for the demo.
4. `docs/design/book-interface/` — a README (what each frame is, which pictures were generated and
   how, what is a demo's shortcut and must not be carried into the product) and the archive of the
   demo's sources; `reports/STAGE_1010_COMPLETION.md`.

## Checks

Harmony: for each of the three books, its campaign's pictures and its binding, paper and icons
looked at side by side; nothing of one book's set is used inside another's.
The layout audit at 1440, 1024, 768 and 390 px with every frame's screenshot looked at; an
independent walk through the DM's, a player's and an author's tasks; keyboard and screen-reader
names; the A–Z map's every row checked. The report says what the demo does not show.

## Boundaries

No product code, contract or package changes. No paid text. Pictures only through Codex CLI.
Nothing is merged or deployed.
