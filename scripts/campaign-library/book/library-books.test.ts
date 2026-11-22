import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  bookReferenceProblems,
  campaignBookSchema,
  campaignPackageSchema,
} from '../../../packages/contracts/src/index.ts';

/**
 * The books the library ships, read from `fixtures/campaign-library/` as the server reads them
 * (docs/adr/0074-dm-book.md §2). That each `book.json` is what the source builds now is checked
 * with the packages in `../library.test.ts`.
 */
const LIBRARY = new URL('../../../fixtures/campaign-library/', import.meta.url);
const CAMPAIGNS = new URL('../../../campaigns/', import.meta.url);
const ids = (
  JSON.parse(readFileSync(new URL('index.json', LIBRARY), 'utf8')) as { campaigns: string[] }
).campaigns;
const sourceOf = (id: string) => {
  for (const series of [
    '',
    'collection-2026/',
    'dark-fantasy-2026/',
    'fantasy-2026/',
    'mixed-ages-2026/',
    'noir-2026/',
  ]) {
    const dir = new URL(`${series}${id}/source/`, CAMPAIGNS);
    try {
      return { dir, files: readdirSync(dir) };
    } catch {
      continue;
    }
  }
  throw new Error(`${id}: no source`);
};
interface SourceChapter {
  key: string;
  number: number;
  readAloud: string;
  scenes: { title: string; play: string; check: string; failForward: string; choices: string[] }[];
}
const books = ids.map((id) => ({
  id,
  book: campaignBookSchema.parse(
    JSON.parse(readFileSync(new URL(`${id}/book.json`, LIBRARY), 'utf8')),
  ),
}));

describe('the books of the campaign library', () => {
  it('holds a book for every campaign: 53 books, 434 chapters, 1,323 pages', () => {
    expect(books).toHaveLength(53);
    expect(books.reduce((sum, { book }) => sum + book.chapters.length, 0)).toBe(434);
    expect(
      books.reduce(
        (sum, { book }) => sum + book.chapters.reduce((n, c) => n + c.pages.length, 0),
        0,
      ),
    ).toBe(1323);
    for (const { book } of books) expect(book.awaitingReading).toBeUndefined();
  });

  it.each(books)(
    '$id: every chapter and scene of the source is in the book, word for word',
    ({ id, book }) => {
      const { dir, files } = sourceOf(id);
      const chapters = files
        .filter((file) => /^(?:act|sessions)-\d+\.json$/.test(file))
        .flatMap((file) => JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as SourceChapter[])
        .sort((a, b) => a.number - b.number);
      expect(book.chapters.map((c) => c.key)).toEqual(chapters.map((c) => c.key));
      for (const [index, chapter] of chapters.entries()) {
        const told = book.chapters[index];
        expect(told?.readAloud).toBe(chapter.readAloud.trim());
        expect(
          told?.pages.map((p) => [p.title, p.text, p.check.line, p.failForward, p.choices]),
        ).toEqual(
          chapter.scenes.map((s) => [
            s.title.trim(),
            s.play.trim(),
            s.check.trim(),
            s.failForward.trim(),
            s.choices.map((c) => c.trim()),
          ]),
        );
        // Layer 1 writes nothing: no written page, no cue, no question of the book's own.
        for (const page of told?.pages ?? []) {
          expect(page.layer).toBe(1);
          expect(page.cues).toBeUndefined();
          expect(page.question).toBeUndefined();
        }
      }
    },
  );

  it.each(books)('$id: everything the book names exists in every variant', ({ id, book }) => {
    const packages = readdirSync(new URL(`${id}/packages/`, LIBRARY));
    expect(packages.length).toBeGreaterThan(0);
    for (const file of packages) {
      const pkg = campaignPackageSchema.parse(
        JSON.parse(readFileSync(new URL(`${id}/packages/${file}`, LIBRARY), 'utf8')),
      );
      expect(
        bookReferenceProblems(book, {
          places: new Set(pkg.entities.filter((e) => e.kind === 'location').map((e) => e.key)),
          people: new Set(pkg.entities.filter((e) => e.kind === 'npc').map((e) => e.key)),
          clues: new Set(pkg.clues.map((c) => c.key)),
          encounters: new Set(pkg.encounters.map((e) => e.key)),
        }),
        `${id}/${file}`,
      ).toEqual([]);
      const heroes = new Set(pkg.party);
      for (const chapter of book.chapters)
        for (const page of chapter.pages)
          for (const link of page.people) expect(heroes.has(link.person), link.person).toBe(false);
    }
  });

  it('ties most prepared encounters to a chapter and lists the rest', () => {
    const tied = books.reduce(
      (sum, { book }) => sum + book.chapters.reduce((n, c) => n + c.encounters.length, 0),
      0,
    );
    const loose = books.reduce((sum, { book }) => sum + book.looseEncounters.length, 0);
    expect(tied + loose).toBe(175);
    expect(loose).toBeLessThanOrEqual(12);
  });

  it('reads the check of most pages and never loses its line', () => {
    const pages = books.flatMap(({ book }) => book.chapters.flatMap((c) => c.pages));
    const by = (roll: string) => pages.filter((p) => p.check.roll === roll).length;
    expect(by('asked')).toBeGreaterThan(1100);
    expect(by('asked') + by('none') + by('unread')).toBe(1323);
    for (const page of pages) {
      expect(page.check.line.length).toBeGreaterThan(0);
      if (page.check.roll !== 'asked') expect(page.check.options).toEqual([]);
    }
  });
});
