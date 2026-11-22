# 0074. The DM's book: a campaign's text as a book beside its packages, and a book as the DM's screen

- Status: Accepted for §1–§2 (the owner's words of 2026-11-22, `reviews/OWNER_DM_BOOK_2026-11-22.json`:
  the brief, «Да, развиваем», «мне для всех компаний книжный формат нужен … 55 кампаний», «Да,
  открываем» and four choices in a question card). Points marked (S), and every point of §2, are
  the session's and stay the owner's to overrule (`docs/DM_BOOK_PLAN.md`, decisions 9–15). Later
  sections are added by their stages and are not in force until then: §3 the book to read (Stage
  920), §4 play from the book (Stage 930).
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

## Consequences

- The campaign package contract does not change (§2.1). The library gains one `book.json` a
  campaign (9.2 MB for the 53) and `library.json` names it; a library built before Stage 910
  still loads.
- The series' package builds do not change: the book is built by the library's build from each
  campaign's `source/`.
- The DM gets a second main screen; journeys for it are added beside the dock's, not instead.
- Layer 2 is a later program with its own spending and reading; nothing in §1–§4 needs it.
