# 0056. Characters from the SRD: classes, origins, feats, creation and advancement

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 660,
  decisions 14, 15 and 16, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Extends ADR
  0051 (the SRD data) to the SRD 5.2.1's Classes (pages 28–82), Character Origins (83–86) and Feats
  (87–88); ADR 0052 (spells), ADR 0045–0050 (the rules in play) and the Stage 530 levels apply.
- Context: a character is a sheet the DM or a package writes; Ravenford's four were built by hand
  from the rules that existed at Stage 605. A table expects to make its own characters from the
  Player's Handbook shelf — species, class, background, abilities, skills, equipment, spells — and
  to grow them to level 20 with their class's features and choices.

## Decision

1. **The SRD's characters as data.** `scripts/srd/classes.ts` reads each class's core traits, what
   it gives as a second class ("As a Multiclass Character"), its features table (level,
   proficiency bonus, features, the class's own columns — Rages, Sneak Attack, spell slots), its
   features by level with their words and tables (a subclass's spells, Beast Shapes, Creating
   Spell Slots), its sidebars, the options its features choose among (the Metamagic options, the
   Eldritch Invocations, each with its prerequisite, cost and whether it repeats) and its subclass
   with its tagline; `scripts/srd/origins.ts` reads the four backgrounds (the three scores they
   raise, the origin feat, two skills, a tool, the equipment), the nine species (type, size, speed,
   and their traits, a lineage's options and tables beside the trait that names them) and the 17
   feats by category with their prerequisites. They are `packages/rules/src/srd/{classes,
backgrounds,species,feats}.json`, held to the SRD by tests (a features table's proficiency bonus,
   the full casters' slots, every feature a table names described, a background's feat an Origin
   feat). The parsers throw on what they cannot read; a table in these chapters has its columns
   written in `scripts/srd/character-tables.ts`.
2. **Creation.** A wizard for a player or the DM: species, class, background (its +2/+1 or
   +1/+1/+1 and its origin feat), abilities by the standard array, point buy or rolls (the World
   Engine rolls), skills, equipment or gold, cantrips and spells; the result is a character sheet
   the World Engine validates (`CreateCharacter`), built only from the SRD's numbers. The DM's
   editors and the workshop use the same builder.
3. **Advancement.** Levels by milestone or by experience (decision 16): the DM awards experience,
   divided among those present; a level brings its hit points (fixed or rolled, the campaign's
   option), its features and its choices — a subclass, an ability increase or a feat, new spells —
   chosen by the player and validated by the World Engine. Multiclassing with its prerequisites and
   what the second class gives.
4. **Features in play.** What the engine applies is data over the effect vocabulary or code with
   its own tests: resources counted and restored at rests (Rage, Focus Points, Channel Divinity,
   Bardic Inspiration, Sorcery Points, Wild Shape, Second Wind, Action Surge, Lay on Hands…), and
   the features that change numbers (Extra Attack, Sneak Attack, Rage's damage and resistance,
   Unarmored Defense…). What it cannot apply shows its words and is the DM's, as for spells.
5. **The rest of the table's life.** Death and the spells that return the dead; a character
   joining mid-campaign at the party's level; a character copied into another campaign as a sheet
   only (decision 15); one account with several characters (decision 14, Stage 630); a printable
   sheet; a portrait made by GPT where the owner's image key allows it. Summons and Wild Shape take
   their forms' stat blocks, the four that a spell's level scales among them.

## Consequences

- Stage 660 runs in parts: the data; creation; advancement; features in play; the table's life.
- The character sheet gains its class features' state (resources, choices); old sheets stay valid.
- The classes' and origins' words are English until the translation pass covers them (ADR 0055 §5).

## Invariants affected

Preserves 1, 8 and 9: the builder proposes, the World Engine validates every sheet and every level
and rolls every die; a player sees only their own character's choices.
