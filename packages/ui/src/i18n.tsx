import { createContext, useContext, type ReactNode } from 'react';

/**
 * Client text in the campaign's play language (docs/adr/0031-play-language.md §10).
 * The key is the English source string, so English reads as written and needs no
 * dictionary. `{name}` marks a value filled in at render. Russian entries are registered
 * by the package that owns the strings; a key without an entry shows in English, and the
 * coverage test and the Russian journeys fail on it.
 */
export type Language = 'en' | 'ru';
export type Params = Readonly<Record<string, string | number>>;
export type Translate = (key: string, params?: Params) => string;

const russian = new Map<string, string>();
/** Keys registered twice with different words: the later would silently win (for tests). */
const conflicts: string[] = [];

export function registerRussian(entries: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries(entries)) {
    const before = russian.get(key);
    if (before !== undefined && before !== value) conflicts.push(`${key}: ${before} / ${value}`);
    russian.set(key, value);
  }
}

/** The Russian entry for a key, if one is registered (for tests). */
export const russianEntry = (key: string): string | undefined => russian.get(key);

/** Keys given two different Russian words: one screen's meaning would overwrite another's. */
export const russianConflicts = (): readonly string[] => [...conflicts];

/** A fraction as the language writes it: "0.5" in English, "0,5" in Russian. */
const FRACTIONS: Readonly<Record<Language, Intl.NumberFormat>> = {
  en: new Intl.NumberFormat('en', { maximumFractionDigits: 6, useGrouping: false }),
  ru: new Intl.NumberFormat('ru', { maximumFractionDigits: 6, useGrouping: false }),
};

export function translate(language: Language, key: string, params?: Params): string {
  const text = language === 'ru' ? (russian.get(key) ?? key) : key;
  const shown = (value: string | number) =>
    typeof value === 'number' && !Number.isInteger(value)
      ? FRACTIONS[language].format(value)
      : String(value);
  return params === undefined
    ? text
    : text.replace(/\{(\w+)\}/g, (whole, name: string) => {
        const value = params[name];
        return value === undefined ? whole : shown(value);
      });
}

const LanguageContext = createContext<Language>('en');

export function LanguageProvider({
  language,
  children,
}: {
  readonly language: Language;
  readonly children: ReactNode;
}) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

export const useLanguage = (): Language => useContext(LanguageContext);

/** The translator of the surrounding campaign's language. */
export function useT(): Translate {
  const language = useContext(LanguageContext);
  return (key, params) => translate(language, key, params);
}
