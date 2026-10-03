import type { RejectionCode } from '@ltw/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  PLAYER,
  START,
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
  type Harness,
} from '../kernel/testing/kernel-harness.ts';

/**
 * Impossible memories (ADR 0010; ADVERSARIAL_TESTS.md B). Basic world:
 * Nia (npc) at the square, lamp at the inn, both since before history; the
 * clock is START.
 */
let harness: Harness;

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
  for (const command of [
    { type: 'AdvanceWorldTime', by: 7200 },
    {
      type: 'CreateEntity',
      entityId: 'hero',
      kind: 'character',
      name: 'Hero',
      existsSince: null,
      placement: { locationId: 'inn', since: START },
    },
    { type: 'AssignCharacter', characterId: 'hero', playerActorId: 'player-1' },
    {
      type: 'CreateEntity',
      entityId: 'tomas',
      kind: 'npc',
      name: 'Tomas',
      existsSince: START + 3600,
      placement: { locationId: 'square', since: START + 3600 },
    },
  ]) {
    expectAccepted(await harness.submit(command));
  }
});

const memory = (memoryId: string, extra: Record<string, unknown> = {}) => ({
  type: 'RecordMemory',
  memoryId,
  scope: { kind: 'NPC', npcId: 'npc' },
  memoryKind: 'OBSERVATION',
  summary: `Memory ${memoryId}`,
  occurredAt: START,
  locationId: 'square',
  participants: ['npc'],
  ...extra,
});

const reject = async (command: Record<string, unknown>, code: RejectionCode) =>
  expectRejected(await harness.submit(command), code);

describe('RecordMemory accepts possible memories', () => {
  it('records a witnessed observation with its witnesses and default salience', async () => {
    expectAccepted(await harness.submit(memory('m1'), { commandId: 'rec-m1' }));
    expect((await harness.state()).memories.get('m1')).toMatchObject({
      witnesses: ['npc'],
      salience: 3,
      sessionId: null,
      origin: { commandId: 'rec-m1' },
    });
  });

  it('accepts presence inside a containing location', async () => {
    expectAccepted(await harness.submit(memory('m1', { locationId: 'town' })));
  });

  it('lets the party remember what a present party member witnessed', async () => {
    expectAccepted(
      await harness.submit(
        memory('m1', { scope: { kind: 'PARTY' }, locationId: 'inn', participants: [] }),
      ),
    );
    expect((await harness.state()).memories.get('m1')?.witnesses).toEqual(['hero']);
  });
});

describe('RecordMemory rejects impossible memories', () => {
  it('rejects memories from the future', async () => {
    await reject(memory('m1', { occurredAt: START + 7201 }), 'IMPOSSIBLE_MEMORY');
  });

  it('rejects a memory from before the holder existed (Tomas, B2)', async () => {
    await reject(
      memory('m1', {
        scope: { kind: 'NPC', npcId: 'tomas' },
        participants: ['tomas'],
        occurredAt: START,
      }),
      'IMPOSSIBLE_MEMORY',
    );
    expectAccepted(
      await harness.submit(
        memory('m2', {
          scope: { kind: 'NPC', npcId: 'tomas' },
          participants: ['tomas'],
          occurredAt: START + 3600,
        }),
      ),
    );
  });

  it('rejects participants who did not exist yet', async () => {
    await reject(
      memory('m1', { participants: ['npc', 'tomas'], occurredAt: START }),
      'IMPOSSIBLE_MEMORY',
    );
  });

  it('rejects observing a place the holder was not at (B3)', async () => {
    await reject(memory('m1', { locationId: 'inn' }), 'IMPOSSIBLE_MEMORY');
  });

  it('rejects a conversation the holder was not part of', async () => {
    await reject(
      memory('m1', { memoryKind: 'CONVERSATION', participants: ['lamp'] }),
      'IMPOSSIBLE_MEMORY',
    );
    await reject(memory('m2', { memoryKind: 'CONVERSATION', participants: [] }), 'INVALID_MEMORY');
  });

  it('rejects party memories no party member witnessed', async () => {
    await reject(memory('m1', { scope: { kind: 'PARTY' }, participants: [] }), 'IMPOSSIBLE_MEMORY');
  });

  it('rejects citing knowledge or memories the holder cannot have', async () => {
    expectAccepted(
      await harness.submit({
        type: 'AddKnowledge',
        knowledgeId: 'secret',
        scope: { kind: 'WORLD_TRUTH' },
        knowledgeType: 'FACT',
        statement: 'Hidden truth',
        knownSince: null,
      }),
    );
    await reject(memory('m1', { relatedKnowledge: ['secret'] }), 'IMPOSSIBLE_MEMORY');
    expectAccepted(
      await harness.submit(
        memory('party-m', { scope: { kind: 'PARTY' }, locationId: 'inn', participants: [] }),
      ),
    );
    await reject(
      memory('m2', { memoryKind: 'CONSEQUENCE', causedBy: ['party-m'] }),
      'IMPOSSIBLE_MEMORY',
    );
  });

  it('rejects causes that come after their consequence, and causes on other kinds', async () => {
    expectAccepted(await harness.submit(memory('cause', { occurredAt: START + 60 })));
    await reject(
      memory('m1', { memoryKind: 'CONSEQUENCE', causedBy: ['cause'] }),
      'IMPOSSIBLE_MEMORY',
    );
    await reject(memory('m2', { causedBy: ['cause'] }), 'INVALID_MEMORY');
    expectAccepted(
      await harness.submit(
        memory('m3', { memoryKind: 'CONSEQUENCE', causedBy: ['cause'], occurredAt: START + 60 }),
      ),
    );
  });

  it('validates holders, references, and sessions', async () => {
    await reject(memory('m1', { scope: { kind: 'NPC', npcId: 'hero' } }), 'INVALID_MEMORY');
    await reject(memory('m2', { participants: ['ghost'] }), 'ENTITY_NOT_FOUND');
    await reject(memory('m3', { locationId: 'lamp' }), 'NOT_A_LOCATION');
    await reject(memory('m4', { sessionId: 'nope' }), 'SESSION_NOT_FOUND');
    await reject(memory('town'), 'ID_ALREADY_USED');
    expectRejected(await harness.submit(memory('m5'), { actor: PLAYER }), 'FORBIDDEN');
  });
});

describe('memories over time', () => {
  it('never appear because other state changed (B4)', async () => {
    const before = (await harness.state()).memories.size;
    for (const command of [
      { type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' },
      { type: 'UpdateEntityProfile', entityId: 'npc', description: 'Now friends with Hero' },
      { type: 'AdvanceWorldTime', by: 600 },
    ]) {
      expectAccepted(await harness.submit(command));
    }
    expect((await harness.state()).memories.size).toBe(before);
  });

  it('keep their premises: the placement that made them possible cannot be undone', async () => {
    expectAccepted(
      await harness.submit(
        { type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' },
        { commandId: 'move' },
      ),
    );
    expectAccepted(
      await harness.submit(memory('m1', { locationId: 'inn', occurredAt: START + 7200 }), {
        commandId: 'rec',
      }),
    );

    expectRejected(
      await harness.submit({ type: 'UndoCommand', targetCommandId: 'move' }),
      'UNDO_UNSAFE',
    );
    expectAccepted(await harness.submit({ type: 'UndoCommand', targetCommandId: 'rec' }));
    expectAccepted(await harness.submit({ type: 'UndoCommand', targetCommandId: 'move' }));
    expect((await harness.state()).memories.has('m1')).toBe(false);
  });
});

describe('sessions', () => {
  it('opens one session at a time and links memories to it', async () => {
    expectAccepted(
      await harness.submit(
        { type: 'StartSession', sessionId: 's1', title: 'One' },
        { commandId: 'start' },
      ),
    );
    expectRejected(
      await harness.submit({ type: 'StartSession', sessionId: 's2', title: 'Two' }),
      'SESSION_ALREADY_ACTIVE',
    );
    expectAccepted(await harness.submit(memory('m1', { sessionId: 's1' })));
    expectAccepted(await harness.submit({ type: 'EndSession', sessionId: 's1' }));
    expectRejected(
      await harness.submit({ type: 'EndSession', sessionId: 's1' }),
      'SESSION_NOT_ACTIVE',
    );

    const state = await harness.state();
    expect(state.sessions.get('s1')).toEqual({
      sessionId: 's1',
      title: 'One',
      startedAt: START + 7200,
      endedAt: START + 7200,
    });
    expect(state.activeSessionId).toBeNull();
    expectRejected(
      await harness.submit({ type: 'UndoCommand', targetCommandId: 'start' }),
      'UNDO_UNSAFE',
    );
  });

  it('undoes a session start while nothing depends on it', async () => {
    expectAccepted(
      await harness.submit(
        { type: 'StartSession', sessionId: 's1', title: 'One' },
        { commandId: 'start' },
      ),
    );
    expectAccepted(await harness.submit({ type: 'UndoCommand', targetCommandId: 'start' }));
    const state = await harness.state();
    expect(state.sessions.size).toBe(0);
    expect(state.activeSessionId).toBeNull();
  });
});
