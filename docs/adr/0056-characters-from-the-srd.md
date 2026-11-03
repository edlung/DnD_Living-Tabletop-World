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

## Notes from the implementation (Stage 660b, 2026-11-03)

- The import reads what a class and a background give a new character into their `creation`
  data (`scripts/srd/creation.ts`): the Hit Point Die, saving throws, the skills to choose, tools,
  and each starting equipment option as catalog items found by name, gold, and the picks the words
  leave to the player (an instrument, a holy symbol, a gaming set). A wizard's spellbook is the
  SRD's Book; the SRD's gear names no other.
- The client sends only the builder's choices (`characterChoicesSchema`); the rules build the
  level 1 sheet (`packages/rules/src/builder/`) and the World Engine records `CreateCharacter`
  through a port, as combat's: the character, its sheet, its starting items (what does not stack
  one at a time, gold as crowns in stacks of at most 99), the body armor and shield worn through
  `EquipItem` from the unarmored Armor Class (Unarmored Defense's for a Barbarian or a Monk), and
  its player — all or nothing. The species' gains come from its traits' words (size, Speed,
  Darkvision, resistances, a lineage's cantrips and spells).
- The World Engine rolls the scores of the "rolled" method from the command's own dice (4d6, the
  lowest dropped, six times), the highest to the ability the player ranked first: no roll waits
  between two commands. A preview uses average dice and draws none.
- The DM makes a character on the Players sheet, for the player of a character or nobody's yet
  (an invitation then seats a player); a seated player makes one of their own from the character
  dialog. A player's actor never leaves the server. Each problem the builder finds is a sentence
  with its parameters, worded by the client; a test holds every one to its Russian.
- The classes', species', backgrounds' and feats' words are Russian in a Russian campaign: the
  translation pass (ADR 0055 §5) takes a class in parts small enough for one batch — its head (name,
  core traits, the features table's names, the subclass's line), each feature, sidebar and option —
  and a species, a background or a feat whole (`russian-characters.ts`, 314 parts); a part whose
  English changed reads in English until made again. A species' options keep their English values
  in the choices and show their words from the table in the campaign's language.

## Notes from the implementation (Stage 660c, 2026-11-03)

- The SRD's Character Advancement table (experience and proficiency bonus by level) is read with
  the classes (`scripts/srd/advancement.ts`, `packages/rules/src/srd/advancement.json`). The sheet
  keeps its experience and the levels the DM granted to take (`experience`, `pendingLevels`).
- The DM awards experience on the Party sheet, divided evenly among the characters ticked, what
  does not divide left over; or grants a level to take (a milestone). A character with its next
  level's experience, or a level granted, takes it from its Overview: the class (a new one only
  with 13 in the primary abilities of every class it would have, and the skill it gives where its
  "As a Multiclass Character" names one), the hit points fixed or rolled by the World Engine, and
  what the level asks — read from the class's features table: an Ability Score Improvement or a
  General feat (an Epic Boon at 19), the subclass at 3, a Fighting Style, Expertise, Eldritch
  Invocations, Metamagic, Weapon Mastery, cantrips, prepared spells and a Wizard's spellbook. The
  rules build the next sheet (`packages/rules/src/builder/level-up.ts`), a raised Constitution
  adding its hit point to every level before, and the World Engine records it; the DM may take a
  level for any character.
- A level's features are named in the campaign's language from the translated features table.
- Stage 530's milestone level — the DM's "Grant a level", which added the hit points and spell
  slots and left the level's choices to the DM — gives way to this: one way to a level, with its
  choices made and checked.

## Notes from the implementation (Stage 660d, part 1, 2026-11-03)

- The class resources are counted by the rules (`packages/rules/src/features/resources.ts`) from
  the features table's columns (Rages, Channel Divinity, Wild Shape, Second Wind, Focus Points,
  Sorcery Points) or the feature's words (Action Surge, Indomitable, Lay on Hands' 5 × level,
  Bardic Inspiration's Charisma modifier, Innate Sorcery, Arcane Recovery, Magical Cunning). The
  sheet keeps what is spent (`featureUses`), a Rage while it lasts and a Bardic Inspiration die
  held; the derived view shows each resource with what is left.
- `UseFeature` is a player command the combat engine decides in a fight or out of one
  (`packages/combat/src/features.ts`): in a fight on the character's turn its Bonus Action or
  action is paid. The engine applies Second Wind's and Lay on Hands' hit points, Lay on Hands'
  end of Poisoned, a Rage (resistance to bludgeoning, piercing and slashing, the Rage Damage
  bonus with Strength attacks, Advantage on Strength checks and saves; refused in heavy armor;
  ended by its player, unconsciousness or a long rest — its extension by attacks is the DM's),
  Action Surge's action (after the action is spent, once a turn, no Magic action with it), a
  Bardic Inspiration die given and rolled by its holder (its addition to the failed test is the
  DM's), Patient Defense and Step of the Wind, Arcane Recovery's and Magical Cunning's slots and
  Font of Magic. Channel Divinity, Wild Shape, Flurry of Blows, Innate Sorcery and Indomitable are
  spent with their words for the DM.
- A Short Rest's end gives back one use of Rage, Channel Divinity, Wild Shape and Second Wind and
  all of Action Surge, Focus and (from Bard 5) Bardic Inspiration, and a Warlock's Pact Magic
  slots; a Long Rest gives back all. Font of Magic's slot refills one of that level the character
  expended (a created slot past the table's is the DM's).
- The Overview's Class features section lists each resource with its use and every feature the
  character's levels give in the campaign's language, with its chosen Metamagic and invocations
  (`GET …/characters/:id/features`).

## Notes from the implementation (Stage 660d, part 2, 2026-11-03)

- The features that change numbers are the rules' (`packages/rules/src/features/numbers.ts`) and
  the combat engine applies them: Sneak Attack's d6s once a turn on a hit with a Finesse or Ranged
  weapon with Advantage, or with an ally beside the target and no Disadvantage (its once is the
  Rogue's own turn's; the turn records it); a Champion's Critical Hit on a 19 (18 from 15) when
  the attack hits; Martial Arts' die and Dexterity for Unarmed Strikes and Monk weapons; Fast
  Movement and Unarmored Movement in the walking speed; Danger Sense's Advantage on Dexterity
  saves; Feral Instinct's and Remarkable Athlete's on Initiative (and Athletics); Reliable
  Talent's 10; Evasion on every Dexterity save for half (spells, creatures' actions); Jack of All
  Trades in the skills.
- Unarmored Defense measures donned armor and a shield (`unarmoredArmorClass`): body armor
  replaces a Barbarian's or a Monk's unarmored Armor Class, not 10 + Dexterity, and a shield ends a
  Monk's.
- The derived view lists what the engine applies (`applied`), shown on the Overview.

## Notes from the implementation (Stage 660d, part 3, 2026-11-03)

- Eldritch Invocations (`packages/rules/src/features/invocations.ts`): the spells some cast at
  will are on the Warlock's casting with an `atWill` list — cast free, as often as wished, Armor of
  Shadows, Ascendant Step, Fiendish Vigor and Otherworldly Leap on the Warlock alone, Fiendish
  Vigor's temporary hit points the dice's highest; Agonizing Blast adds Charisma to each Eldritch
  Blast beam, Eldritch Spear 30 ft per Warlock level to its range, Repelling Blast pushes a Large
  or smaller creature hit 10 ft, Eldritch Mind gives Advantage on Concentration saves. A Warlock's
  damaging cantrip is taken to be Eldritch Blast. The rest are the DM's, in their words.
- Metamagic (`packages/rules/src/features/metamagic.ts`, `packages/combat/src/metamagic-
effects.ts`): `CastSpell` names the options (one, or with Empowered or Seeking beside it), their
  cost in Sorcery Points read from the option's words; Quickened casts with the Bonus Action and
  lets no spell of level 1+ share the turn, Distant doubles the range (Touch 30 ft), Twinned adds the
  creature a higher level would, Heightened gives one target Disadvantage on its save, Careful
  spares the caster's allies (or those named) up to its Charisma modifier, Empowered rerolls the
  lowest damage dice of the first roll, Seeking rerolls a missed spell attack once, Transmuted
  changes a listed damage type, Extended gives Advantage on Concentration saves, Subtle opens no
  window for Counterspell. A cast a Counterspell suspends keeps its Metamagic. Fireball takes
  Careful, Heightened, Empowered and Transmuted as the data spells do.
- The turn tray asks a Sorcerer's Metamagic with the spell's slot; the Spells tab marks a spell
  cast at will.

## Consequences

- Stage 660 runs in parts: the data; creation; advancement; features in play; the table's life.
- The character sheet gains its class features' state (resources, choices); old sheets stay valid.
- The classes' and origins' words are English until the translation pass covers them (ADR 0055 §5).

## Invariants affected

Preserves 1, 8 and 9: the builder proposes, the World Engine validates every sheet and every level
and rolls every die; a player sees only their own character's choices.
