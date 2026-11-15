import type { RecordedEvent } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import type { CuratedEntry, CuratedSet } from './curated-set.ts';
import { bindSeedEntities, seededEntityIds } from './seed-entities.ts';

/**
 * A ready-made character's picture (docs/adr/0058-campaign-content.md §5): the manifest names the
 * seed command that creates the character, and each copy binds it to the ID its history recorded.
 */
const created = (commandId: string, entityId: string, kind = 'character') =>
  ({
    type: 'EntityCreated',
    payload: { entityId, kind },
    causation: { commandId },
  }) as unknown as RecordedEvent;

const entry = (file: string, entityIds: string[]): CuratedEntry => ({
  file,
  entityIds,
  variant: 'reference',
  label: null,
  purpose: 'image',
  derivedFrom: null,
  mediaType: 'image/webp',
  sha256: '0'.repeat(64),
  originalSha256: '0'.repeat(64),
  generated: '2026-11-15',
  references: [],
  prompt: 'p',
});

const set = (entries: CuratedEntry[]): CuratedSet => ({
  model: 'm',
  entries,
  bytesOf: () => new Uint8Array([1]),
});

describe('seed-named pictures', () => {
  it('reads each seed command’s first created entity from a copy’s history', () => {
    const ids = seededEntityIds([
      created('c-1.hollowmere.world.0003', 'hollowmere', 'location'),
      created('c-1.hollowmere.party.0001', 'e-41'),
      created('c-1.hollowmere.party.0001', 'item-of-e-41', 'item'),
      created('c-1.hollowmere.party.0002', 'e-77'),
      created('c-1.some-request', 'e-99'),
    ]);
    expect(ids.get('seed-party-0001')).toBe('e-41');
    expect(ids.get('seed-party-0002')).toBe('e-77');
    expect(ids.get('seed-world-0003')).toBe('hollowmere');
    expect(ids.size).toBe(3);
  });

  it('binds seed names to the copy’s entities and leaves fixed IDs alone', () => {
    const bound = bindSeedEntities(
      set([
        entry('bryn.webp', ['seed-party-0001']),
        entry('gate.webp', ['north-gate']),
        entry('lost.webp', ['seed-party-0009']),
      ]),
      new Map([['seed-party-0001', 'e-41']]),
    );
    expect(bound.entries.map((one) => one.entityIds)).toEqual([['e-41'], ['north-gate'], []]);
    expect(bound.bytesOf('bryn.webp')).toEqual(new Uint8Array([1]));
  });
});
