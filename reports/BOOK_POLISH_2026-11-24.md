# The book's second pass — report (2026-11-24)

Work order `work-orders/BOOK_POLISH_2026-11-24.md`; ADR 0075 §15; the owner's words
`reviews/OWNER_BOOK_POLISH_2026-11-24.json`. Branch `claude/book-interface-polish`, from `main`
9a452395. Status: **the shell work is done; the proposals wait for the owner; nothing is merged or
deployed.**

## How the product was read

The journeys' sign-in server on its own ports, a library campaign («Маяк Между Ветрами») started
from the shelf, as its DM, a player invited to a phone, a fight started and ended, a table's screen
paired. About a hundred screenshots at 1024×768, 1440×900, 390×844 and 1920×1080, each with what
its scrollers hide. The workshop's desk and a manuscript were looked at once.

## What changed

| Where                    | Before                                                                                 | After                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A page's head            | The part's tabs, then a title row with Close; on the Book a third row for its views    | One row: tabs, the Book's views, Close. A page gains 55 px, the Book 137                                     |
| The Book, 1024×768       | 5.5 lines of the story, the last cut in half; "part 1 of 7"; the right page 153 px     | 10 lines, none cut; "part 1 of 4"; the right page 303 px                                                     |
| The Book, 1440×900       | "part 2 of 4" for a scene's first page; the right page 258 px                          | "part 1 of 2"; the right page 409 px                                                                         |
| The Book beside a card   | A card chosen on the Scene took 400 px beside the Book; the bookmarks stood mid-screen | The Book has the whole page; the card waits on the Scene                                                     |
| Bookmarks, tablet, phone | Icons without words                                                                    | A word under each icon; the open part's bookmark is red                                                      |
| The book as a thing      | A flat sheet on cloth; dark web tabs; the top bar a dark panel                         | The block of pages under the page, the cloth around, the campaign's name stamped, tabs of paper              |
| The top bar at 1440      | The product's wordmark left the meeting's title one letter                             | The campaign's and the meeting's names in full                                                               |
| The Journal's known      | A long name broke inside a word beside its kind                                        | The kind stands under the name                                                                               |
| The table's turn order   | "Неопознанн ое существо"                                                               | The word whole                                                                                               |
| The Party's card         | "Sheet" looked like a label                                                            | It reads as a button                                                                                         |
| "Add to the world"       | The example named Ravenford's caravan in every campaign                                | A neutral example (new phrase, for the owner: «Например: свидетель у входа, который видел, кто ушёл ночью.») |

Files: `apps/web/src/styles/book-body.css` (new), `styles/display-tv.css`, `shell/sheet.tsx`,
`book/book-sheet.tsx`, `book/page-text.tsx`, `authoring/authoring-panel.tsx`, `i18n/ru-play.ts`,
`main.tsx`; journey `tests/e2e/scene-spread.spec.ts` (waits for the card instead of reading once).

## What still scrolls (unchanged by this work)

At 1024×768: Party 1,381 px beyond its page, Session 1,678, the Journal's known 2,985, the Rules'
list 6,552, Encounter 493; the Book's right page 631 px inside 303. At 1440×900 Places and the
Scene do not scroll. The shelf is 7,362 px tall. These are the proposals'
subject, not this work's.

## Verification

| Check                                                          | Result                                        |
| -------------------------------------------------------------- | --------------------------------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` | pass                                          |
| `pnpm run context-budget`                                      | pass                                          |
| `pnpm run test` (unit)                                         | 5,127 of 5,127                                |
| Chromium journeys, every one but `party-known`                 | 385 of 386; `voice.spec.ts` fails (see below) |

Looked at by eye after the change: the Scene, the Book (a page and the path), Party, Places, Time
and weather, the Journal, Session, Rules and Encounter at 1024; the Scene, the Book, the path,
Party, Places and the Journal at 1440; the Scene, the Book and Party on a 390 px phone; a fight at
1440 and 1024.

`voice.spec.ts` ("online, the DM and a player hear each other") did not connect its two browsers
(WebRTC stayed "connecting"): it fails the same way on a clean checkout of `main` 9a452395 on this
machine on the same evening, so it is the machine's, not this branch's; CI will say. After the full
run four small refinements from the layout audit went in (a phone's bookmark words at 12 px, the
focus ring of Close on the cloth, a known name's row as tall as before, the room of the table's
asks over the Book) and 55 journeys of the shell, the Book, the Scene, the Party, rests and
accessibility were run again: all pass.

The measurable layout audit (`ui-layout-audit`) was run signed in at 1440, 1024, 768, 390 and 320
px for the DM and at 390 and 320 for a player. Nothing it found comes from this work: what it
reports are the old forms' rows (Party, Session), text it measures under a layer that covers it
(the Scene under an open page; a scrolled list under the dice), and — a limit kept on purpose —
the DM's seven bookmarks without words on a phone narrower than 375 px, where a 12 px word does not
fit a 42 px bookmark.

Not run: the iPad project and WebKit (not installed here; CI runs them), `party-known` (floods
local ports; CI runs it), the native shells, a real tablet.

## The proposals

Shown to the owner on a private page (https://claude.ai/artifact/7i7fSfLqy8kCsHqihKUBAL) with
seven concept pictures by Codex CLI and its independent reading of eleven screenshots
(`~/Documents/living-tabletop-world-art/book-polish-2026-11-24/`). The work order lists them. None
has a work order; each waits for his choice.

## Left

- The guide ("How to play") is a dark dialog over the book.
- "(DM)" in the DM's section titles is now read by screen readers only on wide screens; the words
  themselves are unchanged.
- The Scene's left page still scrolls 150 px at 1024×768 (its cards are large); the right page is
  half empty until a card is chosen.
