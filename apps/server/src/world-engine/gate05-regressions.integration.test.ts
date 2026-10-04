import { createCombatEngine } from '@ltw/combat';
import type {
  ChronicleListResponse,
  CommandResult,
  GenerateChronicleResponse,
  QuestListResponse,
} from '@ltw/contracts';
import {
  SequentialIds,
  SteppingClock,
  WorldEngine,
  checkWorldIntegrity,
  redecideEffective,
  replay,
} from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PostgresAiTraceStore } from '../ai/postgres-trace-store.ts';
import {
  TOKENS,
  get,
  post,
  ravenfordApp,
  seededEngine,
  testAiGateway,
} from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';

/**
 * Gate 05 regressions (reviews/ASTRA_GATE_05_REPORT.md), as the review
 * reproduced them: through the authenticated HTTP app on PostgreSQL, with a
 * restart. G05-H01: a standing chapter protects the names it told. G05-M01:
 * a later move of the evidence never rewrites the quest's earlier
 * examination milestone.
 */
const BASE = '/campaigns/ravenford';
const NAME = 'G05 NAME THAT MUST NOT SURVIVE UNDO';
let database: ThrowawayDatabase;
let pool: pg.Pool;
let app: FastifyInstance;
let engine: WorldEngine;
let serial = 0;

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url });
  engine = await seededEngine(new PostgresEventStore(pool));
  app = await ravenfordApp(engine, { ...testAiGateway(), traces: new PostgresAiTraceStore(pool) });
});

afterEach(async () => {
  await app.close();
  await pool.end();
  await database.drop();
});

const command = async (body: Record<string, unknown>, token: string = TOKENS.dm) => {
  serial += 1;
  const response = await post(
    app,
    `${BASE}/commands`,
    { commandId: `g05-${String(serial)}`, command: body },
    token,
  );
  return { http: response.statusCode, result: response.json<CommandResult>() };
};
const oracle = async () => {
  const snapshot = await engine.load('ravenford');
  if (!snapshot) throw new Error('missing campaign');
  const log = await engine.commandLog('ravenford');
  return { snapshot, divergence: redecideEffective(log, snapshot, () => 0, createCombatEngine()) };
};
async function restart() {
  await app.close();
  engine = new WorldEngine({
    store: new PostgresEventStore(pool),
    ids: new SequentialIds(950),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
  });
  app = await ravenfordApp(engine, { ...testAiGateway(), traces: new PostgresAiTraceStore(pool) });
}

describe('G05-H01: a chapter protects the names it told', () => {
  it.each(['elowen-starwhisper', 'market-square'])(
    'refuses to undo the rename of %s beneath it',
    async (entityId) => {
      const renamed = await command({ type: 'UpdateEntityProfile', entityId, name: NAME });
      expect(renamed.result.status).toBe('accepted');
      const generated = await post(
        app,
        `${BASE}/chronicle`,
        { title: 'Gate 05 regression', perspective: 'DM', from: 0 },
        TOKENS.dm,
      );
      const chapterId = generated.json<GenerateChronicleResponse>().chronicleId ?? '';
      expect((await oracle()).divergence).toBeNull();

      const refused = await command({
        type: 'UndoCommand',
        targetCommandId: renamed.result.commandId,
      });
      expect(refused.http).toBe(422);
      expect(refused.result).toMatchObject({ code: 'UNDO_UNSAFE' });
      const blockers =
        refused.result.status === 'rejected' ? refused.result.details?.['blockers'] : [];
      expect(blockers).toEqual(
        expect.arrayContaining([expect.objectContaining({ commandId: chapterId })]),
      );

      await restart();
      const { snapshot, divergence } = await oracle();
      expect(divergence).toBeNull();
      expect(replay(snapshot.history)).toEqual(snapshot.state);
      expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
      expect(snapshot.state.entities.get(entityId)?.name).toBe(NAME);
      const view = (
        await get(app, `${BASE}/chronicle?perspective=DM`, TOKENS.dm)
      ).json<ChronicleListResponse>();
      expect(
        view.chapters
          .find((c) => c.chronicleId === chapterId)
          ?.entries.some((e) => e.text.includes(NAME)),
      ).toBe(true);

      // Explicit reverse recovery: the chapter, then the rename.
      expect((await command({ type: 'UndoCommand', targetCommandId: chapterId })).http).toBe(200);
      expect(
        (await command({ type: 'UndoCommand', targetCommandId: renamed.result.commandId })).http,
      ).toBe(200);
      expect((await oracle()).divergence).toBeNull();
    },
  );
});

describe('G05-M01: a later move never rewrites an earlier examination', () => {
  it.each(['move-away-after-site-examination', 'move-to-site-after-town-examination'])(
    '%s',
    async (mode) => {
      const wasAtSite = mode.startsWith('move-away');
      const act = (body: Record<string, unknown>) =>
        command({ characterId: 'elowen-starwhisper', ...body }, TOKENS.player);
      if (wasAtSite) {
        await act({ type: 'EnterLocation', locationId: 'old-trade-road' });
        await act({ type: 'EnterLocation', locationId: 'abandoned-caravan-site' });
      } else {
        await command({
          type: 'PlaceEntity',
          entityId: 'strange-symbol',
          locationId: 'market-square',
        });
      }
      expect(
        (await act({ type: 'ExamineEntity', entityId: 'strange-symbol', method: 'inspect' })).http,
      ).toBe(200);
      const quest = async () =>
        (
          await get(app, `${BASE}/quests?perspective=PARTY`, TOKENS.player)
        ).json<QuestListResponse>();
      const stages = (log: QuestListResponse) =>
        log.quests.flatMap((q) => q.transitions.map((t) => t.stage));
      const before = await quest();
      expect(stages(before).includes('evidence-examined')).toBe(wasAtSite);

      await command({ type: 'AdvanceWorldTime', by: 3_600 });
      const moved = await command({
        type: 'PlaceEntity',
        entityId: 'strange-symbol',
        locationId: wasAtSite ? 'north-gate' : 'abandoned-caravan-site',
      });
      expect(moved.http).toBe(200);
      expect(await quest()).toEqual(before);
      await restart();
      expect(await quest()).toEqual(before);
      expect(
        (await command({ type: 'UndoCommand', targetCommandId: moved.result.commandId })).http,
      ).toBe(200);
      expect(await quest()).toEqual(before);
      expect(
        (
          await get(app, `${BASE}/quests?perspective=PUBLIC`, TOKENS.player)
        ).json<QuestListResponse>().quests,
      ).toEqual([]);
      expect((await get(app, `${BASE}/quests?perspective=PARTY`, TOKENS.outsider)).statusCode).toBe(
        404,
      );
      const { snapshot, divergence } = await oracle();
      expect(divergence).toBeNull();
      expect(replay(snapshot.history)).toEqual(snapshot.state);
    },
  );
});
