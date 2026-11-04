# The Gameplay Toolbox's mechanics (`packages/rules/src/toolbox/`)

Curated data the World Engine applies (docs/adr/0055-rules-reference-and-toolbox.md §4): the eight
example traps (`traps.ts`: each tier's save, damage, darts and fall) and the three magical
contagions (`contagions.ts`: the save against infection, what it gives at once, the save that
fights it). Every number comes from the SRD's words in `../srd/rules-sections.json`; the tests
beside each file hold them there. Decisions live in `@ltw/combat` (`toolbox.ts`, `contagions.ts`).
