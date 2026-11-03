import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { russianEntry } from '../../packages/ui/src/index.ts';

import '../../apps/web/src/i18n/ru.ts';
import '../../apps/web/src/i18n/ru-builder.ts';

/**
 * The character builder's problems come from the World Engine's rules in English with their
 * `{placeholders}` (docs/adr/0056-characters-from-the-srd.md §2); the client words each in Russian.
 * Every sentence the builder can say has its Russian, keeping its placeholders.
 */
const builder = new URL('../../packages/rules/src/builder/', import.meta.url).pathname;
const sentences = readdirSync(builder)
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  .flatMap((file) => {
    const source = readFileSync(join(builder, file), 'utf8');
    return [
      ...source.matchAll(/message: '([^']+)'/g),
      ...source.matchAll(/problem\(\s*'[\w.]+',\s*'([^']+)'/g),
      ...source.matchAll(/(?:each|count): '([^']+)'/g),
      ...source.matchAll(/'[\w-]+': '(Pick [^']+)'/g),
      ...source.matchAll(/\? '([A-Z][^']+)'\s*: '([A-Z][^']+)'/g),
      // A group that took no part in the match is undefined, whatever its type says.
    ].flatMap((match) =>
      (match.slice(1) as (string | undefined)[]).filter((one): one is string => one !== undefined),
    );
  });
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('the builder’s problems in Russian', () => {
  it('has a Russian for every sentence, with its placeholders', () => {
    expect(sentences.length).toBeGreaterThan(30);
    const missing = [...new Set(sentences)].filter(
      (sentence) => russianEntry(sentence) === undefined,
    );
    expect(missing).toEqual([]);
    for (const sentence of sentences)
      expect(placeholders(russianEntry(sentence) ?? ''), sentence).toEqual(placeholders(sentence));
  });
});
