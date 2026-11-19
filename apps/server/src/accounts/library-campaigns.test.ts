import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { derivedId, libraryCreationIds } from './library-campaigns.ts';

/** The internal IDs of a hub library creation (ADR 0058, notes of 2026-11-19). */
describe('a library creation’s IDs', () => {
  it('are UUIDs, the same for a repeated request and different for any other', () => {
    const input = {
      requestId: '7f8d2f3e-6c4b-4c1a-9d2e-1a2b3c4d5e6f',
      libraryId: 'rain-check',
      variantId: 'party-4',
    };
    const first = libraryCreationIds('account-1', input);
    expect(libraryCreationIds('account-1', input)).toEqual(first);
    const all = [
      first.scope.ownerId,
      first.scope.draftId,
      first.request,
      first.draftRequest,
      first.revisionRequest,
    ];
    for (const id of all) expect(z.uuid().safeParse(id).success).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    expect(libraryCreationIds('account-2', input).scope.ownerId).not.toBe(first.scope.ownerId);
    expect(
      libraryCreationIds('account-1', { ...input, variantId: 'party-5' }).scope.ownerId,
    ).not.toBe(first.scope.ownerId);
    expect(derivedId('a', 'b', 'c')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
