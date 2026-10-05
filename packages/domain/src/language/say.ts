import type { Language } from '@ltw/contracts';

/**
 * Sentences with values in them, for the DM's authoring and continuity text
 * (docs/adr/0031-play-language.md). The English template is the key, so English
 * reads as written; `{name}` marks a value. Russian entries live in `authoring-ru.ts` and
 * never decline a name. A key without an entry is shown in English and a test fails on it.
 */
export type Say = (key: string, params?: Readonly<Record<string, string | number>>) => string;

const russian = new Map<string, string>();

export function registerRussianSentences(entries: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries(entries)) russian.set(key, value);
}

export const russianSentence = (key: string): string | undefined => russian.get(key);

export function sayIn(language: Language): Say {
  return (key, params) => {
    const text = language === 'ru' ? (russian.get(key) ?? key) : key;
    return params === undefined
      ? text
      : text.replace(/\{(\w+)\}/g, (whole, name: string) => String(params[name] ?? whole));
  };
}
