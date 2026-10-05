import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { russianSentence } from './index.ts';

/**
 * Every sentence the DM's authoring and continuity text can say has a Russian entry that keeps
 * its `{placeholders}` (docs/adr/0031-play-language.md §5). Keys are read from the source:
 * `say('…')` calls and the fixed labels and reasons that reach the DM through `say`.
 */
const root = new URL('../authoring/', import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'testing' ? [] : sources(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

const SAY = /\bsay\(\s*(['"])((?:\\.|(?!\1).)*?)\1/gs;
const FIXED =
  /(?:allowed|refused)\('L\d',\s*say\(|label = '([^']+)'|(?:removal\([^)]*?,\s*)'([^']+)'\)|edit\(\s*'([^']+)'/gs;
const LABEL_CONSTANT = /ACKNOWLEDGE_LABEL = '([^']+)'/;

describe('the Russian authoring sentences', () => {
  const keys = new Set<string>();
  for (const file of sources(root)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(SAY)) keys.add((match[2] ?? '').replace(/\\'/g, "'"));
    for (const match of text.matchAll(FIXED)) {
      const key = match[1] ?? match[2] ?? match[3];
      if (key) keys.add(key.replace(/\\'/g, "'"));
    }
    const label = LABEL_CONSTANT.exec(text);
    if (label?.[1]) keys.add(label[1]);
  }
  // Template keys that are values, not sentences.
  for (const word of ['party', 'public', 'record']) keys.add(word);

  it('finds the sentences', () => {
    expect(keys.size).toBeGreaterThan(40);
  });

  it('has a Russian entry for every one', () => {
    expect([...keys].filter((key) => russianSentence(key) === undefined)).toEqual([]);
  });

  it('keeps the placeholders of each', () => {
    const holes = (text: string) =>
      [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
    for (const key of keys) {
      const russian = russianSentence(key);
      if (russian !== undefined) expect(holes(russian), key).toEqual(holes(key));
    }
  });
});
