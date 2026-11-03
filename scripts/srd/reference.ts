import {
  SRD_GLOSSARY_TAGS,
  type SrdAbbreviation,
  type SrdGlossary,
  type SrdGlossaryEntry,
  type SrdGlossaryTag,
  type SrdRulesPart,
  type SrdRulesSection,
} from '../../packages/contracts/src/index.ts';
import { freshReading, readBlocks } from './reference-blocks.ts';
import { pageLinesAt, pageRows, slugOf, type PdfLine } from './text.ts';

/**
 * The SRD's rules as a reference (docs/adr/0055-rules-reference-and-toolbox.md §1): the Rules
 * Glossary (pages 176–191) — its abbreviations and its entries, each a 12 pt heading with its tag
 * in brackets ("Attack [Action]") — and the Gameplay Toolbox and the magic items' rules (pages
 * 192–208) as sections under their headings (26, 18, 14 and 12 pt).
 */
export const GLOSSARY_PAGES = [176, 191] as const;
export const RULES_PAGES = [192, 208] as const;

const ENTRY_PT = 12;
const heading = (row: PdfLine, size: number) =>
  Math.abs(row.size - size) < 0.2 && row.runs.some((run) => /SemiBold/.test(run.font));
const TAGGED = new RegExp(`^(.+?)(?: \\[(${SRD_GLOSSARY_TAGS.join('|')})\\])?$`);

export function parseGlossary(dir: string): SrdGlossary {
  const rows = pageRows(dir, ...GLOSSARY_PAGES);
  const start = rows.findIndex((row) => row.text === 'Rules Definitions');
  if (start < 0) throw new Error('no "Rules Definitions" heading in the glossary');
  const reading = freshReading();
  const found: { name: string; tag: SrdGlossaryTag | null; rows: PdfLine[] }[] = [];
  for (const row of rows.slice(start + 1)) {
    if (heading(row, ENTRY_PT)) {
      const match = TAGGED.exec(row.text);
      found.push({
        name: match?.[1] ?? row.text,
        tag: (match?.[2] as SrdGlossaryTag | undefined) ?? null,
        rows: [],
      });
    } else found[found.length - 1]?.rows.push(row);
  }
  const names = new Map(found.map((entry) => [entry.name.toLowerCase(), slugOf(entry.name)]));
  const entries: SrdGlossaryEntry[] = found.map((entry) => {
    const blocks = readBlocks(dir, entry.rows, reading);
    return {
      entryId: slugOf(entry.name),
      name: entry.name,
      tag: entry.tag,
      blocks,
      seeAlso: seeAlsoOf(blocks, names, slugOf(entry.name)),
    };
  });
  return { abbreviations: parseAbbreviations(dir), entries };
}

/** The glossary's entries a "See also" names (“Disadvantage” and “Equipment” (“Armor”)). */
function seeAlsoOf(
  blocks: SrdGlossaryEntry['blocks'],
  names: ReadonlyMap<string, string>,
  self: string,
): string[] {
  const found = new Set<string>();
  for (const block of blocks) {
    if (block.kind !== 'paragraph' && block.kind !== 'item') continue;
    const at = block.text.indexOf('See also');
    if (at >= 0) {
      for (const [, quoted] of block.text.slice(at).matchAll(/“([^”]+?)\.?”/g)) {
        const id = names.get((quoted ?? '').toLowerCase());
        if (id !== undefined && id !== self) found.add(id);
      }
    }
  }
  return [...found];
}

/**
 * The abbreviations (page 176), set in two narrow columns: a bold abbreviation and its meaning,
 * whose wrapped words ("component") stand under it.
 */
export function parseAbbreviations(dir: string): SrdAbbreviation[] {
  const lines = pageLinesAt(dir, GLOSSARY_PAGES[0]).filter(
    (line) =>
      line.x0 < 300 &&
      Math.abs(line.size - 10) < 0.2 &&
      line.runs.every((run) => /^GillSans/.test(run.font)),
  );
  const columns = [...new Set(lines.filter(isAbbreviation).map((line) => Math.round(line.x0)))];
  const found: SrdAbbreviation[] = [];
  for (const left of columns.sort((a, b) => a - b)) {
    const inColumn = lines
      .filter((line) => line.x0 >= left - 2 && line.x0 < left + 60)
      .sort((a, b) => b.y0 - a.y0);
    let last: { abbreviation: string; meaning: string } | null = null;
    for (const line of inColumn) {
      if (isAbbreviation(line)) {
        last = {
          abbreviation: (line.runs[0]?.text ?? '').trim(),
          meaning: line.runs
            .slice(1)
            .map((run) => run.text)
            .join('')
            .trim(),
        };
        found.push(last);
      } else if (last) last.meaning = `${last.meaning} ${line.text}`;
    }
  }
  if (found.length < 30) throw new Error(`only ${String(found.length)} abbreviations read`);
  return found.sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
}

const isAbbreviation = (line: PdfLine) => /SemiBold/.test(line.runs[0]?.font ?? '');

const LEVELS = [
  [26, 1],
  [18, 2],
  [14, 3],
  [12, 4],
] as const;
/** A sidebar's title ("Magic Item Rules") is set in 11 pt small capitals: a subsection. */
const isSidebarTitle = (row: PdfLine) =>
  Math.abs(row.size - 11) < 0.2 && row.runs.every((run) => run.font === 'Helvetica');
const levelOf = (row: PdfLine) =>
  isSidebarTitle(row) ? 3 : (LEVELS.find(([size]) => heading(row, size))?.[1] ?? null);
/** The line under a toolbox entry's name: its kind, as "Deadly Trap (Levels 1–4)". */
const SUBTITLE =
  /^(?:(?:Deadly|Nuisance) Trap \(Levels \d+–\d+\)(?: or (?:Deadly|Nuisance) Trap \(Levels \d+–\d+\))?|Magical Contagion|(?:Contact|Ingested|Inhaled|Injury) Poison)$/;

export function parseRulesSections(dir: string): SrdRulesSection[] {
  const rows = pageRows(dir, ...RULES_PAGES);
  const reading = freshReading();
  const found: { title: string; level: 1 | 2 | 3 | 4; part: SrdRulesPart; rows: PdfLine[] }[] = [];
  let part: SrdRulesPart = 'toolbox';
  for (const row of rows) {
    const level = levelOf(row);
    const last = found[found.length - 1];
    if (level === null) {
      last?.rows.push(row);
      continue;
    }
    // A heading set on two lines ("Curses and" / "Magical Contagions") is one.
    if (
      last &&
      last.level === level &&
      last.rows.length === 0 &&
      /\b(and|of|the)$/.test(last.title)
    ) {
      last.title = `${last.title} ${row.text}`;
      continue;
    }
    if (level === 1 && row.text === 'Magic Items') part = 'magic-items';
    found.push({ title: row.text, level, part, rows: [] });
  }
  const ids = new Set<string>();
  const parents: string[] = [];
  return found.map((section) => {
    const first = section.rows[0];
    const ownLine = section.level === 4 && first !== undefined && SUBTITLE.test(first.text);
    const blocks = readBlocks(dir, ownLine ? section.rows.slice(1) : section.rows, reading);
    // A subtitle on two lines reads as the first paragraph.
    const opening = blocks[0];
    const wrapped =
      !ownLine &&
      section.level === 4 &&
      opening?.kind === 'paragraph' &&
      opening.head === null &&
      SUBTITLE.test(opening.text);
    const subtitle = ownLine ? first.text : wrapped ? opening.text : null;
    const own = slugOf(section.title);
    const parent = parents[section.level - 2];
    const sectionId = ids.has(own) && parent !== undefined ? `${parent}-${own}` : own;
    if (ids.has(sectionId)) throw new Error(`two rules sections are "${sectionId}"`);
    ids.add(sectionId);
    parents[section.level - 1] = sectionId;
    parents.length = section.level;
    return {
      sectionId,
      part: section.part,
      title: section.title,
      level: section.level,
      subtitle,
      blocks: wrapped ? blocks.slice(1) : blocks,
    };
  });
}
