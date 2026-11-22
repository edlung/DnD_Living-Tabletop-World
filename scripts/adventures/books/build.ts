import { readFileSync, writeFileSync } from 'node:fs';

import {
  CAMPAIGN_BOOK_VERSION,
  bookReferenceProblems,
  campaignBookSchema,
  type CampaignBook,
} from '../../../packages/contracts/src/index.ts';
import { hollowmereBook } from './hollowmere.ts';
import { readSeed } from './seed.ts';

/**
 * The DM's books of the two built-in adventures (docs/adr/0074-dm-book.md §2.8), Russian only:
 * `fixtures/hollowmere-ru/book.json` from the concept's spreads and `fixtures/ravenford-ru/
 * book.json` from the pages in `ravenford-pages.json`. Both carry `awaitingReading`: their text
 * was written for the book and the owner has not read it. Usage, from the repository root:
 * `node --conditions=@ltw/source scripts/adventures/books/build.ts`.
 */
const ROOT = new URL('../../../', import.meta.url);
export const BUILT_IN_BOOKS = {
  hollowmere: 'fixtures/hollowmere-ru/',
  ravenford: 'fixtures/ravenford-ru/',
} as const;
export type BuiltInBook = keyof typeof BUILT_IN_BOOKS;

function ravenfordBook(): CampaignBook {
  const seed = readSeed(new URL(BUILT_IN_BOOKS.ravenford, ROOT));
  const pages = JSON.parse(
    readFileSync(new URL('ravenford-pages.json', import.meta.url), 'utf8'),
  ) as { title: string; chapter: CampaignBook['chapters'][number] };
  return campaignBookSchema.parse({
    schemaVersion: CAMPAIGN_BOOK_VERSION,
    title: pages.title,
    awaitingReading: true,
    chapters: [pages.chapter],
    people: seed.people,
    clues: seed.clueCards,
    handouts: [],
    looseEncounters: [...seed.encounters].filter((key) => !pages.chapter.encounters.includes(key)),
  });
}

/** A built-in adventure's book, checked against its seed: every key it names exists there. */
export function builtInBook(adventure: BuiltInBook): CampaignBook {
  const book = adventure === 'hollowmere' ? hollowmereBook() : ravenfordBook();
  const seed = readSeed(new URL(BUILT_IN_BOOKS[adventure], ROOT));
  const problems = bookReferenceProblems(book, {
    places: seed.places,
    people: seed.entities,
    clues: seed.clues,
    encounters: seed.encounters,
  });
  if (problems.length > 0)
    throw new Error(
      `${adventure}: the book names what the seed lacks: ${problems
        .map((p) => `${p.path} → ${p.key}`)
        .join('; ')}`,
    );
  return book;
}

export const builtInBookJson = (adventure: BuiltInBook) =>
  `${JSON.stringify(builtInBook(adventure), null, 2)}\n`;
export const builtInBookFile = (adventure: BuiltInBook) =>
  new URL(`${BUILT_IN_BOOKS[adventure]}book.json`, ROOT);

if (import.meta.url === `file://${process.argv[1] ?? ''}`)
  for (const adventure of Object.keys(BUILT_IN_BOOKS) as BuiltInBook[]) {
    writeFileSync(builtInBookFile(adventure), builtInBookJson(adventure));
    process.stdout.write(`${adventure}: book.json\n`);
  }
