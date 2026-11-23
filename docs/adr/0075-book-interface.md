# 0075. The whole interface as a book

- Status: Accepted for §1 (the owner's words of 2026-11-23, `reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`:
  the brief, «Заменять сразу», «Сначала демо всех книг», «Полностью как рукопись», «Да, открываем»).
  Points marked (S) are the session's and stay the owner's to overrule
  (`docs/BOOK_INTERFACE_PLAN.md`, decisions 6–13). Later sections are added by their stages, after
  the owner has accepted the demo of Stage 1010.
- Amends: ADR 0034 §9 (the shell: top bar, stage, dock with sheets, right panel, the Chronicle as a
  dialog) and the dark-only rule of `apps/web/src/styles/tokens.css`; ADR 0043 §3 (the DM's dock and
  its fit); ADR 0074 §1.7 (the book beside the dock). Each amendment takes effect with the stage
  that builds it; until then the amended text stands.
- Stage 1020 added §2 (the kit, paper, the books' materials).
- Context: On 2026-11-19 the owner said the product looks like an Excel table; on 2026-11-22 he made
  a book the base of the DM's screen, and Stages 900–930 put one beside the dock for all 55
  campaigns. On 2026-11-23 he asked that the whole interface become a book and that everything go
  through it. Today the client is a shell of a top bar, a stage, a dock of up to eighteen items with
  seventeen sheets, a detail panel and dialogs (556 source files), a separate table-screen app with
  eleven casts, a hub and sign-in screens, and a workshop of forms.

## Decision

### 1. What "the interface is a book" means (Stage 1000)

1. **Five books, one engine.** The shelf (the way in, the campaigns, the library, the account), the
   DM's book, the hero's book, the open book on the table (the table's screen) and the manuscript
   (the workshop). They share one kit of pieces: the spread, the page, bookmarks, the ribbon, the
   plate, the card, the running head, the foot tray, the fold-out, the slip, the margin.
2. **A screen is a page.** No part of the product shows a dock, a sheet over a stage, a panel beside
   it or a dialog of tools once its stage is done. A tool is where a reader would look for it in a
   book: a part behind a bookmark, a page of that part, the foot of every page (the dice), the
   running head (where, when, the meeting), a slip (what waits), a fold-out (a map, a fight).
3. (S) **Parts, not a bookmark a tool.** The DM's book has seven parts — Story, Scene, Heroes,
   World, Journal, Table, Rules; the hero's book five — Scene, Hero, World, Journal, Table, with the
   rules as an appendix. Every control of today has its row in the program's acceptance map
   (`docs/BOOK_INTERFACE_MAP.md`); a stage that rebuilds a section proves each of its rows.
4. **Replaced at once** (the owner's choice). A stage that makes a screen a book removes the old
   screen in the same pull request; the product keeps no switch back. The way back is the previous
   deployment.
5. **The demo first** (the owner's choice). No product code is written before the owner has seen
   all five books in a clickable demo and accepted it, with his corrections (Stage 1010).
6. **The workshop is a manuscript** (the owner's choice): a draft is the pages of the future book,
   edited on the page; generation proposes pages marked unread; an AI edit is a proofreader's marks;
   publishing is binding. Its contracts — the owner boundary, credentials kept out of React state,
   locks, conflicts, revisions — do not change.
7. **Paper.** The surface of every book is paper; status colours (health, sides, danger, magic) get
   paper values at WCAG 2.2 AA. (S) Paper arrives as a scope of the visual tokens, so a section
   shared by two shells stays right while both exist.
8. **The book looks like its campaign.** «каждая книга имеет свой стиль, согласно арту содержимого …
   картинки кампании и книги (страницы, переплет, иконки) должны выглядеть гармонично» (the owner,
   2026-11-23). Its binding, paper, materials, accent, lettering and the icons of its parts and moments
   are made in that campaign's own house style, with its pictures as the reference; the product's own neutral binding dresses the
   shelf, the way in and a campaign without its own. Book materials are pictures generated with
   Codex CLI (the owner's words of 2026-11-23), kept as originals outside the repository and
   shipped as optimised files; the app draws only the game's own markup over them.
9. (S) **Every campaign has a book.** Where no book document is written or open, the Story is
   assembled from what the campaign's world already holds, with no model; what is missing is shown
   as a gap (ADR 0074 §1.6).
10. **The authority does not move.** A book is a view: every change it starts is a command the
    product already has, judged by the World Engine. A player's book and the table's book receive
    only their own projections; the DM's text never reaches them. No AI is called at the table.

### 2. The kit, paper and each book's materials (Stage 1020)

1. **Each book's own set.** A campaign's book has a set of pictures drawn in that campaign's house
   style with its own pictures as the references: the binding, the paper, the ribbon, the dice tray
   and the icons of the eight parts (Story, Scene, Heroes, Hero, World, Journal, Table, Rules); the
   three books of the demo also have moment icons, a divider and an emblem. The originals are Codex
   CLI pictures kept outside the repository; `scripts/book-materials/build.ts` converts them
   mechanically to `apps/web/public/book-materials/<theme>/` and writes the manifest the client
   reads and the stylesheet that hands a campaign's theme its textures (`--book-cover`,
   `--book-paper`, `--book-ribbon`, `--book-tray`, …). The product's own set (`ltw`) dresses only
   the shelf, the way in and the writer's desk.
2. **Never another book's set.** A campaign whose set is not drawn yet keeps its theme's material
   and the product's glyphs; no book shows a piece of another book's set
   (`tests/ui-kit/book-materials.test.ts`).
3. **The open book is named once.** The session's shell provides the campaign theme's id to the
   kit (`BookThemeContext`); the kit's pieces (`apps/web/src/book-kit/`) take their pictures from it.
4. **Paper is a scope of the tokens.** `[data-surface='paper']` gives every component on a page
   dark inks, edges and status colours measured at WCAG 2.2 AA on the darkest parchment
   (`tests/ui-kit/paper-tokens.test.ts`); the dark glass stays everywhere else. A section shared by
   a page and the old shell is right in both.
5. **The DM's book is dressed first.** Its bookmarks carry the icons of the parts their sections
   belong to, its moments the moment icons, its pages the book's paper, its spread the book's
   binding, the party's place the book's ribbon. Nothing else a user sees changes in this stage.
6. **Journeys run in four shards** in CI.

## Consequences

- Journeys change how they reach a control: 117 of 170 journey files open sections through
  `tests/e2e/support/shell.ts`, which becomes "open a part and a page".
- The dark-only rule of the visual tokens ends; contrast is measured again for every pair.
- The previous deployment is the only way back from a stage that replaced a screen; a rehearsal on
  the owner's tablet precedes the deployment of the DM's book as the DM's screen.
- The table-screen contract and the server's routes are unchanged by §1.
