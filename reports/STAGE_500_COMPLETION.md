# Stage 500 completion — character sheet and character cards

Work order `work-orders/STAGE_500.md`; program `docs/PRODUCT_COMPLETION_PLAN.md`. Date 2026-11-01.

## What changed

- Contracts: all 18 SRD skills in `SKILLS`; `CharacterDerived` beside the sheet response.
- Rules/server: `deriveCharacter` (level, proficiency, abilities and saves, 18 skills, initiative,
  passives, spell DC/attack per source, spells' rule data, weapon attacks, carrying capacity) added
  by the sheet route; who may read a sheet is unchanged.
- Client: the character dialog (modal like the Chronicle) with the card (portrait in the GPT ring,
  level badge, class line, hit points bar, armor class, speed, initiative, proficiency, conditions and
  concentration) and tabs Overview (abilities and saves, attacks, features, death saves), Skills
  (passives, 18 skills by ability with proficiency marks), Spells (sources, slots as pips, spell cards
  with the GPT catalog art and the project's own words), Inventory (the pack, formerly the Items
  sheet). The dock's Items becomes Character; "Full character sheet" opens the dialog (DM: any sheet).
  An action's result shows inside the dialog while it is open. "Follow a lead" no longer shows an empty
  heading. Russian for every new string.

## Verification

- Unit: 3468 tests (new: derived numbers in `apps/server/src/http/character-routes.test.ts`).
- Browser: `tests/e2e/character-sheet.spec.ts` (EN content, RU reads only Russian, axe and no
  sideways scroll at phone/tablet/desktop), updated `items.spec.ts`, `details-and-scenes.spec.ts`,
  `session-lifecycle.spec.ts` (keyboard tabs) — all green locally.
- Layout audit (ui-layout-audit) on every tab at 1440/768/390/320: no errors in the dialog; one
  pre-existing finding outside it (the perspective select clipped at 320 px), left for Stage 540.
- Lint, typecheck, Prettier, context budget: clean.

## Adversarial notes

- Knowledge boundary: `derived` is computed from the already-authorized sheet only; another player's
  character still has no sheet (404 indistinguishable, unchanged tests).
- A modal hides the world behind it: the result notice moves inside the dialog, so item actions are
  never silent.
