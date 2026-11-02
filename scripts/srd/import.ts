import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseMonsters } from './monsters.ts';
import { deriveMechanics } from './spell-mechanics.ts';
import { parseSpells } from './spells.ts';
import { pageLines, pageRows, srdLine } from './text.ts';

/**
 * Writes the SRD 5.2.1 catalogs into `@ltw/rules` (docs/adr/0051-srd-data.md §2) from the lines
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

const write = (name: string, entries: readonly object[]) => {
  const path = fileURLToPath(new URL(`../../packages/rules/src/srd/${name}`, import.meta.url));
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`);
};
const byId =
  <T>(key: keyof T) =>
  (a: T, b: T) =>
    String(a[key]).localeCompare(String(b[key]));
const sorted = [...spells].sort(byId('spellId'));
write('spells.json', sorted);
write('spell-mechanics.json', sorted.map(deriveMechanics));
write('monsters.json', [...monsters].sort(byId('monsterId')));
process.stdout.write(`spells ${spells.length}, monsters ${monsters.length}\n`);
