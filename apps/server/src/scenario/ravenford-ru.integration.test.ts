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
import { RU_SCRIPT } from '../testing/scenario/script-ru.ts';
import { BASE, CAMPAIGN, RavenfordSession } from '../testing/scenario/session.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from '../world-engine/postgres-event-store.ts';

/**
 * The Russian Ravenford on PostgreSQL across a restart (docs/adr/0031-play-language.md): the
 * language and every recorded Russian sentence come back from stored JSON unchanged, and
 * a restarted server answers every view exactly as before.
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

describe('the Russian Ravenford on PostgreSQL', () => {
  it('plays the slice, and a restarted server keeps the language, the words, and every view', async () => {
    const contents = new PostgresAssetContentStore(pool);
    const session = await RavenfordSession.open({
      store: new PostgresEventStore(pool),
      contents,
      script: RU_SCRIPT,
    });
    await playDayOne(session);
    const road = await playRoad(session);
    expect(road.chapter.result.status).toBe('accepted');
    const views = [
      `${BASE}/quests?perspective=PARTY`,
      `${BASE}/chronicle?perspective=PARTY`,
      `${BASE}/knowledge?perspective=PARTY`,
      `${BASE}/session`,
    ];
    const before = await Promise.all(
      views.map(async (url) => (await session.get('player', url)).raw),
    );
    const first = await session.snapshot();
    await session.close();

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
    expect(restarted.state.campaign?.language).toBe('ru');
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
    } finally {
      await app.close();
    }
  });
});
