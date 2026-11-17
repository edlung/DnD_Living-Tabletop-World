/**
 * Where a fight keeps a player's quiet row — "What can I do?" and the way to a pause
 * (docs/adr/0073-table-ideas.md §2–3): an element of the fight's own layout, drawn by
 * `combat-stage.tsx` and filled by `session/lobby-banner.tsx`, so the row lies clear of the turn
 * order on every screen.
 */
export const FIGHT_QUIET_ID = 'fight-quiet';
