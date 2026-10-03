import { beforeEach, describe, expect, it } from 'vitest';

import { EMPTY_WORLD_STATE, type EntityState, type WorldState } from '../state.ts';
import {
  DM,
  START,
  SYSTEM,
  createHarness,
  expectAccepted,
  seedBasicWorld,
  type Harness,
} from '../testing/kernel-harness.ts';
import { auditTrail } from './audit-trail.ts';
import { checkWorldIntegrity } from './integrity.ts';
import { worldViewAt } from './world-view.ts';

let harness: Harness;

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
});

describe('auditTrail', () => {
  it('answers who, what, when, and why for every event', async () => {
    expectAccepted(
      await harness.submit(
        { type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' },
        { commandId: 'move', reason: 'Nia goes to work', actor: SYSTEM },
      ),
    );
    const { history } = await harness.snapshot();
    const trail = auditTrail(history, {
      commands: await harness.engine.commandLog('test-campaign'),
    });

    expect(trail).toHaveLength(history.length);
    expect(
      trail.every((entry) => entry.actor.actorId.length > 0 && entry.commandId.length > 0),
    ).toBe(true);
    expect(trail.at(-1)).toMatchObject({
      type: 'EntityPlaced',
      commandType: 'PlaceEntity',
      actor: SYSTEM,
      reason: 'Nia goes to work',
      worldTime: START,
      undoneBy: null,
    });
  });

  it('filters by entity and marks undone changes and their compensation', async () => {
    expectAccepted(
      await harness.submit(
        { type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' },
        { commandId: 'move' },
      ),
    );
    expectAccepted(
      await harness.submit({ type: 'UndoCommand', targetCommandId: 'move' }, { commandId: 'undo' }),
    );
    expectAccepted(
      await harness.submit({ type: 'UpdateEntityProfile', entityId: 'lamp', name: 'Old lamp' }),
    );

    const trail = auditTrail(await harness.history(), { filter: { entityId: 'npc' } });

    expect(trail.map((entry) => [entry.type, entry.undoneBy, entry.compensates])).toEqual([
      ['EntityCreated', null, null],
      ['EntityPlaced', null, null],
      ['EntityPlaced', 'undo', null],
      ['CommandUndone', null, 'move'],
    ]);
    expect(
      auditTrail(await harness.history(), { filter: { actorId: DM.actorId } }).length,
    ).toBeGreaterThan(0);
    expect(auditTrail(await harness.history(), { filter: { actorId: 'nobody' } })).toEqual([]);
  });
});

describe('worldViewAt: the timeline under the current canon', () => {
  it('reconstructs placement and status at earlier world times', async () => {
    expectAccepted(await harness.submit({ type: 'AdvanceWorldTime', by: 3600 }));
    expectAccepted(
      await harness.submit({ type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' }),
    );
    expectAccepted(await harness.submit({ type: 'AdvanceWorldTime', by: 3600 }));
    expectAccepted(
      await harness.submit({ type: 'ChangeEntityStatus', entityId: 'npc', status: 'dead' }),
    );
    const history = await harness.history();

    const at = (time: number) => worldViewAt(history, time).entities.get('npc');
    expect(at(START)).toMatchObject({ locationId: 'square', status: 'active' });
    expect(at(START + 3600)).toMatchObject({ locationId: 'inn', status: 'active' });
    expect(at(START + 7200)).toMatchObject({ locationId: 'inn', status: 'dead' });
  });

  it('includes backstory authored later and applies profile corrections to the whole timeline', async () => {
    expectAccepted(await harness.submit({ type: 'AdvanceWorldTime', by: 18_000 }));
    expectAccepted(
      await harness.submit({
        type: 'CreateEntity',
        entityId: 'tomas',
        kind: 'npc',
        name: 'Tomas Reed',
        existsSince: START - 700_000_000,
        placement: { locationId: 'square', since: START - 3600 },
      }),
    );
    expectAccepted(
      await harness.submit({ type: 'UpdateEntityProfile', entityId: 'npc', name: 'Nia Vale' }),
    );
    const history = await harness.history();

    expect(worldViewAt(history, START).entities.get('tomas')).toMatchObject({
      locationId: 'square',
    });
    expect(worldViewAt(history, START - 7200).entities.get('tomas')).toMatchObject({
      locationId: null,
    });
    expect(worldViewAt(history, START - 800_000_000).entities.has('tomas')).toBe(false);
    expect(worldViewAt(history, START).entities.get('npc')?.name).toBe('Nia Vale');
  });

  it('excludes undone changes and reports scenes active at the time', async () => {
    expectAccepted(
      await harness.submit({
        type: 'StartScene',
        sceneId: 's1',
        title: 'Market',
        locationId: 'square',
      }),
    );
    expectAccepted(await harness.submit({ type: 'AdvanceWorldTime', by: 600 }));
    expectAccepted(
      await harness.submit(
        { type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' },
        { commandId: 'move' },
      ),
    );
    expectAccepted(await harness.submit({ type: 'UndoCommand', targetCommandId: 'move' }));
    expectAccepted(await harness.submit({ type: 'EndScene', sceneId: 's1' }));
    const history = await harness.history();
    const now = (await harness.state()).clock;

    expect(worldViewAt(history, now).entities.get('npc')?.locationId).toBe('square');
    expect(worldViewAt(history, START).scenes).toEqual([
      { sceneId: 's1', title: 'Market', locationId: 'square' },
    ]);
    expect(worldViewAt(history, now).scenes).toEqual([]);
    expect(() => worldViewAt(history, now + 1)).toThrow(RangeError);
  });
});

describe('checkWorldIntegrity', () => {
  it('accepts a consistent world', async () => {
    expect(checkWorldIntegrity(await harness.state())).toEqual([]);
  });

  it('reports structural violations', async () => {
    const state = await harness.state();
    const npc = state.entities.get('npc') as EntityState;
    const broken: WorldState = {
      ...state,
      activeSceneId: 'missing-scene',
      entities: new Map(state.entities)
        .set('npc', { ...npc, placement: { locationId: 'lamp', since: null }, status: 'destroyed' })
        .set('stray', { ...npc, entityId: 'stray', existsSince: state.clock + 1 }),
    };

    const violations = checkWorldIntegrity(broken);
    expect(violations).toEqual(
      expect.arrayContaining([
        'entity npc placed in non-location lamp',
        'entity npc has status destroyed invalid for npc',
        'entity stray missing from used IDs',
        'entity stray exists after the clock',
        'active scene pointer does not match the open scene',
      ]),
    );
    expect(checkWorldIntegrity({ ...EMPTY_WORLD_STATE, version: 3 })).toContain(
      'events exist without a campaign',
    );
  });
});
