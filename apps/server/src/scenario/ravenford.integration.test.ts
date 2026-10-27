import { createCombatEngine } from '@ltw/combat';
import {
  SequentialIds,
  SteppingClock,
  WorldEngine,
  checkWorldIntegrity,
  redecideEffective,
  replay,
} from '@ltw/domain';
import { scriptedDice, skillCheckPort, skillModifier } from '@ltw/rules';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PostgresAssetContentStore } from '../assets/postgres-content-store.ts';
import {
  MIDDLE_ENTROPY,
  TOKENS,
  get,
  ravenfordApp,
  testAuthoring,
} from '../testing/ravenford-app.ts';
import { playDayOne } from '../testing/scenario/play-day-one.ts';
import { playRoad } from '../testing/scenario/play-road.ts';
import { BASE, CAMPAIGN, RavenfordSession } from '../testing/scenario/session.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from '../world-engine/postgres-event-store.ts';

/**
 * The whole Ravenford session on PostgreSQL (docs/adr/0025-ravenford-
 * integration.md §3): the production event store and content store, then a
 * restarted engine on the same database. Canon, the oracle, replay, and
 * every player-facing view agree after the restart.
 */
let database: ThrowawayDatabase;
let pool: pg.Pool;

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url });
});

afterEach(async () => {
  await pool.end();
  await database.drop();
});

describe('Ravenford on PostgreSQL', () => {
  it('plays the whole slice, and a restarted server agrees on canon and on every view', async () => {
    const contents = new PostgresAssetContentStore(pool);
    const session = await RavenfordSession.open({ store: new PostgresEventStore(pool), contents });
    const { tomasId } = await playDayOne(session);
    const road = await playRoad(session);
    expect(road.chapter.result.status).toBe('accepted');
    const views = [
      `${BASE}/quests?perspective=PARTY`,
      `${BASE}/chronicle?perspective=PARTY`,
      `${BASE}/knowledge?perspective=PARTY`,
      `${BASE}/locations/market-square/scene?perspective=PLAYER&at=40000`,
      `${BASE}/entities/${tomasId}/presentation?perspective=PLAYER`,
    ];
    const before = await Promise.all(
      views.map(async (url) => (await session.get('player', url)).raw),
    );
    const first = await session.snapshot();
    await session.close();

    // A new process: a fresh engine and app on the same database.
    const engine = new WorldEngine({
      store: new PostgresEventStore(pool),
      ids: new SequentialIds(0xbb),
      clock: new SteppingClock(),
      checks: skillCheckPort(scriptedDice([])),
      combat: createCombatEngine(),
      entropy: MIDDLE_ENTROPY,
    });
    const restarted = await engine.load(CAMPAIGN);
    if (!restarted) throw new Error('missing campaign');
    expect(restarted.state).toEqual(first.state);
    expect(checkWorldIntegrity(restarted.state)).toEqual([]);
    expect(replay(restarted.history)).toEqual(restarted.state);
    const log = await engine.commandLog(CAMPAIGN);
    expect(redecideEffective(log, restarted, skillModifier, createCombatEngine())).toBeNull();

    const app = await ravenfordApp(engine, session.ai, testAuthoring(), contents);
    try {
      const after = await Promise.all(
        views.map(async (url) => (await get(app, url, TOKENS.player)).body),
      );
      expect(after).toEqual(before);
      // Tomas's approved image is served from the database for the player.
      const presentation = JSON.parse(after[4] ?? '{}') as {
        presentation?: { image?: { contentHash?: string } };
      };
      const hash = presentation.presentation?.image?.contentHash ?? '';
      expect(hash).toMatch(/^sha256:/);
      expect(
        (await get(app, `${BASE}/assets/content/${hash}?perspective=PLAYER`, TOKENS.player))
          .statusCode,
      ).toBe(200);
    } finally {
      await app.close();
    }
  });
});
