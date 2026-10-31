import pg from 'pg';
import { describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from './throwaway-database.ts';

/**
 * Dropping a throwaway database never terminates a connection that is still closing: `pool.end()`
 * resolves before its clients' sockets close, and a terminated idle client makes its pool emit an
 * unhandled `57P01` error that fails the whole integration run. A connection that never closes
 * still cannot keep the database alive.
 */
async function connect(database: ThrowawayDatabase) {
  const client = new pg.Client({ connectionString: database.url });
  const errors: string[] = [];
  client.on('error', (error: Error & { code?: unknown }) => {
    errors.push(typeof error.code === 'string' ? error.code : error.message);
  });
  const ended = new Promise<void>((resolve) => {
    client.once('end', () => {
      resolve();
    });
  });
  await client.connect();
  return { client, errors, ended };
}

async function exists(database: ThrowawayDatabase): Promise<boolean> {
  const client = new pg.Client({ connectionString: database.url });
  try {
    await client.connect();
  } catch (error) {
    if ((error as { code?: unknown }).code === '3D000') return false;
    throw error;
  }
  await client.end();
  return true;
}

describe('throwaway database drop', () => {
  it('lets a closing connection finish instead of terminating it', async () => {
    const database = await createThrowawayDatabase();
    const { client, errors } = await connect(database);
    // Like the clients of an ended pool: the drop starts while the close is still under way.
    const closed = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        client.end().then(resolve, reject);
      }, 300);
    });
    const started = Date.now();

    await database.drop();
    await closed;

    expect(errors).toEqual([]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(await exists(database)).toBe(false);
  });

  it('still drops the database when a connection never closes', async () => {
    const database = await createThrowawayDatabase();
    const { errors, ended } = await connect(database);

    await database.drop();
    await ended;

    expect(errors[0]).toBe('57P01');
    expect(await exists(database)).toBe(false);
  });
});
