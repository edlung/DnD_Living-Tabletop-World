import { SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seededEngine } from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';

/**
 * Player commands on PostgreSQL (docs/adr/0013-investigation.md): the engine's
 * resolution (IDs, d20) is stored with the command, survives a restart, and
 * replays without drawing dice. Retrying the command ID never rolls again.
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

const player = { actorId: 'player-elowen', kind: 'user' } as const;
const submission = (commandId: string, command: Record<string, unknown>) => ({
  commandId,
  campaignId: 'ravenford',
  actor: player,
  command: { characterId: 'elowen-starwhisper', ...command },
});

describe('investigation on PostgreSQL', () => {
  it('stores the resolution and replays the check after a restart', async () => {
    const engine = await seededEngine(new PostgresEventStore(pool), scriptedDice([7]));
    for (const [id, locationId] of [
      ['p1', 'old-trade-road'],
      ['p2', 'abandoned-caravan-site'],
    ] as const) {
      expect(
        (await engine.execute(submission(id, { type: 'EnterLocation', locationId }))).status,
      ).toBe('accepted');
    }
    const check = submission('p3', {
      type: 'ExamineEntity',
      entityId: 'broken-wagon-wheel',
      method: 'investigation',
    });
    const first = await engine.execute(check);
    expect(first).toMatchObject({
      status: 'accepted',
      outcome: { roll: { d20: 7, modifier: 8, total: 15 } },
    });

    // No dice at all: a restart must replay, and a retry must not roll.
    const restarted = new WorldEngine({
      store: new PostgresEventStore(pool),
      ids: new SequentialIds(5),
      clock: new SteppingClock(),
    });
    const before = await engine.load('ravenford');
    expect((await restarted.load('ravenford'))?.state).toEqual(before?.state);
    expect(await restarted.execute(check)).toMatchObject({
      status: 'duplicate',
      outcome: { roll: { d20: 7, modifier: 8, total: 15 } },
    });
    const stored = (await restarted.commandLog('ravenford')).find((c) => c.commandId === 'p3');
    expect(stored?.command).toMatchObject({ resolution: { d20: 7 } });
  });
});
