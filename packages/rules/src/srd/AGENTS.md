# The SRD 5.2.1 catalogs (`packages/rules/src/srd/`)

Generated data (docs/adr/0051-srd-data.md §2). `spells.json`, `monsters.json` and
`spell-mechanics.json` (docs/adr/0052-spells-as-data.md §2), `monster-blocks.json` (each stat
block's engine stats, docs/adr/0053-monsters-as-data.md §1), `equipment.json` (the Equipment
chapter) and `magic-items.json` (Magic Items A–Z, docs/adr/0054-items-as-data.md §1; their catalog
entries go to `packages/contracts/src/items/srd/`) are written by
`scripts/srd/import.ts` from the lines `scripts/srd/pdflines.swift` reads out of the SRD 5.2.1 PDF,
which stays outside the repository. Never edit them by hand: change the parser (or its list of the
SRD's misprints, `scripts/srd/monsters.ts`; the curated mechanics, `scripts/srd/spell-curated.ts`)
and import again; the same lines give the same files.

- `glossary.json` (the Rules Glossary's entries and abbreviations) and `rules-sections.json` (the
  Gameplay Toolbox and the magic items' rules as sections) are read by `reference.ts` alone
  (`SRD_GLOSSARY`, `SRD_ABBREVIATIONS`, `SRD_RULES_SECTIONS`, `srdGlossaryEntry`, `srdRulesSection`);
  `reference.test.ts` holds them to their schemas (docs/adr/0055-rules-reference-and-toolbox.md).
- `classes.json`, `backgrounds.json`, `species.json` and `feats.json` (the SRD's characters,
  docs/adr/0056-characters-from-the-srd.md §1) are read by `classes.ts` (`SRD_CLASSES`,
  `srdClass`) and `origins.ts` (`SRD_BACKGROUNDS`, `SRD_SPECIES`, `SRD_FEATS`, `srdBackground`,
  `srdSpecies`, `srdFeat`); `classes.test.ts` and `origins.test.ts` hold them to the SRD.
- `catalog.ts` is the only reader: `SRD_SPELLS`, `SRD_MONSTERS`, `SRD_SPELL_MECHANICS`,
  `SRD_MONSTER_BLOCKS`, `SRD_EQUIPMENT`, `SRD_MAGIC_ITEMS`, `srdSpell`, `srdMonster`,
  `srdSpellMechanics`, `srdMonsterBlock`, `srdEquipment`, `srdMagicItem`.
- `catalog.test.ts` holds every entry to its contracts schema, checks the SRD's arithmetic and
  that every number of a spell's mechanics comes from its text.
- The text layer is English as the SRD gives it; the attribution is in `NOTICE.md` and on the
  app's About page. Query the JSON narrowly (`rg`, a slug), never load it whole into context.
