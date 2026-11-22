import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  campaignBookSchema,
  type BookIds,
  type CampaignBook,
  type CampaignRevision,
} from '@ltw/contracts';
import type { WorldState } from '@ltw/domain';

import { REPOSITORY_ROOT, type CampaignLibrary } from '../campaigns/library.ts';

/**
 * Which book a live campaign has (docs/adr/0074-dm-book.md §3.1). A campaign published from a
 * package has the library's book of that package; a campaign of a built-in adventure has the
 * adventure's own, in Russian; any other campaign has none. A book that still waits for the
 * owner's reading stays closed unless this source was told to show such books (the journeys).
 */
export interface CampaignBookFound {
  readonly book: CampaignBook;
  /** What the book's keys are in this campaign's world. */
  readonly ids: BookIds;
}
export interface BookSource {
  bookOf(state: WorldState): Promise<CampaignBookFound | null>;
}

/** The record of how a campaign was published: the one thing read from the workshop's store. */
export interface PublishedRevisions {
  get(scope: {
    readonly ownerId: string;
    readonly draftId: string;
  }): Promise<{ readonly frozen: { readonly revision: CampaignRevision } } | null>;
}

const BUILT_IN_FILES: Readonly<Record<string, string>> = {
  ravenford: 'fixtures/ravenford-ru/book.json',
  hollowmere: 'fixtures/hollowmere-ru/book.json',
};

/** The built-in adventures' books by adventure name; a missing file is no book. */
export async function loadBuiltInBooks(
  root: string = REPOSITORY_ROOT,
): Promise<Readonly<Record<string, CampaignBook>>> {
  const books: Record<string, CampaignBook> = {};
  for (const [adventure, file] of Object.entries(BUILT_IN_FILES)) {
    let text: string;
    try {
      text = await readFile(join(root, file), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    books[adventure] = campaignBookSchema.parse(JSON.parse(text));
  }
  return books;
}

const keysOf = (book: CampaignBook) => {
  const entities = new Set<string>();
  const clues = new Set(book.clues.map((clue) => clue.key));
  const encounters = new Set(book.looseEncounters);
  for (const person of book.people) entities.add(person.key);
  for (const clue of book.clues) {
    if (clue.place !== undefined) entities.add(clue.place);
    for (const subject of clue.subjects) entities.add(subject);
  }
  for (const chapter of book.chapters) {
    entities.add(chapter.place);
    for (const key of chapter.encounters) encounters.add(key);
    for (const page of chapter.pages) {
      if (page.place !== undefined) entities.add(page.place);
      for (const cue of page.cues ?? [])
        if (cue.encounter !== undefined) encounters.add(cue.encounter);
    }
  }
  if (book.routes) encounters.add(book.routes.defeat.encounter);
  return { entities, clues, encounters };
};

const pick = (
  keys: ReadonlySet<string>,
  ids: (key: string) => string | undefined,
): Record<string, string> =>
  Object.fromEntries(
    [...keys].flatMap((key) => {
      const id = ids(key);
      return id === undefined ? [] : [[key, id] as const];
    }),
  );

export function createBookSource(options: {
  readonly library?: CampaignLibrary | undefined;
  readonly published?: PublishedRevisions | undefined;
  readonly builtIn: Readonly<Record<string, CampaignBook>>;
  /** Also serve a book that waits for the owner's reading. */
  readonly showAwaiting?: boolean;
}): BookSource {
  const open = (book: CampaignBook | undefined) =>
    book && (options.showAwaiting === true || book.awaitingReading !== true) ? book : null;
  return {
    bookOf: async (state) => {
      if (!state.campaign) return null;
      if (state.bootstrap) {
        const { ownerId, draftId } = state.bootstrap.source;
        const record = await options.published?.get({ ownerId, draftId });
        const found = record && options.library?.bookFor(record.frozen.revision);
        const book = open(found?.book);
        if (!record || !book) return null;
        const { identities } = record.frozen.revision;
        const keys = keysOf(book);
        return {
          book,
          ids: {
            entities: pick(keys.entities, (key) => identities.entities[key]),
            clues: pick(keys.clues, (key) => identities.clues[key]),
            encounters: pick(keys.encounters, (key) => identities.encounters[key]),
          },
        };
      }
      // A built-in adventure's seed IDs are its book's keys. Russian only (ADR 0074 §2.8).
      if (state.campaign.language !== 'ru') return null;
      const book = open(options.builtIn[state.campaign.adventure ?? 'ravenford']);
      if (!book) return null;
      const keys = keysOf(book);
      const same = (key: string) => key;
      return {
        book,
        ids: {
          entities: pick(keys.entities, (key) => (state.entities.has(key) ? key : undefined)),
          clues: pick(keys.clues, (key) => (state.investigation.clues.has(key) ? key : undefined)),
          encounters: pick(keys.encounters, same),
        },
      };
    },
  };
}
