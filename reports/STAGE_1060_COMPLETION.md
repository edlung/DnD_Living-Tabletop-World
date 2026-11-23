# Stage 1060 completion — the fight as a fold-out

Work order `work-orders/STAGE_1060.md`; program `docs/BOOK_INTERFACE_PLAN.md`; ADR 0075 §6;
2026-11-23. Status: **implemented; not merged, not deployed**. Branch
`claude/stage-1060-fight-foldout`, stacked on Stage 1050's.

## What changed

- **The fight unfolds over the book** on a wide screen: the battlefield lies on a sheet of the
  book's paper across the whole spread inside the binding, with the fold down its middle; the
  place's picture steps aside for the map (`styles/fold-out.css`).
- **The sheet's margins are on paper**: the place and whose turn it is, the active combatant and
  who is at the table on the left, the side cards on the right, the order at the head, the turn
  tray at the foot; a reaction asked or an attack readied lies on it as a slip
  (`combat/fold-out.ts`: the fight's surface; `world/combat-stage.tsx`, `world/scene.tsx`, the
  reaction and readied cards). "Scene" folds it up to the Scene's spread.
- Narrower than 1200 px the fight runs as one column over the dark stage as before, keeping its
  glass; the book's margins are that column's padding now.

Nothing of the fight changed: commands, rules, the board's drawing, battle maps and figures.

## Found and fixed while checking

- On paper the turn tray, captions and the reaction slip of the narrow column were light glass
  over the dark stage, their ink dark: the fold-out became the wide screen's only.
- An action that cannot be taken now was faded to three quarters, which put its small print under
  4.5:1 on paper: on paper its row is dashed instead.
- On a tablet in a fight the place and who is at the table were moved 52 px down by the scene's
  page inset (an offset on a column item), over the switch under them (since Stage 1030): the
  column's padding carries the book's margins now.

## Verification

| Check                                                                            | Result                    |
| -------------------------------------------------------------------------------- | ------------------------- |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run build` | pass                      |
| `pnpm run test` (unit)                                                           | 5,119 of 5,119            |
| Every fight journey and the accessibility ones, Chromium (75, 36 files)          | 75 passed after the fixes |
| The narrow fight's journeys after the last fix (17)                              | 17 passed                 |
| The fight in both books at 1440, 1366 × 650, 1280 × 720, 1024, 834 and 390 px    | looked at                 |

Not run locally: every other journey, the iPad project and WebKit — CI runs them.

## Next

Stage 1070: Heroes, World and Journal as spreads.
