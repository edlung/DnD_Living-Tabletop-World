import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { russianEntry } from '../../packages/ui/src/index.ts';
import { clientKeys } from './client-keys.ts';

/**
 * The play screens load only the dictionaries `main.tsx` imports; the workshop's come with its
 * private bundle (`apps/web/src/workshop/private.tsx`). So every string outside the workshop needs
 * its Russian in a dictionary `main.tsx` loads: one found only in a workshop dictionary showed in
 * English on a Russian table (Stage 605, "Prepared encounters"). This file runs in its own module
 * graph, holding only those dictionaries.
 */
const MAIN = new URL('../../apps/web/src/main.tsx', import.meta.url);
const PLAY_DICTIONARIES = [
  ...readFileSync(MAIN, 'utf8').matchAll(/^import '\.\/(i18n\/ru[a-z-]*\.ts)';$/gm),
].map((match) => match[1] ?? '');

beforeAll(async () => {
  for (const file of PLAY_DICTIONARIES) {
    await import(new URL(`../../apps/web/src/${file}`, import.meta.url).href);
  }
});

describe('the play dictionaries', () => {
  it('are the ones main.tsx loads', () => {
    expect(PLAY_DICTIONARIES).toContain('i18n/ru-play.ts');
    expect(PLAY_DICTIONARIES.some((file) => file.includes('workshop'))).toBe(false);
  });

  it('hold the Russian of every string outside the workshop', () => {
    const missing = clientKeys(/\/apps\/web\/src\/workshop\//).filter(
      (key) => russianEntry(key) === undefined,
    );
    expect(missing).toEqual([]);
  });
});
