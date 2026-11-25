# Stage 1150 — the DM's working spread

Authorized by the owner on 2026-11-24, in a question card of the session
(`reviews/OWNER_BOOK_POLISH_2026-11-24.json`): the look is direction А («настоящая книга»), the
Scene becomes the working spread («Рабочий разворот»: «„Сцена“ становится разворотом, с которого
ведут игру: рассказ текущей страницы, кто здесь, печати „Бросок“, „Бой“, „Привал“, „На экран“,
„Выдать“. „Книга“ остаётся оглавлением и чтением наперёд»), and it is done first. ADR 0075 §16.
Stacked on `claude/book-interface-polish` (pull request 97).

## Why

Read in the running product (`work-orders/BOOK_POLISH_2026-11-24.md`): the DM read the story in
the Book and saw who is here on the Scene, and went between the two; asking for a check lived in
Rules › Dice, a rest in World › Time and weather, a handout's form on the Party's page; a card of
someone chosen began with links to others.

## Scope

On a screen wide enough for two pages (the Scene's spread: 1024×600 and up), in the DM's
perspective, outside a fight:

- **The left page is the story where the party is** (`book/work-story.tsx`): the leaf the ribbon
  lies on — its chapter and title, the words read aloud and the DM's text in the Book's own
  setting, an initial on its first screen, "How we play this" folded at the page's foot (the
  page's question, what if it fails, what the players may choose; a chapter's purpose and note),
  and the turn. Turning on or back moves the ribbon: this page is always where the party is.
  "In the book" opens the Book there; a name in the text opens that person's card on the Scene.
- **The right page is the place** (`styles/work-spread.css`): the plate at its head; under it the
  Scene itself — the place's name and hour as the plate's caption, the heroes' faces with their
  presence at its end, who and what is here as small plates, the ways beyond. The Scene's own
  parts are laid there by the stylesheet, not rebuilt: every control keeps its name and its place
  in the page's order.
- **Five seals at the right page's foot** (`book/work-seals.tsx`): a roll, a fight, a rest, the
  table's screen, a handout. A seal opens a slip on the page with what this page of the story
  prepares — its check and its moments' checks with "ask"; the fights prepared at this place and
  the chapter's; a short or a long rest; the place's picture with the words read aloud; the
  chapter's handouts — and one press further the whole tool (Dice, Encounter, Time and weather,
  the table's screen, the Party's handout form). Every action is an existing one. A seal carries
  a small tag with how many rolls, fights or handouts this page prepares, so the DM sees it
  before pressing; a handout's text folds under its name in the slip, to be read before it is
  given; the screen's slip says what goes to the screen.
- **The card of someone chosen takes the plate's place** (as a talk does), so who is here and the
  seals stay in reach. For the DM it begins with how the campaign's book tells that person
  (`book/told.ts`, `PersonBody`), then the world's own description and "Perform", then the leads.
- A result's slip on the plate is never covered and covers no control: a seal's slip ends below
  it, and a card open in the plate's place begins under it.
- **A campaign with no written book** (a book assembled from the campaign itself, ADR 0075 §5 —
  every built-in adventure whose written book still waits for the owner's reading): a page the
  campaign has no words for says so and lays out what the book does hold of it
  (`book/work-brief.tsx`) — the page's notes, who is here as the campaign describes them, what can
  be found here (words, not controls: the plate on the right page opens a card). Its chapters are the campaign's places: when the Scene shows another place, the
  page offers the chapter told there, and the DM turns to it with one press. Nothing moves by
  itself, and a written story keeps its own order (no offer there). The card of someone of such a
  book has no "By the book": the book holds only the world's own description, shown just below.

Unchanged: a player's Scene; the DM's Scene narrower than the spread and in a fight; the Book
(the contents, reading ahead, its cards); every command, route and contract. No model writes
text. New phrases of the interface, written by the session for the owner to read, are listed in
the report.

## Journeys

- `tests/e2e/working-spread.spec.ts` (Chromium and the iPad project; its own campaigns
  `ui-ru-work`, `ui-ru-work-ipad`): the spread's two pages and five seals, a card that begins
  with the book's telling and leaves who is here in reach, a fight's slip, a rest called and
  ended, the ribbon moved by a turn and found in the Book, a page's rolls, the way to a whole
  tool, an upright tablet without the spread, a player without the story. On the English
  adventure (no written book; campaigns `ui-work-assembled`, `ui-work-assembled-ipad`): a page
  with no words and its brief, and the chapter of another place opened from the page.
- Every other journey runs unchanged.

## Known limits

- The spread needs 1024×600: an upright tablet and a phone keep the Scene and the Book apart.
- A fight keeps its own layout (the fold-out and its two tabs): Stage 1160's subject, not
  authorized.
- The seals are drawn by the stylesheet in the rubric's red with the kit's glyphs; a painted seal
  for each campaign's set is a proposal (new book materials), not this stage.
- A person's card says "By the book" only for someone the campaign's book names.

## Out of scope

The fight as one fold-out, the Party's and the Table's pages by tasks, the table's screen, the
shelf, a player's phone, new book materials. Merging and deployment stay the owner's.
