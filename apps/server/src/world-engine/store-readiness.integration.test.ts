import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadMigrations } from '../platform/db/migration-source.ts';
import { MIGRATIONS_DIR } from '../platform/db/migrations-dir.ts';
import { runMigrations } from '../platform/db/migrator.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';
import { loadRavenfordSeed } from './ravenford-seed.ts';
import { createWorldEngine } from './runtime.ts';
import { storeReadiness } from './store-readiness.ts';

/**
 * The production `/readyz` probe against PostgreSQL (docs/adr/0037-deployment.md §3): a seeded
 * database is ready; a pending migration, history this build cannot read, a stream head without
 * its event and an unreachable database are not; a database a newer build migrated stays ready.
 * After a rollback (`readEveryEvent`) an event this build cannot read anywhere in a stream keeps
 * it not ready, where the normal, cheap check does not look.
 */
const logger = createLogger({ service: 'store-readiness-it', level: 'silent' });

let database: ThrowawayDatabase;
let pool: pg.Pool;

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url, max: 4 });
});

afterEach(async () => {
  await pool.end();
  await database.drop();
});

const probe = async (target: pg.Pool = pool, options: { readEveryEvent?: boolean } = {}) =>
  storeReadiness(target, await loadMigrations(MIGRATIONS_DIR), logger, options)();

/**
 * A copy of Ravenford's stream as `streamId` (sorting after `ravenford`, so the cheap check's one
 * event of every type and version stays Ravenford's) whose event at `sequence` carries a payload
 * field this build's strict schemas refuse: what a newer build that loosened a payload schema
 * without a new version (ADR 0007 allows it) leaves in the middle of a stream.
 */
async function copyRavenfordWithUnreadableEvent(streamId: string, sequence: number) {
  await pool.query(
    `INSERT INTO ltw_event_streams (stream_id, version)
       SELECT $1, version FROM ltw_event_streams WHERE stream_id = 'ravenford'`,
    [streamId],
  );
  await pool.query(
    `INSERT INTO ltw_commands (command_id, stream_id, command_type, actor, fingerprint, command,
       reason, first_sequence, last_sequence, recorded_at)
     SELECT $1 || '.' || command_id, $1, command_type, actor, fingerprint, command, reason,
       first_sequence, last_sequence, recorded_at FROM ltw_commands WHERE stream_id = 'ravenford'`,
    [streamId],
  );
  await pool.query(
    `INSERT INTO ltw_events (stream_id, sequence, event_id, event_type, schema_version, payload,
       world_time, recorded_at, command_id, command_type, actor)
     SELECT $1, sequence, gen_random_uuid(), event_type, schema_version,
       CASE WHEN sequence = $2 THEN payload || '{"addedByANewerBuild": true}'::jsonb ELSE payload END,
       world_time, recorded_at, $1 || '.' || command_id, command_type, actor
       FROM ltw_events WHERE stream_id = 'ravenford'`,
    [streamId, sequence],
  );
}

async function seedRavenford(): Promise<void> {
  const engine = createWorldEngine(pool);
  const seed = await loadRavenfordSeed();
  for (const submission of seed.submissions) {
    expect((await engine.execute(submission)).status).toBe('accepted');
  }
}

/** A stream written behind the World Engine's back: `types[i]` at sequence i + 1. */
async function plantStream(
  streamId: string,
  types: readonly string[],
  version = types.length,
): Promise<void> {
  const actor = JSON.stringify({ actorId: 'dm-probe', kind: 'user' });
  await pool.query('INSERT INTO ltw_event_streams (stream_id, version) VALUES ($1, $2)', [
    streamId,
    version,
  ]);
  if (types.length === 0) return;
  await pool.query(
    `INSERT INTO ltw_commands (command_id, stream_id, command_type, actor, fingerprint, command,
       reason, first_sequence, last_sequence, recorded_at)
     VALUES ($1, $2, 'CreateCampaign', $3::jsonb, 'planted', '{}'::jsonb, NULL, 1, $4, now())`,
    [`${streamId}.planted`, streamId, actor, types.length],
  );
  for (const [index, type] of types.entries()) {
    await pool.query(
      `INSERT INTO ltw_events (stream_id, sequence, event_id, event_type, schema_version, payload,
         world_time, recorded_at, command_id, command_type, actor)
       VALUES ($1, $2, gen_random_uuid(), $3, 1, '{}'::jsonb, 0, now(), $4, 'CreateCampaign',
         $5::jsonb)`,
      [streamId, index + 1, type, `${streamId}.planted`, actor],
    );
  }
}

describe('storeReadiness', () => {
  it('is ready on a migrated database, empty or seeded', async () => {
    expect(await probe()).toEqual({ ready: true, failed: [] });
    await seedRavenford();
    expect(await probe()).toEqual({ ready: true, failed: [] });
  });

  it('is not ready while a migration this build carries is pending', async () => {
    const pendingDatabase = await createThrowawayDatabase();
    const pendingPool = new pg.Pool({ connectionString: pendingDatabase.url, max: 4 });
    const client = await pendingPool.connect();
    try {
      const all = await loadMigrations(MIGRATIONS_DIR);
      await runMigrations({ client, migrations: all.slice(0, -1), logger });
      expect(await probe(pendingPool)).toEqual({ ready: false, failed: ['migrations'] });
    } finally {
      client.release();
      await pendingPool.end();
      await pendingDatabase.drop();
    }
  });

  it('stays ready on a database a newer build migrated (the rollback step accepted it)', async () => {
    await pool.query(
      "INSERT INTO ltw_schema_migrations (id, checksum) VALUES ('9999_from_a_newer_build', 'x')",
    );
    expect(await probe()).toEqual({ ready: true, failed: [] });
    // The migrator itself still refuses it without the explicit rollback step.
    const client = await pool.connect();
    try {
      await expect(
        runMigrations({ client, migrations: await loadMigrations(MIGRATIONS_DIR), logger }),
      ).rejects.toThrow(/missing on disk: 9999_from_a_newer_build/);
    } finally {
      client.release();
    }
  });

  it('is not ready when the store holds an event type this build cannot read, even beneath a readable head', async () => {
    await seedRavenford();
    await plantStream('probe', ['EventFromANewerBuild']);
    // Make the planted stream's head a readable copy of Ravenford's first event.
    await pool.query("UPDATE ltw_event_streams SET version = 2 WHERE stream_id = 'probe'");
    await pool.query(
      `INSERT INTO ltw_events (stream_id, sequence, event_id, event_type, schema_version, payload,
         world_time, recorded_at, command_id, command_type, actor)
       SELECT 'probe', 2, gen_random_uuid(), event_type, schema_version, payload, world_time,
         recorded_at, 'probe.planted', command_type, actor
         FROM ltw_events WHERE stream_id = 'ravenford' AND sequence = 1`,
    );

    expect(await probe()).toEqual({ ready: false, failed: ['eventStore'] });
  });

  it('after a rollback, is not ready over an event this build cannot read in the middle of a stream', async () => {
    await seedRavenford();
    const head = (await createWorldEngine(pool).load('ravenford'))?.state.version ?? 0;
    await copyRavenfordWithUnreadableEvent('rollback-probe', Math.floor(head / 2));
    // The planted event is beyond this build: the campaign holding it cannot be loaded.
    await expect(createWorldEngine(pool).load('rollback-probe')).rejects.toThrow();

    // The normal check reads one event of every type and version, and the heads: not that one.
    expect(await probe()).toEqual({ ready: true, failed: [] });
    // The rollback step reads every event.
    expect(await probe(pool, { readEveryEvent: true })).toEqual({
      ready: false,
      failed: ['eventStore'],
    });
  });

  it('after a rollback, reads every event page by page, names one it cannot read, and is ready once all parse', async () => {
    await seedRavenford();
    await expect(
      new PostgresEventStore(pool).assertReadable({ everyEvent: true, pageSize: 7 }),
    ).resolves.toBeUndefined();
    expect(await probe(pool, { readEveryEvent: true })).toEqual({ ready: true, failed: [] });

    // Ravenford's events come first in key order: the planted one is many pages in.
    await copyRavenfordWithUnreadableEvent('rollback-probe', 40);
    const store = new PostgresEventStore(pool);
    await expect(store.assertReadable({ everyEvent: true, pageSize: 7 })).rejects.toThrow(
      /^this build cannot read event rollback-probe#40 \(/,
    );
    // A failed read is not remembered as done: the next call reads again.
    await expect(store.assertReadable({ everyEvent: true, pageSize: 7 })).rejects.toThrow(
      /rollback-probe#40/,
    );
  });

  it('is not ready when a stream head has no event', async () => {
    await plantStream('orphan', [], 3);
    expect(await probe()).toEqual({ ready: false, failed: ['eventStore'] });
  });

  it('is not ready, within its bound, when the database cannot be reached', async () => {
    const unreachable = new pg.Pool({
      connectionString: 'postgres://ltw:unused@127.0.0.1:1/ltw',
      connectionTimeoutMillis: 500,
    });
    try {
      const verdict = await storeReadiness(
        unreachable,
        await loadMigrations(MIGRATIONS_DIR),
        logger,
        {
          timeoutMs: 2_000,
        },
      )();
      expect(verdict).toEqual({
        ready: false,
        failed: ['database', 'migrations', 'eventStore'],
      });
    } finally {
      await unreachable.end();
    }
  });
});
