# Stage 540 completion — the whole game, audits and release

Work order `work-orders/STAGE_540.md`; 2026-11-01.

## The whole game in the browser

`tests/e2e/a-to-z.spec.ts` plays the Missing Caravan with the DM and the player at one table: Mira's
account, the site and its evidence, the wheel's sawn spokes, a theory for the party, the ambush
started by the DM from the Encounter sheet, Elowen's longbow shot rolled by the server with the dice
flying, the fight ended, the return to the market square, the party's evidence shown to Mira, the
Journal's quest Completed with every step, a long rest and a Wizard level the player's sheet shows.
It passes in about 22 s. The HTTP playthrough (`apps/server/src/scenario/`, EN and RU) reaches the
same ending.

## Gaps found on the way, fixed

- A fight that began kept the selection's panel open (a place's read-only actions), squeezing the
  battlefield into a strip where the ambushers' squares could not be chosen: the panel now steps
  aside when a fight begins (`world/use-fight-takes-stage.ts`), focus going to the world.
- The perspective's chosen name was cut at 320 px: below 360 px it takes a row of its own.
- The pull request's CI showed that a roll's plate never appeared on a runner whose software WebGL
  loaded the dice engine slowly (the plate waited for the engine): who rolled and for what now
  show at once, the engine's first load and a landing are waited for a bounded time, and a page out
  of sight shows the numbers without a throw. A browser without WebGL has its own journey
  (`dice.spec.ts`, `ui-dice-plain`).
- A result shown inside the character sheet lay over the sheet's last lines (the features under
  the attacks), which could not be scrolled clear: the sheet now keeps room for it at every width
  (`rest.spec.ts`, `ui-rest-notice`).
- (Stage 530, same pass) the short rest's banner over the place's card and the side panel; the
  knowledge card's raw "Recorded at" time.

## Audits

- Layout audit (1440, 768, 390, 320; dark and light) of the world, the DM's sheets, the Journal and
  the character sheet in a rest, and of the top bar for the DM and the player: no errors or
  warnings left (spacing information only).
- axe at three widths in `rest.spec.ts`, `dice.spec.ts`, `items.spec.ts`, `character-sheet.spec.ts`
  and `accessibility.spec.ts`.

## Release

Waits for the owner's merge of the program's pull request (one question, at the end). Then: a VPS
backup, the review campaign's reset (the item fixtures changed; `deploy/RUNBOOK.md` §12), the build
and deploy of the merged main, `/api/readyz`, and a new DM link delivered privately.
