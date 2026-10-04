import { createCombatEngine, reactionWindowViolations } from '@ltw/combat';
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

import { BASE, blockersOf, post } from '../testing/gate02-scenarios.ts';
import { insertHistory, loadHistoryRows } from '../testing/history-rows.ts';
import { MIDDLE_ENTROPY, TOKENS, get, ravenfordApp } from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';

/**
 * Gate 03 retest 3 regression on PostgreSQL over the HTTP app
 * (reviews/ASTRA_GATE_03_RETEST_3.md, G03-H07): the rows revision 88d8137
 * stored for Elowen's spells outside an unrelated fight. Undo beneath them
 * is refused, across a restart, until they come off from the end backwards.
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

/** Replay, integrity, re-decision, and no undo beneath an earlier writer, from PostgreSQL. */
async function verify(engine: WorldEngine) {
  const state = (await engine.load('ravenford'))?.state;
  const history = (await new PostgresEventStore(pool).loadStream('ravenford'))?.events ?? [];
  if (!state) throw new Error('missing campaign');
  expect(replay(history)).toEqual(state);
  expect(checkWorldIntegrity(state)).toEqual([]);
  expect(reactionWindowViolations(state)).toEqual([]);
  expect(undoneBeneathEarlierWriters(state, history)).toEqual([]);
  const log = await engine.commandLog('ravenford');
  expect(redecideEffective(log, { state, history }, () => 0, createCombatEngine())).toBeNull();
}

describe('G03-H07 on PostgreSQL: current_undo_preserves_old_spell_legality_premises', () => {
  it.each([
    ['revival', 'mark-revived'],
    ['target-placement', 'mark-placed'],
    ['caster-placement', 'mark-innkeeper'],
    ['patient-revival', 'heal-patient'],
  ])(
    'undo of %s beneath %s is refused after a restart; reverse order recovers',
    async (premise, cast) => {
      const history = await loadHistoryRows('88d8137-outside-casts');
      const step = (name: string) => history.labels[name] ?? '';
      await insertHistory(pool, history);
      const first = await app(engineOnDatabase(31));
      const refused = await post(first, TOKENS.dm, 'h07-undo-1', {
        type: 'UndoCommand',
        targetCommandId: step(premise),
      });
      expect(refused.status).toBe(422);
      expect(blockersOf(refused.body)).toContain(step(cast));

      const engine = engineOnDatabase(32);
      const second = await app(engine);
      expect(
        (await get(second, `${BASE}/encounter?perspective=PLAYER`, TOKENS.player)).statusCode,
      ).toBe(200);
      expect((await engine.load('ravenford'))?.state.version).toBe(history.stream.version);
      const again = await post(second, TOKENS.dm, 'h07-undo-2', {
        type: 'UndoCommand',
        targetCommandId: step(premise),
      });
      expect(again.status).toBe(422);
      await verify(engine);

      // Explicit reverse order: every later command, newest first, then the premise.
      const state = (await engine.load('ravenford'))?.state;
      const target = state?.commands.get(step(premise));
      const later = [...(state?.commands.values() ?? [])]
        .filter((c) => target && c.firstSequence > target.lastSequence && c.undoneBy === null)
        .filter((c) => c.commandType !== 'UndoCommand')
        .sort((a, b) => b.firstSequence - a.firstSequence);
      for (const [index, command] of later.entries()) {
        const undone = await post(second, TOKENS.dm, `h07-reverse-${String(index)}`, {
          type: 'UndoCommand',
          targetCommandId: command.commandId,
        });
        expect(undone.status, command.commandId).toBe(200);
      }
      const last = await post(second, TOKENS.dm, 'h07-undo-3', {
        type: 'UndoCommand',
        targetCommandId: step(premise),
      });
      expect(last.status).toBe(200);
      await verify(engine);
    },
  );
});
