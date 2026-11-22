# 0074. The DM's book: a campaign's text in its package and a book as the DM's screen

- Status: Accepted for §1 (the owner's words of 2026-11-22, `reviews/OWNER_DM_BOOK_2026-11-22.json`:
  the brief, «Да, развиваем», «мне для всех компаний книжный формат нужен … 55 кампаний», «Да,
  открываем» and four choices in a question card). Points marked (S) are the session's and stay the
  owner's to overrule (`docs/DM_BOOK_PLAN.md`, decisions 9–14). Later sections are added by their
  stages and are not in force until then: §2 the book's data (Stage 910), §3 the book to read
  (Stage 920), §4 play from the book (Stage 930).
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

## Consequences

- The campaign package contract gains optional content (§2, Stage 910). Stored package revisions
  stay readable: the addition is optional and absent from earlier revisions, as `possessions` and
  `maps` are.
- The builds of every campaign series change together, and the library fixture is rebuilt.
- The DM gets a second main screen; journeys for it are added beside the dock's, not instead.
- Layer 2 is a later program with its own spending and reading; nothing in §1–§4 needs it.
