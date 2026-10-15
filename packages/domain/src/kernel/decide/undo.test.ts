import { beforeEach, describe, expect, it } from 'vitest';

import { footprintOf, restoredFacts } from '../facts.ts';
import type { WorldState } from '../state.ts';
import {
  PLAYER,
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

/** The world facts undo must restore (bookkeeping such as version and traces aside). */
const worldFacts = (state: WorldState) => ({
  entities: state.entities,
  scenes: state.scenes,
  clock: state.clock,
  activeSceneId: state.activeSceneId,
});

const run = async (commandId: string, command: Record<string, unknown>) =>
  expectAccepted(await harness.submit(command, { commandId }));
const undo = (target: string, commandId = `undo-${target}`) =>
  harness.submit({ type: 'UndoCommand', targetCommandId: target }, { commandId });

describe('safe undo restores the exact prior world', () => {
  it.each<[string, Record<string, unknown>[], Record<string, unknown>]>([
    [
      'CreateEntity with backdated placement',
      [],
      {
        type: 'CreateEntity',
        entityId: 'tomas',
        kind: 'npc',
        name: 'Tomas',
        existsSince: START - 1000,
        placement: { locationId: 'square', since: START - 500 },
      },
    ],
    ['PlaceEntity', [], { type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' }],
    [
      'UpdateEntityProfile',
      [],
      { type: 'UpdateEntityProfile', entityId: 'npc', name: 'Renamed', description: 'New' },
    ],
    [
      'ChangeEntityStatus',
      [],
      { type: 'ChangeEntityStatus', entityId: 'inn', status: 'destroyed' },
    ],
    ['StartScene', [], { type: 'StartScene', sceneId: 's1', title: 'S', locationId: 'square' }],
    [
      'EndScene',
      [{ type: 'StartScene', sceneId: 's1', title: 'S', locationId: 'square' }],
      { type: 'EndScene', sceneId: 's1' },
    ],
    ['AdvanceWorldTime', [], { type: 'AdvanceWorldTime', by: 7200 }],
    [
      // One command creates an entity and then edits it: removing it restores every facet.
      'ApplyAuthoring that creates an NPC, then moves and edits him',
      [],
      {
        type: 'ApplyAuthoring',
        proposalId: '00000000-0000-4000-8000-000000000001',
        revision: 1,
        summary: 'Tomas, moved and renamed at once.',
        source: { kind: 'dm' },
        commands: [
          {
            type: 'CreateEntity',
            entityId: 'tomas',
            kind: 'npc',
            name: 'Tomas',
            existsSince: null,
            placement: { locationId: 'square', since: null },
          },
          { type: 'PlaceEntity', entityId: 'tomas', locationId: 'inn' },
          {
            type: 'UpdateEntityProfile',
            entityId: 'tomas',
            name: 'Tomas Reed',
            description: 'A guard',
          },
        ],
        confirmation: { riskLevel: 'L2', acknowledgedWarnings: [] },
      },
    ],
  ])('%s', async (_label, setup, command) => {
    for (const [index, step] of setup.entries()) await run(`setup-${index}`, step);
    const before = await harness.snapshot();

    const target = await run('target', command);
    const result = expectAccepted(await undo('target'));
    const after = await harness.snapshot();

    expect(worldFacts(after.state)).toEqual(worldFacts(before.state));
    expect(after.state.commands.get('target')?.undoneBy).toBe('undo-target');
    // History is preserved: original events stay, one compensating event is appended.
    expect(after.history.slice(0, before.history.length)).toEqual(before.history);
    expect(
      after.history
        .slice(before.history.length, before.history.length + target.events.length)
        .map((event) => event.eventId),
    ).toEqual(target.events.map((event) => event.eventId));
    expect(after.history.length).toBe(before.history.length + target.events.length + 1);
    expect(result.events.map((event) => event.type)).toEqual(['CommandUndone']);

    // The restores cover exactly the facts the target wrote.
    const targetEvents = after.history.filter((event) => event.causation.commandId === 'target');
    const compensation = after.history.at(-1);
    if (compensation?.type !== 'CommandUndone') throw new Error('expected CommandUndone');
    expect(new Set(compensation.payload.restores.flatMap(restoredFacts))).toEqual(
      new Set(targetEvents.flatMap((event) => footprintOf(event).writes)),
    );
  });
});

describe('unsafe undo is rejected with explicit blockers', () => {
  it('blocks undoing a location that something was later placed into', async () => {
    await run('make-tower', {
      type: 'CreateEntity',
      entityId: 'tower',
      kind: 'location',
      name: 'Tower',
      existsSince: null,
      location: { type: 'building', parentId: 'town' },
    });
    await run('move-npc', { type: 'PlaceEntity', entityId: 'npc', locationId: 'tower' });

    const blocked = expectRejected(await undo('make-tower'), 'UNDO_UNSAFE');
    expect(blocked.details?.['blockers']).toEqual([
      { commandId: 'move-npc', commandType: 'PlaceEntity', sequence: expect.any(Number) as number },
    ]);

    expectAccepted(await undo('move-npc'));
    expectAccepted(await undo('make-tower', 'undo-tower-2'));
    const state = await harness.state();
    expect(state.entities.has('tower')).toBe(false);
    expect(state.entities.get('npc')?.placement?.locationId).toBe('square');
  });

  it('blocks undoing a creation after the entity was changed or referenced', async () => {
    await run('make-guard', {
      type: 'CreateEntity',
      entityId: 'guard',
      kind: 'npc',
      name: 'Guard',
      existsSince: null,
    });
    await run('rename-guard', { type: 'UpdateEntityProfile', entityId: 'guard', name: 'Tomas' });
    expectRejected(await undo('make-guard'), 'UNDO_UNSAFE');

    await run('make-hall', {
      type: 'CreateEntity',
      entityId: 'hall',
      kind: 'location',
      name: 'Hall',
      existsSince: null,
      location: { type: 'building', parentId: 'town' },
    });
    await run('make-room', {
      type: 'CreateEntity',
      entityId: 'room',
      kind: 'location',
      name: 'Room',
      existsSince: null,
      location: { type: 'room', parentId: 'hall' },
    });
    expectRejected(await undo('make-hall'), 'UNDO_UNSAFE');
    await run('scene-in-room', {
      type: 'StartScene',
      sceneId: 'sc',
      title: 'T',
      locationId: 'room',
    });
    expectRejected(await undo('make-room'), 'UNDO_UNSAFE');
  });

  it('allows undoing a time advance only while nothing has happened since', async () => {
    await run('advance', { type: 'AdvanceWorldTime', by: 86_400 });
    await run('move', { type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' });

    expectRejected(await undo('advance'), 'UNDO_UNSAFE');
    expectAccepted(await undo('move'));
    expectAccepted(await undo('advance', 'undo-advance-2'));
    expect((await harness.state()).clock).toBe(START);
  });

  it('allows undo of independent facts despite later activity', async () => {
    await run('rename', { type: 'UpdateEntityProfile', entityId: 'npc', name: 'Renamed' });
    await run('move', { type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' });
    await run('advance', { type: 'AdvanceWorldTime', by: 600 });

    expectAccepted(await undo('rename'));
    const npc = (await harness.state()).entities.get('npc');
    expect(npc).toMatchObject({ name: 'Nia', placement: { locationId: 'inn', since: START } });
  });

  it('treats an undone later command and its compensation as cancelled', async () => {
    await run('to-inn', { type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' });
    await run('to-town', { type: 'PlaceEntity', entityId: 'npc', locationId: 'town' });
    expectRejected(await undo('to-inn'), 'UNDO_UNSAFE');

    expectAccepted(await undo('to-town'));
    expectAccepted(await undo('to-inn', 'undo-to-inn-2'));
    expect((await harness.state()).entities.get('npc')?.placement).toEqual({
      locationId: 'square',
      since: null,
    });
  });
});

describe('undo bookkeeping', () => {
  it('rejects unknown, repeated, unsupported, and unauthorized undo', async () => {
    await run('move', { type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' });
    const campaignCommand = (await harness.history())[0]?.causation.commandId ?? '';

    expectRejected(await undo('nope'), 'COMMAND_NOT_FOUND');
    expectRejected(await undo(campaignCommand), 'UNDO_NOT_SUPPORTED');
    expectRejected(
      await harness.submit({ type: 'UndoCommand', targetCommandId: 'move' }, { actor: PLAYER }),
      'FORBIDDEN',
    );
    expectAccepted(await undo('move'));
    expectRejected(await undo('move', 'again'), 'ALREADY_UNDONE');
    expectRejected(await undo('undo-move'), 'UNDO_NOT_SUPPORTED');
  });

  it('never reuses the ID of an undone creation', async () => {
    await run('make', {
      type: 'CreateEntity',
      entityId: 'tomas',
      kind: 'npc',
      name: 'Tomas',
      existsSince: null,
    });
    expectAccepted(await undo('make'));

    const state = await harness.state();
    expect(state.entities.has('tomas')).toBe(false);
    expect(state.usedIds.has('tomas')).toBe(true);
    expectRejected(
      await harness.submit({
        type: 'CreateEntity',
        entityId: 'tomas',
        kind: 'npc',
        name: 'Tomas',
        existsSince: null,
      }),
      'ID_ALREADY_USED',
    );
  });
});
