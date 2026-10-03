import { randomUUID } from 'node:crypto';

import { WorldEngine, type IdGenerator, type WallClock } from '@ltw/domain';
import type pg from 'pg';

import { PostgresEventStore } from './postgres-event-store.ts';

/** Production sources of nondeterminism; their outputs are recorded in events. */
export const randomIds: IdGenerator = { next: () => randomUUID() };
export const systemClock: WallClock = { now: () => new Date().toISOString() };

/** The World Engine backed by PostgreSQL. One instance per process. */
export function createWorldEngine(pool: pg.Pool): WorldEngine {
  return new WorldEngine({
    store: new PostgresEventStore(pool),
    ids: randomIds,
    clock: systemClock,
  });
}
