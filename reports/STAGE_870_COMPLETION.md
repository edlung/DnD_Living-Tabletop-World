# Stage 870 completion — theatre of the mind on the table's screen

Pull request: https://github.com/edlung/DnD_Living-Tabletop-World/pull/58 (draft, stacked on
Stage 860's, https://github.com/edlung/DnD_Living-Tabletop-World/pull/56).

Work order `work-orders/STAGE_870.md`; program `docs/TABLE_IDEAS_PLAN.md` (section 870); ADR 0073
§8; 2026-11-16. Status: **AWAITING_OWNER_DISPOSITION**. Branch `claude/stage-870-story-cast`.

**On whose word.** The owner's, typed on 2026-11-16 in another session and quoted as relayed
(`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`): «приступай к реализации этих улучшений…». Every
design point is the session's and stays the owner's to overrule.

## What changed

- **A new thing to show on the table's screens: "A picture with words to read aloud".** One
  picture of something the party knows — a place, a face, a thing — fills the screen, or the
  game's own art where none is chosen; up to six hundred characters of words stand over its
  lower part, each line the DM broke as its own paragraph. For evenings without a battlefield.
- **Whose words**: the DM's own, typed — or a paragraph of the party's chapters, which the form
  offers and takes with a press ("Take this paragraph"), asking first if it would replace what
  the DM typed. No narrator is called and no AI capability is added.
- **The words always fit and always stand on the dark**: they stand smaller the more there are,
  the dark behind them rises with them, and the form warns past eight lines.
- **Online** it is every player's shared screen, a panel the keyboard scrolls; new words are
  announced.
- **Below the DM** a picture the party does not know is none: a display and a player read the
  words with no picture and not even its ID.
- **No table, no migration**: the cast is stored as every cast is.
- **Session's decisions**: all of ADR 0073 §8; they are listed in the work order.

## Found and fixed on the way

- **From the independent UX, copy and accessibility pass** (a reviewing subagent, reading the
  source), two blockers: nothing bounded the words — a riddle of twelve short lines lost its
  last lines off the screen; and the dark veil stopped below the words' top, so long text
  climbed onto a bright picture. Also: choosing a paragraph replaced the DM's typing at once,
  on every arrow key, cut in the middle of a word; in a player's sheet online the words sat
  below the fold; nothing announced new words; «Картина» where the rest says «Картинка».
- **By looking at the screens**: a single short line stood as small as a paragraph; a line or
  two now stand large, centred, to be read from across the room.
- The Russian journey opened the sign-in page in an English browser.

## Verification

| Check                                                                                                          | Result                                                                                 |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Format, typecheck, context budget                                                                              | pass                                                                                   |
| Lint                                                                                                           | pass on the files changed since Stage 860; the whole repository is linted by CI        |
| Unit tests                                                                                                     | pass — 598 files, 4790 tests                                                           |
| Integration tests (PostgreSQL 16)                                                                              | pass — 84 files, 405 tests                                                             |
| Build                                                                                                          | pass                                                                                   |
| Journeys, Chromium: `story-cast` (two), and the neighbours `table-display`, `online`, `display-moments`        | pass                                                                                   |
| The cast at 1920×1080, 1280×720 and 1024×768, the form at 1440, 768, 390, 320 and 832×400, English and Russian | looked at, 18 screenshots: 520 characters in three paragraphs, a single line, the form |
| Independent UX, copy and accessibility pass                                                                    | done from the source; findings above, fixed                                            |

**Adversarial pass against the boundary.** A cast is what the DM shows the table, so the words
are the DM's responsibility, as a title card's are. The picture is not: below the DM the cast
is filtered as a picture cast is — an entity the party does not know becomes no picture, and
its ID does not travel (unit tests for a display and for a player, over HTTP too); only an
approved picture is ever shown. A display cannot cast (403). The paragraphs the form offers
come from the chapters read in the party's view, so nothing told from the DM or from one
character is among them. A build from before this stage reads a stored story cast as no cast.

## Not verified

- **No television across a room.** The cast was looked at as screenshots at three sizes;
  whether the words read from a sofa is the family's to say.
- **The whole browser suite was not run on this branch** in this environment; the pull
  request's CI runs it.
- **WebKit**: not installed here; this journey is not in the `ipad` list.
- A screen reader's actual announcement of new words on the shared screen.

## For the owner

Merge after pull request 56 (Stage 860). No migration. Only the owner can: merge, deploy, and
read a line aloud with the picture on the real screen.
