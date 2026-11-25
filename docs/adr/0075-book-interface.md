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

### 14. Closing (Stage 1140)

1. The old dock's styles are removed (its components went in Stages 1030 and 1040); the marker it
   drew stays for the bookmarks; `--dock-h` stays as the height kept clear at a page's foot.
2. The dark tokens stay: the fight's narrow column, the world preview's proof, the table's screen
   and every surface outside a page still stand on the dark ground, and paper is the token scope
   over it (decision 10). No token is unused.
3. The dictionaries lose the phrases no screen says any more (25), the client two functions nobody
   calls.
4. What every stage left undone is gathered in the closing report, with the acceptance map's rows
   by book and stage; nothing of it is hidden in a stage's report alone.

### 15. The book's body and the room of a page (2026-11-24)

The owner, on the deployed book: «Текущий вид меня не сильно впечатляет и кажется что не все
функции достаточно очевидны» (`work-orders/BOOK_POLISH_2026-11-24.md`). Read in the running
product, the shell had kept the sheet's frame inside the book. Decisions, the session's, his to
overrule:

1. **A page has one row at its head.** Wider than a phone, the part's tabs, Close and a page's own
   views share the tabs' row; the section's title is for a screen reader, since its open tab and
   bookmark say it. A phone keeps the title row. Close stays, as the owner asked of every section
   (2026-11-21).
2. **A page's own views stand at its head** (`Sheet`'s `tools`): the Book's "Pages" and "The path".
3. **The story is read with the whole page.** No second binding inside the sheet; the Scene's card
   waits on the Scene while the Book is open (it took a column beside it). Beside the Journal,
   where a name can be chosen, the card's column stays.
4. **A screen of the story never cuts a line.** The measure adds the first line's leading at the
   head and the foot of a screen and sets linked words as the page sets them.
5. **A bookmark keeps its word** on a tablet and a phone: the DM's screen is a tablet, and seven
   pictures without words were seven guesses. The open part's bookmark is the rubric's red.
6. **The book is a thing**: the block of pages lies under the page with its edges showing, the
   binding's cloth is the ground from edge to edge, the campaign's name is stamped on the head
   band, the part's pages are index tabs of the book's own paper. Drawn by the stylesheet from each
   campaign's existing set (`styles/book-body.css`); a painted frame per campaign is a proposal,
   not this section.
7. The page's place does not move (`section-screens.spec.ts` measures it); no control is removed.

### 16. The DM's working spread (Stage 1150)

The owner chose it on 2026-11-24 (`work-orders/STAGE_1150.md`): the look is a real book, and the
Scene is the spread the game is run from. It amends §5 for the DM's perspective.

1. **Two pages, one job.** On the Scene's spread, outside a fight, the left page is the story of
   the leaf the ribbon lies on and the right page is the place: the plate, who and what is here,
   the DM's actions. The Book stays the contents and the reading ahead. A player's Scene, the DM's
   narrower Scene and a fight are §5's and §6's, unchanged.
2. **The working page is where the party is.** It shows the ribbon's leaf and nothing else:
   turning it on or back moves the ribbon (in the Book, reading leaves the ribbon alone, ADR 0074
   §3.4 — that rule stays the Book's).
3. **The DM's actions are seals with the table's words**, in view on every working spread: a
   roll, a fight, a rest, to the screen, a handout. A seal's slip shows what this page prepares
   first and the whole tool one press further. A seal adds no command and no route: it calls what
   the Book's cards and the rest's controls call. A seal says how much this page prepares (a tag
   with the number of rolls, fights or handouts) before it is pressed, and what is given to the
   players — a handout's text — is read in the slip first.
4. **The Scene is laid, not rebuilt.** The world's own Scene — its controls, names and order —
   stands on the right page under the plate; the stylesheet places it while the working spread is
   mounted. Who is here is a small plate each; the heroes' presence is at the caption's end.
5. **A card takes the plate's place**, as a talk does, so who is here and the seals are never
   under it. The DM's card of a person begins with the book's telling of them, then the world's
   description and "Perform"; the leads to others follow. The book is held for that card in the
   DM's screen only (`book/told.ts`); a player's perspective never reads it.
6. **A result is never covered and covers no control** (the shell's rule for an action's result,
   `apps/web/AGENTS.md`): a slip opened under one ends below it, and a card open in the plate's
   place begins under it.
7. **A page with no words is not left blank.** A book assembled from the campaign itself (§5)
   has pages the campaign wrote nothing for — a built-in adventure's place with no description.
   The working page says so and lays out what the book does hold of it: the page's notes, who is
   here as the campaign describes them, what can be found here (`book/work-brief.tsx`). Nothing is
   written for the gap (ADR 0074 §1.6), and no model is asked. A name there is a word: one person
   is one button on a spread — their plate on the right page.
8. **An assembled book's chapters are the campaign's places.** When the Scene shows another place
   than the working page tells, the page offers the chapter told there; the DM turns to it with
   one press. Nothing moves by itself. A written story keeps its own order: no offer is made
   there, and the ribbon at the spine still says whether its chapter plays here (§5). The card of
   someone of an assembled book has no "By the book": that book holds only the world's own
   description of them, which the card shows.

### 17. The fight run from the map (Stage 1160)

The owner's word of 2026-11-25 (`docs/BOOK_SECOND_PASS_PLAN.md`): the field and the actions
together. It amends §6 and, for a turn taken from the map, ADR 0033 §6.

1. **A tablet's fight is a fold-out too.** From 768 px wide and 501 px tall the fight lies on the
   book's paper and fits the page: the order of turns at the head with the fold's handle at its
   end, the map as large as its squares go, the active combatant and the chosen card in the right
   margin, the tray or the DM's slip at the foot. The stage does not scroll. The place's card and
   who is at the table step aside for the map; whose turn it is is said in the order of turns,
   and apart only to the one it calls. §6.1's "narrower … over the dark stage" is a phone's now.
2. **The DM's turn is a slip at the map's foot**, where a player's tray is: whose turn it is and
   what the DM does about it — a creature's suggested turn, a hero's turn, a reaction that waits —
   with "End the fight" and the way to the whole Encounter page. It adds no command: each is one
   the Encounter page had, which keeps the turn order's tools, the light and what joins a fight.
3. **A hero's turn taken from the map ends with it.** The DM acts in that character's own view
   (ADR 0033 §6 stands: the screen shows exactly what the character sees), and when the character
   has nothing more to do now the DM's own view comes back by itself. Such a turn asks no reason:
   it is kept in the DM's history as "a turn taken from the map" (the reason "other" with that
   note). Standing in for a player with a reason — absent, asked — stays on the Encounter page and
   lasts until "Stop acting".
4. **A hero nobody plays is the DM's to run.** The server keeps a reason only for a character who
   has a player (`dm-routes.ts`: "anyone else the DM simply runs") and answers 422; the client
   goes on with the command there. Before, it refused the turn, and a table with no player's
   device could not play a hero's turn.
5. **A creature's suggested turn is said in the table's language** from the suggestion's own
   command (attack whom, a spell at whom, a move toward the nearest foe, the end of the turn); the
   server's sentence, English only, is shown to an English table.
6. **A result and the slip do not cover each other**: the result lies above the slip, and on a
   wide screen the map ends above it (the slip's height is kept, `--turn-h`).

### 18. The parts by tasks (Stage 1170)

1. **A page holds what its task needs every evening; the rest is an appendix.** The Party's page
   is the heroes' health with what is done about it — a rest, experience, a check, a ruling, a
   handout. A trap, a mind under stress, a contagion and the days between adventures are the
   heroes' appendix: a page of the same part, one press away, each tool as it was.
2. **The evening is apart from the campaign's settings.** The Session's page is the evening, its
   start (or the session that runs) first. Whose dice the table rolls and the campaign's options
   are the table's settings, a page of the same part. The table's agreement stays with the
   evening: it is shown and said aloud at the first one.
3. **The evening begins from where the DM is.** Between sessions the working spread's story page
   says the evening has not begun and leads to its start. It is an offer: nothing is asked
   before the DM reads or prepares.
4. **A moved tool keeps its name, its form and its command**; only the page it stands on
   changes. A report of a broken screen can name the two new pages (`CLIENT_PARTS`).

### 19. The table's screen, second pass (Stage 1180)

1. **In a fight the map takes the screen's height.** On a screen wider than tall (4:3 and wider)
   the order of turns is a column at the left — the round at its head, whose turn at its foot —
   and the battlefield stands beside it from the top of the page to its foot. An upright screen
   keeps the order above the map.
2. **Nobody scrolls a television.** Every row of the column is one portrait high, with or
   without a health bar; up to eight stand large, nine to twelve and thirteen to sixteen step
   down in size and still stand whole; a longer order keeps whoever acts in view. A number that
   tells two unnamed creatures apart is sized to be read from the sofa.
3. **Whom the table waits for stands at the head of the map, beside the column** — its old
   place, the foot at the left, is the column's. It never lies over the order of turns.
4. **A page with little to say is a spread, never an empty sheet.** No rolls yet, or a table not
   open to join: the book's emblem is the plate of the left page and the words are on the right
   one, with the fold between. A book without an emblem of its own shows the product's.
5. **A title page takes the book's own emblem** where the book has one — on the left page of a
   paper spread (a title card, a Chronicle with no chapter), and above the title on the cover
   (no fight, a place or a picture the party has none of), where the title is the cover's own
   lettering with no plate under it. A book without its own emblem keeps the game's key art: a
   picture of another world is never put in its place.
6. **Words read aloud lie on the book's page.** Their picture fills the page as the plate; the
   words stand at its foot on the book's paper, in the page's ink, the fold under them — not on
   a dark veil. The players' "Table screen" online keeps the veil (§9.4).
7. No cast changes its contract or its content, and nothing is added to what a screen is sent.
8. (S) Left: on a flat board (a screen under 1200 px wide) a name plate at the map's edge still
   reaches past it and the edge fades, as before this stage; the screen's remote is not driven.

### 20. The shelf, second pass (Stage 1190)

1. **The shelf goes on with one book.** The campaign whose last evening is the latest — by the
   instant it ended, or began while it still runs; a session left open for a week is not "now" —
   stands first on the account's shelf under a ribbon (the campaign's own, else the rubric's
   red), says when it was played, and its door is «Продолжить»: the one first press of the shelf. Every other book's door is «Открыть», an ordinary press. A campaign no
   evening was played in is opened, not gone on with, and so is one played on another server.
2. **The server tells the last evening, nothing more**: `AccountCampaign.evening` is the real
   instant the last session ended — or began, while it still runs — and whether it runs. The whole
   table sat through it; nothing of the world is in it. The field is optional, as `place` is: a
   client reads a server from before it.
3. **The library stands on shelves by age.** A book's age mark (`audience`, "8+") names its
   shelf; the shelves stand the youngest first, each under a brass plate, and the ages are an
   index at the library's head that comes to a shelf. A shelf shows one row, and its head unfolds
   the whole shelf and folds it again; how many stand in a row is the row's own grid, measured.
4. **A library's book is one press.** The book and its caption — the title in the book's own
   lettering and its kind of story — are one button, "Look inside the book «…»", described by
   the kind of story. The paper card with a second title and a button of its own is gone from
   the library; the account's own books keep their labels, which say who the account is there.
5. **A book's first page answers what is asked before choosing**: after its pitch, how long the
   campaign plays and its tone, in its author's words; the party size and the start stay at the
   page's foot while the page scrolls.
6. (S) Left: the ready adventures keep their paper labels with a button for each language; the
   account's page still ends the shelf.

### 21. A player's phone (Stage 1200)

1. **A phone's head is one row.** The emblem, the hero's plate (the campaign's name where the
   viewer plays no hero), whether the view is live, "Sound on" while the table's sound waits for
   a press, and «Ещё». Behind «Ещё» lies what is rarely pressed — the view, how to play, refresh,
   the account, leaving — as a list of named rows under the head; a press outside it or Escape
   closes it, and a dialog opened from it shows over it. A wider screen keeps its top bar: there
   the menu's box is no box.
2. **The hero is first.** For a player in their own hero's view the head holds the hero's plate:
   the portrait, the name on a line of its own, under it the bar of hit points, their numbers and
   the Armor Class, each the server's (the hero's own sheet), and one press opens the sheet. The
   campaign's name stays the page's heading for a screen reader. The plate is mounted, and the
   sheet read for it, only on a phone: no other screen is sent the sheet for a head it does not
   show.
3. **A part with one page has no row of tabs** on a phone while the stage shows: the bookmark
   along the bottom already says where the reader is. A page opened over the stage keeps its head
   row, where Close is.
4. **The d20 stands first at the page's foot**, larger and marked as the first press; the d6 and
   the d8 follow, and "More dice" opens the Dice page as before.
5. **In a fight the map comes up.** A phone's fight has no card of the place and no row of who is
   at the table above the order of turns: the order names the party with its hit points, and the
   place is the map itself. The bookmarks stay the phone's own — along the bottom, each with its
   word, on the binding's cloth, so the fight's column does not show through between them.
6. (S) Left: the hero's sheet is still a dialog over the book, not a page of it; the three dice
   at the foot are the same for every hero.

### 22. A book's own details, three campaigns on trial (Stage 1210)

1. **Where a book could look like its campaign and did not, it may.** A book's set (§1.8) gains
   pieces: the working spread's five seals pressed in one wax a campaign (`seal-roll`,
   `seal-fight`, `seal-rest`, `seal-screen`, `seal-give`), the plate a chapter's initial is
   printed on (`initial`), a corner ornament of the story's page (`corner`), the painted edge of
   the block of pages (`edge`). Each is a Codex CLI picture drawn with the campaign's own
   references and style words.
2. **A piece is used only by the book that has it**; a book without one keeps what the product
   draws — the red wax with a glyph, the plain initial, the ruled block. A seal does what it did:
   the picture replaces the wax, not the word under it or the count on its shoulder.
3. **The build converts and cuts, it draws nothing**: seals and the initial's plate are converted
   as they are; the corner and the edge are cut from their originals without changing a pixel.
4. **Three campaigns first** — a family tale, a noir, a dark fantasy (`lighthouse`,
   `rain-check`, `marrow-crown`) — so the owner sees the idea in three styles before the other
   books are drawn.

### 23. The second pass, reviewed (2026-11-25)

After Stage 1210 the second pass's screens were read once more for accessibility and design
(`reports/BOOK_SECOND_PASS_REVIEW_2026-11-25.md`). What the reading changed:

1. **A question that takes its button's place keeps the focus.** "End the fight" becomes
   "End the fight for everyone?" with two answers, on the map's slip and on the Encounter page:
   the careful answer takes the focus when the question appears — a choice that cannot be undone
   is never one key press from the press that asked — and the button gets it back when the
   question is withdrawn (`shell/asked-focus.ts`). The question names its group.
2. **A choice made in a phone's "More" hands the focus to "More"**: the chosen row goes out of
   sight with the list. A dialog the choice opens gives the focus back there too.
3. **A phone's head keeps a finger's width**: "More" and the hero's plate are 44 px high in a
   head of 48.
4. **The heroes' cards keep one line of actions across a row**, at each card's foot.
5. **A phone's dice foot shows no half of a sentence**: nothing rolled yet, it shows nothing.

### 24. The book is the whole screen (2026-11-25)

The owner, on the second pass as he saw it running: «Книга должна быть на весь экран. Все
элементы должны располагаться если не в книге, то в закладках… Вышло — радиокнопки, выпадающие
списки, формы ввода» (`reviews/OWNER_BOOK_WHOLE_SCREEN_2026-11-25.json`). Sections 15 to 23 moved
what a page holds; none of them made the screen the book of the concept he had chosen. This one
does.

1. **No bar of the application stands above the book.** From 701 px the top bar takes no room:
   the cover's cloth runs to the screen's edges, with a corner fitting on each corner where the
   book's set has one. The campaign's name stays the page's heading for a reader of the screen
   and is shown as a page's running head. A phone's head of one row (§21) is the cover's upper
   edge: the cloth under it, the hero's plate a paper label.
2. **What the bar held is behind the clasp**: a round fitting on the cover's upper corner with
   the book's emblem (three dots on brass for a book without one), named "More" as on a phone.
   It opens a slip of the book's paper with the view, how to play, refreshing, the shelf, the
   account and leaving — the same controls, the same names, at every width. Being connected is a
   lit point on the clasp's rim; any other state says its word beside it.
3. **The dice are the page's own foot**: a band of the page's paper under it with the dice, the
   last roll and the way to the Dice page. Where the book's set has dice of its own, each die is
   its picture with its name on it, there and on the Dice page.
4. **What is written and chosen on a page is set as a book sets it.** A tool is a passage under
   a rubric with a rule, not a rounded card; a field is a box of a printed ledger, inked on all
   four sides; a choice is an inked ring or square filled in the rubric's red; a button is a
   stamped label, a page's main action in the rubric's red; a page with nothing to show says so
   in its own voice. What the table tells over the page (the evening has not begun, the DM takes
   a hero's turn) is a slip of the book's paper. Names, sizes and order of the controls are as
   they were: a key and a reader of the screen meet the same page.
5. **The book begins at 701 px.** The tablet's layouts of the book and of the fight began at
   768 px, and between 701 and 767 the screen was a phone's dark column inside a tablet's shell
   (the owner's own window was 766 px wide). They begin at 701 now. Under 900 px the fight's map
   takes the page's width; the card of what is chosen lies under it.
6. **New pieces of a book's set, by Codex CLI**: `cover-corner` (one fitting; the build turns it
   to the four corners of a frame whose sides stay empty, `cover-frame`, a border image for any
   screen) and the dice — seven pictures, or one sheet of six in a row, cut where nothing is
   painted between them (the d100 is the d10 again). Each book's own finished pieces are the
   style references. The build still draws nothing.
7. **Not changed**: every command, route and contract; what a player's client is sent; the
   table's screen; the shelf and the way in.

### 25. Closer to the concept; forms drawn (2026-11-25)

The owner, on the whole-screen book: «а можно еще ближе к концепту? стандартные формы можно
заменить сгенерированными значками где только можно?»
(`reviews/OWNER_BOOK_CLOSER_TO_CONCEPT_2026-11-25.json`). Two things stood between §24 and the
picture he chose. At the width of his own window (766 px) the Scene was not a spread at all — the
two pages began at 1024 px — and no width set a page as the concept sets it. And a form still
asked with the browser's own controls, however they were inked.

1. **A spread is two pages from 701 px**, where the book's own layouts begin (§24.5): each page
   a phone's width at first. Below that, and on a screen under 600 px tall, the Scene stays one
   page.
2. **The DM's working spread is set as the concept sets it.** Each page stands under a running
   head: the book and the chapter on the left (the chapter's own name on its inner pages), the
   place with the day and the hour on the right. The story's title stands alone in the page's
   middle over the book's ornament. The right page is one flow — its head, the plate in a frame,
   the table's faces on a rule, who and what is here, the seals: the plate takes what room the
   rest leaves (its place is measured, and the picture and the card of what is chosen take it).
   The ribbon hangs down the gutter to the page's foot. From 1024 px the dice are the right
   page's foot and the story's page runs to the foot of the book.
3. **Who and what is here are round portraits** on every spread, a name under each; who has an
   approved figure stands inside the ring (the Scene's one page on a phone keeps its figures).
   Kind and state are said to a reader of the screen as before. The heroes at the table keep
   their own small row, with their presence.
4. **The story's leaf has one print** on the working spread and in the Book: head, title,
   ornament; at its foot the ornament again, the leaf's number in the book, and the hands that
   turn the page — the engraved pointing hand, back in the outer corner, on with the page's own
   word («Дальше», «Следующая страница», «Следующая глава») in the rubric's red. "In the book" and
   "larger letters" are marks in the page's upper corner.
5. **A choice among a few named things is made by pressing a picture.** Each option is a tile —
   a vignette and its word — and the radio button is the whole tile, unseen: its name, its
   group's legend, the arrow keys and a journey's `check()` are as they were. Short lists of
   fixed options become such groups (the weather, who is surprised); lists of the heroes become
   their faces (whom a check is asked of, whom a handout is for), "everyone" a drawn tile before
   them. A list whose options are the world's own names (a creature, a spell, a place) stays a
   list.
6. **What a form keeps is drawn too**: the tick box and its tick, the ring of a choice kept as a
   row and its drop of wax, the mark that a list opens, the fold of a page. Buttons that do a
   thing a picture exists for carry it before their words (a rest, a hero's card, starting the
   session, "More dice"); a page, a card and a slip are closed by a drawn cross.
7. **One set of vignettes for every book**, drawn by Codex CLI as engravings in ink with two
   tints, so they sit on any book's paper: `pick-<name>` in the product's own set, each a named
   custom property (`--pick-<name>`); an element names its picture (`data-pick`). A book may
   bring its own for any of them. The build also trims, without drawing: a ribbon to the band
   that fills the gutter's ribbon, a divider to a flourish set by its height (a book without one
   keeps a hairline). The generated stylesheet lies under `generated/`.
8. **Not changed**: every command, route and contract; what a player's client is sent; names
   and order of controls; the table's screen, the shelf, the way in, the workshop, the
   Chronicle's own dialog. The fifty-three books without seals, an initial, a corner or an
   ornament of their own keep the product's drawn ones.

### 26. The fight is the whole screen (2026-11-25)

The owner, on the book set closer to the concept: «Бой не должен быть мелким. Сделай его на весь
экран.» (`reviews/OWNER_BOOK_LOOSE_ENDS_2026-11-25.json`). In his own window (766 px) the map kept
510 of 650 px beside a column of cards; on a tablet held wide, about half of the sheet. §6 and
§17 laid the fight as a page with margins; from a tablet up it is now one sheet the map takes.

1. **One sheet that never scrolls, and the map takes it** (from 701 × 501 px). A square grows to
   160 px (it stopped at 72). Nothing stands beside the board but the order of turns: a narrow
   column at its left where the sheet is wider than tall (5 : 4 and wider), a row of faces at its
   head where it is not — each with its Initiative, its number, its hit points and its name.
2. **The head row** is the part's own: the fold's handle («Сцена» / «Поле боя») at its end,
   "Your turn" in its middle for the one it calls (whose turn it is stands in the order, and is
   still said aloud), the DM's quiet switch at its start. A page opened over the fight covers
   that row with its own.
3. **The foot keeps a constant room.** A player's turn tray, or the DM's turn slip, lies at the
   sheet's foot over room kept for it at rest; one that needs more — the ways to act on what is
   chosen, a question — rises over the map's foot. The map never changes its size or its place
   under a pointer. (It does when a player's turn begins or ends: the tray comes and goes.)
4. **Cards lie over the map's edge, away from what is chosen.** The card of a chosen square or
   combatant opens in the half of the map its subject is not in. How to read the board waits
   behind one of the board's own tools. The active combatant's card is said to a reader of the
   screen and not shown: the order and the foot say whose turn it is, and the card of a chosen
   combatant tells what its conditions do and how they end. Each card is a slip of the
   fold-out's paper.
5. **Where the map leaves room to spare, the cards take it instead.** The board says how much
   room it leaves on its sheet (`combat/board/spare-room.ts`); the cards lie in the board's own
   cell, so saying it changes nothing the board measures. Room beside the map (300 px: a
   laptop's window, a tilted board most of all): the map stands at the sheet's left and a margin
   at its right holds the active combatant, the card of what is chosen or how to read the
   board, and who is at the table. Room under it where the order is a row (290 px: a tablet
   held upright): the active combatant and the card side by side under the map.
   Where the map leaves no room, who is at the table steps aside: the order of turns names the
   party with their hit points, and the DM's slip says whether the player whose turn it is is
   connected.
6. **A hero's fight is laid as the DM's** from a tablet up: the bookmarks at the fore-edge in
   their close form, the map across the sheet. A phone, and a phone held wide, keep their own
   column and the bookmarks along the bottom (§21).
7. **What the table asks during a fight** (a check, a rest, an evening not begun) lies on the
   map's head at its left, clear of the board's tools; a result lies at its foot on the left,
   above the tray or the slip. The slip over the book that says the DM acts for a hero is one
   row.
8. **The book's layouts begin at 701 px everywhere**: sixteen stylesheets still switched at
   768 px, so a window between the two widths mixed a phone's rules into the book.
9. **Not changed**: every command, route and contract; what a player's client is sent; the
   board's hit-testing, its tools and their names; a phone's fight; the table's screen.

### 27. Every slip and window on the book's paper (2026-11-25)

The second of the loose ends (`reviews/OWNER_BOOK_LOOSE_ENDS_2026-11-25.json`). A survey of every
page, window and overlay at the owner's width found what the book had not reached: the result of
an action and what the table asks lay over the page as dark glass; the guide, the questions about
signing out and saving a seat, and the Chronicle's head were dark panes of the old application; a
hero's builder was a grey pane (the paper's inks over a dark grain); a phone's fight ran on dark
glass under a book of paper pages.

1. **A slip laid over a page is the page's paper** (`styles/book-slips.css`): the result of an
   action with what was learned from it, and each thing the table asks — a check, a rest, a
   pause, a break, a handout to read. They take the paper's inks (`data-surface='paper'`), a
   ground of their own (the tokens' glass is see-through and a slip lies over pictures), the
   page's stamped buttons, square corners, and the drawn cross where one is put away.
2. **A small window is a slip of the same paper**, the book dimmed behind it: how to play, about
   the game, "What can I do?", the table's agreement, signing out, saving a seat, deleting an
   account, a hero's builder and a new level. A window that opens outside a page (from the
   cover's clasp, or before any book) sets its controls as a page sets them: a stamped label, the
   one main action in the rubric's red, a ledger's field, the drawn mark of a list, the drawn
   cross. The builder's step is the rubric's.
3. **The Chronicle's head is set as the book's head**: its three views are index tabs of the
   book's paper standing on its page, the chapter's writer a stamped label and its form a slip,
   the drawn cross closes it; below the desk's size it lies on the cover's cloth. The book
   itself — the desk, the spread, the ribbons — is as it was (§5.6 of the design).
4. **A phone's fight lies on a page of paper** as its other pages do (amending §6 and §17, which
   kept the dark glass there): the column that scrolls is the page, the cover's cloth its margin.
   The fold-out's surface is paper wherever the fight is in a book.
5. **A list of entries is an index** (`styles/book-index.css`): what the party knows, the places
   to go, the glossary's terms, the DM's tools and the Book's own list of a page's people and
   events are lines under hairlines, each with its kind in small capitals — not rows of boxes;
   the entry that is open, or where the party is, takes the rubric's red.
6. **Nothing on paper is a rounded card.** The paper's surface cuts a panel and a control square
   (4 and 3 px for the 10 and 8 of the dark glass): a slip, a plate and a field are a printed
   page's. A tag keeps its rounded ends.
7. **The Dice page's picker shows the book's own dice**, as the page's foot does: the page's rule
   for a stamped button had outweighed the drawn dice since §24.
8. **Not changed**: every command, route and contract; the windows' words, order and focus; the
   table's screen; the workshop; the shelf and the way in (their turn is next).

### 28. What the browser still drew in a form (2026-11-25)

The third of the loose ends (`reviews/OWNER_BOOK_LOOSE_ENDS_2026-11-25.json`). §25 drew a form's
closed controls; what opened from them and what scrolled was still the browser's own.

1. **The list a select opens is a slip of the book's paper** (`styles/book-lists.css`): its
   options are inked lines, the chosen one in the rubric's red, with no tick of the system's. It
   is set where the browser lets a page set it (`appearance: base-select`); a browser that opens
   its own picker (Safari on a tablet or a phone) keeps it, and the closed field is drawn the
   same in both. The select stays a select: its name, its keys and a journey's `selectOption`
   are as they were. The list of views behind the cover's clasp is such a list too, with the
   drawn mark of a list.
2. **A date and time keeps the browser's own field** — the reader's locale writes its order —
   with the page's clock, in the rubric's red, in place of the system's calendar mark.
3. **A page's scroll bar** is a thin stroke of the page's ink with no trough.
4. **A long word on a tile breaks at a syllable**, with a hyphen («преимуще-ством»), not inside
   one.
5. **Before any book is open the paper is set the same** (`styles/book-slips.css`): the way in,
   a shelf's label, the account's page and a library book's look carry a page's stamped labels —
   the one main action («Войти», «Продолжить», «Начать») in the rubric's red —, its ledger
   fields and its lists. The shelf itself, the way in's picture and the table's screen keep
   their own looks: a shelf of dark wood, a screen across a room.
6. **Lists that stay lists**: every select whose options are the world's own names, and those of
   a few fixed options that §25 did not turn into tiles (a campaign's options, how long a link
   lasts, a saving throw, what to create). They open as slips of paper now; turning each into
   tiles changes a form's controls and its journeys, and is not done here.

## Consequences

- Journeys change how they reach a control: 117 of 170 journey files open sections through
  `tests/e2e/support/shell.ts`, which becomes "open a part and a page".
- The dark-only rule of the visual tokens ends; contrast is measured again for every pair.
- The previous deployment is the only way back from a stage that replaced a screen; a rehearsal on
  the owner's tablet precedes the deployment of the DM's book as the DM's screen.
- The table-screen contract and the server's routes are unchanged by §1.
