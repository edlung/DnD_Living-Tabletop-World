import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseEquipmentTables } from './equipment.ts';
import { parseToolsAndGear } from './gear.ts';
import { catalogEntryOf } from './item-catalog.ts';
import { magicCatalogEntries } from './magic-catalog.ts';
import { magicItemRows, parseMagicItems } from './magic-items.ts';
import { deriveMonsterMechanics } from './monster-mechanics.ts';
import { parseMonsters } from './monsters.ts';
import { parseGlossary, parseRulesSections } from './reference.ts';
import { parseAdvancement } from './advancement.ts';
import { parseClasses } from './classes.ts';
import { parseOrigins } from './origins.ts';
import { deriveMechanics } from './spell-mechanics.ts';
import { parseSpells } from './spells.ts';
import { pageLines, pageRows, srdLine } from './text.ts';

/**
 * Writes the SRD 5.2.1 catalogs into `@ltw/rules` (docs/adr/0051-srd-data.md §2), and the item
 * catalog's SRD entries into `@ltw/contracts` (docs/adr/0054-items-as-data.md §2), from the lines
 * `pdflines.swift` wrote. The same lines give the same files; an entry a parser cannot read stops
 * the import.
 *
 *   swift scripts/srd/pdflines.swift <SRD_CC_v5.2.1.pdf> <lines dir>
 *   node scripts/srd/import.ts <lines dir>
 */
const SPELL_PAGES = [107, 175] as const;
/** Monsters A–Z (258–343) and Animals (344–364). */
const MONSTER_PAGES = [258, 364] as const;
/** Group headings ("Dragons, Red") are set in 18 pt and head no block; block names in 14.8 pt. */
const GROUP_HEADING_PT = 16;

const dir = process.argv[2];
if (dir === undefined) {
  process.stderr.write('usage: node scripts/srd/import.ts <lines dir>\n');
  process.exit(1);
}

const spellLines = pageLines(dir, ...SPELL_PAGES);
const start = spellLines.indexOf('Spell Descriptions');
if (start < 0) throw new Error('no "Spell Descriptions" heading on the spell pages');
const spells = parseSpells(spellLines.slice(start + 1));
const monsters = parseMonsters(
  pageRows(dir, ...MONSTER_PAGES)
    .filter((row) => row.size < GROUP_HEADING_PT)
    .map(srdLine),
);

const write = (name: string, entries: object, into = 'packages/rules/src/srd') => {
  const path = fileURLToPath(new URL(`../../${into}/${name}`, import.meta.url));
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`);
};
const byId =
  <T>(key: keyof T) =>
  (a: T, b: T) =>
    String(a[key]).localeCompare(String(b[key]));
const sorted = [...spells].sort(byId('spellId'));
write('spells.json', sorted);
write('spell-mechanics.json', sorted.map(deriveMechanics));
const bestiary = [...monsters].sort(byId('monsterId'));
write('monsters.json', bestiary);
write('monster-blocks.json', bestiary.map(deriveMonsterMechanics));
// The equipment (docs/adr/0054-items-as-data.md §1–2): its text, and the catalog's entries.
const equipment = [...parseEquipmentTables(dir), ...parseToolsAndGear(dir)];
write('equipment.json', equipment);
const equipmentCatalog = equipment.map(catalogEntryOf);
write('equipment.json', equipmentCatalog, 'packages/contracts/src/items/srd');
// The magic items (§5): their text, and their catalog entries, "+1, +2, or +3" three of them.
const magicItems = [...parseMagicItems(magicItemRows(dir))].sort(byId('itemId'));
write('magic-items.json', magicItems);
write(
  'magic-items.json',
  magicItems.flatMap((item) => magicCatalogEntries(item, equipment)),
  'packages/contracts/src/items/srd',
);
// The rules as a reference (docs/adr/0055-rules-reference-and-toolbox.md §1).
const glossary = parseGlossary(dir);
write('glossary.json', glossary);
const rulesSections = parseRulesSections(dir);
write('rules-sections.json', rulesSections);
// The classes, origins and feats (docs/adr/0056-characters-from-the-srd.md §1).
const classes = parseClasses(dir, equipmentCatalog);
write('classes.json', classes);
const origins = parseOrigins(dir, equipmentCatalog);
write('backgrounds.json', origins.backgrounds);
write('species.json', origins.species);
write('feats.json', origins.feats);
write('advancement.json', parseAdvancement(dir));
process.stdout.write(
  `spells ${spells.length}, monsters ${monsters.length}, equipment ${equipment.length}, magic items ${magicItems.length}, glossary ${glossary.entries.length}, rules sections ${rulesSections.length}, classes ${classes.length}, backgrounds ${origins.backgrounds.length}, species ${origins.species.length}, feats ${origins.feats.length}\n`,
);
