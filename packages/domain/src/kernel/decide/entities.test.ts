import type { RejectionCode } from '@ltw/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  START,
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
  type Harness,
} from '../testing/kernel-harness.ts';

let harness: Harness;

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
});

const npc = (entityId: string, extra: Record<string, unknown> = {}) => ({
  type: 'CreateEntity',
  entityId,
  kind: 'npc',
  name: entityId,
  existsSince: null,
  ...extra,
});

const location = (
  entityId: string,
  parentId: string | null,
  extra: Record<string, unknown> = {},
) => ({
  type: 'CreateEntity',
  entityId,
  kind: 'location',
  name: entityId,
  existsSince: null,
  location: { type: 'building', parentId },
  ...extra,
});

describe('CreateEntity', () => {
  it('creates an entity with stable identity and default state', async () => {
    expectAccepted(await harness.submit(npc('tomas', { description: 'Young guard' })));

    expect((await harness.state()).entities.get('tomas')).toEqual({
      entityId: 'tomas',
      kind: 'npc',
      name: 'tomas',
      description: 'Young guard',
      existsSince: null,
      location: null,
      placement: null,
      status: 'active',
    });
  });

  it('generates an ID when none is given', async () => {
    const result = expectAccepted(
      await harness.submit({ type: 'CreateEntity', kind: 'item', name: 'Coin', existsSince: null }),
    );
    const [event] = (await harness.history()).filter(
      (e) => e.sequence === result.events[0]?.sequence,
    );

    expect(event?.type === 'EntityCreated' && event.payload.entityId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('never reuses an ID', async () => {
    expectRejected(await harness.submit(npc('npc')), 'ID_ALREADY_USED');
    expectRejected(await harness.submit(location('square', 'town')), 'ID_ALREADY_USED');
  });

  it('rejects existence that begins after the world clock', async () => {
    expectRejected(
      await harness.submit(npc('ghost', { existsSince: START + 1 })),
      'TEMPORAL_CONFLICT',
    );
    expectAccepted(await harness.submit(npc('newborn', { existsSince: START })));
  });

  it('requires location data exactly for locations', async () => {
    expectRejected(
      await harness.submit({ ...location('x', 'town'), kind: 'npc' }),
      'INVALID_ENTITY_DEFINITION',
    );
    expectRejected(
      await harness.submit(npc('y', { kind: 'location' })),
      'INVALID_ENTITY_DEFINITION',
    );
  });

  it('nests locations only under existing, usable locations that existed first', async () => {
    expectRejected(await harness.submit(location('a', 'missing')), 'ENTITY_NOT_FOUND');
    expectRejected(await harness.submit(location('b', 'npc')), 'NOT_A_LOCATION');
    expectAccepted(await harness.submit(location('ruin', 'town')));
    expectAccepted(
      await harness.submit({ type: 'ChangeEntityStatus', entityId: 'ruin', status: 'destroyed' }),
    );
    expectRejected(await harness.submit(location('c', 'ruin')), 'ENTITY_DESTROYED');

    expectAccepted(
      await harness.submit(location('new-hall', 'town', { existsSince: START - 100 })),
    );
    expectRejected(
      await harness.submit(location('d', 'new-hall', { existsSince: START - 200 })),
      'TEMPORAL_CONFLICT',
    );
    expectRejected(await harness.submit(location('e', 'new-hall')), 'TEMPORAL_CONFLICT');
    expectAccepted(await harness.submit(location('f', 'new-hall', { existsSince: START - 100 })));
  });

  it('places on creation with backstory inside both existences and not after the clock', async () => {
    expectAccepted(
      await harness.submit(
        npc('tomas', {
          existsSince: START - 1_000_000,
          placement: { locationId: 'square', since: START - 5 * 3600 },
        }),
      ),
    );
    expect((await harness.state()).entities.get('tomas')?.placement).toEqual({
      locationId: 'square',
      since: START - 5 * 3600,
    });

    const cases: [Record<string, unknown>, RejectionCode][] = [
      [
        { existsSince: START - 10, placement: { locationId: 'square', since: START - 20 } },
        'TEMPORAL_CONFLICT',
      ],
      [
        { existsSince: START - 10, placement: { locationId: 'square', since: null } },
        'TEMPORAL_CONFLICT',
      ],
      [{ placement: { locationId: 'square', since: START + 1 } }, 'TEMPORAL_CONFLICT'],
      [{ placement: { locationId: 'missing', since: START } }, 'ENTITY_NOT_FOUND'],
      [{ placement: { locationId: 'lamp', since: START } }, 'NOT_A_LOCATION'],
    ];
    for (const [index, [extra, code]] of cases.entries()) {
      expectRejected(await harness.submit(npc(`candidate-${index}`, extra)), code);
    }
  });

  it('rejects placement inside a location that did not exist yet', async () => {
    expectAccepted(await harness.submit(location('new-shop', 'town', { existsSince: START - 60 })));

    expectRejected(
      await harness.submit(
        npc('clerk', { placement: { locationId: 'new-shop', since: START - 120 } }),
      ),
      'TEMPORAL_CONFLICT',
    );
    expectAccepted(
      await harness.submit(
        npc('clerk', { placement: { locationId: 'new-shop', since: START - 60 } }),
      ),
    );
  });

  it('does not place locations or factions', async () => {
    expectRejected(
      await harness.submit({
        ...location('kiosk', 'town'),
        placement: { locationId: 'square', since: null },
      }),
      'INVALID_PLACEMENT',
    );
    expectRejected(
      await harness.submit({
        type: 'CreateEntity',
        entityId: 'guild',
        kind: 'faction',
        name: 'Guild',
        existsSince: null,
        placement: { locationId: 'square', since: null },
      }),
      'INVALID_PLACEMENT',
    );
  });
});

describe('PlaceEntity', () => {
  it('moves an entity at the current world time and records where it came from', async () => {
    expectAccepted(await harness.submit({ type: 'AdvanceWorldTime', by: 600 }));
    expectAccepted(
      await harness.submit({ type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' }),
    );

    const history = await harness.history();
    expect(history.at(-1)?.payload).toEqual({
      entityId: 'npc',
      locationId: 'inn',
      since: START + 600,
      previousLocationId: 'square',
    });
    expect((await harness.state()).entities.get('npc')?.placement).toEqual({
      locationId: 'inn',
      since: START + 600,
    });
  });

  it('rejects no-op, invalid kinds, destroyed things, and bad targets', async () => {
    expectRejected(
      await harness.submit({ type: 'PlaceEntity', entityId: 'npc', locationId: 'square' }),
      'NO_EFFECT',
    );
    expectRejected(
      await harness.submit({ type: 'PlaceEntity', entityId: 'square', locationId: 'inn' }),
      'INVALID_PLACEMENT',
    );
    expectRejected(
      await harness.submit({ type: 'PlaceEntity', entityId: 'npc', locationId: 'lamp' }),
      'NOT_A_LOCATION',
    );
    expectRejected(
      await harness.submit({ type: 'PlaceEntity', entityId: 'ghost', locationId: 'inn' }),
      'ENTITY_NOT_FOUND',
    );
    expectAccepted(
      await harness.submit({ type: 'ChangeEntityStatus', entityId: 'lamp', status: 'destroyed' }),
    );
    expectRejected(
      await harness.submit({ type: 'PlaceEntity', entityId: 'lamp', locationId: 'square' }),
      'ENTITY_DESTROYED',
    );
  });

  it('allows moving the dead (bodies are still things)', async () => {
    expectAccepted(
      await harness.submit({ type: 'ChangeEntityStatus', entityId: 'npc', status: 'dead' }),
    );
    expectAccepted(
      await harness.submit({ type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' }),
    );
  });
});

describe('UpdateEntityProfile and ChangeEntityStatus', () => {
  it('records only the fields that change, with from/to values', async () => {
    expectAccepted(
      await harness.submit({
        type: 'UpdateEntityProfile',
        entityId: 'npc',
        name: 'Nia',
        description: 'Baker',
      }),
    );

    expect((await harness.history()).at(-1)?.payload).toEqual({
      entityId: 'npc',
      description: { from: '', to: 'Baker' },
    });
    expectRejected(
      await harness.submit({ type: 'UpdateEntityProfile', entityId: 'npc', name: 'Nia' }),
      'NO_EFFECT',
    );
  });

  it('keeps identity while profile, placement, and status change', async () => {
    expectAccepted(
      await harness.submit({ type: 'UpdateEntityProfile', entityId: 'npc', name: 'Nia the Bold' }),
    );
    expectAccepted(
      await harness.submit({ type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' }),
    );
    expectAccepted(
      await harness.submit({ type: 'ChangeEntityStatus', entityId: 'npc', status: 'dead' }),
    );

    const entity = (await harness.state()).entities.get('npc');
    expect(entity).toMatchObject({
      entityId: 'npc',
      kind: 'npc',
      name: 'Nia the Bold',
      status: 'dead',
    });
  });

  it('enforces statuses per kind', async () => {
    expectRejected(
      await harness.submit({ type: 'ChangeEntityStatus', entityId: 'npc', status: 'destroyed' }),
      'INVALID_STATUS',
    );
    expectRejected(
      await harness.submit({ type: 'ChangeEntityStatus', entityId: 'lamp', status: 'dead' }),
      'INVALID_STATUS',
    );
    expectRejected(
      await harness.submit({ type: 'ChangeEntityStatus', entityId: 'npc', status: 'active' }),
      'NO_EFFECT',
    );
    expectAccepted(
      await harness.submit({ type: 'ChangeEntityStatus', entityId: 'town', status: 'destroyed' }),
    );
  });
});
