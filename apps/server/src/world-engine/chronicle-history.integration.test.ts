import { createCombatEngine } from '@ltw/combat';
import type { ChronicleListResponse } from '@ltw/contracts';
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
import { MIDDLE_ENTROPY, TOKENS, get, ravenfordApp } from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';

/**
 * The Stages 170–180 writer's chapters (fixtures/history/e9c05ad-chronicle-names.json)
 * on PostgreSQL under the Gate 05 remediation (G05-H01): readable as recorded,
 * undo beneath them refused across a restart, recovered newest first, and
 * the campaign verifies.
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

describe('the Stages 170–180 writer’s chapters on PostgreSQL', () => {
  it('reads them as recorded, refuses undo beneath them after a restart, and recovers newest first', async () => {
    const history = await loadHistoryRows('e9c05ad-chronicle-names');
    const step = (name: string) => history.labels[name] ?? '';
    await insertHistory(pool, history);

    const first = await app(engineOnDatabase(51));
    const refused = await post(first, TOKENS.dm, 'chronicle-undo-1', {
      type: 'UndoCommand',
      targetCommandId: step('rename-elowen'),
    });
    expect(refused.status).toBe(422);
    expect(blockersOf(refused.body)).toContain(step('dm-chapter'));

    const engine = engineOnDatabase(52);
    const second = await app(engine);
    const dmView = (
      await get(second, '/campaigns/ravenford/chronicle?perspective=DM', TOKENS.dm)
    ).json<ChronicleListResponse>();
    expect(dmView.chapters.map((c) => c.chronicleId)).toEqual([
      step('dm-chapter'),
      step('party-chapter'),
    ]);
    expect(dmView.chapters[0]?.entries.map((e) => e.text)).toContain(
      'Elowen of the Trade Road went to The Old Market.',
    );
    const party = (
      await get(second, '/campaigns/ravenford/chronicle?perspective=PARTY', TOKENS.player)
    ).json<ChronicleListResponse>();
    expect(party.chapters.map((c) => c.chronicleId)).toEqual([step('party-chapter')]);

    const again = await post(second, TOKENS.dm, 'chronicle-undo-2', {
      type: 'UndoCommand',
      targetCommandId: step('rename-mira'),
    });
    expect(again.status).toBe(422);
    let serial = 2;
    for (const name of [
      'party-chapter',
      'dm-chapter',
      'rename-mira',
      'rename-square',
      'rename-elowen',
    ]) {
      serial += 1;
      const undone = await post(second, TOKENS.dm, `chronicle-undo-${String(serial)}`, {
        type: 'UndoCommand',
        targetCommandId: step(name),
      });
      expect(undone.status, name).toBe(200);
    }

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
