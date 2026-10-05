import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { russianEntry } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import './ru.ts';

/**
 * Every English string the client can show has a Russian entry, and every entry keeps the
 * `{placeholders}` of its source (docs/adr/0031-play-language.md §10). Keys are found by
 * reading the source: `t('…')` calls, plus constant tables of sentences (REFUSALS, messages)
 * that reach the screen through `t()` at render.
 */
const roots = [
  new URL('../', import.meta.url),
  new URL('../../../../packages/ui/src/', import.meta.url),
];
const T_CALL = /\bt\(\s*(['"])((?:\\.|(?!\1).)*?)\1/gs;
/** Sentence-like literals in constant tables: a capital, a space, and a sentence's worth of text. */
const SENTENCE = /(?<![\w.])'((?:\\.|[^'\\\n])*?)'/g;
const NOT_UI = new Set(['Missing application root']);

function sources(dir: URL): string[] {
  const path = dir.pathname;
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name);
    if (statSync(full).isDirectory()) return sources(new URL(`${name}/`, dir));
    return /\.(ts|tsx)$/.test(name) &&
      !/\.test\.|\.d\.ts$|\/ru\.ts$/.test(full) &&
      name !== 'ru.ts' &&
      name !== 'i18n.tsx'
      ? [full]
      : [];
  });
}

function keysOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const keys = new Set<string>();
  for (const match of text.matchAll(T_CALL)) keys.add((match[2] ?? '').replace(/\\'/g, "'"));
  for (const match of text.matchAll(SENTENCE)) {
    const literal = (match[1] ?? '').replace(/\\'/g, "'");
    if (
      /^[A-Z][a-z]+ [A-Za-z]/.test(literal) &&
      /[a-z]{3}/.test(literal) &&
      !/^[A-Z][A-Za-z]+Error/.test(literal)
    ) {
      keys.add(literal);
    }
  }
  return [...keys].filter((key) => !NOT_UI.has(key));
}

const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

describe('the Russian client dictionary', () => {
  const all = roots.flatMap((root) => sources(root)).flatMap((file) => keysOf(file));
  const unique = [...new Set(all)];

  it('finds the strings the client shows', () => {
    expect(unique.length).toBeGreaterThan(300);
  });

  it('has a Russian entry for every English string', () => {
    const missing = unique.filter((key) => russianEntry(key) === undefined);
    expect(missing).toEqual([]);
  });

  it('keeps the placeholders of each source string', () => {
    for (const key of unique) {
      const russian = russianEntry(key);
      if (russian !== undefined) expect(placeholders(russian), key).toEqual(placeholders(key));
    }
  });
});
