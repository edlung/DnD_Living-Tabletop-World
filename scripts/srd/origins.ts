import {
  SKILL_IDS,
  type Ability,
  type Skill,
  type SrdBackground,
  type SrdBlock,
  type SrdFeat,
  type SrdSpecies,
  type SrdTrait,
} from '../../packages/contracts/src/index.ts';
import { bold, near, openingLines } from './character-text.ts';
import { backgroundCreation, type Catalog } from './creation.ts';
import { freshReading, isSidebarTitle, readBlocks, type ReadingSoFar } from './reference-blocks.ts';
import { inReadingOrder, pageLinesAt, slugOf, type PdfLine } from './text.ts';

/**
 * The SRD's character origins (pages 83–86) and feats (87–88; docs/adr/0056-characters-from-the-
 * srd.md §1): the backgrounds under "Background Descriptions", the species under "Species
 * Descriptions", the feats under their categories — each a 12 pt name, its opening lines
 * ("Ability Scores: …", "Speed: …", "Origin Feat") and its words. What does not read so throws.
 */
interface Entry {
  readonly name: string;
  readonly rows: PdfLine[];
}

const linesOf = (dir: string, from: number, to: number): PdfLine[] => {
  const all: PdfLine[] = [];
  for (let page = from; page <= to; page += 1) all.push(...inReadingOrder(pageLinesAt(dir, page)));
  return all;
};

/** The 12 pt entries after a heading, to the first line that ends them. */
function entriesAfter(
  lines: readonly PdfLine[],
  heading: string,
  ends: (line: PdfLine) => boolean,
): Entry[] {
  const start = lines.findIndex((line) => line.text === heading && bold(line));
  if (start < 0) throw new Error(`no "${heading}"`);
  const entries: Entry[] = [];
  for (const line of lines.slice(start + 1)) {
    if (ends(line)) break;
    if (isSidebarTitle(line)) throw new Error(`a sidebar under "${heading}": ${line.text}`);
    if (near(line.size, 12) && bold(line)) entries.push({ name: line.text, rows: [] });
    else if (!near(line.size, 14)) entries[entries.length - 1]?.rows.push(line);
  }
  return entries;
}

/** An entry's labelled opening lines by label; throws for one it lacks. */
function labelled(name: string, rows: readonly PdfLine[], labels: readonly string[]) {
  const { lines, rest } = openingLines(rows, new RegExp(`^(?:${labels.join('|')}): `));
  const field = (label: string): string => {
    const line = lines.find((one) => one.startsWith(`${label}: `));
    if (line === undefined) throw new Error(`${name}: no ${label}`);
    return line.slice(label.length + 2).trim();
  };
  return { field, rest };
}

const setIn = (line: PdfLine | undefined, next: PdfLine | undefined) =>
  line !== undefined && next !== undefined && next.x0 - line.x0 > 5 && next.x0 - line.x0 < 10;

/**
 * An entry's words. A one-line sentence before a set-in paragraph ("You gain the following
 * benefits." over "Initiative Proficiency. …") stands as its own: the reader would hang them.
 */
function blocksOf(dir: string, rows: readonly PdfLine[], reading: ReadingSoFar): SrdBlock[] {
  const [first, second] = rows;
  return first && /[.:]$/.test(first.text) && setIn(first, second)
    ? [...readBlocks(dir, [first], reading), ...readBlocks(dir, rows.slice(1), reading)]
    : readBlocks(dir, rows, reading);
}

const ABILITY_OF: Readonly<Record<string, Ability>> = {
  Strength: 'str',
  Dexterity: 'dex',
  Constitution: 'con',
  Intelligence: 'int',
  Wisdom: 'wis',
  Charisma: 'cha',
};
const listOf = (words: string) => words.split(/, and |, | and /);

function background(entry: Entry, catalog: Catalog): SrdBackground {
  const { name, rows } = entry;
  const { field, rest } = labelled(name, rows, [
    'Ability Scores',
    'Feat',
    'Skill Proficiencies',
    'Tool Proficiency',
    'Equipment',
  ]);
  if (rest.length > 0) throw new Error(`${name}: words after its equipment`);
  const feat = field('Feat').replace(/\s*\(see “Feats”\)$/, '');
  return {
    backgroundId: slugOf(name),
    name,
    abilityScores: listOf(field('Ability Scores')).map((word) => {
      const ability = ABILITY_OF[word];
      if (!ability) throw new Error(`${name}: no ability "${word}"`);
      return ability;
    }),
    feat,
    featId: slugOf(feat.replace(/\s*\(.*\)$/, '')),
    skills: listOf(field('Skill Proficiencies')).map((word) => {
      const skill = SKILL_IDS.find((one) => one === slugOf(word));
      if (!skill) throw new Error(`${name}: no skill "${word}"`);
      return skill satisfies Skill;
    }),
    tool: field('Tool Proficiency'),
    equipment: field('Equipment'),
    creation: backgroundCreation(field('Tool Proficiency'), field('Equipment'), catalog),
  };
}

/**
 * A species: its type, size and speed, then each trait under its run-in head. A head that hangs
 * (its first line at the edge, the next set in: "Forest Gnome. …") is a trait's option, not a trait.
 */
function species(dir: string, entry: Entry, reading: ReadingSoFar): SrdSpecies {
  const { name, rows } = entry;
  const { field, rest } = labelled(name, rows, ['Creature Type', 'Size', 'Speed']);
  const speed = /^(\d+) feet$/.exec(field('Speed'));
  if (!speed) throw new Error(`${name}: speed "${field('Speed')}"`);
  // Its one line before them ("As a Dwarf, you have these special traits.").
  if (!/special traits\.$/.test(rest[0]?.text ?? '')) throw new Error(`${name}: no traits line`);
  const options = new Set(
    rest
      .filter((line, index) => setIn(line, rest[index + 1]))
      .map((line) => /^([A-Z][\w’' ]*)\. /.exec(line.text)?.[1]),
  );
  const traits: { name: string; blocks: SrdBlock[] }[] = [];
  for (const block of blocksOf(dir, rest.slice(1), reading)) {
    const head = block.kind === 'paragraph' ? block.head : null;
    if (block.kind === 'paragraph' && head !== null && !head.endsWith(':') && !options.has(head))
      traits.push({ name: head, blocks: [{ ...block, head: null }] });
    else if (traits.length > 0) traits[traits.length - 1]?.blocks.push(block);
    else throw new Error(`${name}: words before its traits`);
  }
  return {
    speciesId: slugOf(name),
    name,
    creatureType: field('Creature Type'),
    size: field('Size'),
    speed: Number(speed[1]),
    traits: traits satisfies SrdTrait[],
  };
}

const CATEGORY = /^(Origin|General|Fighting Style|Epic Boon) Feat(?: \(Prerequisite: (.+)\))?$/;

function feat(dir: string, entry: Entry, reading: ReadingSoFar): SrdFeat {
  const { name, rows } = entry;
  const { lines, rest } = openingLines(rows, /^(?:Origin|General|Fighting Style|Epic Boon) Feat/);
  const opening = CATEGORY.exec(lines[0] ?? '');
  if (!opening || lines.length !== 1) throw new Error(`${name}: no category`);
  const blocks = blocksOf(dir, rest, reading);
  return {
    featId: slugOf(name),
    name,
    category: opening[1] as SrdFeat['category'],
    prerequisite: opening[2] ?? null,
    repeatable: blocks.some((block) => block.kind === 'paragraph' && block.head === 'Repeatable'),
    blocks,
  };
}

/**
 * A table goes with the trait that names it ("the Fiendish Legacies table"): the page sets one
 * where it fits, under another species' words.
 */
function withTablesInPlace(all: SrdSpecies[]): SrdSpecies[] {
  const traits = all.flatMap((one) => one.traits);
  for (const trait of traits)
    for (const table of trait.blocks.filter((block) => block.kind === 'table')) {
      const named = `${table.title ?? ''} table`;
      const owner = traits.find((one) =>
        one.blocks.some((block) => block.kind === 'paragraph' && block.text.includes(named)),
      );
      if (!owner) throw new Error(`no trait names "${named}"`);
      if (owner === trait) continue;
      trait.blocks.splice(trait.blocks.indexOf(table), 1);
      owner.blocks.push(table);
    }
  return all;
}

export function parseOrigins(
  dir: string,
  catalog: Catalog,
): {
  backgrounds: SrdBackground[];
  species: SrdSpecies[];
  feats: SrdFeat[];
} {
  const origins = linesOf(dir, 83, 86);
  const reading = freshReading();
  const backgrounds = entriesAfter(
    origins,
    'Background Descriptions',
    (line) => near(line.size, 18) && line.text === 'Character Species',
  ).map((one) => background(one, catalog));
  const all = withTablesInPlace(
    entriesAfter(origins, 'Species Descriptions', () => false).map((one) =>
      species(dir, one, reading),
    ),
  );
  const feats = entriesAfter(linesOf(dir, 87, 88), 'Origin Feats', () => false).map((one) =>
    feat(dir, one, reading),
  );
  return { backgrounds, species: all, feats };
}
