# The SRD's item catalog entries (`packages/contracts/src/items/srd/`)

Generated data (docs/adr/0054-items-as-data.md §2, §5). `equipment.json` holds the catalog entries
the World Engine applies for the SRD's equipment — category, slots, stack, weight, worth, armor,
shield, weapon, ammunition, effect — and `magic-items.json` those of its magic items — rarity and
worth, attunement, bonuses, charges, a curse, the bases one may be made on — written by
`scripts/srd/import.ts` (`scripts/srd/item-catalog.ts`, `scripts/srd/magic-catalog.ts`) beside the
text layer in `packages/rules/src/srd/{equipment,magic-items}.json`. Never edit them by hand: change
the derivation and import again.

- `catalog.ts` is the reader (`SRD_ITEM_CATALOG`, `srdItemEntry`), reached only through the second
  entry point `@ltw/contracts/srd-items` (docs/adr/0004-module-boundaries.md, 2026-11-02
  amendment): the domain and the server read it; browser packages may not, so the browser's bundle
  never carries it. The domain reads an entry of either catalog through `itemEntry`.
- Ids are `srd-` and the SRD name's slug; never renamed or reused. Russian words are the English
  ones, marked `untranslated`, until the translation pipeline (Stage 650e).
- `catalog.test.ts` holds every entry to the schema and keeps Ravenford's names Ravenford's.
