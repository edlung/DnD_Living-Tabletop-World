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
  type AppendBatch,
  type EventStore,
} from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { MIDDLE_ENTROPY, seededEngine } from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';

/**
 * Reaction windows on PostgreSQL (docs/adr/0016-reaction-engine.md; the
 * Stage 90 gate). Every die rolls its middle face: the order is Elowen, the
 * Raiders, the Shaman, and Counterspell counters (11 + 1 against DC 16).
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
const submission = (commandId: string, actor: Actor, command: Record<string, unknown>) => ({
  commandId,
  campaignId: CAMPAIGN,
  actor,
  command,
});

/** Starts the ambush and lets the Shaman cast at Elowen: the window, and the cast's command ID. */
async function windowOpen(engine: WorldEngine): Promise<{ windowId: string; trigger: string }> {
  const steps: Record<string, unknown>[] = [
    ...ambush.place,
    ambush.startCombat,
    ...[ELOWEN, 'goblin-raider-1', 'goblin-raider-2', 'goblin-raider-3'].map((combatantId) => ({
      type: 'EndTurn',
      combatantId,
    })),
    { type: 'CastSpell', combatantId: 'goblin-shaman', spellId: 'ashen-bolt', targetId: ELOWEN },
  ];
  for (const [index, command] of steps.entries()) {
    const result = await engine.execute(submission(`setup-${String(index)}`, DM, command));
    expect(result.status, `setup ${String(index)}`).toBe('accepted');
  }
  const window = openReactionWindow((await engine.load(CAMPAIGN))?.state ?? replay([]));
  if (!window) throw new Error('no window opened');
  return { windowId: window.windowId, trigger: `setup-${String(steps.length - 1)}` };
}

async function verify(engine: WorldEngine, store: EventStore) {
  const state = (await engine.load(CAMPAIGN))?.state;
  const history = (await store.loadStream(CAMPAIGN))?.events ?? [];
  if (!state) throw new Error('missing campaign');
  expect(replay(history)).toEqual(state);
  expect(checkWorldIntegrity(state)).toEqual([]);
  const log = await engine.commandLog(CAMPAIGN);
  expect(redecideEffective(log, { state, history }, () => 0, createCombatEngine())).toBeNull();
  return state;
}

/** Another process commits right before this store's next append (ADR 0006 §7). */
class RacingStore extends PostgresEventStore {
  #before: (() => Promise<unknown>) | null = null;
  conflicts = 0;
  interleave(step: () => Promise<unknown>) {
    this.#before = step;
  }
  override async append(batch: AppendBatch): Promise<void> {
    const step = this.#before;
    this.#before = null;
    if (step) await step();
    try {
      await super.append(batch);
    } catch (error) {
      this.conflicts += 1;
      throw error;
    }
  }
}

const restarted = (store: EventStore) =>
  new WorldEngine({
    store,
    ids: new SequentialIds(9),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
    backoff: () => Promise.resolve(),
  });

describe('reaction windows on PostgreSQL', () => {
  it('survive a restart open, close once, and replay without randomness', async () => {
    const store = new PostgresEventStore(pool);
    const engine = await seededEngine(store, scriptedDice([]), MIDDLE_ENTROPY);
    const { windowId } = await windowOpen(engine);
    // A restarted process without randomness still sees the window open.
    expect(
      openReactionWindow((await restarted(store).load(CAMPAIGN))?.state ?? replay([]))?.windowId,
    ).toBe(windowId);
    const counter = submission('counter', PLAYER, {
      type: 'UseReaction',
      combatantId: ELOWEN,
      windowId,
      reaction: 'counterspell',
    });
    const used = await engine.execute(counter);
    expect(used).toMatchObject({ status: 'accepted', outcome: { countered: true } });
    const retry = await restarted(store).execute(counter);
    expect(retry).toMatchObject({ status: 'duplicate', outcome: { countered: true } });
    const state = await verify(restarted(store), store);
    expect(state.reactionWindows.get(windowId)?.status).toBe('countered');
    expect(state.characterSheets.get(ELOWEN)?.spellSlots.expended[2]).toBe(1);
  });

  it('store the DM’s close with its recorded dice, so a restart replays and re-decides it', async () => {
    const store = new PostgresEventStore(pool);
    const engine = await seededEngine(store, scriptedDice([]), MIDDLE_ENTROPY);
    const { windowId } = await windowOpen(engine);
    const closed = await engine.execute(
      submission('close', DM, { type: 'CloseReactionWindow', windowId }),
    );
    expect(closed.status).toBe('accepted');
    const log = await restarted(store).commandLog(CAMPAIGN);
    const stored = log.find((command) => command.commandId === 'close')?.command;
    expect(stored?.type === 'CloseReactionWindow' && stored.resolution.entropy).toHaveLength(64);
    const state = await verify(restarted(store), store);
    expect(state.reactionWindows.get(windowId)).toMatchObject({
      status: 'proceeded',
      candidates: [{ entityId: ELOWEN, response: 'expired' }],
      closedBy: 'close',
    });
  });

  it('serialize an answer and a close from two processes: the second finds the window closed', async () => {
    const store = new PostgresEventStore(pool);
    const engine = await seededEngine(store, scriptedDice([]), MIDDLE_ENTROPY);
    const { windowId } = await windowOpen(engine);
    const racing = new RacingStore(pool);
    const rival = new WorldEngine({
      store: racing,
      ids: new SequentialIds(7),
      clock: new SteppingClock(),
      combat: createCombatEngine(),
      entropy: MIDDLE_ENTROPY,
      backoff: () => Promise.resolve(),
    });
    await rival.load(CAMPAIGN);
    racing.interleave(() =>
      engine.execute(
        submission('answer', PLAYER, {
          type: 'DeclineReaction',
          combatantId: ELOWEN,
          windowId,
        }),
      ),
    );
    const close = await rival.execute(
      submission('close', DM, { type: 'CloseReactionWindow', windowId }),
    );
    expect(racing.conflicts).toBe(1);
    expect(close).toMatchObject({ status: 'rejected', code: 'REACTION_WINDOW_CLOSED' });
    const state = await verify(engine, store);
    expect(state.reactionWindows.get(windowId)).toMatchObject({
      status: 'proceeded',
      candidates: [{ entityId: ELOWEN, response: 'declined' }],
    });
    const bolts = ((await store.loadStream(CAMPAIGN))?.events ?? []).filter(
      (e) => e.type === 'SpellCast' && e.payload.spellId === 'ashen-bolt',
    );
    expect(bolts).toHaveLength(1);
  });

  it('undo with an open window: rejected when unsafe, reverse order restores it exactly', async () => {
    const store = new PostgresEventStore(pool);
    const engine = await seededEngine(store, scriptedDice([]), MIDDLE_ENTROPY);
    const { windowId, trigger } = await windowOpen(engine);
    const opened = (await engine.load(CAMPAIGN))?.state;
    const undo = (target: string) =>
      engine.execute(
        submission(`undo-${target}`, DM, { type: 'UndoCommand', targetCommandId: target }),
      );
    const used = await engine.execute(
      submission('counter', PLAYER, {
        type: 'UseReaction',
        combatantId: ELOWEN,
        windowId,
        reaction: 'counterspell',
      }),
    );
    expect(used.status).toBe('accepted');
    expect(await undo(trigger)).toMatchObject({ status: 'rejected', code: 'UNDO_UNSAFE' });
    expect((await undo('counter')).status).toBe('accepted');
    const reopened = await verify(engine, store);
    expect(reopened.reactionWindows.get(windowId)).toEqual(opened?.reactionWindows.get(windowId));
    expect(reopened.characterSheets.get(ELOWEN)).toEqual(opened?.characterSheets.get(ELOWEN));
    expect((await undo(trigger)).status).toBe('accepted');
    const state = await verify(engine, store);
    expect(state.reactionWindows.size).toBe(0);
  });
});
