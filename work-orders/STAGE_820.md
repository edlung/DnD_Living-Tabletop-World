# Work Order — Stage 820: "What can I do?"

Authority: the owner's word of 2026-11-16 (`reviews/OWNER_TABLE_IDEAS_2026-11-16.json`, quoted as
relayed) and the standing word to follow a plan without asking, applied by the sessions' reading;
program `docs/TABLE_IDEAS_PLAN.md` (section 820); ADR 0073 §3, written with the stage. Branch
`claude/stage-820-what-can-i-do`, stacked on Stage 810's.

## Deliver

1. **"What can I do?" on a player's own screen** while a session is open, beside "Ask for a
   pause": a page in plain words — in a fight what is left of the turn and the hero's own
   options; on another's turn that the hero waits; outside a fight the scene and the places.
2. **What is left of a turn in the fight's view**, for the combatant's own player and the DM: the
   action, the bonus action, the reaction, feet of movement, attacks left.
3. **Three ways on**: to Places, to the hero's sheet, to the rules reference.

## Session's decisions (the owner asked not to be asked; each may be overruled)

- All of ADR 0073 §3.
- The hint is a button the player presses, not a card that appears: a child who knows what to do
  is not interrupted, and the one who does not has one place to ask.
- It lists what the rules allow now, never what is wise: no "you should attack".
- The last line of every page is "Say it aloud. The DM decides what happens: you are not limited
  to the buttons." — the most important thing a new player does not know.
- The own actions get one plain phrase each ("Dodge — be harder to hit until your next turn");
  the rules' own names stay, so the buttons and the page say the same word.
- The DM's view carries every combatant's budget; the DM's screen does not show it yet.
- The plan's "each line leads to the control that does it" is kept for three lines only: a line
  about the map cannot press the map for the reader.

## Boundaries

No migration, no table, no event, no command. No AI. One additive field in one view; an older
client ignores it, and the hint works without it (a shorter page). No art drawn or generated (the
UI kit's `ask` glyph). Nothing is deployed; merging is the owner's word.

## Checks

- Unit: the view's `turn` per viewer — the character's own, a foe's for a player, the party's
  view, a table display, the DM; as feet, the action and Dash are spent; off the turn. The hint's
  model: a fresh turn, a spent one, attacks left, spell slots, a server without the budget,
  another's turn, a hidden turn, down, fallen, not in the fight, the scene; a Russian word for
  every line.
- Journeys: `turn-hint.spec.ts` (Chromium, WebKit on an iPad): the hint through a turn — fresh,
  after a move, after Dodge, after End turn — with what the page read held to the player's
  boundary; outside a fight, and the way to Places; no button for the DM; in Russian.
- A look at the new screens at 1440, 768, 390, 320 and 832×400 in both languages; an independent
  UX, copy and accessibility pass.
- Format, lint, typecheck, context budget, unit and integration tests, build, the whole e2e
  suite; an adversarial pass recorded in the report.

## Done

`reports/STAGE_820_COMPLETION.md`, status `AWAITING_OWNER_DISPOSITION`, with the first
checkpoint of the program (Stages 800–820); a pull request stacked on Stage 810's.
