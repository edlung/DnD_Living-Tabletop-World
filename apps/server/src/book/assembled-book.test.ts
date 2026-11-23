import { campaignPackageSchema, type CampaignBook, type CampaignRevision } from '@ltw/contracts';
import type { WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { loadCampaignLibrary } from '../campaigns/library.ts';
import { RAVENFORD_RU_FIXTURES_DIR } from '../world-engine/ravenford-seed.ts';
import { seededEngine } from '../testing/ravenford-app.ts';
import { bookFromPackage, bookFromWorld } from './assembled-book.ts';
import { createBookSource } from './book-source.ts';

/**
 * A book from the world itself (docs/adr/0075-book-interface.md §5): every campaign opens as a
 * book. Where none was written, the server assembles one from what the campaign holds — and adds
 * not one word of its own.
 */
const library = await loadCampaignLibrary();
const content = campaignPackageSchema.parse(
  JSON.parse(library.packageJson('lighthouse', 'original-party') ?? ''),
);

/** Every text of a book, so that each can be found in what it was assembled from. */
const textsOf = (book: CampaignBook) => [
  book.title,
  ...book.chapters.flatMap((chapter) => [
    chapter.title,
    chapter.goal,
    chapter.readAloud,
    ...chapter.consequences.flatMap((step) => [step.if, step.then]),
    ...chapter.pages.flatMap((page) => [page.title, page.text, ...page.choices]),
  ]),
  ...book.people.flatMap((person) => [person.name, person.look]),
  ...book.clues.flatMap((clue) => [clue.name, clue.appearance, clue.statement]),
];

describe('the book of a package no one wrote a book for', () => {
  const book = bookFromPackage(content);

  it('has a chapter a situation, in the package’s order, each the campaign’s own words', () => {
    expect(book?.assembled).toBe(true);
    expect(book?.title).toBe(content.world.name);
    const situations = content.situations.slice(0, 40);
    expect(book?.chapters.map((chapter) => chapter.key)).toEqual(situations.map((s) => s.key));
    expect(book?.chapters[0]?.readAloud).toBe(content.world.opening.trim());
    const source = JSON.stringify(content);
    for (const text of textsOf(book as CampaignBook).filter((t) => t !== ''))
      expect(source.includes(JSON.stringify(text).slice(1, -1))).toBe(true);
    for (const page of book?.chapters.flatMap((chapter) => chapter.pages) ?? []) {
      expect(page.layer).toBe(1);
      expect(page.voice).toBe('dm');
      expect(page.check.roll).toBe('unread');
    }
    // A situation's words are the DM's: none is marked to be read aloud but the opening.
    expect(book?.chapters.slice(1).map((chapter) => chapter.readAloud)).toEqual(
      book?.chapters.slice(1).map(() => ''),
    );
  });

  it('leaves what the package does not hold empty, for the book to show as a gap', () => {
    for (const chapter of book?.chapters ?? []) {
      expect(chapter.dmNote).toBe('');
      expect(chapter.handouts).toEqual([]);
    }
    for (const person of book?.people ?? []) expect([person.want, person.public]).toEqual(['', '']);
    expect(book?.handouts).toEqual([]);
  });

  it('names each prepared fight once: at its place’s first chapter, or as a loose one', () => {
    const named = [
      ...(book?.chapters.flatMap((chapter) => chapter.encounters) ?? []),
      ...(book?.looseEncounters ?? []),
    ];
    expect(new Set(named).size).toBe(named.length);
    expect(named.toSorted()).toEqual(content.encounters.map((e) => e.key).toSorted());
  });

  it('has none for a package without a situation at one of its places', () => {
    expect(bookFromPackage({ ...content, situations: [] })).toBeNull();
  });

  it('is what a published campaign opens when the library has no book of its package', async () => {
    const renamed = { ...content, world: { ...content.world, name: 'Другой маяк' } };
    const ids = (keys: readonly string[], prefix: string) =>
      Object.fromEntries(keys.map((key, index) => [key, `${prefix}-${String(index)}`]));
    const revision = {
      content: renamed,
      identities: {
        entities: ids(
          renamed.entities.map((e) => e.key),
          'entity',
        ),
        knowledge: {},
        clues: ids(
          renamed.clues.map((c) => c.key),
          'clue',
        ),
        encounters: ids(
          renamed.encounters.map((e) => e.key),
          'encounter',
        ),
        scene: 'scene-0',
      },
    } as unknown as CampaignRevision;
    const source = createBookSource({
      library,
      published: { get: () => Promise.resolve({ frozen: { revision } }) },
      builtIn: {},
    });
    const state = {
      campaign: { campaignId: 'c-1', language: 'ru', adventure: null, name: 'Другой маяк' },
      bootstrap: { source: { ownerId: 'owner-1', draftId: 'draft-1' } },
    } as unknown as WorldState;
    const found = await source.bookOf(state);
    expect(found?.book.assembled).toBe(true);
    expect(found?.book.title).toBe('Другой маяк');
    const first = found?.book.chapters[0];
    expect(found?.ids.entities[first?.place ?? '']).toBe(
      revision.identities.entities[first?.place ?? ''],
    );
  });
});

const engine = await seededEngine(undefined, undefined, undefined, RAVENFORD_RU_FIXTURES_DIR);
const state = (await engine.load('ravenford'))?.state as WorldState;

describe('the book of a built-in adventure from its world', () => {
  it('has a chapter a place, the party’s first, with who is there and the clues that lie there', () => {
    const book = bookFromWorld(state);
    expect(book?.assembled).toBe(true);
    const start = state.scenes.get(state.activeSceneId ?? '')?.locationId;
    expect(book?.chapters[0]?.place).toBe(start);
    for (const chapter of book?.chapters ?? []) {
      expect(state.entities.get(chapter.place)?.kind).toBe('location');
      for (const key of chapter.people)
        expect(state.entities.get(key)?.placement?.locationId).toBe(chapter.place);
    }
    for (const chapter of book?.chapters ?? []) expect(chapter.readAloud).toBe('');
    const clues = book?.chapters.flatMap((chapter) => chapter.clues) ?? [];
    expect(clues.length).toBeGreaterThan(0);
    for (const key of clues) expect(state.investigation.clues.has(key)).toBe(true);
  });

  it('is the built-in campaign’s book while its written one waits, its keys the world’s IDs', async () => {
    const source = createBookSource({
      builtIn: { ravenford: { ...(bookFromWorld(state) as CampaignBook), awaitingReading: true } },
    });
    const found = await source.bookOf(state);
    expect(found?.book.awaitingReading).toBeUndefined();
    expect(found?.book.assembled).toBe(true);
    for (const [key, id] of Object.entries(found?.ids.entities ?? {})) expect(id).toBe(key);
  });

  it('adds no word of its own: every text is the world’s', () => {
    const book = bookFromWorld(state) as CampaignBook;
    const words = new Set([
      state.campaign?.name,
      ...[...state.entities.values()].flatMap((e) => [e.name, e.description.trim()]),
      ...[...state.investigation.clues.values()].map((clue) => clue.statement.trim()),
    ]);
    for (const text of textsOf(book).filter((t) => t !== '')) expect(words.has(text)).toBe(true);
  });
});
