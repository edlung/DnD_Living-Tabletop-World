import {
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  WorldEngine,
  checkWorldIntegrity,
  replay,
  type EventStore,
} from '@ltw/domain';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';
import { loadRavenfordSeed, type RavenfordSeed } from './ravenford-seed.ts';
import { createWorldEngine } from './runtime.ts';

/**
 * Stage 10 validation gate on real storage: stable identity, deterministic
 * replay, event ordering, invalid-command rejection, auditability.
 */
let database: ThrowawayDatabase;
let pool: pg.Pool;
let seed: RavenfordSeed;

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url, max: 8 });
  seed = await loadRavenfordSeed();
});

afterEach(async () => {
  await pool.end();
  await database.drop();
});

const deterministicEngine = (store: EventStore, namespace = 0) =>
  new WorldEngine({ store, ids: new SequentialIds(namespace), clock: new SteppingClock() });

async function seedWith(engine: WorldEngine): Promise<void> {
  for (const submission of seed.submissions) {
    expect((await engine.execute(submission)).status).toBe('accepted');
  }
}

const command = (commandId: string, body: Record<string, unknown>) => ({
  commandId,
  campaignId: seed.campaignId,
  actor: seed.dm,
  command: body,
});

describe('World Engine on PostgreSQL', () => {
  it('replays the same canonical state and history in a fresh process as in memory', async () => {
    await seedWith(deterministicEngine(new PostgresEventStore(pool)));
    const memory = deterministicEngine(new InMemoryEventStore());
    await seedWith(memory);

    const restarted = await createWorldEngine(pool).load(seed.campaignId);
    const reference = await memory.load(seed.campaignId);

    expect(restarted?.history).toEqual(reference?.history);
    expect(restarted?.state).toEqual(reference?.state);
    expect(restarted && replay(restarted.history)).toEqual(restarted?.state);
    expect(restarted && checkWorldIntegrity(restarted.state)).toEqual([]);
  });

  it('orders concurrent commands from two processes into one gapless stream', async () => {
    let conflicts = 0;
    const inner = new PostgresEventStore(pool);
    const counting: EventStore = {
      loadStream: (id, after) => inner.loadStream(id, after),
      findCommand: (id) => inner.findCommand(id),
      loadCommands: (id) => inner.loadCommands(id),
      append: (batch) =>
        inner.append(batch).catch((error: unknown) => {
          conflicts += 1;
          throw error;
        }),
    };
    const a = new WorldEngine({
      store: counting,
      ids: new SequentialIds(6),
      clock: new SteppingClock(),
    });
    const b = new WorldEngine({
      store: counting,
      ids: new SequentialIds(7),
      clock: new SteppingClock(),
    });
    await seedWith(a);
    const startClock = (await a.load(seed.campaignId))?.state.clock ?? Number.NaN;

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 === 0 ? a : b).execute(
          command(`tick-${String(i)}`, { type: 'AdvanceWorldTime', by: 60 }),
        ),
      ),
    );

    expect(results.filter((result) => result.status !== 'accepted')).toEqual([]);
    const stream = await inner.loadStream(seed.campaignId);
    const sequences = stream?.events.map((event) => event.sequence) ?? [];
    expect(sequences).toEqual(sequences.map((_, i) => i + 1));
    expect((await a.load(seed.campaignId))?.state).toEqual((await b.load(seed.campaignId))?.state);
    expect((await a.load(seed.campaignId))?.state.clock).toBe(startClock + 20 * 60);
    expect(conflicts).toBeGreaterThan(0);
  });

  it('records a command once when two processes race on the same command ID', async () => {
    const a = createWorldEngine(pool);
    const b = createWorldEngine(pool);
    await seedWith(a);
    const submission = command('race', {
      type: 'PlaceEntity',
      entityId: 'mira-vale',
      locationId: 'golden-stag-inn',
    });

    const results = await Promise.all([a.execute(submission), b.execute(submission)]);

    expect(results.map((result) => result.status).sort()).toEqual(['accepted', 'duplicate']);
    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*) FROM ltw_events WHERE command_id = 'race'",
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('rejects invalid commands without writing anything', async () => {
    const engine = createWorldEngine(pool);
    await seedWith(engine);
    const before = await pool.query('SELECT count(*) FROM ltw_events');

    const outcomes = await Promise.all([
      engine.execute(
        command('bad-1', { type: 'PlaceEntity', entityId: 'mira-vale', locationId: 'ghost' }),
      ),
      engine.execute({
        ...command('bad-2', { type: 'AdvanceWorldTime', by: 60 }),
        actor: { actorId: 'player', kind: 'user' },
      }),
      engine.execute(
        command('bad-3', {
          type: 'CreateEntity',
          entityId: 'ravenford',
          kind: 'npc',
          name: 'X',
          existsSince: null,
        }),
      ),
      engine.execute(command('bad-4', { type: 'AdvanceWorldTime', to: 0 })),
      engine.execute({
        ...command('bad-5', { type: 'EndScene', sceneId: 'arrival' }),
        extra: true,
      }),
    ]);

    expect(outcomes.map((outcome) => outcome.status === 'rejected' && outcome.code)).toEqual([
      'ENTITY_NOT_FOUND',
      'FORBIDDEN',
      'ID_ALREADY_USED',
      'TEMPORAL_CONFLICT',
      'INVALID_COMMAND',
    ]);
    expect((await pool.query('SELECT count(*) FROM ltw_events')).rows).toEqual(before.rows);
    expect(
      (await pool.query("SELECT count(*) FROM ltw_commands WHERE command_id LIKE 'bad-%'")).rows[0],
    ).toEqual({
      count: '0',
    });
  });

  it('keeps undo and its audit history across restarts', async () => {
    const engine = createWorldEngine(pool);
    await seedWith(engine);
    expect(
      (
        await engine.execute(
          command('move-orin', {
            type: 'PlaceEntity',
            entityId: 'orin-stonebeard',
            locationId: 'market-square',
          }),
        )
      ).status,
    ).toBe('accepted');
    expect(
      (
        await engine.execute(
          command('undo-orin', { type: 'UndoCommand', targetCommandId: 'move-orin' }),
        )
      ).status,
    ).toBe('accepted');

    const restarted = await createWorldEngine(pool).load(seed.campaignId);
    expect(restarted?.state.entities.get('orin-stonebeard')?.placement?.locationId).toBe(
      'orins-alchemy',
    );
    expect(restarted?.state.commands.get('move-orin')?.undoneBy).toBe('undo-orin');
    expect(restarted?.history.at(-2)?.type).toBe('EntityPlaced');
    expect(restarted?.history.at(-1)?.type).toBe('CommandUndone');
  });
});
