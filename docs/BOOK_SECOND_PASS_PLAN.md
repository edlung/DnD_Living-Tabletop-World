# The book's second pass: the plan (Stages 1150–1210)

Owner, 2026-11-24, on the deployed book interface: «Текущий вид меня не сильно впечатляет и
кажется что не все функции достаточно очевидны и интуитивно доступны для использования. Жду от
тебя предложений.» The session read the running product, showed him a page of findings and steps
(«Второй проход книги»), and he chose the look (direction А, a real book) and the first step (the
DM's working spread). On 2026-11-25, after that step: «Реализуй весь план до конца».
Records: `reviews/OWNER_BOOK_POLISH_2026-11-24.json`, `reviews/OWNER_BOOK_SECOND_PASS_2026-11-25.json`.

**Authorized: Stages 1160–1210, each on its own branch and pull request stacked on the one
before.** Merging and deployment stay the owner's; so does opening the two built-in adventures'
written books. ADR 0075 holds the decisions, one section a stage.

What was found, in one paragraph: the book program changed the frame and kept the old forms
inside; a fight is run from two tabs (the field on one, the controls on the other); frequent
actions are filed under parts named for something else; the table's screen draws a fight on a
quarter of the television; the shelf is eight screens tall; a player's phone opens on the Scene
under 200 px of heads. Findings with screenshots: the page; `reports/BOOK_POLISH_2026-11-24.md`.

| Stage | What                                | The promise shown to the owner                                                                                           | Status           |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| —     | The book's body                     | One row at a page's head, bookmarks with words, the block of pages, text never cut                                       | pull request 97  |
| 1150  | The DM's working spread             | The story and the Scene on one spread, five seals with slips, a card "by the book"                                       | pull request 98  |
| 1160  | The fight as one fold-out           | The field and the actions together; a turn for anyone by pressing their figure; "End the fight" on the map               | pull request 99  |
| 1170  | The Party and the Table by tasks    | Rest and experience beside the party's health; the evening apart from the campaign's settings; rare tools in an appendix | pull request 100 |
| 1180  | The table's screen                  | The book across the whole television, the battlefield at full height, a cover instead of a beige rectangle               | pull request 101 |
| 1190  | The shelf                           | Labelled shelves, «Продолжить» at the current book, no eight screens of scrolling                                        | pull request 102 |
| 1200  | A player's phone                    | The hero and the die first, a thin head                                                                                  | pull request 103 |
| 1210  | New book materials, three campaigns | A painted frame with the block of pages, action seals, an initial, corners — in each campaign's own style, by Codex CLI  | pull request 104 |

## What every stage keeps

- **No rails.** Nothing becomes a required chain of pages; every part stays one press away.
- **Nothing is removed.** A tool that moves keeps its name and its journey; a rare tool goes to an
  appendix, not away.
- **The server decides.** No rule, legality, cost or range is computed in the client; a stage that
  needs a new route or contract says so in its work order and its ADR section.
- **Knowledge isolation.** A player's client and the table's screen receive only their own
  projections; the DM's book never reaches them.
- **The owner's tablet first.** A screen is judged at 1024×768 before any other size; a phone at
  390×844; the television at 1920×1080.
- **Words are read.** Every phrase the session writes for the interface is listed in the stage's
  report for the owner to read. No model writes text for the product.
- **Pictures are Codex CLI's**, in the campaign's own style, kept with their prompts beside the
  originals (`~/Documents/living-tabletop-world-art/`).

## After the plan

Every stage of the table above is implemented, each on its own branch and pull request stacked on
the one before (97 to 104); none is merged or deployed. The screens of Stages 1160–1210 were
then read once more for accessibility and design, and what that found is fixed in pull request
105 (ADR 0075 §23, `reports/BOOK_SECOND_PASS_REVIEW_2026-11-25.md`).

**What the plan missed, and what followed (2026-11-25).** The owner looked at the stack running
and said that nothing had changed to the eye: a header over the book, web forms on its pages, no
Codex CLI pictures in its frame (`reviews/OWNER_BOOK_WHOLE_SCREEN_2026-11-25.json`). The stages
above moved what a page holds; none of them built the picture he had chosen. Pull request 106
does (ADR 0075 §24, `reports/BOOK_WHOLE_SCREEN_2026-11-25.md`): the book is the whole screen, what
the top bar held is behind a clasp on the cover, the dice and every form are set as parts of the
book, and each of the 56 books has a corner fitting and dice of its own by Codex CLI.

He then asked for more of the same (`reviews/OWNER_BOOK_CLOSER_TO_CONCEPT_2026-11-25.json`):
closer to the concept, and generated icons in place of standard forms wherever possible. Pull
request 107 (ADR 0075 §25, `reports/BOOK_CLOSER_TO_CONCEPT_2026-11-25.md`): the Scene is a spread
from 701 px — his own window showed a picture under glass plates —, set with running heads, the
title over the book's ornament, round portraits, the ribbon down the gutter and the page's number
between drawn hands; choices are made by pressing one of fifty-six vignettes Codex CLI drew, the
heroes are chosen by their faces, and a form's own tick, ring and list mark are drawn.

Then (`reviews/OWNER_BOOK_LOOSE_ENDS_2026-11-25.json`): every loose end of the interface first —
he checks the book when it is whole, and the other books' materials are drawn after that — and
the fight large, on the whole screen. Pull request 108 (ADR 0075 §26,
`reports/BOOK_FIGHT_WHOLE_SCREEN_2026-11-25.md`): from a tablet up the fight is one sheet the map
takes, with only the order of turns beside it; its foot keeps a constant room, so the map never
changes its size under a pointer; the cards lie over the map's edge, or in the room the map
leaves beside or under itself. The loose ends that follow, each in its own pull request stacked
on the last: every card, slip and dialog on the book's paper; the choices and lists the browser
still draws; the shelf, the way in, the table's screen, the Chronicle; the workshop and a hero's
builder.

Still the owner's: merging and deploying the stack; his look at the three campaigns' new
materials before the other books are drawn; reading and opening the written books of «Пропавший
караван» and «Холлоумир» (until then his own campaigns run on a book assembled from the world).

What the stages left, each named in its report: a name plate at the edge of a flat map on a
narrow table screen; the shelf's length with the account's page at its end; the hero's sheet as a
dialog over the book on a phone; materials for the other fifty-two books.
