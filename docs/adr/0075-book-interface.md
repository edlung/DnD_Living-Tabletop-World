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
- Stage 1020 added §2 (the kit, paper, the books' materials); Stage 1030 §3 (the DM's screen); Stage 1040 §4 (the hero's book); Stage 1050 §5 (the Scene as a spread, a book for every campaign); Stage 1060 §6 (the fight as a fold-out); Stage 1070 §7 (the parts' pages as spreads); Stage 1080 §8 (the dice at the foot of every page); Stage 1090 §9 (the open book on the table).
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

### 3. The DM's book is the DM's screen (Stage 1030)

1. **Seven parts, no dock.** In the DM's perspective the dock is gone. The fore-edge holds seven
   bookmarks — Book, Scene, Heroes, World, Journal, At the table, Rules — each in the campaign's
   own icon; the open part's pages are tabs along the top of the page. Every section the dock held
   is one page: Book (the DM's book); Scene (the stage itself, Encounter); Heroes (Party); World
   (Places, Time and weather, Add to the world, Images); Journal (Journal, Notes, Chronicle,
   History); At the table (Session, Chat, Table screen and Players where the table signs in by
   invitation); Rules (Rules, Dice). A page's tab keeps the dock button's id, name and states; the
   dock remains a player's until Stage 1040.
2. **A part opens where it was left.** Choosing a part opens the page last read in it, the Scene
   part's first page being the stage. Closing a page returns to the Scene, focus on its bookmark.
3. **Everything on paper.** Every section in the DM's book is a page: the campaign's binding around
   it, its paper under it, the paper scope of the tokens (§2.4) on it; the dark grounds of fields
   and cards become lighter paper there. The stage keeps its picture inside the binding.
4. **The book's own bookmarks** keep only its two views, the pages and the contents; the sections
   they opened are parts and pages of the DM's book itself.
5. **Not in this stage**: the running head (place, time, the meeting) stays the top bar; the dice
   at the foot of every page, slips and the Scene as a spread come with Stages 1050 and 1080.

### 4. A hero's book (Stage 1040)

1. **Five parts, no dock.** A player's screen is the hero's book: Scene, Hero, World, Journal and
   At the table, with the open part's pages as tabs (World: Places; Journal: Journal, Chronicle;
   At the table: Dice, Chat, the table's screen online, Rules). On a phone the bookmarks run along
   the bottom with their icons. The dock, its More and its fitting are gone from the product.
2. **What waits marks its bookmark**: a check the DM asked marks At the table and its Dice, a
   handout the Journal, a message the talk.
3. **The hero's sheet** opens from the Hero's bookmark, on the book's paper. (S) It stays the
   dialog it was, so a sheet with unsaved words still asks before it closes; it becomes a spread of
   the Heroes part in Stage 1070, with the DM's.
4. Every section a player opens is on the book's paper inside the campaign's binding, as the DM's.

### 5. The Scene as a spread; a book for every campaign (Stage 1050)

1. **The Scene is a spread** in both books where two pages fit (at least 1024 px wide and 600 px
   tall), and is not while a fight holds the stage (Stage 1060 makes the fight a fold-out). The left
   page is the place as it is now, in reading order: its name and hour, the talk while it lasts,
   who sits at the table, who and what is here as a list with their pictures, the ways beyond. The
   right page is the place's plate and, under it, the card of what is chosen; with nothing chosen
   the page says where a card comes from. A result is a slip laid on the plate; a talk takes the
   plate's place while it lasts, the card of the one it is with under it.
2. (S) Narrower, the Scene stays one page under its picture, as Stage 1040 left it; the phone's
   page on paper comes with the hero's spread (Stage 1070).
3. **The ribbon and the Scene point at each other.** The DM's ribbon hangs at the spine of the
   Scene's spread with its chapter's number and opens the story there; the place a page of the
   story plays at opens that place's card in the Scene. Reading never moves the ribbon (ADR 0074
   §3.4).
4. **Every campaign has a book.** Where none was written for it, the server assembles one from what
   the campaign holds, with no model and no word of its own: a published campaign's package gives a
   chapter a situation at one of its places (its words, the approaches as choices, the developments
   as consequences, the campaign's opening on the first chapter), a world with no package behind it
   (a built-in adventure) a chapter a place, the party's own first, with who is there and the clues
   that lie there. Every page is the campaign's own text (layer 1) for the DM to tell — a
   situation's words may hold what the party has not learned, so only the campaign's opening is
   marked to be read aloud; a check, a person's wants, a handout it does not hold stay empty, for
   the book to show as a gap (ADR 0074 §1.6). The book says on its pages that it was assembled. The
   written book comes first wherever there is one; a built-in adventure's written book that waits
   for the owner's reading stays closed, and the assembled one opens in its place. This is the one
   read route with a second source (plan decision 12): `GET /campaigns/:id/dm/book`; no command and
   no rule change.

### 6. The fight as a fold-out (Stage 1060)

1. **A fight unfolds over the book.** While the stage shows the battlefield, it is a sheet unfolded
   over the whole spread inside the binding: the book's paper with the fold down its middle, the
   place's picture stepping aside for the map. "Scene" folds it up to the Scene's spread; the
   battlefield's own switch is the fold's handle. (S) The fold-out is the wide screen's (from
   1200 px, where the fight lies across the spread); narrower, the fight runs as one column over
   the dark stage and keeps its glass, inside the book's margins.
2. **The sheet keeps the fight's places**: whose turn it is and the order at its head, the place,
   the active combatant and who is at the table in its left margin, the card of what is chosen in
   its right, the turn tray at its foot; a reaction asked or an attack readied lies on it as a
   slip. Every one of them is on the book's paper (§1.7), measured at WCAG 2.2 AA like any page.
3. **Nothing of the fight changes**: its commands, its rules, the board's drawing, the battle maps
   and the figures stay as they are (ADR 0035, 0045, 0057); a player's bookmarks still run along
   the bottom of a fight (§4).

### 7. The parts' pages as spreads (Stage 1070)

1. **The hero's sheet is a spread**: the card (portrait, name, class, hit points and the four
   figures) the left page, the sheet's tabs the right, the fold between, on the book's paper — the
   campaign's dark binding no longer lies under the card's ink.
2. **A section of two things side by side is a spread**: the World's places (the map and the
   choice of place), the blank pages of "Add to the world" (the words for the AI and the editors by
   hand) and the Encounter (the fights ready and a fight with who is here): two equal pages, the
   fold in the gutter. Sections of one thing or of many cards stay one wide page.
3. **A phone's Scene is one page of the book**: its picture at the head and the place's words, who
   and what is here and the ways beyond on the book's paper under it (§5.2).
4. (S) Deferred, each to the stage of its part's rebuild: the party's own page beside a hero's
   spread, pictures on their plates, the time and weather in a running head, handouts and asks as
   slips, the Chronicle inside the book, the world map as a fold-out. The sections keep their
   forms and controls meanwhile; nothing a DM or a player can do changes.

### 8. The dice at the foot of every page (Stage 1080)

1. **Every page of both books has the dice at its foot**: a tray across the binding's lower edge
   under the page with the seven dice, the last roll the table saw and "More dice" to the Dice
   page. One press rolls one die for the table: the server rolls it and the dice fly for everyone
   who may see them, as a free roll of the Dice page does (Stage 510); nothing new is sent.
2. On a phone the tray lies above the bookmarks along the bottom with the three dice a table
   reaches for most (d20, d6, d8); what kept clear of the dock keeps clear of it.
3. In a fight the turn tray is the page's foot and the dice tray steps aside.
4. (S) The Table's and the Rules' pages keep their sections as Stage 1030 put them in the book;
   the meeting as a page with "Previously…", sound and music, and the rules as an appendix opened
   from a rule's word are deferred with the parts of §7.4.

### 9. The open book on the table (Stage 1090)

1. **The table's screen is the campaign's book lying open**: its binding around the page; the
   place's picture, a picture, a story read aloud and the battlefield as plates in it; what is
   read — the rolls, the agreement, the Chronicle's chapter, the stars, the bookplate to join —
   on the book's paper; a title card a title page, the campaign's picture on the left page and
   the title on the right with the fold between.
2. **Nothing cast is the closed cover**: the binding and the emblem, as dim as the dark screen the
   DM asked for.
3. No cast changes its contract or its content (ADR 0059); the screen's own controls keep a
   ground of their own over the paper.
4. (S) Deferred: the players' "Table screen" online keeps the casts as before inside its page of
   the book; the TV shell's remote is not driven in this stage.

### 10. The shelf (Stage 1100)

1. **The way in is the product's own book lying open** over the key art: the ex libris on the left
   page (the emblem, the wordmark, the tagline in its cream panel), on the right page what the
   book asks or says — signing in, an invitation, a table's code, a failed link, signed out. Below
   900 px the book is one page and the plate's words head it as a title page's would: the plate's
   picture would take a phone's screen.
2. **The hub is the shelf**: the product's bookcase behind; each campaign the account sits in a
   book face-out in its campaign's own binding, standing on a stretch of the bookcase's board, with
   a paper label below in its campaign's paper — its name, who the account is there, **where the
   party is** (a name the party knows, else nothing), the next game, its book and its door. The
   finished adventures, the ready adventures and the library are shelves of the same kind.
3. **A library campaign is a book with its cover picture set in**; "Look inside the book" opens its
   first page over the shelf (a modal dialog on paper): the picture, the whole pitch, the party size
   and the press that starts it. The book itself is a large target for the pointer doing what its
   label's first button does, hidden from the keyboard and from assistive technology so nothing is
   read twice.
4. **The account is a page** of the product's book after the shelves; the privacy notice and
   "something went wrong" are pages of the same paper.
5. **Every campaign's book set is shipped** (55 campaigns and the product's own, Codex CLI
   pictures in each campaign's style, converted by `scripts/book-materials/build.ts`), with the
   product's bookcase, its board — cut from the bookcase without changing a pixel — and the ex
   libris. Every paper is lighter than the product's, whose ink contrast is measured.
6. The account list gains `place` (`GET /account`), from the same test the table's screen applies
   before it names a place (ADR 0044 §5); no command, rule or projection changes.
7. (S) Deferred: the ready adventures have no cover picture of their own on their books; the
   shelf's own books are not ordered or grouped by the account.

### 11. The manuscript: the desk and the pages (Stage 1110)

1. **The workshop's home is the writer's desk** (the `ltw` set's desk, a Codex CLI picture): a new
   draft is a blank sheet; each draft a manuscript of loose pages; each confirmed campaign a bound
   book in its own binding, the shelf's book with its label (enter it, open its source draft).
   The way into the workshop and its sign-in lie on the same desk.
2. **A draft's scenario is the manuscript read on its pages**: the sections are bookmarks on the
   page's top edge; the scenario on the book's paper; its contents on the left page and the page of
   the object read on the right, with the fold between; below 1100 px the contents stand above.
3. **A new manuscript from the library**: each campaign's card in its own paper under its cover.
4. **Revisions compared are two proofs side by side** — before on the left, after on the right — on
   a phone one above the other.
5. Nothing of the workshop's contract changes: the owner's boundary, the requests and their nonces,
   locks and conflicts stay as they are (`workshop/AGENTS.md`). Editing in place is Stage 1120; the
   co-author, plates, proof copies and binding — Generation, World preview and Activation — come to
   the book in Stage 1130, and until then keep their glass.

### 12. The manuscript: writing on the page (Stage 1120)

1. **The structured editor and the protections are the manuscript's page itself**, not a card on
   it, on the book's paper.
2. **Words are written in the page's column** (names, texts, descriptions), each with how many
   more characters fit standing in the margin beside it.
3. **What is chosen stands in the margin** beyond a ruled margin line — a choice from a list or a
   reference, a number, a yes or no, a part added or removed — its label in the column with a
   dotted leader to it. Nested parts keep their right edge on the page's, so every margin lines up
   under the line; below 768 px the page is one column and the margin falls under its label.
4. **Where a protection begins the margin says so** ("Locked content…"), not again inside it.
5. Locks, conflicts, saving and every request of the editing contract stay as they were
   (`workshop/editing/`); the inspector's quick corrections and the targeted AI edit come to the
   book with the co-author in Stage 1130.

### 13. The manuscript: the co-author, the plates, the binding (Stage 1130)

1. **Every section of a draft is the manuscript's paper** but the world preview: the generation's
   commission is the form on the left, the pages it proposed on the right; **each proposed page is
   marked "Not read yet" until the author opens it**, then "Page read". The marks live while the
   draft is open, in memory only: the workshop keeps nothing of a draft in the browser.
2. **An AI edit is a proofreader's marks**: what it would take out is struck through, what it would
   put in is underlined and ruled in the margin; it is accepted or refused whole, as the editing
   contract has it (accepting each mark alone would need a new request, which this program does not
   add — decision 12).
3. **The draft's pictures are plates** in a thin gilt frame.
4. **The world preview is the proof copy**: the game's own scene and board views as they will be
   read, under the proof's stamp ("Preview only…"); it keeps the game's dark ground, so the views
   are exactly the table's.
5. **Activation is binding**: the checks and the consent on the manuscript's paper; once bound, the
   book stands in the activation and on the desk in its binding, and the campaign plays like a
   library campaign with its DM's book — the library's, or the one assembled from its package
   (§5, `book-source.ts`); the activation journey opens it.
6. No provider is added and no spending rule changes (ADR 0032); no workshop request, nonce or
   consent changes.

## Consequences

- Journeys change how they reach a control: 117 of 170 journey files open sections through
  `tests/e2e/support/shell.ts`, which becomes "open a part and a page".
- The dark-only rule of the visual tokens ends; contrast is measured again for every pair.
- The previous deployment is the only way back from a stage that replaced a screen; a rehearsal on
  the owner's tablet precedes the deployment of the DM's book as the DM's screen.
- The table-screen contract and the server's routes are unchanged by §1.
