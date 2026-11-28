# 0074. The DM's book: a campaign's text as a book beside its packages, and a book as the DM's screen

- Status: Accepted for §1–§4 (the owner's words of 2026-11-22, `reviews/OWNER_DM_BOOK_2026-11-22.json`:
  the brief, «Да, развиваем», «мне для всех компаний книжный формат нужен … 55 кампаний», «Да,
  открываем» and four choices in a question card). Points marked (S), and every point of §2–§4, are
  the session's and stay the owner's to overrule (`docs/DM_BOOK_PLAN.md`, decisions 9–15).
- Context: A campaign's story is written scene by scene in its source, and a DM reads it today in
  an HTML book outside the game. Inside the game the DM has a dock of nineteen sheets and none of
  them holds the story. On 2026-11-19 the owner said the product "looks like an Excel table"; on
  2026-11-20 he asked where the DM reads the story and said he wants no rails; on 2026-11-22 he
  described the screen he wants — a book — and accepted a demo of it. The scene text, the check
  line, puzzles and handouts never reach a campaign's package (`scripts/lighthouse/package.ts`
  keeps a chapter's goal and read-aloud words as a situation and the first chapter as
  `firstSession`), so the game cannot show them.

## Decision

### 1. What the book is (Stage 900)

1. **A view, not a second game.** The book shows a campaign's prepared text and the world's
   current state side by side. It owns no rules and computes no outcome: every change to the
   world that starts in the book is a command the product already has, sent as the DM, judged by
   the World Engine and written to history like any other. The demo's own dice and fight
   arithmetic are not carried over.
2. **Prepared is not decided.** A page, a link, a check with its DC, a fight, a fork and an order
   of chapters are plans. A fork records what the DM marked that the players chose and nothing
   else. A chapter can be put off, entered early or opened by the DM's hand; the book never
   refuses a table its own way through the story.
3. **The DM's alone.** The book's text is read under the DM's perspective only. A player's client
   and the table's screen receive what the DM sends through the casts and gifts that exist; a
   roll a player sees carries no DC and no clue. Reading ahead changes nothing a player can see.
4. **Two layers.** Layer 1 is built from what a campaign's source already holds, by the build,
   for every campaign, with no model and nothing for the owner to read. Layer 2 — narration
   written to be read aloud, links inside the line, words for outcomes, pictures of events — is
   campaign preparation done before play, read by the owner, and arrives in a package the same
   way. A package says which layer a page is.
5. **No model at the table.** The book calls no AI provider. Text a model wrote is content of a
   package, with its provenance, never a fact of the world and never generated during play.
6. **A gap is shown.** Where a campaign's data lacks something the page needs — a person without
   a card, a letter without its text, a condition without a list — the book says so to the DM. It
   does not invent.
7. (S) **Beside the dock.** The book is one more way into what the dock holds; every sheet stays
   reachable as it is today. Replacing the dock is a later decision, after a real table.
8. (S) **The DM's place in the book** — the ribbon, the open bookmark, notes on a page — is the
   DM's own state beside the world. The journal the book shows is the campaign's history.
9. (S) **Words.** A unit of the book is a chapter; an evening of play is a meeting. A campaign's
   own text, which calls its chapters evenings, is not rewritten.
10. **All campaigns.** The book is a property of the screen and of the package contract, not of
    one campaign: every authored campaign's build writes its book, and the two built-in
    adventures get theirs.

### 2. The book's data (Stage 910)

1. **A document beside the packages, not inside one.** `campaignBookSchema`
   (`packages/contracts/src/campaign/book.ts`) is a document of its own: one a campaign, whatever
   the party's size. The plan first put it into the package; measured on 2026-11-22, a package may
   be 512 KB at most (`MAX_CAMPAIGN_PACKAGE_BYTES`), the largest shipped one is 453 KB, a book is
   175 KB on average and 252 KB at most, and a campaign ships four to seven packages that would
   each repeat it. So the package contract does not change, no stored revision changes, no digest
   moves, and the library gains `fixtures/campaign-library/<id>/book.json`, named with its SHA-256
   in `library.json`. The book's keys are the package's local keys.
2. **What it holds.** Chapters in the campaign's own order; for a chapter its place, goal, words to
   read aloud, the DM's note, length and level where the source has them, the people, clues,
   handouts and encounters it names, its puzzle, rewards, ending, consequences, rest, the
   campaign's guide for that evening and its note on a changed plan; for a page (a scene) its
   title, its text as written, its minutes, the choices, the check, what follows a failure, the
   people named in it. Beside the chapters: the cast as the DM reads it (with `secret` and
   `reveal`), the clues with how each is found, the handouts with their text, the campaign's notes
   on a party that leaves the road, the encounters no chapter could be named for. A written page
   (the second layer, the built-in adventures) may add its own place, a question for the table, a
   note and cues — moments opened from words of its text.
3. **The check as fields.** The line as written is always kept. An option is read only where a
   difficulty («DC 12», «СЛ 12», «Сл 12») stands right after an ability, a skill, an ability with
   its skill in brackets, a saving throw («спасбросок Ловкости»), or several of these joined by
   «или» or «либо»; «группой» before the difficulty makes a group check. The names are the
   product's own (`SKILLS`, `ABILITIES`); «Восприятие» and «Внимательность» are perception,
   «Расследование» and «Анализ» investigation. A list where one word is unknown gives no option
   at all. `roll` is `asked` with options, `none` where the line says there is no roll and names
   no difficulty, `unread` otherwise. Read on 2026-11-22: 1,137 lines asked, 63 none, 123 unread.
4. **People in a page.** A person of the cast (never a hero) is linked where the page's text names
   them: each capitalised word of the name is matched by its stem with a Russian case ending. A
   stem two people share makes no link, and neither does a word the campaign also writes in lower
   case (a title, a trade). The link keeps the words as the text has them. 1,250 of 1,323 pages
   have at least one.
5. **An encounter's chapter**, by the first rule that names exactly one: the campaign's own note
   on a lost fight; the evening its trigger names («Вечер 3», «в шестой встрече»); the only
   chapter played at its place; the only chapter whose scenes name its title. 166 of 175 are
   tied; the other nine are listed with the book as they are.
6. **Whom a page speaks to.** `voice` is `dm` when the text, outside quotations, names the table
   from outside (heroes, players, the DM, the party, a roll, a check, a scene) or tells the DM
   what to do in the plural imperative; otherwise `players`. The rule leans to the DM on purpose.
   1,284 pages are the DM's, 39 can be read aloud as they are. A chapter's `readAloud` is always
   for the players.
7. **Which campaign a book belongs to.** The library names it: a live campaign whose active
   revision is, in canonical form, one of the library's packages has that campaign's book, as it
   has its pictures (`CampaignLibrary.bookFor`). A package edited before it was activated, and a
   campaign started from an earlier build of the library, are not recognised this way; Stage 920
   decides what they get.
8. **The built-in adventures** have no package. Their books are `fixtures/hollowmere-ru/book.json`
   and `fixtures/ravenford-ru/book.json`, Russian only, under the same contract; the keys are the
   seed's own IDs. Hollowmere's eight pages are the spreads of the second concept
   (`docs/design/dm-book/story.js`) as written there, under the four chapters of
   `docs/BUILTIN_ADVENTURES_DM_RU.md`. Ravenford's six pages were written by the session from the
   seed's own statements. Both carry `awaitingReading`: text written for a book is not shown until
   the owner has read it (decision 8 of the plan), and the server keeps such a book closed.
9. **Nothing is written by a model in the 53.** A first-layer page is the source's scene, word for
   word; the build adds only fields read from it. A test compares every page with its source.

### 3. The book to read (Stage 920)

1. **Which campaign has a book.** A campaign published from a package has the library's book of
   that package (`BookSource`, `apps/server/src/book/`): the record of its publishing gives the
   revision, the library gives the book — by the package's digest, or, for a package the library
   no longer ships as it is (an earlier build, a package edited before publishing), by the
   campaign's name when every key the book names exists in the revision. A campaign of a built-in
   adventure has that adventure's book, in Russian. Any other campaign has none. A book that waits
   for the owner's reading is closed (§2.8).
2. **Two routes, the DM's alone.** `GET …/dm/book` gives the book, what its keys are in this world
   (only the keys the book names), the DM's place and the book's clues the table has found;
   `{ "book": null }` when the campaign has none. `POST …/dm/book/place` keeps the place. Anyone
   who is not this campaign's DM gets the DM routes' 404 — a player, the table's screen, another
   table's DM learn nothing, not even whether a book exists. Neither route sends a command: the
   book changes nothing in the world in this stage.
3. **The spread** (`apps/web/src/book/`, the `book` sheet). Left: where we are, the title, whom
   the text speaks to, the text, the ribbon, the way on. Right: the picture and, under it, the
   brief of the spread — for a chapter's opening what it is for, how long it plays, the campaign's
   notes; for a page its check, what follows a failure, what the players may choose — then its
   moments and the DM's own note. A moment opens as a card in the brief's place; "Back to the
   page" returns focus to the words it was opened from.
4. **The DM's place** is one document a campaign beside the world (`ltw_dm_book_places`,
   migration 0049; it moves with the campaign): the ribbon, the chapters played, a note a page.
   The ribbon follows only the turn to the next page from where it lies; reading ahead, turning
   back and opening a chapter from the path leave it; "lay the ribbon here" moves it by hand.
   Leaving a chapter by that turn marks it played; the DM may mark and unmark any. The last write
   is kept; keys a book no longer has are dropped when the place is read or written.
5. **The path** lists every chapter with a hint: the party is here; played; next by the book (the
   first unplayed chapter after the ribbon); open (a clue the table found in another chapter is
   about this chapter's place — the clue is named); later. A hint is never a lock: every chapter
   opens, and the campaign's own sentence about its order is shown above the list. The map is the
   Places section, one press away; a map drawn inside the book is not in this stage.
6. **Pages that turn.** On a screen where the spread has a height, the left page's text is cut
   into sentences and shown in as many screens as it needs; "Read on" shows the next screen, then
   the next page. The right page scrolls under the picture. On a narrow screen the two pages
   stack and the sheet scrolls.
7. **Bookmarks** open the dock's sections — heroes, places, journal, encounter, session, rules,
   history — and "What we know". A section opened from a bookmark returns to the book, at the
   same page, when it is closed.
8. **The way in** is a Book button, first among the DM's tools in the dock, shown only where the
   campaign has a book. The dock and every section stay as they were (§1.7).
9. **The picture** is the most exact one the DM may see: the open card's own subject, else the
   page's own place, else the chapter's; the caption says which; a press enlarges it. No picture:
   the page says so.
10. **The look** is the campaign's own material and accent around parchment pages
    (`campaign-themes`); the book's own generated materials and the icons of its moments wait for
    the second layer.

### 4. Play from the book (Stage 930)

1. **Every button is a way the product already has.** No command, no route and no rule was added
   for the book. The book shows what the server answered and computes nothing itself.
2. **A roll.** Where a page's or a moment's check was read as fields (§2.3), each option has "ask
   for the roll": the DM picks a hero or the whole party and the table's own check request goes
   out with that check and that difficulty. The difficulty stays the DM's; the answer comes back
   to the card ("waiting", then the total and success or failure as the server says). A line that
   was not read as fields is asked by hand from the Dice section, which is one bookmark away — as
   is any roll the text did not foresee.
3. **A fight.** The card of a prepared encounter starts it through the prepared encounters' own
   start (one request, never twice), or says why it cannot start now in the product's own words.
   Once it starts, the book steps aside for the battlefield: the fight is run on the product's
   own screen, and the Book button brings the page back.
4. **A handout.** A campaign's handout is given to the party from its card as any handout is
   given; the players read it at once. One longer than a handout may be is not cut: the card says
   so.
5. **The table's screen.** Under the picture: "show on the table's screen", and for a chapter's
   opening "with the words read aloud" when they fit the story cast. Only on the DM's press:
   neither reading nor turning a page casts anything. (The plan had the screen follow the ribbon;
   a turn of a page is too quiet an act to change what the whole table sees.)
6. **A meeting** is started, paused and ended in the Session section, a bookmark away; the book
   adds no second set of those controls. The journal is the History and Journal sections.
7. **Not in this stage.** A clue is not handed to the party from its card: the product has no
   command by which the DM gives the party a clue, and none is added here (§4.1) — a clue is
   found as it is found today, and the contents show it when it is. A fork is not marked: the
   DM's note on the page holds what the table chose. Each waits for the owner's word.

## Amendments

- 2026-11-23 (campaign texts, second round; `docs/CAMPAIGN_TEXT_STANDARD.md` §5, §7): **a scene's
  words to read aloud and the DM's pocket.** A page may carry `readAloud`, the source scene's own
  text to read as the scene begins; the library's test compares it word for word, as it does the
  page's text, and the web book quotes it before the page's text («Цитату прочитайте вслух,
  остальное — для мастера»). A book may carry `pocket` (`campaignBookPocketSchema`): rumours with
  their `truth` and the DM's `note` (at most 16), places off the prepared road (at most 8) and
  passers-by (at most 8), read from the campaign's `source/pocket.json` or, for a built-in
  adventure, from the file beside its pages; the web book folds it on every page as «Карман
  мастера». Both fields are optional, so a book built before still parses. Neither names a key,
  neither is a fact of the world until the DM says it, and neither goes into a package: the
  package contract still does not change (§2.1), and the book stays the DM's alone (§1). The build
  still writes nothing of its own (§2.9): both are the source's text as written. All 1,323 pages
  of the 53 books have their words to read aloud and every book has a pocket; the books grew from
  10.9 MB to 13.1 MB (the largest 338 KB).

- 2026-11-27 (campaign story, third round; `docs/CAMPAIGN_TEXT_STANDARD.md` §9–12): **what follows
  each choice, the people's voices, the endings' epilogues and the story's turns.** A page may carry
  `forks`, one text for each of its `choices` in the same order (the book's reference check refuses
  a count that differs); a person may carry `voice` and `lines` (`when` and `say`, at most 12; the
  sources have 5–8); an ending may carry `epilogue`, words to read aloud after it; a book may carry
  `twists` (`campaignBookTwistSchema`, at most 6), each with what seems and what is, its seeds by
  chapter and the chapter of its reveal, both checked against the book's chapters
  (`scripts/campaign-text/story.py` keeps a seed from coming after its reveal). All four are
  optional, so a book built before still parses; all are the source's text as written (§2.9), and
  the tool refuses one that names an internal key. The web book shows the forks beside the page
  under its choices, a person's voice and lines on their card, a turn beside the chapters it is
  planted and revealed in, and the endings with their epilogues beside the first chapter (to steer
  toward them) and the last. None goes into a package: the package contract still does not change
  (§2.1), the packages gaining only a person's `manner`, a field they already had, and the book
  stays the DM's alone (§1). The 53 books were rebuilt: 4,160 forks over 1,323 pages, 517 people
  with a voice and 3,193 lines, 194 epilogues, 172 turns with 399 seeds.

## Consequences

- The campaign package contract does not change (§2.1). The library gains one `book.json` a
  campaign (9.2 MB for the 53) and `library.json` names it; a library built before Stage 910
  still loads.
- The series' package builds do not change: the book is built by the library's build from each
  campaign's `source/`.
- The DM gets a second main screen; journeys for it are added beside the dock's, not instead.
- Migration 0049 adds one table, additive: an older build leaves it alone. `ClientPart` gains
  `book`, so a report of a broken screen can name it.
- Layer 2 is a later program with its own spending and reading; nothing in §1–§4 needs it.
