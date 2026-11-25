# The second pass, reviewed — report (2026-11-25)

Work order `work-orders/BOOK_SECOND_PASS_REVIEW_2026-11-25.md`; ADR 0075 §23. Branch
`claude/second-pass-review`, stacked on `claude/stage-1210-book-details` (pull request 104).
Status: **implemented; nothing is merged or deployed.**

## What was read, and how

The screens of Stages 1160–1210 — the fight run from the map, the Party's and the Session's
pages, the table's screen, the shelf, a player's phone, the three books' own details — against
WCAG 2.1/2.2 AA and for usability, hierarchy and consistency, from the code and the screenshots
of each stage. The journeys' axe scans and the layout audit already hold contrast of rendered
text, 24 px targets and focusable scroll boxes on these screens; the reading looked at what they
do not see: where the focus goes, what a control is named, text over pictures, a finger's width
on a phone's head, rows that should line up.

## Found and fixed

| Where                                | What was wrong                                                                                               | Now                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| The fight's slip, the Encounter page | "End the fight" was replaced by its question and the focus fell to the page; a keyboard lost its place twice | The careful answer takes the focus, the button gets it back; the question names its group |
| A phone's "More"                     | A choice closed the list and left the focus on a row out of sight                                            | "More" takes the focus                                                                    |
| A phone's head                       | "More" and the hero's plate were 40 px high                                                                  | 44 px, in the same head of 48                                                             |
| The Party's page                     | A hero with a line more (spell slots) had its buttons a line lower than its neighbours'                      | The actions stand at each card's foot, on one line across the row                         |
| A phone's dice foot                  | «Бросков ещё н…»: the line had room for half of its words                                                    | Nothing rolled yet, no line                                                               |
| The board's hint for the DM          | «Нажмите на фигурку, затем на клетку — и переставьте её.» read as three steps                                | «Чтобы переставить фигурку, нажмите на неё, затем на клетку.»                             |

Measured, not changed: the story's initial on each book's plate reads at 6.9 : 1, 3.9 : 1 and
6.6 : 1 (a letter of that size needs 3 : 1); the phone's live mark keeps its word for a screen
reader; "More" closes on Escape and gives the focus back; the shelf's look inside is a modal
dialog that returns the focus to its book; a library's book is one named button.

## The reworded phrase (for the owner to read)

«Чтобы переставить фигурку, нажмите на неё, затем на клетку. Действия хода — на листке внизу.»
(the DM's hint beside the map; it replaces the Stage 1160 wording).

## Left for the owner's eye, not changed

- **Two words for one thing.** The Scene says «Вечер ещё не начат.» and «Начать вечер»; the
  page it leads to says «Начать сессию», and a player's strip says «Сессия ещё не началась.».
  «Начать сессию» and the strip were in the product; which word stays is his to say.
- **Whose turn, three times.** A tablet's fight names whose turn it is in the order of turns,
  under it and at the slip's head; a phone's fight in the banner, the order and the hint. Each
  is an older part with its own journeys; removing one is a choice.
- **The map's size on a tablet.** The fold-out fits the page, and the map is 495 × 395 px beside
  a card and a hint that is read once. A larger map means the hint folds away after its first
  reading — a design step, not a fix.
- **A player's "I am ready" strip** lies over the page until the evening begins: over the order
  of turns when the DM takes a hero's turn in a fight started before the evening. Older than
  this pass.
- **«Вся полка: 17»** names what it shows, not what it does; «Показать всю полку: 17» would be
  the verb. «Приложение» does not say what it holds until opened.
- **The shelf at 320 px** was not looked at (390 px was).

## The journeys' time limit in CI

Pull request 103's last shard of journeys (4 of 4: it carries the iPad and WebKit projects)
reached its 25-minute limit twice — the first run and a re-run — each time with 108 of its 109
journeys passed and none failed. The same journeys of the same shard ran in pull request 104 at
the same hour in 18 minutes: every journey was about 1.4 times slower on the two runs that hit
the limit, the slow WebKit ones and the quick Chromium ones alike, which is the hosted runner's
machine and not the code (the suite takes the same 22 minutes on one machine before and after
Stage 1200). The shard had grown to within a slow machine's reach of its limit. The step's limit
is 35 minutes now (`.github/workflows/ci.yml`); the job's stays 60. Pull request 103 itself still
runs with the limit of its own branch.

## Verification

| Check                                                                | Result                          |
| -------------------------------------------------------------------- | ------------------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`       | pass                            |
| `pnpm run context-budget`                                            | pass                            |
| `pnpm run test` (unit)                                               | 5,137 of 5,137                  |
| `fight-from-map`, `combat-lifecycle`, `phone-head`, `pages-by-tasks` | 6 of 6, with the new assertions |
| Their neighbours in Chromium (eleven specs)                          | 44 of 44                        |
| The iPad project (WebKit)                                            | 31 of 31                        |

The heroes' cards' check fails without its rule (two lines of actions in one row). The whole
Chromium suite was not run again for this branch: the changes are two focus moves, four rules of
two stylesheets and one sentence, and CI runs the whole of it.

Looked at on the audit's own servers: the Party's page at 1024 × 768, a player's phone at
390 × 844 and 320 × 640 (the layout audit clean at both), the fight's question on the slip.

Not run: `party-known`, `voice.spec.ts`, the native shells, a real tablet or phone, a screen
reader itself (the focus and the names are read by the journeys, not heard).
