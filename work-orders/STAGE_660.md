# Work Order — Stage 660: Characters

Authority: owner approval 2026-11-02 (`reviews/OWNER_FULL_GAME_2026-11-02.json`), program
`docs/FULL_GAME_PLAN.md` (Milestone B, decisions 14, 15 and 16); ADR 0056 (written first). The SRD
5.2.1 PDF the owner allowed on 2026-11-02 stays outside the repository; its lines are read by
`scripts/srd/import.ts` as for Stage 650.

## Sub-stages (one commit each, the suite green at each)

- 660a — The data: the twelve classes (core traits, what a second class gives, the features table,
  the features by level with their tables, sidebars, the Metamagic options and Eldritch
  Invocations, the subclass with its tagline), the four backgrounds, the nine species and the 17
  feats, read from the SRD into `packages/rules/src/srd/{classes,backgrounds,species,feats}.json`;
  contracts' schemas, accessors in `@ltw/rules`, tests that hold them to the SRD (proficiency
  bonus, the full casters' slots, every feature its table names described, a background's Origin
  feat, a lineage's table beside its trait). Their Russian through the translation pass (ADR 0055
  §5), held complete by the test. Done: the data and its
  Russian (314 parts).
- 660b — Creation: the wizard for a player or the DM (species, class, background with its +2/+1 or
  +1/+1/+1 and its origin feat, abilities by the standard array, point buy or the World Engine's
  rolls, skills, equipment or gold, cantrips and spells); `CreateCharacter` validated by the World
  Engine from the SRD's numbers; the DM's editors and the workshop use the same builder. Done: the
  builder and its routes, the DM's way in on the Players sheet and a player's in the character
  dialog; the DM's editors and the workshop take it with 680's editors.
- 660c — Advancement: experience awarded by the DM and divided among those present, or milestones
  (decision 16); a level's hit points (fixed or rolled), features and choices (a subclass, an
  ability increase or a feat, new spells); multiclassing with its prerequisites. Done: the
  experience table, the DM's award and granted levels, the level dialog for the player or the DM;
  Stage 530's milestone level gives way to it.
- 660d — Features in play: resources counted and restored at rests, the features that change
  numbers, the options chosen (Metamagic, invocations); what the engine cannot apply shows its words
  and is the DM's. Part 1 done: the resources, `UseFeature`, a Rage's numbers, the rests, the
  Overview's Class features and every feature's words. Part 2 done: the features that change
  numbers and Unarmored Defense with armor.
- 660e — The table's life: death and the spells that return the dead, a character joining
  mid-campaign, a character copied into another campaign as a sheet (decision 15), a printable
  sheet, a portrait by GPT, the four summons a spell's level scales and Wild Shape's forms.

## Checks at each sub-stage

Format, lint, typecheck, context budget, unit and integration tests, build; the browser suite for
anything a screen shows; the layout audit (1440, 768, 390, 320; RU and EN) for every new screen.
