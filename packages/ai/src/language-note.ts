import type { Language } from '@ltw/contracts';

/**
 * The output-language line of a prompt (docs/adr/0031-play-language.md §8). Names are
 * given in the form the campaign uses and are never declined or translated.
 */
export const languageNote = (language: Language): string | null =>
  language === 'ru'
    ? 'Write everything you output in Russian. Use every name exactly as given, in the form given; never decline, translate, or transliterate it.'
    : null;
