# Work Order — Stage 680: Campaign content

Authority: owner approval 2026-11-02 (`reviews/OWNER_FULL_GAME_2026-11-02.json`), program
`docs/FULL_GAME_PLAN.md` (Milestone C, Stage 680); ADR 0058 (written first). Branch
`claude/full-game-c`, with Stage 670.

## Sub-stages (one commit each, the suite green at each)

- 680a — The DM's editors without AI: places, people and creatures made and changed by hand, a story
  object made and left or given, clues and knowledge recorded, quests written and their steps set;
  each through the World Engine, undone from the DM's history as any change. Done: "Make by hand"
  (a place, a person, a creature, a story object, a clue, knowledge, a quest) and "Change by hand"
  on a thing's card, the DM's history listing every edit.
- 680b — The handout library and random tables: handouts kept for later and given from the
  library; random tables the DM writes (a die, its ranges and results) and rolls, the roll the
  World Engine's and the table's to see as the DM chooses. Done: "Keep for later" and the kept
  handouts on the Party sheet (given, changed, deleted; they stay after giving), random tables in
  the Dice sheet rolled by the server for the DM alone or for the table (migration 0036).
- 680c — The workshop with the full SRD: what it generates may name any SRD monster, item and
  spell, checked against the catalogs as the World Engine checks them. Done: the guide lists the
  whole SRD by ID; a package names a bestiary creature by `monster`, its stat block the SRD's.
- 680d — The starter adventure: a new campaign of its own for levels 1–5 in the Ravenford setting —
  its places, people, quests, clues, encounters, treasure, handouts and tables, its pictures made by
  GPT, in English and Russian — begun by the owner as any new campaign, its characters from the
  builder or ready-made; the level-15 slice stays a one-shot.

## Checks at each sub-stage

Format, lint, typecheck, context budget, unit and integration tests, build; the browser suite for
anything a screen shows; the layout audit (1440, 768, 390, 320; light and dark; RU and EN) for every
new screen. What a player may see of the DM's preparation (the library, the tables, an unrevealed
quest step) is tested against the DM's view.
