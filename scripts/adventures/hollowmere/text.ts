/**
 * The Bells of Hollowmere in two languages (docs/adr/0058-campaign-content.md §5): every text the
 * adventure writes, English and Russian side by side, so the two fixtures keep one shape. Russian
 * follows the Ravenford glossary's rule (fixtures/ravenford-ru/GLOSSARY.md): proper names are
 * transliterated and stay in the nominative; common words in names are translated.
 */
export type Language = 'en' | 'ru';
export const LANGUAGES: readonly Language[] = ['en', 'ru'];

export interface Text {
  readonly en: string;
  readonly ru: string;
}

export const t = (en: string, ru: string): Text => ({ en, ru });

/** One command or record of the adventure, written in one language. */
export type Written<T> = (language: Language) => T;

/** World time in seconds from Day 1, 00:00. */
export const at = (day: number, hour: number, minute = 0): number =>
  ((day - 1) * 24 + hour) * 3600 + minute * 60;

/** The adventure begins on Day 1 at 08:00, at Ravenford's North Gate. */
export const STARTS_AT = at(1, 8);
