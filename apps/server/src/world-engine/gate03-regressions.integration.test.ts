import { createCombatEngine, reactionWindowViolations } from '@ltw/combat';
import {
  SequentialIds,
  SteppingClock,
  WorldEngine,
  checkWorldIntegrity,
  redecideEffective,
  replay,
} from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { blockersOf, post } from '../testing/gate02-scenarios.ts';
import {
  ELOWEN,
  RAIDER_1,
  SEED_SHEET,
  SEREN,
  SHAMAN,
  encounter,
  expectAccepted,
  playerReads,
  shamanCastsAtElowen,
  startAmbush,
} from '../testing/gate03-scenarios.ts';
import { MIDDLE_ENTROPY, TOKENS, ravenfordApp, seededEngine } from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';

/**
 * Gate 03 regressions on PostgreSQL over the HTTP app, before and after a
 * restart with a fresh engine over the same database
 * (reviews/ASTRA_GATE_03_REPORT.md). Every die rolls its middle face.
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

const restarted = () =>
  new WorldEngine({
    store: new PostgresEventStore(pool),
    ids: new SequentialIds(8),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
    entropy: MIDDLE_ENTROPY,
  });
async function app(engine: WorldEngine): Promise<FastifyInstance> {
  const instance = await ravenfordApp(engine);
  apps.push(instance);
  return instance;
}
const live = async () =>
  app(await seededEngine(new PostgresEventStore(pool), scriptedDice([]), MIDDLE_ENTROPY));
const undo = (instance: FastifyInstance, id: string, targetCommandId: string) =>
  post(instance, TOKENS.dm, id, { type: 'UndoCommand', targetCommandId });

/** Replay, integrity, an open window's legality, and re-decision, from PostgreSQL. */
async function verify(engine: WorldEngine) {
  const store = new PostgresEventStore(pool);
  const state = (await engine.load('ravenford'))?.state;
  const history = (await store.loadStream('ravenford'))?.events ?? [];
  if (!state) throw new Error('missing campaign');
  expect(replay(history)).toEqual(state);
  expect(checkWorldIntegrity(state)).toEqual([]);
  expect(reactionWindowViolations(state)).toEqual([]);
  const log = await engine.commandLog('ravenford');
  expect(redecideEffective(log, { state, history }, () => 0, createCombatEngine())).toBeNull();
}

describe('G03-H01 on PostgreSQL', () => {
  it.each([
    ['countered, then the caster dies', 'counter'],
    ['let through, then the caster’s target is incapacitated', 'ignore'],
  ] as const)('%s: reopening is unsafe after a restart; reverse order recovers', async (_, how) => {
    const first = await live();
    await startAmbush(first, 'h01');
    const windowId = await shamanCastsAtElowen(first, 'h01');
    const answer = await expectAccepted(
      post(
        first,
        TOKENS.player,
        'h01-answer',
        how === 'counter'
          ? { type: 'UseReaction', combatantId: ELOWEN, windowId, reaction: 'counterspell' }
          : { type: 'DeclineReaction', combatantId: ELOWEN, windowId },
      ),
    );
    const edit = await expectAccepted(
      post(
        first,
        TOKENS.dm,
        'h01-edit',
        how === 'counter'
          ? { type: 'ChangeEntityStatus', entityId: SHAMAN, status: 'dead' }
          : {
              type: 'SetCharacterSheet',
              entityId: ELOWEN,
              sheet: { ...SEED_SHEET, conditions: ['incapacitated'] },
            },
      ),
    );

    const engine = restarted();
    const second = await app(engine);
    const version = (await engine.load('ravenford'))?.state.version;
    const refused = await undo(second, 'h01-undo-answer', answer);
    expect(refused.status).toBe(422);
    expect(blockersOf(refused.body)).toEqual([edit]);
    expect((await engine.load('ravenford'))?.state.version).toBe(version);

    await expectAccepted(undo(second, 'h01-undo-edit', edit));
    await expectAccepted(undo(second, 'h01-undo-answer-2', answer));
    expect((await encounter(second))?.reactionWindow?.windowId).toBe(windowId);
    await expectAccepted(
      post(second, TOKENS.dm, 'h01-close', { type: 'CloseReactionWindow', windowId }),
    );
    await verify(engine);
  });
});

describe('G03-H02 on PostgreSQL', () => {
  it('a missed attack blocks undoing the target’s Armor Class after a restart', async () => {
    const first = await live();
    await startAmbush(first, 'h02', true);
    const edit = await expectAccepted(
      post(first, TOKENS.dm, 'h02-ac', {
        type: 'SetCharacterSheet',
        entityId: SEREN,
        sheet: { ...SEED_SHEET, armorClass: 30 },
      }),
    );
    const attack = await post(first, TOKENS.player, 'h02-attack', {
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: SEREN,
    });
    expect(attack.body).toMatchObject({ status: 'accepted', outcome: { hit: false } });

    const engine = restarted();
    const second = await app(engine);
    const refused = await undo(second, 'h02-undo-ac', edit);
    expect(blockersOf(refused.body)).toEqual([attack.body.commandId]);
    await expectAccepted(undo(second, 'h02-undo-attack', attack.body.commandId ?? ''));
    await expectAccepted(undo(second, 'h02-undo-ac-2', edit));
    await verify(engine);
  });
});

describe('G03-H03 over HTTP on PostgreSQL', () => {
  it.each([
    ['cast at once', false],
    ['suspended, then closed by the DM', true],
  ] as const)('%s: only the clue within 30 ft reaches the player', async (_, suspended) => {
    const first = await live();
    await startAmbush(first, 'h03', suspended);
    for (const [entityId, statement] of [
      [RAIDER_1, 'G03_NEAR_MAGIC'], // 30 ft from Elowen
      [SHAMAN, 'G03_FAR_MAGIC'], // 50 ft
    ]) {
      await expectAccepted(
        post(first, TOKENS.dm, `h03-clue-${entityId}`, {
          type: 'AddClue',
          entityId,
          method: 'magic',
          statement,
          subjects: [],
        }),
      );
    }
    await expectAccepted(
      post(first, TOKENS.player, 'h03-detect', {
        type: 'CastSpell',
        combatantId: ELOWEN,
        spellId: 'detect-magic',
      }),
    );
    if (suspended) {
      const windowId = (await encounter(first))?.reactionWindow?.windowId;
      await expectAccepted(
        post(first, TOKENS.dm, 'h03-close', { type: 'CloseReactionWindow', windowId }),
      );
    }
    const engine = restarted();
    const reads = await playerReads(await app(engine));
    expect(reads).toContain('G03_NEAR_MAGIC');
    expect(reads).not.toContain('G03_FAR_MAGIC');
    await verify(engine);
  });
});
