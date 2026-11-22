# Work Order — Stage 930: play from the book

Authority: the owner's words of 2026-11-22 (`reviews/OWNER_DM_BOOK_2026-11-22.json`), Stages
900–930 without stops; program `docs/DM_BOOK_PLAN.md` (section 930); ADR 0074 §4, written with the
stage. Branch `claude/stage-930-play-from-the-book`, stacked on Stage 920's. The last authorized
stage: its report is the report to the owner.

A meeting can be run without leaving the book. Every action is a command the product already has.

## Deliver

1. **A check from its card**: choose the hero (or the group), and the product's own check request
   goes out with the card's skill and hidden DC; the result comes back to the card with the
   scene's own line for a failure. "The player rolled at the table" stays possible.
2. **A free roll** from the page's foot, for what the text did not foresee: any hero, any skill,
   a difficulty or none — the same check request.
3. **A clue from its card**: "the party found it" sends the product's own clue and disclosure
   commands; the card and the bookmark "what the party knows" show it.
4. **A handout from its card**: the campaign's handout is given through the product's own
   handouts, and can be shown on the table's screen.
5. **A fight from its card**: the prepared encounter starts in one step, as it does today from
   the Encounter sheet; the right page shows whose turn it is and the product's own controls for
   that turn; the battle map goes to the table's screen by the cast that exists. Ending the fight
   returns to the page.
6. **The table's screen**: the page's picture is cast when the ribbon moves, never when the DM
   reads ahead; a moment's picture and a handout are cast by a button.
7. **A meeting**: start with "Previously…", pause, the break, end — the product's own, called
   from the book; "close the book" keeps the ribbon.
8. **A fork**: the DM marks what the players chose; the book opens the card or the page that
   choice leads to and writes nothing to the world by itself.
9. **The journal** in the book: the campaign's own history, with a way to the page a line came
   from where that is known.

## Session's decisions (each may be overruled)

- All of ADR 0074 §4.
- No command is added to the World Engine for the book. Where the book needs something no
  command gives (a prepared check remembered as played, a fork's mark), it is the DM's own state
  beside the world, as the ribbon is.
- A campaign's handouts are imported into the DM's kept handouts when its book is first opened,
  through the path a DM uses to keep one; they are table material, never world knowledge.
- Words for outcomes, hits and the turning point of a fight are Layer 2 and are not in this
  stage: the card shows the campaign's own line where it has one and the result where it has
  none.

## Boundaries

No new world command, no new rule, no dice of the book's own. A roll a player sees carries no DC
and no clue. No AI. Nothing is merged or deployed; the trial at a real table is Stage 940 and the
owner's.

## Checks

- Unit: each card's command, its permissions and what a player may see of it; the cast on the
  ribbon's move and its absence when reading ahead; the import of handouts (once, no duplicates).
- Integration: stores added in Stages 920–930 against PostgreSQL.
- Journeys (Chromium, and the iPad shell where the runner has it): one meeting of a family
  campaign from the book — start, read, a check asked and answered from a player's phone, a clue
  given, a handout on the table's screen, a prepared fight started, two turns, ended, the meeting
  closed, the book reopened on the ribbon; the same without a fight; a player's client never
  shows the book's text.
- The layout audit and the accessibility pass on every new state.
- Format, lint, typecheck, the context budget, unit, integration, build; `validate:ci-local`.
