import { z } from 'zod';

/** The play language of a campaign (docs/adr/0031-play-language.md). `en` when a history never said. */
export const LANGUAGES = ['en', 'ru'] as const;
export const languageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof languageSchema>;
export const DEFAULT_LANGUAGE: Language = 'en';
