# Work Order — Stage 790: Small comforts

Authority: the owner's word of 2026-11-16, «продолжаем», and the word of 2026-11-15 to follow the
plan without asking (`reviews/OWNER_MEMORY_RITUAL_2026-11-15.json`); the answer that small
comforts join the package; program `docs/MEMORY_RITUAL_PLAN.md` (Part 2, section 790); ADR 0072
§3, written with the stage. Branch `claude/stage-790-small-comforts`, stacked on Stage 780's
branch (PR 44, not merged). The work moved to a cloud session on the owner's word of 2026-11-16,
«перенеси часть работы в облако».

The plan wanted Part 2 re-read against the family playtest, which "decides which of them are
worth their screens". It has not happened: the three comforts are built small, each can be left
unused, and none changes what was there.

## Deliver

1. **Text size for each viewer**: three steps, kept beside the dice settings in the browser;
   every page of a person's screen follows; the table's display and paper do not.
2. **A break reminder for the DM**: off by default, after 60 or 90 minutes of an unpaused
   session; a quiet card offers a break, which pauses the game and shows a "Break" title card on
   the table's screens through the `title` cast that exists; "Back to the game" brings the
   table back.
3. **Cheers at the table**: five fixed marks as system emoji text; shown for a moment on every
   screen and the table's display; held in the server's memory for a few seconds and never
   stored; read through the live inventory.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- All of ADR 0072 §3.
- They are called "cheers", not "reactions": a reaction is a rule of the fight (ADR 0046), in
  both languages.
- The marks are the system's emoji as text: the plan's open point "the reactions' art" is
  settled without drawing or generating a set.
- A finished campaign still takes a cheer (named in `apps/server/src/ending/guard.ts`); an away
  campaign refuses it; a paused game takes it.
- The break's count is the DM's browser's own: no server state, no new route, no new cast kind.
  A pause of five minutes, or ten with the screen away, starts it again.
- The table's display has no text size: its type is sized by the screen.
- From the independent pass, taken as decisions: the row of marks is labelled "Without words";
  the text size has a second door on the first page of "How to play"; the break lasts while the
  game is paused, whoever resumes it.

## Boundaries

No migration, no table, no event, no world state. No new cast kind. No AI. No art drawn or
generated. Nothing of a cheer is stored, logged or listed in a person's copy. No free text in a
cheer. Nothing is deployed; merging is the owner's word.

## Checks

- Unit: the board of cheers (held, gone, bounded, copies); who gives and who reads over HTTP — a
  player, the DM, the party's view, a table display, a stranger; the rate; a finished campaign;
  the live signal through the shared board; the live inventory; the break's count (due, a short
  and a long pause, a screen away, "later", a break on, what the browser kept).
- Journeys: `comforts.spec.ts` (Chromium, WebKit on an iPad): the text size kept through a
  reload, a cheer on both screens and gone from the server, the reminder, the break, the table
  back; `comforts-screens.spec.ts`: the cheer and the break on the table's screen.
- A layout look at 1440, 768, 390, 320 and 832×400 in both languages, the main screens at each
  text size; an independent UX, copy and accessibility pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e
  suite; an adversarial pass recorded in the report.

## Done

`reports/STAGE_790_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, a pull request stacked on
Stage 780's.
