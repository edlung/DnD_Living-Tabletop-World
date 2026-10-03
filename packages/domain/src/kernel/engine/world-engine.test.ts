import { describe, expect, it } from 'vitest';

import {
  CAMPAIGN,
  DM,
  PLAYER,
  START,
  SYSTEM,
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
} from '../testing/kernel-harness.ts';
import { StreamVersionConflictError, type AppendBatch, type EventStore } from './event-store.ts';
import { InMemoryEventStore } from './in-memory-event-store.ts';
import { WorldEngine } from './world-engine.ts';
import { SequentialIds, SteppingClock } from './deterministic-sources.ts';

const createCampaign = { type: 'CreateCampaign', name: 'Test', worldName: 'W', startsAt: START };

describe('WorldEngine: schema validation', () => {
  it.each([
    ['null input', null],
    ['missing command', { commandId: 'c1', campaignId: CAMPAIGN, actor: DM }],
    [
      'unknown command type',
      { commandId: 'c1', campaignId: CAMPAIGN, actor: DM, command: { type: 'KillOrin' } },
    ],
    ['unknown field', { commandId: 'c1', actor: DM, command: { ...createCampaign, truth: 'x' } }],
    ['unknown envelope field', { commandId: 'c1', actor: DM, command: createCampaign, role: 'dm' }],
    [
      'bad actor',
      { commandId: 'c1', actor: { actorId: 'x', kind: 'god' }, command: createCampaign },
    ],
    [
      'missing campaignId',
      { commandId: 'c1', actor: DM, command: { type: 'EndScene', sceneId: 's' } },
    ],
    ['bad command id', { commandId: ' spaced', actor: DM, command: createCampaign }],
  ])('rejects %s as INVALID_COMMAND without touching the store', async (_label, input) => {
    const harness = createHarness();

    const result = expectRejected(await harness.engine.execute(input), 'INVALID_COMMAND');

    expect(result.details?.['issues']).toBeInstanceOf(Array);
    expect(await harness.store.loadStream(CAMPAIGN)).toBeNull();
  });
});

describe('WorldEngine: stamping and ordering', () => {
  it('stamps sequence, IDs, causation, recorded time, and world time on every event', async () => {
    const harness = createHarness();
    const created = expectAccepted(await harness.submit(createCampaign, { commandId: 'c-1' }));

    const [event] = await harness.history();

    expect(created.events).toEqual([
      { sequence: 1, eventId: event?.eventId, type: 'CampaignCreated' },
    ]);
    expect(event).toMatchObject({
      campaignId: CAMPAIGN,
      sequence: 1,
      schemaVersion: 1,
      worldTime: START,
      recordedAt: '2026-01-01T00:00:00.000Z',
      causation: { commandId: 'c-1', commandType: 'CreateCampaign', actor: DM },
    });
    expect(event?.eventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps a gapless sequence and contiguous command events', async () => {
    const harness = createHarness();
    await seedBasicWorld(harness);
    const history = await harness.history();

    expect(history.map((event) => event.sequence)).toEqual(history.map((_, index) => index + 1));
    const state = await harness.state();
    for (const trace of state.commands.values()) {
      const events = history.filter((event) => event.causation.commandId === trace.commandId);
      expect(events.map((event) => event.sequence)).toEqual(
        Array.from(
          { length: trace.lastSequence - trace.firstSequence + 1 },
          (_, i) => trace.firstSequence + i,
        ),
      );
    }
  });

  it('records the world clock after each event', async () => {
    const harness = createHarness();
    await seedBasicWorld(harness);
    expectAccepted(await harness.submit({ type: 'AdvanceWorldTime', by: 3600 }));
    expectAccepted(
      await harness.submit({ type: 'PlaceEntity', entityId: 'npc', locationId: 'inn' }),
    );

    const history = await harness.history();
    expect(history.slice(-2).map((event) => [event.type, event.worldTime])).toEqual([
      ['WorldTimeAdvanced', START + 3600],
      ['EntityPlaced', START + 3600],
    ]);
  });

  it('returns frozen history so callers cannot alter the cache', async () => {
    const harness = createHarness();
    await seedBasicWorld(harness);
    const history = await harness.history();

    expect(() => (history as unknown[]).push({})).toThrow(TypeError);
    expect(() => {
      (history[0] as { sequence: number }).sequence = 99;
    }).toThrow(TypeError);
  });
});

describe('WorldEngine: idempotency', () => {
  it('returns the original outcome for a resubmitted command', async () => {
    const harness = createHarness();
    const first = expectAccepted(await harness.submit(createCampaign, { commandId: 'same' }));
    const again = await harness.submit(createCampaign, { commandId: 'same' });

    expect(again).toEqual({ ...first, status: 'duplicate' });
    expect((await harness.history()).length).toBe(1);
  });

  it('is idempotent for generated campaign and entity IDs', async () => {
    const harness = createHarness();
    const submission = { commandId: 'gen-1', actor: DM, command: createCampaign };
    const first = expectAccepted(await harness.engine.execute(submission));
    const second = await harness.engine.execute(submission);

    expect(second.status).toBe('duplicate');
    expect(second.status !== 'rejected' && second.campaignId).toBe(first.campaignId);
  });

  it('still reports a duplicate after later commands', async () => {
    const harness = createHarness();
    await seedBasicWorld(harness);
    const command = { type: 'AdvanceWorldTime', by: 60 };
    expectAccepted(await harness.submit(command, { commandId: 'tick' }));
    expectAccepted(await harness.submit({ type: 'AdvanceWorldTime', by: 60 }));

    const again = await harness.submit(command, { commandId: 'tick' });
    expect(again.status).toBe('duplicate');
    expect((await harness.state()).clock).toBe(START + 120);
  });

  it('rejects a reused command ID with different content', async () => {
    const harness = createHarness();
    await seedBasicWorld(harness);
    expectAccepted(await harness.submit({ type: 'AdvanceWorldTime', by: 60 }, { commandId: 'k' }));

    expectRejected(
      await harness.submit({ type: 'AdvanceWorldTime', by: 61 }, { commandId: 'k' }),
      'COMMAND_ID_CONFLICT',
    );
    expectRejected(
      await harness.submit({ type: 'AdvanceWorldTime', by: 60 }, { commandId: 'k', actor: SYSTEM }),
      'COMMAND_ID_CONFLICT',
    );
  });

  it('re-evaluates a rejected command ID, which is not recorded', async () => {
    const harness = createHarness();
    await seedBasicWorld(harness);
    const command = { type: 'PlaceEntity', entityId: 'npc', locationId: 'tower' };
    expectRejected(await harness.submit(command, { commandId: 'retry' }), 'ENTITY_NOT_FOUND');
    expectAccepted(
      await harness.submit({
        type: 'CreateEntity',
        entityId: 'tower',
        kind: 'location',
        name: 'Tower',
        existsSince: null,
        location: { type: 'building', parentId: 'town' },
      }),
    );

    expectAccepted(await harness.submit(command, { commandId: 'retry' }));
  });
});

describe('WorldEngine: authorization and atomic rejection', () => {
  it('lets only the DM or the system author the world', async () => {
    const harness = createHarness();
    await seedBasicWorld(harness);

    expectRejected(
      await harness.submit({ type: 'AdvanceWorldTime', by: 1 }, { actor: PLAYER }),
      'FORBIDDEN',
    );
    expectRejected(
      await harness.submit(
        { type: 'AdvanceWorldTime', by: 1 },
        { actor: { actorId: 'dm-2', kind: 'user' } },
      ),
      'FORBIDDEN',
    );
    expectAccepted(await harness.submit({ type: 'AdvanceWorldTime', by: 1 }, { actor: SYSTEM }));
    expectRejected(
      await harness.engine.execute({ commandId: 'sys', actor: SYSTEM, command: createCampaign }),
      'FORBIDDEN',
    );
  });

  it('checks authorization before revealing whether targets exist', async () => {
    const harness = createHarness();
    await seedBasicWorld(harness);

    const result = await harness.submit(
      { type: 'PlaceEntity', entityId: 'no-such', locationId: 'nowhere' },
      { actor: PLAYER },
    );
    expectRejected(result, 'FORBIDDEN');
    expect(JSON.stringify(result)).not.toContain('no-such');
  });

  it('rejects stale expectations and missing or duplicate campaigns', async () => {
    const harness = createHarness();
    expectRejected(await harness.submit({ type: 'AdvanceWorldTime', by: 1 }), 'CAMPAIGN_NOT_FOUND');
    await seedBasicWorld(harness);
    const version = (await harness.state()).version;

    expectRejected(
      await harness.submit({ type: 'AdvanceWorldTime', by: 1 }, { expectedVersion: version - 1 }),
      'VERSION_MISMATCH',
    );
    expectAccepted(
      await harness.submit({ type: 'AdvanceWorldTime', by: 1 }, { expectedVersion: version }),
    );
    expectRejected(await harness.submit(createCampaign), 'CAMPAIGN_ALREADY_EXISTS');
  });

  it('leaves history and state untouched on every rejection', async () => {
    const harness = createHarness();
    await seedBasicWorld(harness);
    const before = await harness.snapshot();

    for (const command of [
      { type: 'PlaceEntity', entityId: 'npc', locationId: 'npc' },
      { type: 'AdvanceWorldTime', to: START },
      { type: 'ChangeEntityStatus', entityId: 'lamp', status: 'dead' },
      { type: 'UndoCommand', targetCommandId: 'nope' },
    ]) {
      expect((await harness.submit(command)).status).toBe('rejected');
    }

    const after = await harness.snapshot();
    expect(after.history).toEqual(before.history);
    expect(after.state).toEqual(before.state);
    expect((await harness.store.loadStream(CAMPAIGN))?.version).toBe(before.state.version);
  });
});

describe('WorldEngine: concurrency', () => {
  it('retries when another writer appends first and never loses or duplicates events', async () => {
    const inner = new InMemoryEventStore();
    let conflicts = 0;
    const shared: EventStore = {
      loadStream: (id, after) => inner.loadStream(id, after),
      findCommand: (id) => inner.findCommand(id),
      loadCommands: (id) => inner.loadCommands(id),
      append: (batch) =>
        inner.append(batch).catch((error: unknown) => {
          conflicts += 1;
          throw error;
        }),
    };
    const a = createHarness({ store: shared, namespace: 1 });
    const b = createHarness({ store: shared, namespace: 2 });
    await seedBasicWorld(a);

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        (i % 2 === 0 ? a : b).submit(
          { type: 'AdvanceWorldTime', by: 60 },
          { commandId: `tick-${i}` },
        ),
      ),
    );

    results.forEach((result) => expectAccepted(result));
    expect(conflicts).toBeGreaterThan(0);
    const history = (await shared.loadStream(CAMPAIGN))?.events ?? [];
    expect(history.map((event) => event.sequence)).toEqual(history.map((_, i) => i + 1));
    expect((await a.state()).clock).toBe(START + 600);
    expect(await b.state()).toEqual(await a.state());
  });

  it('gives up with CONCURRENCY_CONFLICT when the stream keeps moving', async () => {
    const inner = new InMemoryEventStore();
    const alwaysConflicting: EventStore = {
      loadStream: (id, after) => inner.loadStream(id, after),
      findCommand: (id) => inner.findCommand(id),
      loadCommands: (id) => inner.loadCommands(id),
      append: (batch: AppendBatch) =>
        batch.expectedVersion === 0
          ? inner.append(batch)
          : Promise.reject(new StreamVersionConflictError(batch.campaignId, batch.expectedVersion)),
    };
    const engine = new WorldEngine({
      store: alwaysConflicting,
      ids: new SequentialIds(),
      clock: new SteppingClock(),
      maxAttempts: 3,
      backoff: () => Promise.resolve(),
    });
    expectAccepted(
      await engine.execute({
        commandId: 'c',
        campaignId: CAMPAIGN,
        actor: DM,
        command: createCampaign,
      }),
    );

    const result = await engine.execute({
      commandId: 'tick',
      campaignId: CAMPAIGN,
      actor: DM,
      command: { type: 'AdvanceWorldTime', by: 60 },
    });

    expectRejected(result, 'CONCURRENCY_CONFLICT');
    expect((await inner.loadStream(CAMPAIGN))?.version).toBe(1);
  });
});
