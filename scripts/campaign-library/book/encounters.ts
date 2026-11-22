/**
 * Which chapter a prepared encounter belongs to (docs/adr/0074-dm-book.md §2.5), by the first rule
 * that names exactly one: the campaign's own note on a lost fight; the evening its trigger names;
 * the only chapter played at its place; the only chapter whose scenes name its title. An encounter
 * no rule places is left loose and listed with the book.
 */
export interface TiedEncounter {
  readonly key: string;
  readonly title: string;
  readonly location: string;
  readonly trigger: string;
}
export interface TiedChapter {
  readonly key: string;
  readonly number: number;
  readonly location: string;
  /** Everything its scenes say, for the title rule. */
  readonly text: string;
}

const ORDINALS = [
  'перв',
  'втор',
  'трет',
  'четв[её]рт',
  'пят',
  'шест',
  'седьм',
  'восьм',
  'девят',
  'десят',
  'одиннадцат',
  'двенадцат',
];
const NAMED = /Вечер\s+(\d{1,2})(?!\d)/u;
const ORDINAL = new RegExp(
  `(?<![А-Яа-яЁё])(${ORDINALS.join('|')})[а-яё]{1,3}\\s+(?:сесси|встреч|вечер)`,
  'iu',
);

function numberNamed(trigger: string): number | null {
  const direct = NAMED.exec(trigger);
  if (direct) return Number(direct[1]);
  const word = ORDINAL.exec(trigger);
  if (!word) return null;
  const index = ORDINALS.findIndex((o) => new RegExp(`^${o}$`, 'iu').test(word[1] ?? ''));
  return index < 0 ? null : index + 1;
}

export function tieEncounters(
  encounters: readonly TiedEncounter[],
  chapters: readonly TiedChapter[],
  lostFight?: { readonly chapter: number; readonly encounter: string },
): { byChapter: Map<string, string[]>; loose: string[] } {
  const byChapter = new Map<string, string[]>();
  const loose: string[] = [];
  const only = (found: readonly TiedChapter[]) => (found.length === 1 ? found[0] : undefined);
  for (const encounter of encounters) {
    const named = numberNamed(encounter.trigger);
    const chapter =
      (lostFight?.encounter === encounter.key
        ? only(chapters.filter((c) => c.number === lostFight.chapter))
        : undefined) ??
      (named === null ? undefined : only(chapters.filter((c) => c.number === named))) ??
      only(chapters.filter((c) => c.location === encounter.location)) ??
      only(chapters.filter((c) => c.text.toLowerCase().includes(encounter.title.toLowerCase())));
    if (chapter) byChapter.set(chapter.key, [...(byChapter.get(chapter.key) ?? []), encounter.key]);
    else loose.push(encounter.key);
  }
  return { byChapter, loose };
}
