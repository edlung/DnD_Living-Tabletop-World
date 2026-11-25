# The second pass, reviewed — fixes from the accessibility and design reading

The owner's standing rule for any interface work (his global instructions): before reporting it,
look at every screen, run the UX passes that are installed (design critique, accessibility
review, copy) and fix what they find without being asked. For Stages 1160–1210
(`docs/BOOK_SECOND_PASS_PLAN.md`) the passes were run for Stage 1150 only; this order closes
that. ADR 0075 §23. Stacked on `claude/stage-1210-book-details` (pull request 104). Nothing here
is a new feature, a new command, a new route or a contract change.

## Scope

- **The fight's question keeps the focus.** "End the fight" on the map's slip
  (`combat/dm-turn.tsx`) and "End encounter" on the Encounter page (`combat/dm-controls.tsx`)
  are replaced by their question and two answers: the careful answer takes the focus, the button
  gets it back when the question is withdrawn (`shell/asked-focus.ts`); the slip's question
  names its group.
- **A phone's "More"** (`shell/top-bar.tsx`): a choice that closes the list hands the focus to
  "More".
- **A phone's head** (`styles/phone-head.css`): "More" and the hero's plate 44 px high in the
  same head of 48; nothing rolled yet, the dice foot shows no line.
- **The heroes' cards** (`styles/dm-screen.css`): the actions at each card's foot, one line
  across a row.
- **One sentence reworded** (`i18n/ru-visual.ts`), the board's hint for the DM, written in
  Stage 1160: the goal first, then the two presses.

## Out of scope

Anything the reading found that is a matter of taste or of the product's words the owner has
already read: listed in the report for him, not changed.

## Acceptance

- `fight-from-map`, `combat-lifecycle`, `phone-head`, `pages-by-tasks` hold the changes; the
  heroes' cards' check fails without its rule.
- Static checks, unit tests, the neighbouring journeys and the iPad project pass.
- The Party's page, a phone at 390 and 320 px and the fight's question are looked at.
