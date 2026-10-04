import { createCombatEngine } from '@ltw/combat';
import type { NpcDialogueResponse } from '@ltw/contracts';
import {
  SequentialIds,
  SteppingClock,
  WorldEngine,
  checkWorldIntegrity,
  redecideEffective,
  replay,
  undoneBeneathEarlierWriters,
} from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { blockersOf, post } from '../testing/gate02-scenarios.ts';
import { insertHistory, loadHistoryRows } from '../testing/history-rows.ts';
import { MIDDLE_ENTROPY, TOKENS, ravenfordApp } from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';

/**
 * The Stage 120 writer's rows (fixtures/history/b7a1a92-npc-memories.json) on
 * PostgreSQL under the Stage 130 app (ADR 0020): its play memories quote names
 * it never recorded, so undo beneath them is refused, across a restart; the
 * campaign continues, NPC dialogue included, and verifies.
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

const engineOnDatabase = (namespace: number) =>
  new WorldEngine({
    store: new PostgresEventStore(pool),
    ids: new SequentialIds(namespace),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
    entropy: MIDDLE_ENTROPY,
  });

async function app(engine: WorldEngine): Promise<FastifyInstance> {
  const instance = await ravenfordApp(engine);
  apps.push(instance);
  return instance;
}

describe('the Stage 120 writer’s memories on PostgreSQL', () => {
  it('refuses undo beneath them after a restart, and continues with dialogue', async () => {
    const history = await loadHistoryRows('b7a1a92-npc-memories');
    const step = (name: string) => history.labels[name] ?? '';
    await insertHistory(pool, history);

    const first = await app(engineOnDatabase(41));
    const refused = await post(first, TOKENS.dm, 'npc-undo-1', {
      type: 'UndoCommand',
      targetCommandId: step('rename-caravan'),
    });
    expect(refused.status).toBe(422);
    expect(blockersOf(refused.body)).toContain(step('ask-caravan'));

    const engine = engineOnDatabase(42);
    const second = await app(engine);
    const again = await post(second, TOKENS.dm, 'npc-undo-2', {
      type: 'UndoCommand',
      targetCommandId: step('ask-road'),
    });
    expect(again.status).toBe(422);
    const talked = await second.inject({
      method: 'POST',
      url: '/campaigns/ravenford/npcs/captain-thorne/dialogue',
      payload: { characterId: 'elowen-starwhisper', intent: { kind: 'talk' } },
      headers: { authorization: `Bearer ${TOKENS.player}` },
    });
    expect(talked.json<NpcDialogueResponse>().reply?.status).toBe('REPLIED');

    const state = (await engine.load('ravenford'))?.state;
    const events = (await new PostgresEventStore(pool).loadStream('ravenford'))?.events ?? [];
    if (!state) throw new Error('missing campaign');
    expect(replay(events)).toEqual(state);
    expect(checkWorldIntegrity(state)).toEqual([]);
    expect(undoneBeneathEarlierWriters(state, events)).toEqual([]);
    const log = await engine.commandLog('ravenford');
    expect(
      redecideEffective(log, { state, history: events }, () => 0, createCombatEngine()),
    ).toBeNull();
  });
});
