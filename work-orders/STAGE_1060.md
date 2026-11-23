# Work Order — Stage 1060: the fight as a fold-out

Authority: the owner's words of 2026-11-23 (`reviews/OWNER_BOOK_INTERFACE_2026-11-23.json`), the
demo accepted («Принимаю, дальше»); program `docs/BOOK_INTERFACE_PLAN.md` (section 1060, decision
8); ADR 0075 §6, written with the stage. Branch `claude/stage-1060-fight-foldout`, stacked on
Stage 1050's.

## Deliver

1. The battlefield as a fold-out on the book's paper inside the binding, the fold down its middle,
   the place's picture stepping aside, where the fight lies across the spread (a wide screen;
   `apps/web/src/styles/fold-out.css`, `apps/web/src/combat/fold-out.ts`).
2. The fight's own parts — the order and whose turn it is, the active combatant, the side cards,
   the turn tray, a reaction or a readied attack, the place and who is at the table — on the
   book's paper (`usePaperSurface` in `shell/sheet.tsx`; `world/combat-stage.tsx`,
   `world/scene.tsx`, `combat/*-prompt.tsx`, `combat/readied-card.tsx`).
3. ADR 0075 §6; `reports/STAGE_1060_COMPLETION.md`.

## Boundaries

No command, rule, projection or board drawing changes. The fight's layout (battle-layout.css)
keeps its places; this stage dresses it.

## Checks

Typecheck, lint, format, build, unit, every fight journey and every journey in every project, the
fight looked at in both books at 1440, 1280 × 720, 1366 × 650, 1024 and 390 px, contrast measured
by the accessibility checks.
