/**
 * People of the cast named in a page's text (docs/adr/0074-dm-book.md §2.4). A name is matched by
 * the stem of each of its capitalised words with a Russian case ending; a stem two people share,
 * and a word the campaign also writes in lower case (a title, a trade), make no link.
 */
const LETTER = 'А-Яа-яЁё';
const ENDINGS = [
  '',
  'а',
  'я',
  'у',
  'ю',
  'е',
  'ы',
  'и',
  'о',
  'ой',
  'ей',
  'ом',
  'ем',
  'ём',
  'ою',
  'ею',
  'ь',
  'й',
  'ью',
  'ия',
  'ию',
  'ии',
  'ием',
  'ией',
  'ого',
  'ому',
  'ым',
  'им',
  'ую',
  'ая',
  'ий',
  'ый',
].sort((a, b) => b.length - a.length);
const TAIL = `(?:${ENDINGS.join('|')})`;

/** What stays of a name's word when its case ending goes. */
export function nameStem(word: string): string {
  if (word.length >= 6 && /(?:ий|ый|ая|ой|ия)$/u.test(word)) return word.slice(0, -2);
  if (word.length >= 4 && /[аяоеиыуюйь]$/u.test(word)) return word.slice(0, -1);
  return word;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const forms = (stem: string, flags: string) =>
  new RegExp(`(?<![${LETTER}])${escape(stem)}${TAIL}(?![${LETTER}])`, flags);

export interface NamedPerson {
  readonly key: string;
  readonly name: string;
}
export type PersonLinks = { person: string; words: string[] }[];

/**
 * A finder for one campaign: `corpus` is all its scene text, read to learn which capitalised words
 * of the names are ordinary words there.
 */
export function personFinder(
  people: readonly NamedPerson[],
  corpus: string,
): (text: string) => PersonLinks {
  const owners = new Map<string, Set<string>>();
  for (const person of people)
    for (const word of person.name.split(/[\s-]+/u)) {
      if (!new RegExp(`^[А-ЯЁ][а-яё]+$`, 'u').test(word)) continue;
      const stem = nameStem(word);
      if (stem.length < 2) continue;
      const lower = stem.charAt(0).toLowerCase() + stem.slice(1);
      if (forms(lower, 'u').test(corpus)) continue;
      owners.set(stem, (owners.get(stem) ?? new Set()).add(person.key));
    }
  const stems = [...owners]
    .filter(([, keys]) => keys.size === 1)
    .map(([stem, keys]) => ({ person: [...keys][0] ?? '', pattern: forms(stem, 'gu') }));
  return (text) => {
    const found = new Map<string, Set<string>>();
    for (const { person, pattern } of stems)
      for (const match of text.matchAll(pattern))
        found.set(person, (found.get(person) ?? new Set()).add(match[0]));
    return people.flatMap(({ key }) => {
      const words = found.get(key);
      return words ? [{ person: key, words: [...words].sort().slice(0, 16) }] : [];
    });
  };
}
