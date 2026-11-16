# Work Order — Stage 810: A short way to a pause

Authority: the owner's word of 2026-11-16 (`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`, quoted as
relayed) and the standing word to follow a plan without asking, applied by the sessions' reading;
program `docs/TABLE_IDEAS_PLAN.md` (section 810); ADR 0073 §2, written with the stage. Branch
`claude/stage-810-short-way-to-a-pause`, stacked on Stage 800's.

## Deliver

1. **"Ask for a pause" on a player's own screen** while the game plays: one press, then a line
   that says only the DM was told, and later that the DM has seen it.
2. **A card on the DM's screen and nowhere else**: who asks, "Pause the game", "Not now".
3. **A request held in memory**: one a character, gone when answered or aged out; no chat
   message, no table.
4. **"Our table" in the guide** uses the same request.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- All of ADR 0073 §2.
- The button is in the column of the table's questions over the stage, small, there for the
  whole evening: not in the dock (full on a phone) and not in the top bar (an icon a child would
  not read).
- A request is asked only of a game in play: between sessions and while the game is paused the
  button is not shown, and the guide offers only the word to the DM.
- The DM's card makes no sound: a chime on the DM's device would tell the table that someone
  asked.
- "Not now" is told to the asker as "The DM has seen that you asked for a pause" — true, and
  not a refusal a child has to read.
- The request leaves chat: the fixed message "I would like a pause, please." is gone.

## Boundaries

No migration, no table, no event, no world state. No words in a request. Nothing on the table's
display. No AI. No art drawn or generated (the UI kit's `time` glyph). Nothing is deployed;
merging is the owner's word.

## Checks

- Unit: the board (one a character, the minute, seen and gone, aged out, the pause, the session's
  end, copies); the routes per role — the asker, another player's character, the party's and the
  public view, the DM, a stranger, nobody, a table display; a body with words refused; the rate;
  no chat message left; the live signal to the DM and the asker and to no other player; the live
  inventory.
- Journeys: `pause.spec.ts` (Chromium, WebKit on an iPad) with the DM, two players and the
  table's screen — the press, the DM's card, the other player's and the TV's screens and what
  they were sent, "Not now", the guide's button, the pause; `pause-words.spec.ts` in Russian;
  `agreement.spec.ts` and `ritual-checkpoint.spec.ts` follow the request's new place.
- A look at the new screens at 1440, 768, 390, 320 and 832×400 in both languages; an independent
  UX, copy and accessibility pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e
  suite; an adversarial pass recorded in the report.

## Done

`reports/STAGE_810_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, a pull request stacked on
Stage 800's.
