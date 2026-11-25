# Stage 1200 — a player's phone

Authorized by the owner on 2026-11-25: «Реализуй весь план до конца»
(`reviews/OWNER_BOOK_SECOND_PASS_2026-11-25.json`, `docs/BOOK_SECOND_PASS_PLAN.md`). The plan's
words for this step: «Телефон игрока. Герой и кубик первыми, тонкая шапка». ADR 0075 §21.
Stacked on `claude/stage-1190-shelf` (pull request 102).

## Why

Read on a phone of 390 × 844 in the running product: the head took three rows — the campaign's
name, four icons, the view's select — about 150 px, and a row with the Scene's one tab came under
it; the scene began 200 px down. Nothing on the first screen was the player's own hero. In a
fight the map began 590 px down, under the place's card, the row of who is at the table, the
switch, the turn's line and the order of turns.

## Scope

- **A head of one row** (`shell/top-bar.tsx`, `styles/phone-head.css`): the emblem, the hero's
  plate or the campaign's name, the live mark, «Ещё». The view, how to play, refresh, the account
  and leaving are rows of the list «Ещё» opens.
- **The hero's plate** (`shell/hero-plate.tsx`, written into the top bar by
  `world/world-overlays.tsx`): for a player in their own hero's view — the portrait, the name on a
  line of its own, under it the bar of hit points, their numbers and the Armor Class; a press
  opens the sheet. Mounted, and its sheet read, only on a phone (`PLATE_SCREENS`).
- **No row of tabs for a part with one page** while the stage shows.
- **The d20 first at the page's foot**, larger.
- **A phone's fight without the place's card and the table's row** above the order of turns:
  the whole map stands on the first screen; the bookmarks stay along the bottom with their words,
  on the binding's cloth.
- The Chronicle on a narrow screen has a dark ground of its own (`styles/chronicle.css`): with
  the head thin, its ribbons lay over the scene behind the dialog's veil.

Unchanged: every control's name and what it does; a tablet's and a desktop's top bar; the hero's
sheet; the Dice page.

## Journeys

- `tests/e2e/phone-head.spec.ts` (Chromium, 390 × 844, read-only on `ravenford`): the head of
  one row, the hero's plate and the sheet it opens, «More» and its rows, Escape and a press
  outside, the Scene without its row of tabs and a page with its head row, the d20 first; axe.
- Journeys that reach how to play or leaving on a phone open «More» first (`support/shell.ts`,
  `openTopMenu`): `accessibility`, `guide`, `sign-in-accessibility`. `expectDockFits` looks at the
  tabs that show.

## Known limits

- The hero's sheet is a dialog over the book, as before.
- A phone held wide (a height under 500 px) keeps the top bar of a narrow screen as it was.

## Out of scope

New book materials (Stage 1210). Merging and deployment stay the owner's.
