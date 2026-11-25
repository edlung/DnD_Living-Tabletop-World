# Stage 1200 completion — a player's phone

Work order `work-orders/STAGE_1200.md`; ADR 0075 §21; the owner's word
`reviews/OWNER_BOOK_SECOND_PASS_2026-11-25.json`; plan `docs/BOOK_SECOND_PASS_PLAN.md`;
2026-11-25. Branch `claude/stage-1200-player-phone`, stacked on `claude/stage-1190-shelf` (pull
request 102). Status: **implemented; nothing is merged or deployed.**

## What a player holds now (390 × 844)

| On the phone             | Before                                                            | Now                                                                                |
| ------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| The head                 | Three rows, about 150 px: the campaign's name, four icons, a list | One row, 49 px: the hero's plate, the live mark, «Ещё»                             |
| My hero                  | A chip in the row of who is at the table; hit points in the sheet | The portrait, the name, hit points with their bar and the Armor Class, in the head |
| The hero's sheet         | The «Герой» bookmark                                              | That, and a press on the plate                                                     |
| The view, help, leaving  | Icons in the head; the view's list a row of its own               | Named rows of «Ещё»: «Вид», «Как играть», «Обновить мир», the account, «Выйти»     |
| Where the scene begins   | 200 px down, under a row with the Scene's one tab                 | 49 px down, right under the head                                                   |
| The dice                 | d6, d8, d20                                                       | d20 first and larger, then d6, d8                                                  |
| A fight                  | The map began 590 px down and was cut by the screen               | The map begins 313 px down and stands whole (to 735 px)                            |
| The bookmarks in a fight | Five icons without words, floating over the map                   | The phone's own row with words, on the binding's cloth                             |

A tablet's and a desktop's top bar are as they were: the list's box is a box only on a phone. A
DM's phone has the same head with the campaign's name where a player's has the hero.

## New phrases of the interface

None new: «Ещё» (the menu's name) and «Открыть лист: {имя}» (the plate's) were in the product,
and the rows of «Ещё» keep the names their icons had.

## Files

New: `apps/web/src/shell/hero-plate.tsx`, `styles/phone-head.css`,
`tests/e2e/phone-head.spec.ts`. Changed: `shell/top-bar.tsx` (the hero's slot, «Ещё» and its
list), `world/world-overlays.tsx` (the plate written in), `session/live-status.tsx` (the word in
a box of its own), `styles/chronicle.css` (a narrow Chronicle's own ground), `main.tsx`;
`tests/e2e/support/shell.ts` (`openTopMenu`; `expectDockFits` looks at the tabs that show),
journeys `accessibility`, `guide`, `sign-in-accessibility`.

## Verification

| Check                                                          | Result                                    |
| -------------------------------------------------------------- | ----------------------------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` | pass                                      |
| `pnpm run context-budget`                                      | pass                                      |
| `pnpm run test` (unit)                                         | 5,135 of 5,135                            |
| Chromium, every journey but `party-known` and the voice        | 393 of 394 in the run; the one then fixed |
| The iPad project (WebKit)                                      | 31 of 31 in the run, and again after it   |

The whole run found one real fault: `encounter-summary` reads everything a player's browser is
sent and refuses the word "spellId" — and the hero's plate, mounted on every screen, read the
hero's own sheet for a head only a phone shows. The plate is now mounted, and its sheet read,
only on a phone (`PLATE_SCREENS`). After that change the journey passed with eight neighbours
(18 of 18 in Chromium: the fight's summaries, a turn, the hint, the narrow fight, the hero's book,
the sheet, the guide, the phone's head) and the whole iPad project passed again, 31 of 31; the
whole Chromium suite was not run a second time for this stage — Stage 1210's run, on top of this
branch, covers it.

Looked at by eye on the audit's own servers as a player and as the DM at 390 × 844 and at
320 × 640: the Scene, «Ещё» open, the hero's sheet, the World's page, a fight. The layout audit
(`ui-layout-audit`) of the Scene, «Ещё», the World's page and the fight at 390 is clean; at 320 it
finds what it found before this stage on the board (a map wider than the screen cuts the plates
at its edge).

Not run: `party-known`, `voice.spec.ts`, the `webkit` project of the release journeys, the native
shells on a simulator, a real phone.

## Left

- The hero's sheet is still a dialog over the book, not a page of it, so the dice at the foot are
  not under it.
- The three dice at the foot are the same for every hero.
- Under the order of turns a phone's fight still says whose turn it is twice (the line above the
  order and the one below it).
- A phone held wide (a height under 500 px) keeps the head of a narrow screen as it was.
