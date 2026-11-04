import type {
  SrdBlock,
  SrdClass,
  SrdClassFeature,
  SrdClassOption,
} from '../../packages/contracts/src/index.ts';
import { bold, closer, joined, near, openingLines } from './character-text.ts';
import { classCreation, type Catalog } from './creation.ts';
import { freshReading, isSidebarTitle, readBlocks, type ReadingSoFar } from './reference-blocks.ts';
import { inReadingOrder, pageLinesAt, slugOf, type PdfLine } from './text.ts';

/**
 * The SRD's twelve classes (pages 28–82; docs/adr/0056-characters-from-the-srd.md §1): each one's
 * core traits, what a second class gives, its features table — level, proficiency bonus, features
 * and the class's own columns — its features by level in their words, its sidebars, the options
 * its features choose among, and its subclass with its features. A table or a line the parser
 * cannot read throws: the import stops rather than guess.
 */
type SrdClassText = SrdClass;

const SLOTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
/** Each class's pages and the columns of its features table beyond the first three. */
export const CLASSES: readonly {
  readonly name: string;
  readonly pages: readonly [number, number];
  readonly columns: readonly string[];
}[] = [
  { name: 'Barbarian', pages: [28, 31], columns: ['Rages', 'Rage Damage', 'Weapon Mastery'] },
  {
    name: 'Bard',
    pages: [31, 36],
    columns: ['Bardic Die', 'Cantrips', 'Prepared Spells', ...SLOTS],
  },
  {
    name: 'Cleric',
    pages: [36, 41],
    columns: ['Channel Divinity', 'Cantrips', 'Prepared Spells', ...SLOTS],
  },
  {
    name: 'Druid',
    pages: [41, 47],
    columns: ['Wild Shape', 'Cantrips', 'Prepared Spells', ...SLOTS],
  },
  { name: 'Fighter', pages: [47, 49], columns: ['Second Wind', 'Weapon Mastery'] },
  {
    name: 'Monk',
    pages: [49, 53],
    columns: ['Martial Arts', 'Focus Points', 'Unarmored Movement'],
  },
  {
    name: 'Paladin',
    pages: [53, 57],
    columns: ['Channel Divinity', 'Prepared Spells', ...SLOTS.slice(0, 5)],
  },
  {
    name: 'Ranger',
    pages: [57, 61],
    columns: ['Favored Enemy', 'Prepared Spells', ...SLOTS.slice(0, 5)],
  },
  { name: 'Rogue', pages: [61, 64], columns: ['Sneak Attack'] },
  {
    name: 'Sorcerer',
    pages: [64, 70],
    columns: ['Sorcery Points', 'Cantrips', 'Prepared Spells', ...SLOTS],
  },
  {
    name: 'Warlock',
    pages: [70, 77],
    columns: ['Eldritch Invocations', 'Cantrips', 'Prepared Spells', 'Spell Slots', 'Slot Level'],
  },
  { name: 'Wizard', pages: [77, 83], columns: ['Cantrips', 'Prepared Spells', ...SLOTS] },
];

/** A value of the class's own columns: a die, a number, a bonus, a distance, or none. */
const VALUE = '(?:\\d*[dD]\\d+|\\+\\d+ft\\.|[+-]?\\d+|—)';

/** The features table of a class: its 20 rows, read where they stand on their pages. */
function featuresTable(
  dir: string,
  name: string,
  pages: readonly [number, number],
  width: number,
): { levels: SrdClassText['levels']; skip: Set<string> } {
  const skip = new Set<string>();
  const levels: SrdClassText['levels'][number][] = [];
  const row = new RegExp(`^(\\d+) \\+(\\d) (.+?)((?: ${VALUE}){${String(width)}})$`);
  let endedWithComma = false;
  for (let page = pages[0]; page <= pages[1] && levels.length < 20; page += 1) {
    const lines = pageLinesAt(dir, page);
    const title = lines.find((line) => line.text === `${name} Features` && near(line.size, 10.5));
    const top = title ? title.y0 : levels.length > 0 ? Infinity : null;
    if (top === null) continue;
    // Rows are the 9.5 pt lines under the title (or a page's top, going on), grouped by height.
    const pieces = lines
      .filter(
        (line) =>
          line.y0 < top && near(line.size, 9.5) && line.runs.some((r) => /GillSans/.test(r.font)),
      )
      .sort((a, b) => b.y0 - a.y0 || a.x0 - b.x0);
    // Its header: the 9.3 pt words between the title and the first row, skipped too.
    if (title) {
      const first = pieces.find((piece) => /^1 \+2/.test(piece.text));
      for (const line of lines)
        if (
          line.y0 < title.y0 &&
          (first === undefined || line.y0 > first.y0) &&
          line.runs.some((run) => /SemiBold/.test(run.font) && near(run.size, 9.3))
        )
          skip.add(`${String(page)}:${line.y0.toFixed(1)}`);
    }
    const groups: PdfLine[][] = [];
    for (const piece of pieces) {
      const last = groups[groups.length - 1];
      if (last?.[0] && Math.abs(last[0].y0 - piece.y0) < 2) last.push(piece);
      else groups.push([piece]);
    }
    for (const group of groups) {
      if (levels.length >= 20) break;
      const text = group
        .sort((a, b) => a.x0 - b.x0)
        .map((piece) => piece.text)
        .join(' ')
        .replace(/(\+\d)—/g, '$1 —')
        .replace(/\+(\d+) ft\./g, '+$1ft.')
        .replace(/\s+/g, ' ')
        .trim();
      const match = row.exec(text);
      const last = levels[levels.length - 1];
      if (match && Number(match[1]) === levels.length + 1) {
        endedWithComma = (match[3] ?? '').trim().endsWith(',');
        levels.push({
          level: Number(match[1]),
          proficiencyBonus: Number(match[2]),
          features: splitFeatures(match[3] ?? ''),
          values: (match[4] ?? '')
            .trim()
            .split(' ')
            .map((value) => value.replace('ft.', ' ft.')),
        });
      } else if (
        last &&
        /^[A-Z][\w’' -]*,?$/.test(text) &&
        group.every((piece) => piece.x0 > 140)
      ) {
        // A feature's name wrapped onto a line of its own: a new feature after a comma, else the
        // rest of the last one's name ("Ability Score" / "Improvement").
        const features = endedWithComma
          ? [...last.features, ...splitFeatures(text)]
          : [
              ...last.features.slice(0, -1),
              `${last.features.at(-1) ?? ''} ${text}`.replace(/,$/, '').trim(),
            ];
        levels[levels.length - 1] = { ...last, features };
        endedWithComma = text.endsWith(',');
      } else continue;
      for (const piece of group) skip.add(`${String(page)}:${piece.y0.toFixed(1)}`);
    }
  }
  if (levels.length !== 20)
    throw new Error(`${name}: ${String(levels.length)} rows in its features table`);
  return { levels, skip };
}

const splitFeatures = (text: string): string[] =>
  text === '—'
    ? []
    : text
        .split(',')
        .map((one) => one.trim())
        .filter((one) => one !== '' && one !== '—');

/** The core traits: each bold key and the words beside and under it, until the next key. */
function coreTraits(lines: readonly PdfLine[], name: string): Record<string, string> {
  const keys = [
    'Primary Ability',
    'Hit Point Die',
    'Saving Throw',
    'Skill Proficiencies',
    'Weapon Proficiencies',
    'Tool Proficiencies',
    'Armor Training',
    'Starting Equipment',
  ];
  const title = lines.findIndex((line) => line.text === `Core ${name} Traits`);
  const end = lines.findIndex(
    (line, index) => index > title && line.text.startsWith(`Becoming a ${name}`),
  );
  if (title < 0 || end < 0) throw new Error(`${name}: no core traits`);
  const core: Record<string, string> = {};
  let key: string | null = null;
  for (const line of lines.slice(title + 1, end)) {
    const opening = keys.find((one) => line.text.startsWith(one) && bold(line));
    if (opening) {
      key = opening;
      core[key] = line.text.slice(opening.length).trim();
    } else if (key && !line.text.startsWith('Proficiencies')) {
      core[key] = joined(core[key] ?? '', line.text);
    }
  }
  return core;
}

const LEVEL = /^Level (\d+): (.+)$/;

/** The sidebars ("Breaking Your Oath"): an 11 pt title and its 9 pt words, apart from the flow. */
function withoutSidebars(dir: string, lines: readonly PdfLine[], reading: ReadingSoFar) {
  const flow: PdfLine[] = [];
  const sidebars: { title: string; blocks: SrdBlock[] }[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    if (!isSidebarTitle(line)) {
      flow.push(line);
      continue;
    }
    const rows: PdfLine[] = [];
    for (let next = lines[index + 1]; next && near(next.size, 9); next = lines[index + 1]) {
      rows.push(next);
      index += 1;
    }
    sidebars.push({ title: line.text, blocks: readBlocks(dir, rows, reading) });
  }
  return { flow, sidebars };
}

/**
 * An option under its 12 pt name: its "Prerequisite:" and "Cost:" lines (set closer above its
 * words), its words, and whether it can be taken again ("Repeatable.").
 */
function optionOf(
  dir: string,
  name: string,
  rows: readonly PdfLine[],
  reading: ReadingSoFar,
): SrdClassOption {
  const { lines, rest } = openingLines(rows, /^(?:Prerequisite|Cost): /);
  const opening = (key: string) =>
    lines.find((line) => line.startsWith(`${key}: `))?.slice(key.length + 2) ?? null;
  const blocks = readBlocks(dir, rest, reading);
  return {
    optionId: slugOf(name),
    name,
    prerequisite: opening('Prerequisite'),
    cost: opening('Cost'),
    repeatable: blocks.some((block) => block.kind === 'paragraph' && block.head === 'Repeatable'),
    blocks,
  };
}

export function parseClass(
  dir: string,
  entry: (typeof CLASSES)[number],
  catalog: Catalog,
): SrdClassText {
  const { name, pages, columns } = entry;
  const table = featuresTable(dir, name, pages, columns.length);
  // Its lines from its own heading (18 pt) to the next class's, or to the next chapter.
  const all: PdfLine[] = [];
  for (let page = pages[0]; page <= pages[1]; page += 1)
    all.push(...inReadingOrder(pageLinesAt(dir, page)));
  const heading = (line: PdfLine) => near(line.size, 18) && bold(line);
  const first = all.findIndex((line) => heading(line) && line.text === name);
  const next = all.findIndex(
    (line, index) =>
      index > first &&
      ((heading(line) && CLASSES.some((one) => one.name === line.text)) || near(line.size, 26)),
  );
  if (first < 0) throw new Error(`${name}: no heading`);
  const lines = all.slice(first, next < 0 ? undefined : next);
  const inTable = (line: PdfLine) => table.skip.has(`${String(line.page)}:${line.y0.toFixed(1)}`);
  const kept = lines.filter(
    (line) => !inTable(line) && !(line.text === `${name} Features` && near(line.size, 10.5)),
  );
  const core = coreTraits(kept, name);
  const reading = freshReading();
  const { flow, sidebars } = withoutSidebars(dir, kept, reading);
  // What a second class gives, then the features by level, the options they choose among
  // ("Metamagic Options", 14 pt), and the subclass's (its heading: "<Class> Subclass:" and its
  // name, 14 pt). A class spell list ends a part: its lists are the spells' own data.
  const multiclassAt = flow.findIndex((line) => line.text === 'As a Multiclass Character');
  const start = flow.findIndex((line) => line.text === `${name} Class Features`);
  if (start < 0 || multiclassAt < 0 || multiclassAt > start)
    throw new Error(`${name}: no class features`);
  const features: SrdClassFeature[] = [];
  const subclass = {
    name: '',
    tagline: null as string | null,
    intro: [] as PdfLine[],
    features: [] as SrdClassFeature[],
  };
  let options: { title: string; intro: PdfLine[] } | null = null;
  const entries: { name: string; rows: PdfLine[] }[] = [];
  let part: 'features' | 'options' | 'subclass' | 'none' = 'features';
  let open: { level: number; name: string; rows: PdfLine[] } | null = null;
  // Where the next line of words goes: a feature's, an option's, or an introduction's.
  let rows: PdfLine[] | null = null;
  const close = () => {
    if (open)
      (part === 'subclass' ? subclass.features : features).push({
        level: open.level,
        name: open.name,
        blocks: readBlocks(dir, open.rows, reading),
      });
    open = null;
    rows = null;
  };
  for (let index = start + 1; index < flow.length; index += 1) {
    const line = flow[index];
    if (!line) continue;
    const named = near(line.size, 14)
      ? new RegExp(`^${name} Subclass:(.*)$`).exec(line.text)
      : null;
    if (named) {
      close();
      // Its name, on the heading's line or after it, wrapping onto the next 14 pt line.
      let words = (named[1] ?? '').trim();
      while (near(flow[index + 1]?.size ?? 0, 14) && !LEVEL.test(flow[index + 1]?.text ?? '')) {
        index += 1;
        words = `${words} ${flow[index]?.text ?? ''}`.trim();
      }
      subclass.name = words;
      // Its tagline ("Channel Rage into Violent Fury"), set closer above its words.
      const tagline = flow[index + 1];
      if (tagline && !LEVEL.test(tagline.text) && closer(tagline, flow[index + 2])) {
        subclass.tagline = tagline.text;
        index += 1;
      }
      part = 'subclass';
      rows = subclass.intro;
      continue;
    }
    if (near(line.size, 14) && / Options$/.test(line.text)) {
      close();
      options = { title: line.text, intro: [] };
      part = 'options';
      rows = options.intro;
      continue;
    }
    if (near(line.size, 14) && /Spell List$/.test(line.text)) {
      close();
      part = 'none';
      continue;
    }
    const heading = near(line.size, 12) && bold(line);
    const level = heading && part !== 'options' ? LEVEL.exec(line.text) : null;
    if (level && part !== 'none') {
      close();
      open = { level: Number(level[1]), name: level[2] ?? '', rows: [] };
      rows = open.rows;
    } else if (heading && part === 'options') {
      const option = { name: line.text, rows: [] as PdfLine[] };
      entries.push(option);
      rows = option.rows;
    } else rows?.push(line);
  }
  close();
  if (subclass.name === '') throw new Error(`${name}: no subclass`);
  return {
    classId: slugOf(name),
    name,
    core,
    creation: classCreation(name, core, catalog),
    multiclass: readBlocks(dir, flow.slice(multiclassAt + 1, start), reading),
    columns: [...columns],
    levels: table.levels,
    features,
    sidebars,
    options: options && {
      title: options.title,
      intro: readBlocks(dir, options.intro, reading),
      entries: entries.map((one) => optionOf(dir, one.name, one.rows, reading)),
    },
    subclass: {
      name: subclass.name,
      tagline: subclass.tagline,
      intro: readBlocks(dir, subclass.intro, reading),
      features: subclass.features,
    },
  };
}

export const parseClasses = (dir: string, catalog: Catalog): SrdClassText[] =>
  CLASSES.map((entry) => parseClass(dir, entry, catalog));
