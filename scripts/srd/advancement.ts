import { freshReading, readBlocks } from './reference-blocks.ts';
import { inReadingOrder, pageLinesAt } from './text.ts';

/**
 * The SRD's Character Advancement table (page 23; docs/adr/0056-characters-from-the-srd.md §3):
 * the experience points each level needs and its proficiency bonus. A row that does not read
 * throws.
 */
export interface AdvancementRow {
  readonly level: number;
  readonly experience: number;
  readonly proficiencyBonus: number;
}

export function parseAdvancement(dir: string): AdvancementRow[] {
  const lines = inReadingOrder(pageLinesAt(dir, 23));
  const title = lines.findIndex((line) => line.text === 'Character Advancement' && line.size > 10);
  if (title < 0) throw new Error('no Character Advancement table');
  // Its lines only: the page's next table (Fixed Hit Points by Class) is the rules' own numbers.
  const next = lines.findIndex(
    (line, index) => index > title && line.text === 'Fixed Hit Points by Class',
  );
  const table = readBlocks(
    dir,
    lines.slice(title, next < 0 ? undefined : next),
    freshReading(),
  ).find((block) => block.kind === 'table' && block.title === 'Character Advancement');
  if (table?.kind !== 'table' || table.rows.length !== 20)
    throw new Error('the Character Advancement table does not read');
  return table.rows.map(([level, experience, bonus]) => ({
    level: Number(level),
    experience: Number((experience ?? '').replace(/,/g, '')),
    proficiencyBonus: Number(bonus),
  }));
}
