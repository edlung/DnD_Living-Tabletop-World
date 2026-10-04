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
 * on PostgreSQL under the Gate 05 remediation (G05-H01), and the Gate 05
 * retest 1 writer's chapter telling examinations that changed no fact
 * (fixtures/history/a488de4-cited-examinations.json; G05-H02): readable as
 * recorded, undo beneath them refused across a restart, recovered newest
 * first, and the campaign verifies.
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

    await verified(engine);
  });
});

describe('the Gate 05 retest 1 writer’s chapter on PostgreSQL', () => {
  it('reads it with every source, refuses undo of the examinations it tells after a restart, and recovers chapter first', async () => {
    const history = await loadHistoryRows('a488de4-cited-examinations');
    const step = (name: string) => history.labels[name] ?? '';
    await insertHistory(pool, history);
    let serial = 0;
    const undo = (instance: FastifyInstance, name: string) => {
      serial += 1;
      return post(instance, TOKENS.dm, `occurrence-undo-${String(serial)}`, {
        type: 'UndoCommand',
        targetCommandId: step(name),
      });
    };

    const first = await app(engineOnDatabase(53));
    const refused = await undo(first, 'repeat-inspection');
    expect(refused.status).toBe(422);
    expect(blockersOf(refused.body)).toEqual([step('dm-chapter')]);

    const engine = engineOnDatabase(54);
    const second = await app(engine);
    const dmView = (
      await get(second, '/campaigns/ravenford/chronicle?perspective=DM', TOKENS.dm)
    ).json<ChronicleListResponse>();
    expect(dmView.chapters.map((c) => c.chronicleId)).toEqual([step('dm-chapter')]);
    const entries = dmView.chapters[0]?.entries ?? [];
    expect(entries.map((e) => e.text)).toContain('Elowen Starwhisper examined Ordinary Token.');
    expect(entries.every((e) => e.sources.length > 0)).toBe(true);

    const again = await undo(second, 'token-inspection');
    expect(again.status).toBe(422);
    expect(blockersOf(again.body)).toEqual([step('dm-chapter')]);
    // After the chapter, so no chapter tells it: it stays undoable.
    expect((await undo(second, 'later-inspection')).status).toBe(200);
    for (const name of ['dm-chapter', 'token-inspection', 'repeat-inspection']) {
      expect((await undo(second, name)).status, name).toBe(200);
    }
    await verified(engine);
  });

  it('reads the undo that writer accepted beneath its chapter as recorded, names the orphan, and recovers', async () => {
    const history = await loadHistoryRows('a488de4-cited-examination-undone');
    const step = (name: string) => history.labels[name] ?? '';
    await insertHistory(pool, history);
    const engine = engineOnDatabase(55);
    const instance = await app(engine);
    const told = (
      await get(instance, '/campaigns/ravenford/chronicle?perspective=DM', TOKENS.dm)
    ).json<ChronicleListResponse>();
    const texts = (told.chapters[0]?.entries ?? []).map((e) => [e.text, e.sources.length]);
    expect(texts).toContainEqual(['Elowen Starwhisper examined Strange Symbol.', 0]);
    const loaded = await engine.load('ravenford');
    expect(loaded && checkWorldIntegrity(loaded.state)).toEqual([
      `chronicle ${step('dm-chapter')} tells undone command ${step('repeat-inspection')}`,
    ]);

    const refused = await post(instance, TOKENS.dm, 'orphan-undo-1', {
      type: 'UndoCommand',
      targetCommandId: step('token-inspection'),
    });
    expect(refused.status).toBe(422);
    const recovered = await post(instance, TOKENS.dm, 'orphan-undo-2', {
      type: 'UndoCommand',
      targetCommandId: step('dm-chapter'),
    });
    expect(recovered.status).toBe(200);
    const state = (await engine.load('ravenford'))?.state;
    expect(state && checkWorldIntegrity(state)).toEqual([]);
    const events = (await new PostgresEventStore(pool).loadStream('ravenford'))?.events ?? [];
    expect(state && undoneBeneathEarlierWriters(state, events)).toEqual([
      step('undo-repeat-inspection'),
    ]);
  });
});

async function verified(engine: WorldEngine) {
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
}
