import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The English strings the client can show, read from its source: `t('…')` calls, plus constant
 * tables of sentences (REFUSALS, messages) that reach the screen through `t()` at render. Shared by
 * the dictionary tests (docs/adr/0031-play-language.md §10).
 */
export const CLIENT_ROOTS = [
  new URL('../../apps/web/src/', import.meta.url),
  new URL('../../packages/ui/src/', import.meta.url),
];
const T_CALL = /\bt\(\s*(['"])((?:\\.|(?!\1).)*?)\1/gs;
/** Sentence-like literals in constant tables: a capital, a space, and a sentence's worth of text. */
const SENTENCE = /(?<![\w.])'((?:\\.|[^'\\\n])*?)'/g;
const NOT_UI = new Set(['Missing application root']);

export function sources(dir: URL): string[] {
  const path = dir.pathname;
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name);
    if (statSync(full).isDirectory()) return sources(new URL(`${name}/`, dir));
    return /\.(ts|tsx)$/.test(name) &&
      !/\.test\.|\.d\.ts$|\/ru\.ts$/.test(full) &&
      !/^ru(-[a-z]+)*\.ts$/.test(name) &&
      name !== 'i18n.tsx'
      ? [full]
      : [];
  });
}

export function keysOf(file: string): string[] {
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

/** Every string of the client's sources whose path `skip` does not match, once. */
export function clientKeys(skip?: RegExp): string[] {
  const files = CLIENT_ROOTS.flatMap((root) => sources(root)).filter((file) => !skip?.test(file));
  return [...new Set(files.flatMap((file) => keysOf(file)))];
}
