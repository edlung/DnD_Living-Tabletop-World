import { campaignPackageSchema, type CampaignRevision } from '@ltw/contracts';
import type { WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { loadCampaignLibrary } from '../campaigns/library.ts';
import { createBookSource } from './book-source.ts';

/**
 * Which book a published campaign has (docs/adr/0074-dm-book.md §3.1): the library's, found
 * through the record of the campaign's publishing, with the book's keys resolved to the world's
 * IDs. The state here is the two fields the source reads.
 */
const library = await loadCampaignLibrary();
const content = campaignPackageSchema.parse(
  JSON.parse(library.packageJson('lighthouse', 'original-party') ?? ''),
);
const opaque = (keys: readonly string[], prefix: string) =>
  Object.fromEntries(keys.map((key, index) => [key, `${prefix}-${String(index)}`]));
const revisionOf = (pkg: typeof content): CampaignRevision =>
  ({
    content: pkg,
    identities: {
      entities: opaque(
        pkg.entities.map((e) => e.key),
        'entity',
      ),
      knowledge: {},
      clues: opaque(
        pkg.clues.map((c) => c.key),
        'clue',
      ),
      encounters: opaque(
        pkg.encounters.map((e) => e.key),
        'encounter',
      ),
      scene: 'scene-0',
    },
  }) as unknown as CampaignRevision;
const published = (revision: CampaignRevision | null) => ({
  get: (scope: { ownerId: string; draftId: string }) =>
    Promise.resolve(
      revision && scope.ownerId === 'owner-1' && scope.draftId === 'draft-1'
        ? { frozen: { revision } }
        : null,
    ),
});
const state = (source: { ownerId: string; draftId: string }) =>
  ({
    campaign: { campaignId: 'c-1', language: 'ru', adventure: null },
    bootstrap: { source },
  }) as unknown as WorldState;
const OWN = { ownerId: 'owner-1', draftId: 'draft-1' };

describe('the book of a published campaign', () => {
  it('is the library’s book of its package, its keys resolved to the world’s IDs', async () => {
    const revision = revisionOf(content);
    const source = createBookSource({ library, published: published(revision), builtIn: {} });
    const found = await source.bookOf(state(OWN));
    expect(found?.book.title).toBe('Маяк Между Ветрами');
    expect(found?.book.chapters).toHaveLength(12);
    const first = found?.book.chapters[0];
    expect(found?.ids.entities[first?.place ?? '']).toBe(
      revision.identities.entities[first?.place ?? ''],
    );
    for (const person of found?.book.people ?? [])
      expect(found?.ids.entities[person.key]).toMatch(/^entity-\d+$/);
    for (const clue of found?.book.clues ?? [])
      expect(found?.ids.clues[clue.key]).toMatch(/^clue-/);
    for (const key of found?.book.chapters.flatMap((c) => c.encounters) ?? [])
      expect(found?.ids.encounters[key]).toMatch(/^encounter-/);
    // Only what the book names: a hero's key is not handed out with it.
    for (const hero of content.party) expect(found?.ids.entities[hero]).toBeUndefined();
  });

  it('finds the book of a package the library no longer ships as it is, by the campaign’s name', async () => {
    const edited = {
      ...content,
      brief: { ...content.brief, tone: `${content.brief.tone} (edited)` },
    };
    const source = createBookSource({
      library,
      published: published(revisionOf(edited)),
      builtIn: {},
    });
    expect((await source.bookOf(state(OWN)))?.book.title).toBe('Маяк Между Ветрами');
    // Renamed, or without something the book names, it is another campaign: the library's book
    // is not its, and it opens the book assembled from its own package (ADR 0075 §5).
    const renamed = { ...edited, world: { ...edited.world, name: 'Другой маяк' } };
    const cut = { ...edited, clues: edited.clues.slice(1) };
    for (const other of [renamed, cut]) {
      const own = createBookSource({
        library,
        published: published(revisionOf(other)),
        builtIn: {},
      });
      const found = await own.bookOf(state(OWN));
      expect(found?.book.assembled).toBe(true);
      expect(found?.book.title).toBe(other.world.name);
    }
  });

  it('has none without the record of its publishing or a campaign; without the library its own', async () => {
    const revision = revisionOf(content);
    const whole = createBookSource({ library, published: published(revision), builtIn: {} });
    expect(await whole.bookOf(state({ ownerId: 'owner-2', draftId: 'draft-1' }))).toBeNull();
    const bare = createBookSource({ published: published(revision), builtIn: {} });
    expect((await bare.bookOf(state(OWN)))?.book.assembled).toBe(true);
    expect(await createBookSource({ library, builtIn: {} }).bookOf(state(OWN))).toBeNull();
    expect(await whole.bookOf({ campaign: null } as unknown as WorldState)).toBeNull();
  });
});
