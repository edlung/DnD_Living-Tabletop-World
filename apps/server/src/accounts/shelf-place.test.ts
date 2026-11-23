import { knownEntityIds, partyMemberIds, resolvePerspective, type WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { seededEngine } from '../testing/ravenford-app.ts';
import { placeOf } from './accounts.ts';

/**
 * Where the party is, as the shelf names it (docs/adr/0075-book-interface.md §10): the place's
 * name when the party knows it, nothing when it does not — not even for its DM's own seat list.
 */
describe('the place on the shelf', () => {
  it('names a place the party knows and keeps one it does not', async () => {
    const snapshot = await (await seededEngine()).load('ravenford');
    if (!snapshot) throw new Error('no Ravenford');
    const { state } = snapshot;
    const dm = { actorId: 'dm-ravenford', kind: 'user' } as const;
    expect(placeOf(state, dm)).toBe('Market Square');

    const party = resolvePerspective(state, dm, { kind: 'PARTY' });
    if (!party.ok) throw new Error('no party');
    const known = knownEntityIds(state, party.perspective);
    const unknown = [...state.entities.values()].find(
      (entity) => entity.kind === 'location' && !known.has(entity.entityId),
    );
    if (!unknown) throw new Error('Ravenford has no place the party does not know');
    const entities = new Map(state.entities);
    for (const id of partyMemberIds(state)) {
      const member = entities.get(id);
      if (member?.placement) {
        entities.set(id, {
          ...member,
          placement: { ...member.placement, locationId: unknown.entityId },
        });
      }
    }
    const moved: WorldState = { ...state, entities };
    expect(placeOf(moved, dm)).toBeNull();
  });
});
