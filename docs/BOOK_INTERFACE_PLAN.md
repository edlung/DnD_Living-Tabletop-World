# The whole interface as a book: the plan (Stages 1000–1140)

Owner request 2026-11-23, typed in a working session: «Задача - сделать план для преобразования
всего интерфейса проекта в книгу. Чтобы все шло через книжный интерфейс.» Asked three questions in
a card the same day, he chose: the present interface is **replaced at once** as each screen becomes
a book («Заменять сразу»), the program **starts with a demo of all the books** («Сначала демо всех
книг»), and the campaign workshop is rebuilt **fully as a manuscript** («Полностью как рукопись»).

**Authorized: Stages 1000–1140.** The demo was accepted on 2026-11-23 («Принимаю, дальше»), which
opened the rest; Stages 1000 and 1010 were opened earlier the same day by «Да, открываем. Для
генераций красивых книжных ассетов интерфейса обращаемся к Codex CLI.» (record
`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`, ADR 0075 §1, work orders in `work-orders/`). Stage
after stage, each on its own branch and pull request stacked on the one before. Merging,
deployment, the rehearsal on the owner's tablet before Stage 1030 is deployed, the family playtest
and real devices stay the owner's.

It continues `docs/DM_BOOK_PLAN.md` (Stages 900–930, merged and deployed 2026-11-22; ADR 0074).
That program put a book beside the dock, for the DM, for the story. This one makes the book the
only interface: for the DM, the players, the table's screen, the way in and the workshop.

## The owner's words this plan answers

- 2026-11-19: the product "looks like an Excel table" — things scattered, hidden, needing scrolling
  and choosing. He wants the ease of the Google start page: nothing to search for, the next step
  obvious. (Not a search line: his correction of 2026-11-20.)
- 2026-11-20: no rails — «DnD — это про свободу выбора и действий». He asked twice where the DM
  reads the story.
- 2026-11-21: every section full screen, everything at hand and in view, the least scrolling; the
  interface's materials match the campaign's visual code; every phrase a model wrote is read by him
  before it reaches a table.
- 2026-11-22: the book is the base of the DM's screen; for all 55 campaigns.
- 2026-11-23: the whole interface is a book; everything goes through it.

## The idea

One book engine and five things made of it. A screen is never a menu of tools: it is a page of a
book, and a tool is where a reader of a book would look for it.

| What                           | Who opens it               | It replaces                                                                                                 |
| ------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **The shelf**                  | everyone, before a game    | sign-in, the hub, the library, finished adventures, the account, an invitation's page                       |
| **The DM's book**              | the DM in a game           | the stage, the top bar, the dock (up to eighteen items for a DM) and its seventeen sheets, the detail panel |
| **The hero's book**            | a player, on a phone first | the same shell in a player's perspective, the character dialog, the builder                                 |
| **The open book on the table** | the table's screen, Online | the eleven casts of the display and the players' "Table screen" sheet                                       |
| **The manuscript**             | the author of a campaign   | the workshop: drafts, scenario, editing, generation, pictures, preview, activation                          |

The Chronicle is a book already (ADR 0024, ADR 0072). It stops being a dialog over the shell and
becomes the part "what happened" of the DM's and the hero's books.

### A book's anatomy is the navigation

Eighteen dock items turned into eighteen bookmarks would be the same spreadsheet in a binding. A book
has few **parts**; a part has **pages**; other things have their own fixed places.

| Piece of a book        | What it is in the product                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Cover and binding      | the campaign's material, accent and lettering (`apps/web/src/visual/campaign-themes/`)              |
| Bookmarks at the edge  | the parts: seven for the DM, five for a player; the open one is marked, a waiting one carries a dot |
| Spread                 | two facing pages on a wide screen; one page a screen on a phone, the facing page one turn away      |
| Left page              | what is read: the story, the place, the list                                                        |
| Right page             | the plate (the picture) and "how we play this": the card of what was opened on the left             |
| Running head           | where the party is, the day, the hour and the weather, the meeting's state; a press opens its page  |
| Ribbon                 | where the party is in the story (ADR 0074 §3.4); never moved by reading                             |
| Foot of the page       | the dice tray, on every page of every part: a roll is needed everywhere                             |
| Fold-out               | a map: the world's, a place's, a battlefield — the whole spread without a spine                     |
| Slip between pages     | a handout, a keepsake, a request that waits (a roll asked, a pause asked, a new message)            |
| Margin                 | the reader's own notes on that page; the DM's notes of a page are already there (ADR 0074 §3.4)     |
| Blank pages at the end | "add to the world": a person, a place, a thing the story did not have                               |
| Appendix               | the rules, the glossary, the toolbox, the DM's guide                                                |
| Colophon               | what changed and who changed it (the DM's history with undo), the report of what broke, the privacy |

### Where every section of today goes (the DM's book)

Seven parts. Every row is checked item by item in Stage 1000 against the code and becomes the
acceptance table of the program ("nothing the DM can do today is taken away").

| Today (dock)      | In the book                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Book              | part **Story**: chapters, pages, moments, the path (as built in Stages 920–930)                                                                           |
| Scene (the stage) | part **Scene**: left the place as it is now — who is here, what is here, the ways out, the talk; right the place's plate and the card of what is selected |
| Encounter         | Scene: "prepare a fight" is a page of it; a running fight is the Scene's **fold-out**                                                                     |
| Party, Character  | part **Heroes**: one spread a hero (overview, skills, spells, pack, story), the party's page (rest, advancement, giving, rulings)                         |
| Places            | part **World** › Places, with the world's map as a fold-out                                                                                               |
| Add to the world  | World › the blank pages; also from the Scene ("this is not here yet")                                                                                     |
| Images            | the plate of the page it belongs to (ask, approve, replace); World › Pictures for the queue                                                               |
| Time and weather  | the running head; its page is in World                                                                                                                    |
| Journal           | part **Journal**: what the party knows, handouts, the Chronicle's chapters, "Previously…", keepsakes                                                      |
| Chronicle         | Journal › the chapters and the whole book                                                                                                                 |
| Notes             | the margin of the page; Journal › all the DM's notes                                                                                                      |
| History           | Journal › the colophon: what changed, with undo                                                                                                           |
| Session           | part **Table** › the meeting: start, pause, end, the next game, the agreement, the break                                                                  |
| Players           | Table › who sits here: invitations, seats, guests                                                                                                         |
| Table screen      | Table › the screen: pairing, what it shows now, sound and music                                                                                           |
| Chat              | Table › the talk; unread marks the bookmark                                                                                                               |
| Dice              | the foot of every page                                                                                                                                    |
| Rules             | part **Rules**: the appendix                                                                                                                              |

The hero's book has five parts — **Scene**, **Hero**, **World**, **Journal**, **Table** — the dice
tray at the foot, and the rules as an appendix opened from Table and from any rule's word. A phone
shows the five as a row of bookmarks at the bottom, with words. The table's book has no parts: it
shows the page the DM turned to the table (a title page, a plate, a page of text, a fold-out, a
roll, the bookplate with the code to join; nothing cast is the closed cover).

## Where it stands (read in code, 2026-11-23, `main` 5b4961b1)

| Area           | There today                                                                                                                                                         | What the book needs                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Client         | 556 source files, 82,573 lines (`apps/web/src`); 80 stylesheets, 19,454 lines                                                                                       | every screen re-laid; the workshop is 72 files, 10,041 lines, 7 stylesheets                                     |
| Shell          | `shell/` — the top bar, the dock (`dock.tsx`, `use-dock-fit.ts`, More), one sheet at a time (`use-shell.ts`), a detail panel, the Chronicle and the hero as dialogs | a book shell: the open part and page, remembered for the tab as the open sheet is today                         |
| The DM's book  | `book/` — 12 files; the spread, paging by sentences, cards, the path, the ribbon; styles under `.dmb-`                                                              | its pieces as a kit any part can use                                                                            |
| Look           | `styles/tokens.css`: "Dark is the only theme; the Chronicle's pages are the one light surface"; 161 raw colours in stylesheets                                      | paper is the surface everywhere; status colours (health, sides, danger, magic) need paper values at AA contrast |
| Story          | 53 library campaigns have a book (`book.json`); the two built-in adventures' books wait for the owner's reading; a campaign made in the workshop has none           | every campaign opens as a book (see "A book for every campaign")                                                |
| Fight          | `combat/` — 70 files, 10,506 lines; its own stage, tray and panels                                                                                                  | the same parts on a fold-out; no rule and no arithmetic moves                                                   |
| Players        | the DM's shell in another perspective; the dock is a tab bar on a phone                                                                                             | a book of its own shape for 390 px                                                                              |
| Table's screen | `display/` — eleven casts (`packages/contracts/src/display/display.ts`)                                                                                             | the same casts drawn as pages; no contract change                                                               |
| Way in         | `session/` — sign-in screens, `hub.tsx`, `hub-library.tsx`, the account                                                                                             | the shelf                                                                                                       |
| Workshop       | `workshop/` — forms over a draft package; preview; activation                                                                                                       | the manuscript; a published campaign gets its book                                                              |
| Journeys       | 170 files in `tests/e2e`, 3,383 locators; 117 files open sections through `support/shell.ts`                                                                        | `openSheet` becomes "open a part and a page" in one helper; journeys of the dock itself are rewritten           |
| CI             | journeys shard 3 of 3 runs near its 25-minute limit                                                                                                                 | a fourth shard before the journeys grow                                                                         |
| Native shells  | `apps/ios`, `apps/android` wrap the server's client; `web/src/native/`                                                                                              | back, safe areas and the TV's remote checked on the book; no native screen is rebuilt                           |

### A book for every campaign

"Everything through the book" fails if a campaign has no book. Three sources, in this order:

1. **The library's book** of the campaign (ADR 0074 §2–§3), as today.
2. **The built-in adventures' books**, once the owner has read their pages; until then (3).
3. **A book from the world itself** (new, Stage 1050): chapters and pages assembled on the server
   from what the campaign's revision (for a built-in adventure, its seed) already holds — its situations (a goal and words to read
   aloud), the first meeting's text, its places, cast and clues — with no model and nothing new to
   read. What a seed holds for this is read in Stage 1000. A campaign published from the workshop, a package edited before publishing and a built-in
   adventure whose written pages still wait all get it. What a revision does not hold (a scene's
   text, a check line) the page shows as a gap (ADR 0074 §1.6).

The parts other than Story never depend on a written book: Scene, Heroes, World, Journal, Table
and Rules are the world's own state.

## When it is done (the owner's checklist)

1. **No screen of the product shows the dock, a sheet over a stage or a dark panel.** Signing in
   opens the shelf; a campaign opens as a book.
2. **Any campaign opens as a book for the DM** — library, built-in, own — and everything the
   dock's sections did is reached from seven bookmarks; the table above, checked row by row.
3. **A player's phone shows the hero's book**: one page a screen, five bookmarks, the dice at the
   foot.
4. **The table's screen shows the open book**: only what the DM turned to the table.
5. **A fight is a fold-out of the same book**, and closing it returns to the page it was started
   from.
6. **A campaign is written as a manuscript** and, bound, plays like a library book.
7. **The book looks like its campaign.**
8. **Least scrolling**: at 1440×900, 1024×768 and 390×844 a page fits its screen or turns; what
   still scrolls is listed in each stage's report.
9. **A player never receives the DM's text**; the knowledge-boundary tests pass unchanged.
10. **Nothing was written by a model** for the interface, and no page shows model text the owner
    has not read.

## Stages

Each stage is one branch and one pull request with its work order, checks, the layout audit at
1440, 1024, 768 and 390 px with screenshots looked at, an independent UX and accessibility pass,
and a report. "Replaced at once" (decision 2): a stage that makes a screen a book deletes the old
screen and moves its journeys in the same pull request; the way back is the previous deployment.

### 1000 — Foundation (docs only)

The record of the owner's words and choices; ADR 0075 §1 (what "the interface is a book" means,
what it amends in ADR 0034, 0043 and 0074 §1.7); the map of every control of today to its place in
the books, read from the code, as the program's acceptance table; the work orders.

### 1010 — The demo of all the books

A clickable page on the engine of the accepted sample (`docs/design/dm-book-sample/`), one state
shared by three frames as in the «Живой стол» demo: the shelf; the DM's book with all seven parts
and every one of today's sections reachable; the hero's book in a phone frame; the open book on
the table; a fight as a fold-out; the manuscript (a draft opened, a page edited in place, a
proposal read and accepted, the book bound). The lighthouse and one campaign of another look, from
existing texts and pictures. **Hard stop: the owner looks, corrects and accepts before any code.**
His corrections rewrite the stages below.

### 1020 — The book kit and paper

The DM's book's pieces become a kit (`Spread`, `Page`, bookmarks, the ribbon, the plate, the card,
the foot tray, the running head, the fold-out, paging, the size of the text). Paper becomes a
scope of the visual tokens: inside a page every component reads paper values, outside it the old
ones, so shared sections work in both shells while both exist. Contrast measured for every token
pair. A fourth journeys shard. Nothing a user sees changes except the DM's book, refitted on the
kit.

### 1030 — The DM's book is the DM's screen

The book shell replaces the top bar, the dock, More and the sheets in the DM's perspective. Seven
bookmarks; every section of today is a page of its part, laid on paper as it is; the running head;
the dice tray; slips for what waits. Escape, focus and "back to the page I came from" as the
sheets have them. The dock's journeys go; 117 files move through the helper.

### 1040 — The hero's book

The same shell in a player's perspective, phone first: five bookmarks, one page a screen. The
character dialog becomes the Hero part; the builder becomes the first pages of a hero's book; a
roll the DM asked, a handout and a pause arrive as slips. The iPad and Android shells' back and
safe areas are checked here.

### 1050 — Scene and Story

The Scene as a spread (the place, who and what is here, the ways out, the talk; the plate and the
card), for both books. The book from the world itself (above), so every campaign has a Story; the
ribbon and the Scene point at each other. Server: one read route gains a second source; no
command.

### 1060 — The fight as a fold-out

The battlefield takes the spread; the turn tray is its foot, the panels its margins; prepare,
start, run and end without leaving the book. Combat rules, commands and the board's drawing do not
change.

### 1070 — Heroes, World, Journal

The DM's tools of these parts rebuilt as pages instead of forms in a column: a hero's spread, the
party's page; places and the map fold-out, the blank pages, pictures on their plates, time and
weather; what the party knows, handouts, the Chronicle inside the book, notes, the colophon.

### 1080 — Table and Rules

The meeting (start with "Previously…", pause, end, the next game, the agreement, the break), who
sits here, the table's screen, sound, music, voice and chat as pages of Table; the rules, the
toolbox and the guide as the appendix.

### 1090 — The open book on the table

The eleven casts drawn as pages for a screen read from three metres; the players' "Table screen"
online is the same page. The TV shell's remote and sound are checked.

### 1100 — The shelf

Sign-in as the bookplate; campaigns as books standing on a shelf with where the party is and who
you are in each; the library and "look inside"; finished adventures; the account; an invitation
and a table's code as pages; the privacy notice and "something broke" on paper.

### 1110 — The manuscript: the desk and the pages

The workshop's home is the desk (manuscripts, bound books); a draft opens as a book in the kit —
intent, chapters, cast, places, clues, encounters — read as the DM will read it; revisions and
their comparison as proofs side by side.

### 1120 — The manuscript: writing on the page

Every field of the editors is edited on the page where it will be read; structured fields in the
margin; locks, conflicts and saving as today's contract has them (`workshop/editing/`).

### 1130 — The manuscript: the co-author, the plates, the binding

Generation as pages proposed and marked as unread until the author reads them; an AI edit as a
proofreader's marks to accept or refuse; pictures on their plates; the preview is the real DM's
and hero's books in proof; activation is binding: the checks, then the book on the shelf — with
its book document, so it plays like a library campaign. No provider is added and no spending rule
changes (ADR 0032).

### 1140 — Closing

Dark tokens, the old shell's styles and dead code removed; dictionaries cleaned; the full
accessibility and responsive pass; device journeys; the closing report with the acceptance table.

### Not in the run, each needing the owner's own word

- **A real table** by the book (Stage 940 of the DM's book plan).
- **Layer 2** of the story (Stage 950): narration, links inside the line, pictures of events.
- **A command to hand a clue to the party and to mark a fork** (ADR 0074 §4.7).

## Decisions

(O) the owner's, with the date; (S) the session's, his to overrule.

1. (O, 2026-11-23) The whole interface becomes a book; everything goes through it.
2. (O, 2026-11-23) The present interface is replaced at once, screen by screen, with no switch back.
3. (O, 2026-11-23) The program starts with a demo of all the books.
4. (O, 2026-11-23) The workshop is rebuilt fully as a manuscript.
5. (O, earlier) No rails; every model-written phrase is read by him first; materials match the
   campaign; the least scrolling (the words quoted above).
6. (S) Parts, not seventeen bookmarks: seven for the DM, five for a player; the dice at the foot
   of every page.
7. (S) Every campaign has a book: where none is written, the Story is assembled from the world
   itself, without a model.
8. (S) A fight is a fold-out of the book, not a screen beside it; the battlefield's own drawing
   and rules stay.
9. (S) The table's screen stays cast only on the DM's press (ADR 0074 §4.5).
10. (S) Paper is a scope of the tokens, so the DM and the players can move in different stages.
11. (S) The DM first, then the players, then the table's screen, the shelf, the workshop: the
    order follows what a meeting needs.
12. (S) No command, route or rule is added for the interface except the second source of a book
    (Stage 1050) and the book of a published draft (Stage 1130).
13. (O, 2026-11-23) Book materials of the interface are generated with Codex CLI, and each book has
    its own style from its campaign's art: the campaign's pictures and the book's pages, binding
    and icons look harmonious. (S) The demo makes the product's own set and three campaigns' sets; the sets of the other campaigns are made
    in the stages that need them (1020 for the kit, 1100 for the shelf), and the existing catalogue
    of 55 materials dresses a campaign until its set exists.

## Risks

- **No way back but a rollback** (decision 2). Stage 1030 changes how the DM reaches everything in
  one deployment, before any real table has played by the book. The demo's hard stop and a
  rehearsal on the owner's tablet before that deployment are the guards.
- **Journeys**: 117 files change how they open a section in one stage. The helper carries most of
  it; the stage is not done until all three projects pass.
- **Contrast on paper**: health, sides, danger and magic were chosen for a dark ground.
- **A phone**: a spread does not fit; the hero's book is designed at 390 px first, not shrunk.
- **The board in a spread**: a spine through a map is wrong; hence the fold-out.
- **The manuscript** is the largest part (three stages, 19 journeys) and touches credentials'
  handling in the workshop's transport, which must not change.
- **A mixed table** between Stages 1030 and 1040: the DM in a book, players in the old shell.
  Their devices are separate; shared sections are kept right in both by the token scope.

## Boundaries

The World Engine alone changes the world. A player's client and the table's screen receive only
their own projections; the DM's book document stays the DM's. Prepared situations, encounters,
checks and choices are plans, never decisions. No AI is called at the table. No paid provider call;
pictures only through Codex CLI (decision 13). A package and a book are generated from their
source, never edited by hand. Files stay under the context budget. Nothing is merged or deployed
by the session without the owner's word.
