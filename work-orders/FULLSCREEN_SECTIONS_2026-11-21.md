# Work order: full-screen sections (2026-11-21)

Owner request, 2026-11-21, in the session: «нажатие на панели, где сцена, места, журнал и так
далее, все эти разделы должны быть полноэкранными с возможностью закрытия. Размести на каждом
экране все внутренние элементы так, чтобы все было под рукой, на виду, функционально, интуитивно
понятно и минимум скроллинга.»

## Scope

- The frame (`apps/web/src/shell/sheet.tsx`, `styles/sheet.css`): every dock sheet takes the
  whole stage at every width (it rose over the lower 46 % of a laptop's stage; a phone's already
  took the screen). The dock stays in reach over the section's foot as the way between sections.
  A section closes by a Close button with its word, by Escape and by its own dock button (and by
  Scene); focus returns to the dock button. A result of an action shows over the section, whose
  content scrolls clear of it. The player's quiet row (the hint, the way to a pause) waits under
  an open section. What the table asks (a rest, a check, a break, a finished adventure's card)
  stands under the section's header and the section's content starts below it (`--asks-h`,
  `alerts/slot-room.ts`), so no card lies over a section's Close or its controls.
- The content (`styles/sheet-layouts.css`), from 1000 px wide and 600 px tall:
  - Places: the map on the left, as large as the height allows, the choice of place and every
    destination on the right.
  - Journal: three panes that scroll on their own — quests, envelopes, handouts, hypotheses and
    the fight in words; remembered events; the known, with a field to find by name and a kind to
    keep (`world/journal-known.tsx`). Two columns on a tablet held upright.
  - Dice: the roll, the check and the tables in two columns of cards beside the rolls; this
    screen's settings under the rolls.
  - Party: every character in one row over the DM's tools in columns of cards.
  - Session: its blocks in balanced columns.
  - Encounter: the ready fights beside a fight with who is here; while a fight runs, the turn
    order with the bestiary beside its light, its end and acting for a player.
  - Add to the world: the words for the AI beside the editors by hand. Chat: a column that reads.
  - Forms are as tall as what they ask: how a check is rolled and whom a tool concerns stand side
    by side, a check's character and skill share a row, a character's four actions take two rows.
- No contract, server, domain or rules change; no control is removed or hidden behind a new
  choice. One journey changed a step: with a section open the scene is covered, so
  `rest.spec.ts` closes Time and weather before it presses a character on the party's rail.
- Journey: `tests/e2e/section-screens.spec.ts` (the section fills the stage and closes three ways;
  Places and the Journal need no scrolling at 1440×900 and 1024×768; the Journal's find and kind).

## Known limits

- Party and Session hold nine and eight blocks of forms: laid out in columns they still scroll
  about one screen at 1440×900 (Party scrolled nine times its window before). Bringing them to
  one screen would need one tool open at a time; the owner chose to leave them as they are
  (2026-11-22, in the session: «Оставить так»).
- The Players and Table screen sheets (invitation sign-in only) take the stage like the rest;
  their content keeps its own layout.

## Out of scope

Merging and deploying stay the owner's.
