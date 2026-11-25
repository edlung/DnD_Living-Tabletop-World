# Stage 1160 completion — the fight run from the map

Work order `work-orders/STAGE_1160.md`; ADR 0075 §17; the owner's word
`reviews/OWNER_BOOK_SECOND_PASS_2026-11-25.json` («Реализуй весь план до конца»); plan
`docs/BOOK_SECOND_PASS_PLAN.md`; 2026-11-25. Branch `claude/stage-1160-fight-foldout`, stacked on
`claude/stage-1150-working-spread` (pull request 98). Status: **implemented; nothing is merged or
deployed.**

## What the DM has now

| Where                         | Before                                                                               | Now                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| A fight on a 1024×768 tablet  | One scrolling column; the map began at 505 px of 768 and scrolled 714 px             | A paper fold-out that fits the page: the order of turns, the map (495×395), the cards beside it, the slip at its foot     |
| A creature's turn             | Encounter page › "Suggested turn" (the field out of sight), its sentence in English  | On the map: «Предложенный ход: атаковать — Эловен Старвиспер» and «Сделать этот ход»                                      |
| A hero's turn taken by the DM | Encounter page › "Act as …" › a reason › act › "Stop acting"                         | On the map: «Ходить за героя» — that hero's tray on the same map; the DM's view comes back when the turn ends             |
| A hero nobody plays           | Could not be run: «Причину не удалось записать, поэтому за игрока ничего не сделано» | Run like any other from the map; no reason is kept, as the server's own rule says                                         |
| Ending a fight                | Encounter page › "End encounter"                                                     | On the map: «Закончить бой», asked once                                                                                   |
| The rest of the fight's tools | The same page                                                                        | «Вся схватка», one press from the map: the turn order's tools, the light, what joins the fight, standing in with a reason |

A player's fight on a phone, the board's drawing, every command, rule, route and contract are
unchanged. On a tablet the place's card and who is at the table step aside for the map in a
fight (the order of turns shows everyone's hit points).

## Found on the way

- **A hero nobody plays could not be played by the DM.** The server keeps a reason only for a
  character who has a player (422 for anyone else, whom "the DM simply runs"); the client took
  every refusal as "nothing was done". A table with no player's device — or a hero whose seat is
  empty — could not take that hero's turn. `use-action.ts` goes on with the command on 422.
- **The suggested turn was English in a Russian table** («Гоблин-налётчик moves toward Эловен
  Старвиспер, the nearest hostile (30 ft away)», «Выполнить предложенное: move»). Both places
  that show it read the suggestion's own command now; "move" and "spell" have their Russian
  words on the Encounter page's button.
- **A result covered the slip's buttons** on a wide screen (the journey could not press "The
  whole Encounter page" after a creature's attack): a result lies above the slip.

## New phrases of the interface (the session's, for the owner to read)

«Ход на карте» (a screen reader's label), «Ходить за героя», «Ответить за: {name}», «Сделать этот
ход», «Вся схватка», «Закончить бой», «Закончить бой для всех?», «Да, закончить»; a creature's
suggested turn: «атаковать — {target}», «сотворить заклинание», «сотворить заклинание — {target}»,
«подойти к ближайшему противнику», «закончить ход»; in the DM's history: «Ход, сделанный с
карты»; while a hero's turn is taken: «Вы видите то, что видит {name}. Когда ход закончится, вы
снова мастер.»; the board's hint for the DM (replaces «Мастер действует за существ через
инструменты схватки (предложенный ход).»): «Нажмите на фигурку, затем на клетку — и переставьте
её. Действия хода — на листке внизу.»; on the Encounter page's button: «перемещение»,
«заклинание» (the tactic's word). Every other word was in the product.

## Files

New: `apps/web/src/combat/dm-turn.tsx`, `suggestion-words.ts`,
`tests/e2e/fight-from-map.spec.ts`. Changed: `combat/stand-in.ts` (`untilDone`,
`ActingContext`, `useReturnWhenDone`), `combat/fold-out.ts` (paper from a tablet up),
`combat/dm-controls.tsx` and `combat/hud/side-panel.tsx` (words), `world/combat-stage.tsx`
(the way back), `session/app.tsx` (the context), `session/acting-bar.tsx`,
`exploration/use-action.ts` (`recordReason`), `shell/reserved-height.ts` (`--turn-h`),
`dm/dm-sheets.tsx` (the mount), `styles/fold-out.css`, `i18n/ru-book.ts`, `ru-play.ts`,
`ru-visual.ts`, `tests/e2e/fixtures/combat-campaigns.json` and
`apps/server/src/testing/ui-combat-campaigns.ts` (the journey's campaigns),
`playwright.config.ts` (the journey joins the iPad project). With this stage's pull request
also the record of the owner's word, `docs/BOOK_SECOND_PASS_PLAN.md` and the root `AGENTS.md`.

## Verification

| Check                                                                        | Result                                   |
| ---------------------------------------------------------------------------- | ---------------------------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`               | pass                                     |
| `pnpm run context-budget`                                                    | pass                                     |
| `pnpm run test` (unit)                                                       | 5,127 of 5,127                           |
| `fight-from-map.spec.ts`                                                     | Chromium 2 of 2, the iPad project 2 of 2 |
| Chromium and the iPad project, every journey but `party-known` and the voice | 415 of 421 on the first whole run        |
| The six that failed, with the fight's journeys, after the fixes (Chromium)   | 26 of 26                                 |
| The iPad project (WebKit) after the fixes                                    | 31 of 31                                 |

The six failures of the whole run were this stage's own and are fixed: four journeys met two
buttons named "Close reaction window" (the slip showed the reaction window under the open
Encounter page; under a page the slip is not drawn now); on a wide screen the slip reached into
the right margin over a brush's card (it keeps to the map's own width); and at 768 px the legend
in the right margin scrolled with nothing in the keyboard's reach (the legend never scrolls now;
a card of what is chosen does, with its Close). After those fixes the whole Chromium suite was
not run again on this branch: it runs with the next stage, stacked on this one, and on CI.

Looked at by eye on the lighthouse's fight at 1024×768 and 1440×900: the fold-out with a hero's
turn, with a creature's suggested turn, with the question before the end; a hero's turn taken and
given back. Not run: `party-known`, `voice.spec.ts`, the `webkit` project of the release
journeys, the native shells, a real tablet.

## Left

- Acting for a hero is still done in that hero's own view (what the character sees, the acting
  bar): it begins with one press and ends by itself, but the screen does change for the turn.
- A creature's own actions with a save, legendary actions and a readied attack are on the
  Encounter page, one press away.
- If a fight ends while the DM holds a hero's turn, "Stop acting" on the bar brings the DM back.
- The history says "another reason: a turn taken from the map" for a turn taken there.
