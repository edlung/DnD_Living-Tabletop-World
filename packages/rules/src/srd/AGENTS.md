# The SRD 5.2.1 catalogs (`packages/rules/src/srd/`)

Generated data (docs/adr/0051-srd-data.md §2). `spells.json`, `monsters.json` and
`spell-mechanics.json` (docs/adr/0052-spells-as-data.md §2) are written by
`scripts/srd/import.ts` from the lines `scripts/srd/pdflines.swift` reads out of the SRD 5.2.1 PDF,
which stays outside the repository. Never edit them by hand: change the parser (or its list of the
SRD's misprints, `scripts/srd/monsters.ts`; the curated mechanics, `scripts/srd/spell-curated.ts`)
and import again; the same lines give the same files.

- `catalog.ts` is the only reader: `SRD_SPELLS`, `SRD_MONSTERS`, `SRD_SPELL_MECHANICS`, `srdSpell`,
  `srdMonster`, `srdSpellMechanics`.
- `catalog.test.ts` holds every entry to its contracts schema, checks the SRD's arithmetic and
  that every number of a spell's mechanics comes from its text.
- The text layer is English as the SRD gives it; the attribution is in `NOTICE.md` and on the
  app's About page. Query the JSON narrowly (`rg`, a slug), never load it whole into context.
