# Work Order — Stage 800: Client error reports

Authority: the owner's word of 2026-11-16, «приступай к реализации этих улучшений. все что возможно
сделай в облаке, доступ к github у тебя есть.» (`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`, quoted
as relayed), and the standing word of 2026-11-15 to follow a plan without asking, applied to this
program by the sessions' reading; program `docs/TABLE_IDEAS_PLAN.md` (section 800); ADR 0073 §1,
written with the stage. Branch `claude/stage-800-client-error-reports`, stacked on the plan's
(PR 48), which is stacked on Stage 799's (PR 47, not merged).

## Deliver

1. **A report of fixed fields** when a page breaks while drawing, throws an uncaught error or
   leaves a rejection unhandled: how it surfaced, the error's class from a fixed list, the page and
   the part that was open, the browser's family and version, the device's system, the native
   shell, up to three frames of the application's own scripts. Never a message, an address, a
   name or a typed word.
2. **`POST /client-errors`** on the family's own server: anyone who can load the page, a table
   display included; limited by address and as a whole; a campaign believed only for a member of
   it. `ltw_client_errors` (migration 0044): one row a distinct report, counted, removed after
   thirty days, a hundred a campaign.
3. **A plain screen in place of a blank one**, on every page: "Something went wrong", "Load the
   game again"; the table's display loads itself again.
4. **The DM's read**: a line over the stage while something new was reported, the list at the top
   of the Session sheet, "Clear the list". The operator's read: the database (the runbook says
   how).
5. **The privacy notice** names it.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- All of ADR 0073 §1.
- A report does not say who sent it: no account, no character. Whose screen it was is one of
  three words — a player's, the DM's, the table's display.
- The build on a report is the server's (`LTW_REVISION`); the client gains no build ID of its
  own, since the hashed script name in the place already tells builds apart.
- The server's log does not copy a report's fields: the table is the one copy, so "removed after
  thirty days" in the privacy notice is true.
- A request the server refused or the network dropped is not an error of the page and is not
  reported.
- The game's own fallback keeps "Sign out" / "Leave session" beside "Load the game again"; its
  old line about a "world response" is gone.
- From the independent pass, taken as decisions: the DM's list lives on the Session sheet, not in
  a card over the stage; the line over the stage can be put away ("Not now") and comes back only
  for something new; the technical line of each entry is folded under "For whoever looks after
  the server"; the broken screen says a note was sent only when one left.

## Boundaries

No world state, no event, no command. Nothing of a report is in a person's copy of their data (it
names nobody). The table is not moved with a campaign. No third-party service, no SDK, no source
map served. No AI. No art drawn or generated (the UI kit's `warning` glyph). Nothing is deployed;
merging is the owner's word.

## Checks

- Unit: the report's assembly (class, frames per engine, what is dropped, the browser from its
  description of itself); the reporter (what is sent, never twice, five a load, what is not
  reported, never throws); the store (counted, told apart, thirty days, the list's size, cleared);
  the routes per sender — nobody, a player, the DM, a stranger, another campaign's claim, a table
  display; refused fields; the body's size; the limits; the DM's read and clear and nobody
  else's; the live signal to the DM and no player; the live inventory; the DM's words in both
  languages for every value a report can hold.
- Integration: the store on PostgreSQL against the in-memory one; the move's coverage (the table
  is left behind, with its reason).
- Journeys: `client-errors.spec.ts` (Chromium, WebKit on an iPad): a player's screen breaks, the
  report as sent, the DM's line and list, a reload, the list cleared; the same in Russian;
  `client-errors-screens.spec.ts`: the table's display breaks and says so, the DM reads that it
  was the display.
- A look at the new screens at 1440, 768, 390, 320 and 832×400 in both languages; an independent
  UX, copy and accessibility pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e
  suite; an adversarial pass recorded in the report.

## Done

`reports/STAGE_800_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, a pull request stacked on
the plan's.
