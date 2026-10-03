import { createCombatEngine } from '@ltw/combat';
import {
  SequentialIds,
  SteppingClock,
  WorldEngine,
  checkWorldIntegrity,
  openReactionWindow,
  redecideEffective,
  replay,
  type Actor,
  type WorldState,
} from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { MIDDLE_ENTROPY, seededEngine } from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';

/**
 * Deterministic combat on PostgreSQL (docs/adr/0015-combat-engine.md; the
 * Stage 80 gate). The entropy pool drawn at resolution is stored with each
 * command: a restarted engine with no randomness at all replays the fight,
 * retries never roll again, every command re-decides identically, and undo
 * unwinds the fight in reverse order.
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

const CAMPAIGN = 'ravenford';
const DM: Actor = { actorId: 'dm-ravenford', kind: 'user' };
const PLAYER: Actor = { actorId: 'player-elowen', kind: 'user' };
const ELOWEN = 'elowen-starwhisper';
const SHAMAN = 'goblin-shaman';

const submission = (commandId: string, actor: Actor, command: Record<string, unknown>) => ({
  commandId,
  campaignId: CAMPAIGN,
  actor,
  command,
});

/**
 * Every die rolls its middle face. Round 1: Fireball (32) kills the Raiders; the
 * Shaman saves (5 HP left), and its Ashen Bolt waits for Elowen's Counterspell
 * window (ADR 0016); she ignores it and it misses. Round 2: the marked Shaman
 * falls to Elowen's longbow.
 */
type Body = Record<string, unknown> | ((state: WorldState) => Record<string, unknown>);
type Step = readonly [string, Actor, Body];
const resolve = async (engine: WorldEngine, body: Body) => {
  if (typeof body !== 'function') return body;
  const state = (await engine.load(CAMPAIGN))?.state;
  if (!state) throw new Error('missing campaign');
  return body(state);
};
const ignoreWindow = (state: WorldState) => ({
  type: 'DeclineReaction',
  combatantId: ELOWEN,
  windowId: openReactionWindow(state)?.windowId,
});
const cast = (combatantId: string, spellId: string, target: Record<string, unknown>) => ({
  type: 'CastSpell',
  combatantId,
  spellId,
  ...target,
});
const FIGHT: readonly Step[] = [
  ...ambush.place.map((step, index): Step => [`place-${String(index)}`, DM, step]),
  ['start', DM, ambush.startCombat],
  ['fireball', PLAYER, cast(ELOWEN, 'fireball', { point: { x: 10, y: 6 } })],
  ['mark', PLAYER, cast(ELOWEN, 'hunters-mark', { targetId: SHAMAN })],
  ['end-turn', PLAYER, { type: 'EndTurn', combatantId: ELOWEN }],
  ['bolt', DM, cast(SHAMAN, 'ashen-bolt', { targetId: ELOWEN })],
  ['bolt-ignored', PLAYER, ignoreWindow],
  ['shaman-ends', DM, { type: 'EndTurn', combatantId: SHAMAN }],
  ['shot', PLAYER, { type: 'Attack', combatantId: ELOWEN, attackId: 'longbow', targetId: SHAMAN }],
];

async function verify(engine: WorldEngine, store: PostgresEventStore) {
  const state = (await engine.load(CAMPAIGN))?.state;
  const history = (await store.loadStream(CAMPAIGN))?.events ?? [];
  expect(state).toBeDefined();
  expect(replay(history)).toEqual(state);
  if (state) expect(checkWorldIntegrity(state)).toEqual([]);
  if (state) {
    const log = await engine.commandLog(CAMPAIGN);
    expect(redecideEffective(log, { state, history }, () => 0, createCombatEngine())).toBeNull();
  }
  return state;
}

describe('combat on PostgreSQL', () => {
  it('replays after a restart without randomness, and re-decides identically', async () => {
    const engine = await seededEngine(
      new PostgresEventStore(pool),
      scriptedDice([]),
      MIDDLE_ENTROPY,
    );
    for (const [id, actor, body] of FIGHT) {
      const command = await resolve(engine, body);
      expect((await engine.execute(submission(id, actor, command))).status, id).toBe('accepted');
    }
    const fought = await verify(engine, new PostgresEventStore(pool));
    for (const id of ['goblin-raider-1', 'goblin-raider-2', 'goblin-raider-3', 'goblin-shaman']) {
      expect(fought?.entities.get(id)?.status, id).toBe('dead');
    }
    expect(fought?.encounter).toMatchObject({ round: 2, currentIndex: 0 });

    // No entropy source at all: a restart must replay, and a retry must not draw.
    const restarted = new WorldEngine({
      store: new PostgresEventStore(pool),
      ids: new SequentialIds(),
      clock: new SteppingClock(),
      combat: createCombatEngine(),
    });
    expect((await restarted.load(CAMPAIGN))?.state).toEqual(fought);
    const [, , shot] = FIGHT.find(([id]) => id === 'shot') ?? [];
    if (!shot) throw new Error('missing shot');
    const retry = await restarted.execute(
      submission('shot', PLAYER, await resolve(restarted, shot)),
    );
    expect(retry).toMatchObject({ status: 'duplicate', outcome: { kind: 'Attack', hit: true } });
  });

  it('undoes the fight in reverse order back to the ambush setup', async () => {
    const store = new PostgresEventStore(pool);
    const engine = await seededEngine(store, scriptedDice([]), MIDDLE_ENTROPY);
    for (const [id, actor, body] of FIGHT) {
      await engine.execute(submission(id, actor, await resolve(engine, body)));
    }
    const undo = (target: string) =>
      engine.execute(
        submission(`undo-${target}`, DM, { type: 'UndoCommand', targetCommandId: target }),
      );
    expect(await undo('mark')).toMatchObject({ status: 'rejected', code: 'UNDO_UNSAFE' });
    for (const target of [
      'shot',
      'shaman-ends',
      'bolt-ignored',
      'bolt',
      'end-turn',
      'mark',
      'fireball',
      'start',
    ]) {
      expect((await undo(target)).status, target).toBe('accepted');
    }
    const state = await verify(engine, store);
    expect(state?.encounter).toBeNull();
    expect(state?.statBlocks.get('goblin-shaman')?.hitPoints.current).toBe(21);
    expect(state?.characterSheets.get(ELOWEN)?.spellSlots.expended[2]).toBe(0);
  });
});
