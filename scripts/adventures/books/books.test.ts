import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { campaignBookSchema } from '../../../packages/contracts/src/index.ts';
import {
  BUILT_IN_BOOKS,
  builtInBook,
  builtInBookFile,
  builtInBookJson,
  type BuiltInBook,
} from './build.ts';

const adventures = Object.keys(BUILT_IN_BOOKS) as BuiltInBook[];

describe('the books of the built-in adventures', () => {
  it.each(adventures)('%s: the fixture is what the build writes now', (adventure) => {
    expect(readFileSync(builtInBookFile(adventure), 'utf8')).toBe(builtInBookJson(adventure));
  });

  it.each(adventures)(
    '%s: closed until the owner has read it, every page written for the book',
    (adventure) => {
      const book = campaignBookSchema.parse(
        JSON.parse(readFileSync(builtInBookFile(adventure), 'utf8')),
      );
      expect(book.awaitingReading).toBe(true);
      for (const chapter of book.chapters)
        for (const page of chapter.pages) {
          expect(page.layer).toBe(2);
          expect(page.voice).toBe('players');
          expect(page.place).toBeDefined();
          for (const cue of page.cues ?? [])
            if (cue.kind === 'check') expect(cue.check?.roll).toBe('asked');
        }
    },
  );

  it('Hollowmere: eight spreads of the concept under the four chapters of the DM notes', () => {
    const book = builtInBook('hollowmere');
    expect(book.chapters.map((c) => [c.title, c.pages.length])).toEqual([
      ['Повозка и погреб', 3],
      ['Колокольня и часовня', 2],
      ['Затопленная мельница', 1],
      ['Склеп и колокол', 2],
    ]);
    expect(book.chapters.flatMap((c) => c.encounters)).toEqual([
      'willow-ford-ambush',
      'cellar-rats',
      'drowned-chapel',
      'sunken-mill',
      'sunken-bell',
    ]);
    expect(book.looseEncounters).toEqual(['marsh-lights', 'flooded-stair']);
    const text = book.chapters.flatMap((c) => c.pages.map((p) => p.text)).join('\n');
    expect(text).not.toMatch(/\[[a-z]+\|/u);
  });

  it('Ravenford: one chapter, six pages, every clue of the site behind a check', () => {
    const book = builtInBook('ravenford');
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]?.pages.map((p) => p.place)).toEqual([
      'market-square',
      'location-f3b82c8b',
      'orins-alchemy',
      'north-gate',
      'old-trade-road',
      'market-square',
    ]);
    const site = book.chapters[0]?.pages[1];
    expect(site?.cues?.map((c) => [c.clue, c.check?.options[0]?.dc])).toEqual([
      ['clue-wheel-sawn', 13],
      ['clue-blade-unused', 15],
      ['clue-symbol-careful', 14],
      ['clue-tracks-boots', 12],
      ['clue-cargo-missing', 12],
    ]);
  });
});
