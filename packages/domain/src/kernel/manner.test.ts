import { describe, expect, it } from 'vitest';

import { parseRecordedEvent } from './events.ts';
import { replay } from './evolve.ts';
import {
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
} from './testing/kernel-harness.ts';

/**
 * An NPC's public manner of speech in the world (docs/adr/0020-npc-intelligence.md, amendment
 * 2026-11-14): carried by `CreateEntity` and `UpdateEntityProfile`, for NPCs only, replayed from
 * history and undone like the rest of a profile. State holds it only when the NPC has one.
 */
const ORDERS = 'Speaks briefly, as if reading out an order.';
const COUNTS = 'Counts aloud, like a cashier giving change.';

async function world() {
  const harness = createHarness();
  await seedBasicWorld(harness);
  return harness;
}

const mannerOf = async (harness: Awaited<ReturnType<typeof world>>, entityId: string) =>
  (await harness.state()).entities.get(entityId)?.manner;

describe('an NPC carries its manner of speech', () => {
  it('is created with one, and a plain NPC has none', async () => {
    const harness = await world();
    expectAccepted(
      await harness.submit({
        type: 'CreateEntity',
        entityId: 'clerk',
        kind: 'npc',
        name: 'Clerk',
        manner: `  ${ORDERS}  `,
        existsSince: null,
      }),
    );
    expect(await mannerOf(harness, 'clerk')).toBe(ORDERS);
    expect((await harness.state()).entities.get('npc')).not.toHaveProperty('manner');
    const created = (await harness.history()).find(
      (event) => event.type === 'EntityCreated' && event.payload.entityId === 'npc',
    );
    expect(created?.payload).not.toHaveProperty('manner');
  });

  it('only an NPC has one', async () => {
    const harness = await world();
    expectRejected(
      await harness.submit({
        type: 'CreateEntity',
        kind: 'item',
        name: 'Talking lamp',
        manner: ORDERS,
        existsSince: null,
      }),
      'INVALID_ENTITY_DEFINITION',
    );
    expectRejected(
      await harness.submit({ type: 'UpdateEntityProfile', entityId: 'lamp', manner: ORDERS }),
      'INVALID_ENTITY_DEFINITION',
    );
  });

  it('is set, changed and cleared by a profile update; the same value is no effect', async () => {
    const harness = await world();
    expectAccepted(
      await harness.submit({ type: 'UpdateEntityProfile', entityId: 'npc', manner: ORDERS }),
    );
    expect(await mannerOf(harness, 'npc')).toBe(ORDERS);
    expectRejected(
      await harness.submit({ type: 'UpdateEntityProfile', entityId: 'npc', manner: ORDERS }),
      'NO_EFFECT',
    );
    expectAccepted(
      await harness.submit({ type: 'UpdateEntityProfile', entityId: 'npc', manner: COUNTS }),
    );
    const events = await harness.history();
    const last = events.at(-1);
    expect(last?.type === 'EntityProfileUpdated' && last.payload.manner).toEqual({
      from: ORDERS,
      to: COUNTS,
    });
    expectAccepted(
      await harness.submit({ type: 'UpdateEntityProfile', entityId: 'npc', manner: '' }),
    );
    expect((await harness.state()).entities.get('npc')).not.toHaveProperty('manner');
    expectRejected(
      await harness.submit({ type: 'UpdateEntityProfile', entityId: 'npc', manner: '' }),
      'NO_EFFECT',
    );
  });

  it('is undone exactly, back to the earlier manner or to none', async () => {
    const harness = await world();
    const before = await harness.state();
    const set = expectAccepted(
      await harness.submit({ type: 'UpdateEntityProfile', entityId: 'npc', manner: ORDERS }),
    );
    const changed = expectAccepted(
      await harness.submit({
        type: 'UpdateEntityProfile',
        entityId: 'npc',
        name: 'Nia the Clerk',
        manner: COUNTS,
      }),
    );
    expectAccepted(
      await harness.submit({ type: 'UndoCommand', targetCommandId: changed.commandId }),
    );
    const restored = (await harness.state()).entities.get('npc');
    expect(restored?.manner).toBe(ORDERS);
    expect(restored?.name).toBe('Nia');
    expectAccepted(await harness.submit({ type: 'UndoCommand', targetCommandId: set.commandId }));
    expect((await harness.state()).entities.get('npc')).toStrictEqual(before.entities.get('npc'));
  });

  it('replays from stored history, serialized and parsed again', async () => {
    const harness = await world();
    expectAccepted(
      await harness.submit({
        type: 'CreateEntity',
        entityId: 'clerk',
        kind: 'npc',
        name: 'Clerk',
        manner: ORDERS,
        existsSince: null,
      }),
    );
    expectAccepted(
      await harness.submit({ type: 'UpdateEntityProfile', entityId: 'npc', manner: COUNTS }),
    );
    const { state, history } = await harness.snapshot();
    const stored = JSON.parse(JSON.stringify(history)) as unknown[];
    expect(replay(stored.map(parseRecordedEvent))).toStrictEqual(state);
    expect(state.entities.get('clerk')?.manner).toBe(ORDERS);
    expect(state.entities.get('npc')?.manner).toBe(COUNTS);
  });
});
