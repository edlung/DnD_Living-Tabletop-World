import { SRD_LANGUAGES, STANDARD_LANGUAGES, type ClassId, type SrdLanguage } from '@ltw/contracts';

/**
 * The languages a character knows (SRD 5.2.1; docs/adr/0056-characters-from-the-srd.md §2):
 * Common and two standard languages at creation; a Druid's Druidic and a Rogue's Thieves' Cant at
 * their class's first level, with the Rogue's one more of either table; a Ranger's two more at
 * level 2 (Deft Explorer).
 */
const STANDARD: ReadonlySet<SrdLanguage> = new Set(STANDARD_LANGUAGES);

/** The languages a class's level gives without a choice. */
export const classLanguages = (classId: ClassId, level: number): SrdLanguage[] =>
  level !== 1
    ? []
    : classId === 'druid'
      ? ['druidic']
      : classId === 'rogue'
        ? ['thieves-cant']
        : [];

/** How many languages a class's level lets the player choose. */
export const languagesToChoose = (classId: ClassId, level: number): number =>
  classId === 'rogue' && level === 1 ? 1 : classId === 'ranger' && level === 2 ? 2 : 0;

/** The languages one may still choose: any not known, Common and the secret ones of a class aside. */
export const languagesOpen = (known: readonly SrdLanguage[]): SrdLanguage[] =>
  SRD_LANGUAGES.filter(
    (one) =>
      one !== 'common' && one !== 'druidic' && one !== 'thieves-cant' && !known.includes(one),
  );

type Problem = (field: string, message: string, params?: Record<string, string | number>) => void;

/**
 * A new character's languages: Common, the two standard ones chosen, the class's own, and a
 * Rogue's one more; the problems with the choice.
 */
export function creationLanguages(
  classId: ClassId,
  chosen: readonly SrdLanguage[] | undefined,
  problem: Problem,
): SrdLanguage[] {
  const picks = chosen ?? [];
  const wanted = 2 + languagesToChoose(classId, 1);
  const open = languagesOpen([]);
  if (picks.length !== wanted || new Set(picks).size !== picks.length)
    problem('languages', 'Choose {count} languages', { count: wanted });
  else if (picks.some((one) => !open.includes(one)))
    problem('languages', 'Common and a class’s own languages are known already');
  else if (picks.filter((one) => STANDARD.has(one)).length < 2)
    problem('languages', 'Two of them from the standard languages');
  return [...new Set<SrdLanguage>(['common', ...picks, ...classLanguages(classId, 1)])];
}

/** The languages after a level: the class's own and those chosen, with the problems. */
export function levelLanguages(
  known: readonly SrdLanguage[],
  classId: ClassId,
  classLevel: number,
  chosen: readonly SrdLanguage[] | undefined,
  problem: Problem,
): SrdLanguage[] {
  const picks = chosen ?? [];
  const wanted = languagesToChoose(classId, classLevel);
  const open = languagesOpen(known);
  if (picks.length !== wanted || new Set(picks).size !== picks.length)
    problem('languages', wanted > 0 ? 'Choose {count} languages' : 'This level gives no language', {
      count: wanted,
    });
  else if (picks.some((one) => !open.includes(one)))
    problem('languages', 'A language the character knows already');
  return [...new Set<SrdLanguage>([...known, ...picks, ...classLanguages(classId, classLevel)])];
}
