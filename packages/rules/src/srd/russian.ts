import type { SrdAbbreviation, SrdBlock, SrdGlossaryEntry, SrdRulesSection } from '@ltw/contracts';

/**
 * The SRD's words in Russian (docs/adr/0055-rules-reference-and-toolbox.md §5). Each entry is a
 * unit of strings — its English for the translation pass, its Russian in the same shape — kept
 * with a hash of the English it was made from: a Russian whose English has changed since is
 * stale, and the English shows until it is made again. A Russian is kept only when it holds its
 * English's shape, numbers and dice (`translationProblem`).
 */
export type Strings = string | readonly Strings[] | { readonly [key: string]: Strings };

export interface KeptRussian {
  /** `englishHash` of the English it was made from. */
  readonly hash: string;
  readonly ru: Strings;
}

/** A stable hash of a unit's English (FNV-1a, twice over): 16 hex digits. */
export function englishHash(english: Strings): string {
  const text = JSON.stringify(english);
  const fnv = (seed: number) => {
    let hash = seed >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  };
  return `${fnv(0x811c9dc5)}${fnv(0x01000193)}`;
}

const blockStrings = (block: SrdBlock): Strings => {
  switch (block.kind) {
    case 'paragraph':
    case 'item':
      return [block.head ?? '', block.text];
    case 'names':
      return block.names;
    case 'table':
      return {
        title: block.title ?? '',
        columns: block.columns,
        rows: block.rows,
        notes: block.notes,
      };
  }
};

const text = (value: Strings | undefined): string => (typeof value === 'string' ? value : '');
const list = (value: Strings | undefined): readonly Strings[] =>
  Array.isArray(value) ? (value as readonly Strings[]) : [];
const field = (value: Strings | undefined, key: string): Strings | undefined =>
  value !== undefined && typeof value === 'object' && !Array.isArray(value)
    ? (value as { readonly [key: string]: Strings })[key]
    : undefined;

function russianBlock(block: SrdBlock, ru: Strings | undefined): SrdBlock {
  switch (block.kind) {
    case 'paragraph':
    case 'item': {
      const [head, words] = list(ru);
      return { ...block, head: block.head === null ? null : text(head), text: text(words) };
    }
    case 'names':
      return { ...block, names: list(ru).map(text) };
    case 'table':
      return {
        ...block,
        title: block.title === null ? null : text(field(ru, 'title')),
        columns: list(field(ru, 'columns')).map(text),
        rows: list(field(ru, 'rows')).map((row) => list(row).map(text)),
        notes: list(field(ru, 'notes')).map(text),
      };
  }
}

export const glossaryEntryStrings = (entry: SrdGlossaryEntry): Strings => ({
  name: entry.name,
  blocks: entry.blocks.map(blockStrings),
});

export const russianGlossaryEntry = (entry: SrdGlossaryEntry, ru: Strings): SrdGlossaryEntry => ({
  ...entry,
  name: text(field(ru, 'name')),
  blocks: entry.blocks.map((block, index) => russianBlock(block, list(field(ru, 'blocks'))[index])),
});

export const rulesSectionStrings = (section: SrdRulesSection): Strings => ({
  title: section.title,
  subtitle: section.subtitle ?? '',
  blocks: section.blocks.map(blockStrings),
});

export const russianRulesSection = (section: SrdRulesSection, ru: Strings): SrdRulesSection => ({
  ...section,
  title: text(field(ru, 'title')),
  subtitle: section.subtitle === null ? null : text(field(ru, 'subtitle')),
  blocks: section.blocks.map((block, index) =>
    russianBlock(block, list(field(ru, 'blocks'))[index]),
  ),
});

export const abbreviationStrings = (abbreviations: readonly SrdAbbreviation[]): Strings =>
  abbreviations.map((entry) => entry.meaning);

export const russianAbbreviations = (
  abbreviations: readonly SrdAbbreviation[],
  ru: Strings,
): SrdAbbreviation[] =>
  abbreviations.map((entry, index) => ({ ...entry, meaning: text(list(ru)[index]) }));

/** The numbers a text holds, thousands written whole ("1,500" and "1 500" are 1500). */
const numbersOf = (words: string): string[] =>
  [...words.replace(/(\d)[, \u00a0\u202f](?=\d{3}\b)/g, '$1').matchAll(/\d+(?:[.,]\d+)?/g)]
    .map((match) => match[0].replace(',', '.'))
    .sort();
/** Its dice, as written or as the rules name them ("D20 Test" and "two d20s" hold d20s). */
const diceOf = (words: string): string[] =>
  [...words.matchAll(/\b\d*d\d+(?=s?\b)/gi)].map((match) => match[0].toLowerCase()).sort();

/**
 * Why a Russian cannot stand for its English — a different shape, an empty string, a number or a
 * die lost or added — or null when it can.
 */
export function translationProblem(english: Strings, russian: unknown, at = ''): string | null {
  if (typeof english === 'string') {
    if (typeof russian !== 'string') return `${at}: not words`;
    if (english.trim() === '') return russian.trim() === '' ? null : `${at}: words where none were`;
    if (russian.trim() === '') return `${at}: left empty`;
    if (numbersOf(english).join(' ') !== numbersOf(russian).join(' '))
      return `${at}: numbers ${numbersOf(english).join(',')} became ${numbersOf(russian).join(',')}`;
    if (diceOf(english).join(' ') !== diceOf(russian).join(' ')) return `${at}: dice changed`;
    return null;
  }
  if (Array.isArray(english)) {
    if (!Array.isArray(russian) || russian.length !== english.length) return `${at}: list length`;
    for (const [index, item] of (english as readonly Strings[]).entries()) {
      const problem = translationProblem(
        item,
        (russian as unknown[])[index],
        `${at}[${String(index)}]`,
      );
      if (problem !== null) return problem;
    }
    return null;
  }
  if (typeof russian !== 'object' || russian === null || Array.isArray(russian))
    return `${at}: not an object`;
  const keys = Object.keys(english);
  if (Object.keys(russian).sort().join() !== [...keys].sort().join()) return `${at}: keys differ`;
  for (const key of keys) {
    const problem = translationProblem(
      (english as { readonly [key: string]: Strings })[key] ?? '',
      (russian as Record<string, unknown>)[key],
      `${at}.${key}`,
    );
    if (problem !== null) return problem;
  }
  return null;
}
