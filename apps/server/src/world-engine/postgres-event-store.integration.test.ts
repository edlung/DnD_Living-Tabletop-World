import {
  CommandIdConflictError,
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  StreamVersionConflictError,
  WorldEngine,
  type AppendBatch,
  type RecordedEvent,
  type StoredCommand,
} from '@ltw/domain';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';
import { loadRavenfordSeed } from './ravenford-seed.ts';

let database: ThrowawayDatabase;
let pool: pg.Pool;
let store: PostgresEventStore;

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url });
  store = new PostgresEventStore(pool);
});

afterEach(async () => {
  await pool.end();
  await database.drop();
});

/** Seeds Ravenford into the given store with deterministic IDs and clock. */
async function seedInto(target: PostgresEventStore | InMemoryEventStore) {
  const engine = new WorldEngine({
    store: target,
    ids: new SequentialIds(),
    clock: new SteppingClock(),
  });
  const seed = await loadRavenfordSeed();
  for (const submission of seed.submissions) {
    expect((await engine.execute(submission)).status).toBe('accepted');
  }
  return { engine, seed };
}

describe('PostgresEventStore', () => {
  it('stores and loads events and commands exactly as the in-memory store does', async () => {
    const memory = new InMemoryEventStore();
    const { seed } = await seedInto(store);
    await seedInto(memory);

    const fromPostgres = await store.loadStream(seed.campaignId);
    expect(fromPostgres).toEqual(await memory.loadStream(seed.campaignId));
    expect(await store.loadCommands(seed.campaignId)).toEqual(
      await memory.loadCommands(seed.campaignId),
    );
    expect(await store.loadStream(seed.campaignId, 10)).toEqual(
      await memory.loadStream(seed.campaignId, 10),
    );
    expect(await store.findCommand('ravenford.seed.0002')).toEqual(
      await memory.findCommand('ravenford.seed.0002'),
    );
    expect(await store.loadStream('no-such-campaign')).toBeNull();
    expect(await store.findCommand('no-such-command')).toBeNull();
  });

  describe('append', () => {
    let events: RecordedEvent[];
    let commands: StoredCommand[];
    let campaignId: string;

    beforeEach(async () => {
      const memory = new InMemoryEventStore();
      ({
        seed: { campaignId },
      } = await seedInto(memory));
      events = [...((await memory.loadStream(campaignId))?.events ?? [])];
      commands = [...(await memory.loadCommands(campaignId))];
    });

    const batchFor = (index: number): AppendBatch => {
      const command = commands[index];
      if (!command) throw new Error('no such command');
      return {
        campaignId,
        expectedVersion: command.firstSequence - 1,
        command,
        events: events.filter(
          (e) => e.sequence >= command.firstSequence && e.sequence <= command.lastSequence,
        ),
      };
    };

    it('creates a stream once and then requires the current version', async () => {
      await store.append(batchFor(0));
      // A second creation of the same stream loses, whatever its command ID.
      await expect(store.append(batchFor(0))).rejects.toBeInstanceOf(StreamVersionConflictError);
      await store.append(batchFor(1));
      // A writer still at version 1 lost the race to version 2.
      await expect(store.append(batchFor(1))).rejects.toBeInstanceOf(StreamVersionConflictError);
      expect((await store.loadStream(campaignId))?.version).toBe(2);
      await expect(store.append({ ...batchFor(2), expectedVersion: 5 })).rejects.toThrow(
        /does not follow/,
      );
    });

    it('rejects a command ID that is already recorded', async () => {
      await store.append(batchFor(0));
      const reused = batchFor(1);

      await expect(
        store.append({
          ...reused,
          command: { ...reused.command, commandId: commands[0]?.commandId ?? '' },
        }),
      ).rejects.toBeInstanceOf(CommandIdConflictError);
    });

    it('writes nothing when any part of a batch fails', async () => {
      await store.append(batchFor(0));
      const batch = batchFor(1);
      const duplicateEventId = {
        ...batch,
        events: batch.events.map((e) => ({ ...e, eventId: events[0]?.eventId ?? '' })),
      };

      await expect(store.append(duplicateEventId)).rejects.toThrow();

      expect((await store.loadStream(campaignId))?.version).toBe(1);
      expect(await store.findCommand(batch.command.commandId)).toBeNull();
    });
  });

  it('enforces append-only history in the database itself', async () => {
    const { seed } = await seedInto(store);
    const before = await store.loadStream(seed.campaignId);
    const attempts = [
      "UPDATE ltw_events SET payload = '{}'::jsonb WHERE sequence = 1",
      'DELETE FROM ltw_events WHERE sequence = 2',
      'TRUNCATE ltw_events CASCADE',
      "UPDATE ltw_commands SET reason = 'rewritten'",
      'DELETE FROM ltw_commands',
      'DELETE FROM ltw_event_streams',
      'UPDATE ltw_event_streams SET version = version - 1',
      'TRUNCATE ltw_event_streams CASCADE',
    ];
    for (const sql of attempts) {
      await expect(pool.query(sql), sql).rejects.toThrow(/append-only|only move forward/);
    }
    expect(await store.loadStream(seed.campaignId)).toEqual(before);
    expect(await store.loadCommands(seed.campaignId)).toHaveLength(seed.submissions.length);
  });

  it('refuses to load rows that do not match the event schema', async () => {
    const { seed } = await seedInto(store);
    await pool.query(`INSERT INTO ltw_event_streams (stream_id, version) VALUES ('tampered', 1)`);
    await pool.query(
      `INSERT INTO ltw_commands (command_id, stream_id, command_type, actor, fingerprint, command,
         reason, first_sequence, last_sequence, recorded_at)
       VALUES ('t1', 'tampered', 'CreateCampaign', '{"actorId":"x","kind":"user"}', '{}',
         '{"type":"CreateCampaign","name":"T","worldName":"T","startsAt":0}', NULL, 1, 1, now())`,
    );
    await pool.query(
      `INSERT INTO ltw_events (stream_id, sequence, event_id, event_type, schema_version, payload,
         world_time, recorded_at, command_id, command_type, actor)
       VALUES ('tampered', 1, gen_random_uuid(), 'CampaignCreated', 1, '{"campaignId":"tampered","secret":1}',
         0, now(), 't1', 'CreateCampaign', '{"actorId":"x","kind":"user"}')`,
    );

    await expect(store.loadStream('tampered')).rejects.toThrow();
    expect((await store.loadStream(seed.campaignId))?.version).toBeGreaterThan(0);
  });
});
