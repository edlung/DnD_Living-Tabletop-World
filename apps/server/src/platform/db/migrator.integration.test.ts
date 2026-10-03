import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createThrowawayDatabase,
  type ThrowawayDatabase,
} from '../../testing/throwaway-database.ts';
import { createLogger } from '../logging/logger.ts';
import { loadMigrations, parseMigrations } from './migration-source.ts';
import { MIGRATIONS_DIR } from './migrations-dir.ts';
import { MIGRATIONS_TABLE, runMigrations } from './migrator.ts';

/**
 * Runs against the PostgreSQL instance from DATABASE_URL (docker-compose
 * locally, a service container in CI). Each test gets a throwaway database.
 */
const logger = createLogger({ service: 'migrator-it', level: 'silent' });

let database: ThrowawayDatabase;
let clients: pg.Client[] = [];

async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: database.url });
  await client.connect();
  clients.push(client);
  return client;
}

async function tableExists(client: pg.Client, table: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    'SELECT to_regclass($1) IS NOT NULL AS exists',
    [table],
  );
  return rows[0]?.exists === true;
}

async function history(client: pg.Client): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM ${MIGRATIONS_TABLE} ORDER BY id`,
  );
  return rows.map((row) => row.id);
}

beforeEach(async () => {
  database = await createThrowawayDatabase();
});

afterEach(async () => {
  await Promise.all(clients.map((client) => client.end()));
  clients = [];
  await database.drop();
});

describe('runMigrations against PostgreSQL', () => {
  it('bootstraps an empty database with the repository migrations', async () => {
    const client = await connect();

    const result = await runMigrations({
      client,
      migrations: await loadMigrations(MIGRATIONS_DIR),
      logger,
    });

    expect(result.alreadyApplied).toBe(0);
    expect(await tableExists(client, MIGRATIONS_TABLE)).toBe(true);
    expect(await history(client)).toEqual(result.applied);
  });

  it('applies pending migrations in order, once', async () => {
    const client = await connect();
    const migrations = parseMigrations([
      { name: '0002_add_probe_column.sql', sql: 'ALTER TABLE probe ADD COLUMN label text;' },
      { name: '0001_create_probe.sql', sql: 'CREATE TABLE probe (id integer PRIMARY KEY);' },
    ]);

    const first = await runMigrations({ client, migrations, logger });
    const second = await runMigrations({ client, migrations, logger });

    expect(first.applied).toEqual(['0001_create_probe', '0002_add_probe_column']);
    expect(second).toEqual({ applied: [], alreadyApplied: 2 });
    expect(await history(client)).toEqual(['0001_create_probe', '0002_add_probe_column']);
    await client.query("INSERT INTO probe (id, label) VALUES (1, 'ok')");
  });

  it('rolls back a failing migration without partial schema or history', async () => {
    const client = await connect();
    const good = { name: '0001_create_probe.sql', sql: 'CREATE TABLE probe (id integer);' };
    const broken = {
      name: '0002_broken.sql',
      sql: 'CREATE TABLE half_done (id integer); SELECT * FROM table_that_does_not_exist;',
    };

    await expect(
      runMigrations({ client, migrations: parseMigrations([good, broken]), logger }),
    ).rejects.toThrow(/"0002_broken" failed and was rolled back/);

    expect(await tableExists(client, 'probe')).toBe(true);
    expect(await tableExists(client, 'half_done')).toBe(false);
    expect(await history(client)).toEqual(['0001_create_probe']);

    const fixed = { name: '0002_broken.sql', sql: 'CREATE TABLE half_done (id integer);' };
    const retry = await runMigrations({
      client,
      migrations: parseMigrations([good, fixed]),
      logger,
    });
    expect(retry.applied).toEqual(['0002_broken']);
  });

  it('refuses to run when an applied migration was edited', async () => {
    const client = await connect();
    const original = { name: '0001_create_probe.sql', sql: 'CREATE TABLE probe (id integer);' };
    await runMigrations({ client, migrations: parseMigrations([original]), logger });

    const edited = { ...original, sql: 'CREATE TABLE probe (id bigint);' };
    await expect(
      runMigrations({ client, migrations: parseMigrations([edited]), logger }),
    ).rejects.toThrow(/modified after it was applied/);
  });

  it('serializes concurrent runners so each migration applies exactly once', async () => {
    const [a, b] = await Promise.all([connect(), connect()]);
    const migrations = parseMigrations([
      { name: '0001_create_probe.sql', sql: 'CREATE TABLE probe (id integer);' },
      { name: '0002_create_other.sql', sql: 'CREATE TABLE other (id integer);' },
    ]);

    const results = await Promise.all([
      runMigrations({ client: a, migrations, logger }),
      runMigrations({ client: b, migrations, logger }),
    ]);

    expect(results.flatMap((result) => result.applied).sort()).toEqual([
      '0001_create_probe',
      '0002_create_other',
    ]);
    expect(await history(a)).toEqual(['0001_create_probe', '0002_create_other']);
  });
});
