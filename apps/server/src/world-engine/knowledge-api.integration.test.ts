import { SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  TOKENS,
  get,
  ravenfordApp,
  seededEngine,
  withoutRequestId,
} from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';
import { createWorldEngine } from './runtime.ts';

/**
 * The knowledge API over PostgreSQL: the same requests must yield the same
 * responses as the in-memory reference, including after a restart, so no
 * storage path, cache, or fallback changes what a perspective sees.
 */
let database: ThrowawayDatabase;
let pool: pg.Pool;
const apps: FastifyInstance[] = [];

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url });
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await pool.end();
  await database.drop();
});

const REQUESTS: [string, string][] = [
  ['/campaigns/ravenford/knowledge?perspective=PARTY', TOKENS.player],
  ['/campaigns/ravenford/knowledge?perspective=PLAYER', TOKENS.player],
  ['/campaigns/ravenford/knowledge?perspective=PUBLIC', TOKENS.player],
  ['/campaigns/ravenford/knowledge?perspective=NPC:mira-vale', TOKENS.dm],
  [
    '/campaigns/ravenford/knowledge/party-goblin-hypothesis/related?perspective=PARTY&depth=3',
    TOKENS.player,
  ],
  ['/campaigns/ravenford/knowledge/truth-ashen-circle?perspective=PARTY', TOKENS.player],
  ['/campaigns/ravenford/entities?perspective=PARTY', TOKENS.player],
  ['/campaigns/ravenford/entities/guild-caravan/knowledge?perspective=NPC:mira-vale', TOKENS.dm],
  ['/campaigns/ravenford/knowledge?perspective=DM', TOKENS.dm],
  ['/campaigns/ravenford/knowledge?perspective=DM', TOKENS.outsider],
];

async function responses(app: FastifyInstance) {
  return Promise.all(
    REQUESTS.map(async ([url, token]) => withoutRequestId(await get(app, url, token))),
  );
}

describe('knowledge API on PostgreSQL', () => {
  it('answers exactly like the in-memory reference, before and after a restart', async () => {
    const deterministic = () => ({ ids: new SequentialIds(), clock: new SteppingClock() });
    await seededEngine(new PostgresEventStore(pool));
    const reference = await ravenfordApp(await seededEngine());
    const live = await ravenfordApp(
      new WorldEngine({ store: new PostgresEventStore(pool), ...deterministic() }),
    );
    const restarted = await ravenfordApp(createWorldEngine(pool));
    apps.push(reference, live, restarted);

    const expected = await responses(reference);
    expect(await responses(live)).toEqual(expected);
    expect(await responses(restarted)).toEqual(expected);
    expect(JSON.stringify(expected.slice(0, 8))).not.toContain('Ashen');
  });
});
