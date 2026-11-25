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

| Stage | What                                | The promise shown to the owner                                                                                           | Status                                  |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| —     | The book's body                     | One row at a page's head, bookmarks with words, the block of pages, text never cut                                       | pull request 97                         |
| 1150  | The DM's working spread             | The story and the Scene on one spread, five seals with slips, a card "by the book"                                       | pull request 98                         |
| 1160  | The fight as one fold-out           | The field and the actions together; a turn for anyone by pressing their figure; "End the fight" on the map               | pull request 99                         |
| 1170  | The Party and the Table by tasks    | Rest and experience beside the party's health; the evening apart from the campaign's settings; rare tools in an appendix | pull request 100                        |
| 1180  | The table's screen                  | The book across the whole television, the battlefield at full height, a cover instead of a beige rectangle               | pull request 101                        |
| 1190  | The shelf                           | Labelled shelves, «Продолжить» at the current book, no eight screens of scrolling                                        | pull request 102                        |
| 1200  | A player's phone                    | The hero and the die first, a thin head                                                                                  | branch `claude/stage-1200-player-phone` |
| 1210  | New book materials, three campaigns | A painted frame with the block of pages, action seals, an initial, corners — in each campaign's own style, by Codex CLI  | `work-orders/STAGE_1210.md`             |

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

Still the owner's: merging and deploying the stack; his look at the three campaigns' new
materials before the other books are drawn; reading and opening the written books of «Пропавший
караван» and «Холлоумир» (until then his own campaigns run on a book assembled from the world).
