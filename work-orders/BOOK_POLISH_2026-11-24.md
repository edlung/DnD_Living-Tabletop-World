# Work order: the book's body and the room of a page (2026-11-24)

Owner request, 2026-11-24, in the session (`reviews/OWNER_BOOK_POLISH_2026-11-24.json`): «доработать
до конца задуманное, выявить неудобства использования и предложить улучшения … Текущий вид меня не
сильно впечатляет и кажется что не все функции достаточно очевидны и интуитивно доступны для
использования. Жду от тебя предложений.»

It continues `docs/BOOK_INTERFACE_PLAN.md` (Stages 1000–1140, merged and deployed) and ADR 0075
(§15 is this work). Read from the running product first: Stage 1140's report says the acceptance
rows "were not ticked one by one against the running app".

## What was found (the audit)

The program changed the frame and kept the insides. Read at 1024×768 (the DM's tablet), 1440×900,
390×844 (a player's phone) and 1920×1080 (the table's screen), on a library campaign started from
the shelf:

- Of the DM's eighteen pages two are set as a book (the Book, the Chronicle), the Scene half; the
  rest are the old sheets' forms on paper.
- Four rows stood over the Book's words (the top bar, the part's tabs, the section's title with
  Close, "Pages / The path"): 223 of a tablet's 768 px. The story had 5.5 lines, the last cut in
  half; "how we play this" a window of 153 px with 781 px under it.
- A tablet's bookmarks had no words. A card chosen on the Scene stayed beside the Book and left it
  a third of the screen.
- A fight is run from two tabs (the battlefield on Scene, the controls on Encounter). Asking for a
  check lives in Rules › Dice, a rest in World › Time and weather, a handout's form on the Party's
  page, the evening's start among eight blocks of Session.
- What still scrolls on a tablet: Party +1,401 px, Session +1,740 px, the Journal's known +2,957 px,
  the shelf 7,362 px tall at 1440.
- The table's screen draws a fight's board on about a quarter of the television.

## Scope (done here; no product choice needed)

- **One row at a page's head** (`styles/book-body.css`, `shell/sheet.tsx`): wider than a phone a
  section's title stays for a screen reader only — its open tab and bookmark say it — and Close
  stands in the tabs' row as a tab of the same paper. The Book's own views ("Pages", "The path")
  stand there too (`Sheet`'s `tools`, `book/book-sheet.tsx`). A page gains 55 px, the Book 137.
- **The story's page**: no second binding inside the sheet; the text's measure counts the lines'
  leading and sets linked words as the page does (`book/page-text.tsx`), so the last line is never
  cut. The Scene's card waits on the Scene while the Book is read.
- **Bookmarks keep their words** on a tablet (under the icon, 84 px wide) and on a phone; the open
  part's bookmark is the rubric's red.
- **The book's body**: the block of pages under the page (its edges showing), the binding's cloth
  around it, the campaign's name stamped on the head band, index tabs of the book's own paper,
  paper with an edge. Stylesheet only, from each campaign's existing set; no new picture.
- **Defects**: a known name keeps its words whole in the Journal (its kind under it); "Unidentified
  creature" whole in the table screen's turn order; a hero's "Sheet" reads as a button; the
  meeting's title is not cut to a letter at 1440; the example in "Add to the world" no longer
  names Ravenford's caravan in every campaign (one new phrase, the session's, for the owner to
  read).
- One journey waits for the page instead of reading it once (`scene-spread.spec.ts`: the card
  under a talk).

No contract, server, domain or rule change. No control is removed. The page's place (what
`section-screens.spec.ts` measures) does not move.

## Proposed, not authorized (the owner's page)

Shown to the owner on a private page with seven concept pictures by Codex CLI; each needs his
choice before a work order:

1. The look: a real book edge to edge (recommended), the book on a table, or an illuminated page.
2. One spread for the story and the scene, with the DM's actions as seals on it (a roll, a fight,
   a rest, to the screen, a handout); a card that begins with who someone is.
3. A fight as one fold-out: a press on a figure offers its actions; no second tab.
4. The Party's and the Table's pages by tasks; rare tools in the appendix.
5. The table's screen as the open book across the television.
6. The shelf in named shelves with "Continue".
7. A player's phone opening on the hero and the die.
8. New book materials for every campaign (a frame with page edges, the seals, an initial).

His choices the same day, in a question card: the look is direction А (a real book, with the
illuminated page's typography); the Scene becomes the DM's working spread and the Book stays as
the contents (item 2, authorized as Stage 1150 and done first; its work order comes with it); this work goes to
a pull request. Items 3–8 still wait for his word.

## Known limits

- Looked at on the lighthouse's book and the English built-in adventure; the other books get the
  same stylesheet and their materials did not change.
- The guide ("How to play") is still a dark dialog over the book.
- WebKit and the iPad project are not installed locally; CI runs them.

## Out of scope

Merging and deploying stay the owner's.
