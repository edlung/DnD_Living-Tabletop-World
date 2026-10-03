import { SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ELOWEN,
  H01_VIEWS,
  assignAndAct,
  authorHiddenParent,
  blockersOf,
  discloseAndEnter,
  emptyInspectionChain,
  post,
  recallAt,
} from '../testing/gate02-scenarios.ts';
import { TOKENS, ravenfordApp, seededEngine } from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';

/**
 * Gate 02 regressions on PostgreSQL, before and after a restart with a fresh
 * engine over the same database (reviews/ASTRA_GATE_02_REPORT.md).
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

async function app(engine: WorldEngine): Promise<FastifyInstance> {
  const instance = await ravenfordApp(engine);
  apps.push(instance);
  return instance;
}
const restarted = () =>
  new WorldEngine({
    store: new PostgresEventStore(pool),
    ids: new SequentialIds(8),
    clock: new SteppingClock(),
  });

describe('G02-H01 on PostgreSQL', () => {
  it('hidden and nonexistent locations answer identically, before and after reload', async () => {
    const live = await app(await seededEngine(new PostgresEventStore(pool)));
    await authorHiddenParent(live);
    const reloaded = await app(restarted());
    for (const instance of [live, reloaded]) {
      for (const [perspective, token] of H01_VIEWS) {
        const hidden = await recallAt(instance, perspective, token, 'hidden-vault');
        expect(hidden, perspective).toEqual(
          await recallAt(instance, perspective, token, 'missing-vault'),
        );
        expect(hidden.body, perspective).toMatchObject({ total: 0 });
      }
      expect(await recallAt(instance, 'DM', TOKENS.dm, 'hidden-vault')).toMatchObject({
        body: { total: 1 },
      });
    }
  });
});

describe('G02-H02 on PostgreSQL', () => {
  it.each(['knowledge', 'memory'] as const)(
    '%s variant stays blocked after reload; reverse order works',
    async (kind) => {
      const engine = await seededEngine(new PostgresEventStore(pool));
      const live = await app(engine);
      const { disclosureId, moveId } = await discloseAndEnter(live, kind, `pg-${kind}`);

      const fresh = restarted();
      const reloaded = await app(fresh);
      const before = (await fresh.load('ravenford'))?.state;
      const undone = await post(reloaded, TOKENS.dm, `pg-${kind}-undo`, {
        type: 'UndoCommand',
        targetCommandId: disclosureId,
      });
      expect(undone.body).toMatchObject({ status: 'rejected', code: 'UNDO_UNSAFE' });
      const blockers =
        undone.body.status === 'rejected'
          ? (undone.body.details?.['blockers'] as { commandId: string }[])
          : [];
      expect(blockers.map((b) => b.commandId)).toEqual([moveId]);
      expect((await fresh.load('ravenford'))?.state).toEqual(before);

      expect(
        (
          await post(reloaded, TOKENS.dm, `pg-${kind}-undo-move`, {
            type: 'UndoCommand',
            targetCommandId: moveId,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await post(reloaded, TOKENS.dm, `pg-${kind}-undo-reveal`, {
            type: 'UndoCommand',
            targetCommandId: disclosureId,
          })
        ).status,
      ).toBe(200);
      const after = await restarted().load('ravenford');
      expect(after?.state.entities.get(ELOWEN)?.placement?.locationId).toBe('market-square');
    },
  );
});

describe('G02-H03 on PostgreSQL', () => {
  it.each(['move', 'hypothesis'] as const)(
    '%s: blocked after reload; reverse order works',
    async (action) => {
      const live = await app(await seededEngine(new PostgresEventStore(pool)));
      const { assignmentId, actionId } = await assignAndAct(live, action, `pg-h03-${action}`);
      const fresh = restarted();
      const reloaded = await app(fresh);
      const before = (await fresh.load('ravenford'))?.state;
      const undone = await post(reloaded, TOKENS.dm, `pg-h03-${action}-undo`, {
        type: 'UndoCommand',
        targetCommandId: assignmentId,
      });
      expect(blockersOf(undone.body)).toEqual([actionId]);
      expect((await fresh.load('ravenford'))?.state).toEqual(before);
      expect(
        (
          await post(reloaded, TOKENS.dm, `pg-h03-${action}-undo-act`, {
            type: 'UndoCommand',
            targetCommandId: actionId,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await post(reloaded, TOKENS.dm, `pg-h03-${action}-undo-assign`, {
            type: 'UndoCommand',
            targetCommandId: assignmentId,
          })
        ).status,
      ).toBe(200);
      expect((await restarted().load('ravenford'))?.state.roster.has('guest-character')).toBe(
        false,
      );
    },
  );
});

describe('G02-M01 on PostgreSQL', () => {
  it('unwinds the chain after reload, and the empty compensation reloads', async () => {
    const live = await app(await seededEngine(new PostgresEventStore(pool)));
    const { revealId, moveId, inspectId } = await emptyInspectionChain(live, 'pg-m01');
    const reloaded = await app(restarted());
    const undo = (key: string, target: string) =>
      post(reloaded, TOKENS.dm, key, { type: 'UndoCommand', targetCommandId: target });
    expect(blockersOf((await undo('pg-m01-u1', revealId)).body)).toEqual([moveId]);
    expect(blockersOf((await undo('pg-m01-u2', moveId)).body)).toEqual([inspectId]);
    for (const [key, target] of [
      ['pg-m01-u3', inspectId],
      ['pg-m01-u4', moveId],
      ['pg-m01-u5', revealId],
    ] as const) {
      expect((await undo(key, target)).status, key).toBe(200);
    }
    const after = await restarted().load('ravenford');
    expect(after?.state.entities.get(ELOWEN)?.placement?.locationId).toBe('market-square');
    expect(after?.state.knowledge.has('empty-route')).toBe(false);
  });
});
