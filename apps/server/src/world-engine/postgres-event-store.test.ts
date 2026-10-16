import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import { PostgresEventStore } from './postgres-event-store.ts';

/**
 * Readiness reads of the stored history (docs/adr/0037-deployment.md §3) over a scripted pool, no
 * database: concurrent probes share one read, a read that succeeded is not repeated, a failed one
 * is. The PostgreSQL behaviour is in `store-readiness.integration.test.ts`.
 */
function scriptedPool(history: () => Promise<{ rows: unknown[] }>) {
  const reads: string[] = [];
  const pool = {
    query: (text: string) => {
      // The heads: none here.
      if (text.includes('FROM ltw_event_streams h')) return Promise.resolve({ rows: [] });
      reads.push(text.includes('DISTINCT ON') ? 'shapes' : 'events');
      return history();
    },
  };
  return { pool: pool as unknown as pg.Pool, reads };
}

describe('PostgresEventStore.assertReadable', () => {
  it('shares one read of every event among concurrent calls and keeps it once it succeeded', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { pool, reads } = scriptedPool(() => gate.then(() => ({ rows: [] })));
    const store = new PostgresEventStore(pool);

    const first = store.assertReadable({ everyEvent: true });
    const second = store.assertReadable({ everyEvent: true });
    release();
    await Promise.all([first, second]);
    await store.assertReadable({ everyEvent: true });
    // Every event covers the cheap check's one event of every type and version.
    await store.assertReadable();
    expect(reads).toEqual(['events']);
  });

  it('reads again after a failed read, and reads every event when only the cheap check ran', async () => {
    let fail = true;
    const { pool, reads } = scriptedPool(() =>
      fail ? Promise.reject(new Error('connection lost')) : Promise.resolve({ rows: [] }),
    );
    const store = new PostgresEventStore(pool);

    await expect(store.assertReadable({ everyEvent: true })).rejects.toThrow('connection lost');
    fail = false;
    await store.assertReadable();
    await store.assertReadable({ everyEvent: true });
    await store.assertReadable({ everyEvent: true });
    expect(reads).toEqual(['events', 'shapes', 'events']);
  });
});
