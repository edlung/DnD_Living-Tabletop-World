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

import { PostgresAiJournal } from '../ai/journal.ts';
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
 * examination milestone. G05-H02 (reviews/ASTRA_GATE_05_RETEST_1.md): a
 * standing chapter protects the examinations it tells, even those that
 * changed no fact.
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
  app = await ravenfordApp(engine, { ...testAiGateway(), traces: new PostgresAiJournal(pool) });
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
  app = await ravenfordApp(engine, { ...testAiGateway(), traces: new PostgresAiJournal(pool) });
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
        await act({ type: 'EnterLocation', locationId: 'location-f3b82c8b' });
      } else {
        await command({
          type: 'PlaceEntity',
          entityId: 'feature-19c7c7f7',
          locationId: 'market-square',
        });
      }
      expect(
        (await act({ type: 'ExamineEntity', entityId: 'feature-19c7c7f7', method: 'inspect' }))
          .http,
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
        entityId: 'feature-19c7c7f7',
        locationId: wasAtSite ? 'north-gate' : 'location-f3b82c8b',
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

describe('G05-H02: a chapter protects the examinations it tells, whatever they changed', () => {
  const act = (body: Record<string, unknown>) =>
    command({ characterId: 'elowen-starwhisper', ...body }, TOKENS.player);
  const chapter = async (perspective: string, from = 0) => {
    const generated = await post(
      app,
      `${BASE}/chronicle`,
      { title: 'Gate 05 retest regression', perspective, from },
      TOKENS.dm,
    );
    expect(generated.statusCode).toBe(200);
    return generated.json<GenerateChronicleResponse>().chronicleId ?? '';
  };
  /** Elowen at the caravan site, then an inspection that rolls nothing and finds nothing. */
  async function emptyExamination(mode: string) {
    await act({ type: 'EnterLocation', locationId: 'old-trade-road' });
    await act({ type: 'EnterLocation', locationId: 'location-f3b82c8b' });
    let entityId = 'feature-19c7c7f7';
    if (mode === 'repeated inspection') {
      await act({ type: 'ExamineEntity', entityId, method: 'inspect' });
    } else {
      entityId = 'g05-plain-token';
      await command({
        type: 'CreateEntity',
        entityId,
        kind: 'item',
        name: 'Plain Token',
        existsSince: null,
        placement: { locationId: 'location-f3b82c8b', since: null },
      });
    }
    const examined = await act({ type: 'ExamineEntity', entityId, method: 'inspect' });
    expect(examined.result).toMatchObject({
      status: 'accepted',
      outcome: { roll: null, discovered: [] },
    });
    return examined.result.commandId;
  }

  it.each(['repeated inspection', 'first inspection without clues'])(
    'refuses to undo a %s beneath it, across a restart, until the chapter is undone',
    async (mode) => {
      const examination = await emptyExamination(mode);
      const chapterId = await chapter('DM');
      const { snapshot: before, divergence } = await oracle();
      expect(divergence).toBeNull();
      const source = before.history.find(
        (event) => event.type === 'EvidenceExamined' && event.causation.commandId === examination,
      );
      const told = async () =>
        (await get(app, `${BASE}/chronicle?perspective=DM`, TOKENS.dm))
          .json<ChronicleListResponse>()
          .chapters.find((c) => c.chronicleId === chapterId)
          ?.entries.find((e) => e.sources.some((s) => s.eventId === source?.eventId));
      const entry = await told();
      expect(entry?.sources).toEqual([
        { eventId: source?.eventId, eventType: 'EvidenceExamined', sequence: source?.sequence },
      ]);

      const refused = await command({ type: 'UndoCommand', targetCommandId: examination });
      expect(refused.http).toBe(422);
      expect(refused.result).toMatchObject({ code: 'UNDO_UNSAFE' });
      expect(
        refused.result.status === 'rejected' ? refused.result.details?.['blockers'] : [],
      ).toEqual([
        expect.objectContaining({ commandId: chapterId, commandType: 'GenerateChronicle' }),
      ]);
      // Nothing changed: no compensation, and the entry keeps its source.
      expect((await oracle()).snapshot).toEqual(before);
      expect(await told()).toEqual(entry);

      await restart();
      const reloaded = await oracle();
      expect(reloaded.divergence).toBeNull();
      expect(reloaded.snapshot.state).toEqual(before.state);
      expect(await told()).toEqual(entry);
      expect((await get(app, `${BASE}/chronicle?perspective=DM`, TOKENS.player)).statusCode).toBe(
        403,
      );
      expect((await get(app, `${BASE}/chronicle?perspective=DM`, TOKENS.outsider)).statusCode).toBe(
        404,
      );
      expect((await command({ type: 'UndoCommand', targetCommandId: examination })).http).toBe(422);

      // Explicit reverse recovery: the chapter, then the examination.
      expect((await command({ type: 'UndoCommand', targetCommandId: chapterId })).http).toBe(200);
      expect((await command({ type: 'UndoCommand', targetCommandId: examination })).http).toBe(200);
      const { snapshot, divergence: after } = await oracle();
      expect(after).toBeNull();
      expect(replay(snapshot.history)).toEqual(snapshot.state);
      expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    },
  );

  it('leaves an examination that changed nothing undoable while no standing chapter tells it', async () => {
    const examination = await emptyExamination('repeated inspection');
    const examinedAt = (await oracle()).snapshot.state.clock;
    await command({ type: 'AdvanceWorldTime', by: 3_600 });
    await act({ type: 'EnterLocation', locationId: 'old-trade-road' });
    await chapter('DM', examinedAt + 1);
    await chapter('PARTY');
    expect((await command({ type: 'UndoCommand', targetCommandId: examination })).http).toBe(200);
    expect((await oracle()).divergence).toBeNull();
  });
});
