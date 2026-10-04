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

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { BASE, blockersOf, post } from '../testing/gate02-scenarios.ts';
import {
  ELOWEN,
  SEED_SHEET,
  SEREN,
  SHAMAN,
  encounter,
  expectAccepted,
  startAmbush,
} from '../testing/gate03-scenarios.ts';
import { insertHistory, loadHistoryRows } from '../testing/history-rows.ts';
import {
  MIDDLE_ENTROPY,
  TOKENS,
  get,
  ravenfordApp,
  seededEngine,
} from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresEventStore } from './postgres-event-store.ts';

/**
 * Gate 03 retest 2 regressions on PostgreSQL over the HTTP app
 * (reviews/ASTRA_GATE_03_RETEST_2.md): G03-H05 with the genuine rows the
 * retest 1 writer stored, and G03-H06 across a restart.
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

/** Replay, integrity, an open window's legality, and re-decision, from PostgreSQL. */
async function verify(engine: WorldEngine) {
  const state = (await engine.load('ravenford'))?.state;
  const history = (await new PostgresEventStore(pool).loadStream('ravenford'))?.events ?? [];
  if (!state) throw new Error('missing campaign');
  expect(replay(history)).toEqual(state);
  expect(checkWorldIntegrity(state)).toEqual([]);
  expect(reactionWindowViolations(state)).toEqual([]);
  const log = await engine.commandLog('ravenford');
  expect(redecideEffective(log, { state, history }, () => 0, createCombatEngine())).toBeNull();
}

describe('G03-H05 on PostgreSQL: retest1_placement_premise_survives_current_reader', () => {
  it('the current server reads, continues, and safely undoes the retest 1 rows', async () => {
    const history = await loadHistoryRows('88d8137-gate03-retest1');
    const step = (name: string) => history.labels[name] ?? '';
    await insertHistory(pool, history);

    const first = await app(engineOnDatabase(11));
    const view = await get(first, `${BASE}/encounter?perspective=PLAYER`, TOKENS.player);
    expect(view.statusCode).toBe(200);
    await expectAccepted(
      post(first, TOKENS.dm, 'h05-fact', {
        type: 'AddKnowledge',
        scope: { kind: 'PUBLIC' },
        knowledgeType: 'FACT',
        statement: 'The road is quiet again.',
        subjects: ['old-trade-road'],
        knownSince: null,
      }),
    );

    const engine = engineOnDatabase(12);
    const second = await app(engine);
    expect(
      (await get(second, `${BASE}/encounter?perspective=PLAYER`, TOKENS.player)).statusCode,
    ).toBe(200);
    const version = (await engine.load('ravenford'))?.state.version;
    expect(version).toBe(history.stream.version + 1);
    for (const [index, premise] of [step('far-charm'), step('far-magic')].entries()) {
      const refused = await post(second, TOKENS.dm, `h05-undo-${String(index)}`, {
        type: 'UndoCommand',
        targetCommandId: premise,
      });
      expect(refused.status).toBe(422);
      expect(blockersOf(refused.body)).toEqual(
        expect.arrayContaining([step('detect'), step('detect-in-combat')]),
      );
    }
    expect((await engine.load('ravenford'))?.state.version).toBe(version);

    const detect = await expectAccepted(
      post(second, TOKENS.player, 'h05-detect', {
        type: 'CastSpell',
        combatantId: ELOWEN,
        spellId: 'detect-magic',
      }),
    );
    const written = await pool.query<{ schema_version: number }>(
      `SELECT schema_version FROM ltw_events WHERE command_id = $1 AND event_type = 'PremisesRecorded'`,
      [detect],
    );
    expect(written.rows).toEqual([{ schema_version: 3 }]);
    await verify(engine);
  });
});

describe('G03-H06 on PostgreSQL: outsider_healing_does_not_reveal_hidden_reaction_window', () => {
  type Phase = 'no fight' | 'a fight' | 'a fight with an open window';
  const BYSTANDER = 'h06-bystander';
  // Probes on creatures outside the fight first, then on a combatant.
  const PROBES = [
    { spellId: 'healing-word', targetId: BYSTANDER },
    { spellId: 'hunters-mark', targetId: BYSTANDER },
    { spellId: 'healing-word', targetId: ELOWEN },
    { spellId: 'detect-magic' },
    { spellId: 'healing-word', targetId: SHAMAN },
    { spellId: 'hunters-mark', targetId: SHAMAN },
  ];

  /** What Elowen's player receives for each probe, after a restart. */
  async function observe(phase: Phase) {
    const first = await app(
      await seededEngine(new PostgresEventStore(pool), scriptedDice([]), MIDDLE_ENTROPY),
    );
    const dm = (id: string, command: Record<string, unknown>) =>
      expectAccepted(post(first, TOKENS.dm, `h06-${id}`, command));
    await dm('bystander', {
      type: 'CreateEntity',
      entityId: BYSTANDER,
      kind: 'npc',
      name: 'Bystander',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    });
    if (phase === 'no fight') {
      // The same world: Seren on the road with her own player, everyone placed, no fight.
      await dm('seren', {
        type: 'CreateEntity',
        entityId: SEREN,
        kind: 'character',
        name: 'Seren Ashgrove',
        existsSince: null,
        placement: { locationId: 'old-trade-road', since: null },
      });
      await dm('seren-sheet', { type: 'SetCharacterSheet', entityId: SEREN, sheet: SEED_SHEET });
      await dm('seren-player', {
        type: 'AssignCharacter',
        characterId: SEREN,
        playerActorId: 'player-seren',
      });
      for (const place of ambush.place) await dm(`place-${place.entityId}`, place);
    } else {
      await startAmbush(first, 'h06', true, true);
    }
    if (phase === 'a fight with an open window') {
      for (let turn = 0; turn < 8; turn += 1) {
        const current = (await encounter(first))?.currentCombatantId;
        if (current === SHAMAN) break;
        await dm(`end-${String(turn)}`, { type: 'EndTurn', combatantId: current });
      }
      await dm('bolt', {
        type: 'CastSpell',
        combatantId: SHAMAN,
        spellId: 'ashen-bolt',
        targetId: SEREN,
      });
      expect((await encounter(first))?.reactionWindow?.windowId).toBeDefined();
    }

    const engine = engineOnDatabase(21);
    const second = await app(engine);
    const view = await get(second, `${BASE}/encounter?perspective=PLAYER`, TOKENS.player);
    const seen: unknown[] = [{ http: view.statusCode, ...view.json<object>() }];
    for (const [index, probe] of PROBES.entries()) {
      const { status, body } = await post(second, TOKENS.player, `h06-probe-${String(index)}`, {
        type: 'CastSpell',
        combatantId: ELOWEN,
        ...probe,
      });
      const rest = Object.entries(body).filter(([key]) => key !== 'commandId');
      seen.push({ http: status, ...Object.fromEntries(rest) });
    }
    await verify(engine);
    return seen;
  }

  /** Each phase on its own database, as in separate campaigns. */
  async function freshDatabase() {
    await Promise.all(apps.splice(0).map((instance) => instance.close()));
    await pool.end();
    await database.drop();
    database = await createThrowawayDatabase({ migrate: true });
    pool = new pg.Pool({ connectionString: database.url });
  }

  it('the player sees the same results whether or not a window is open', async () => {
    const none = await observe('no fight');
    await freshDatabase();
    const fight = await observe('a fight');
    await freshDatabase();
    const window = await observe('a fight with an open window');

    expect(window).toEqual(fight);
    expect(JSON.stringify(window)).not.toContain('REACTION_PENDING');
    // Outside the fight nothing changes; a combatant cannot be targeted in any phase of it.
    expect(fight.slice(0, 5)).toEqual(none.slice(0, 5));
    expect(none.slice(5)).toMatchObject([
      { http: 200, status: 'accepted' },
      { http: 200, status: 'accepted' },
    ]);
    const outsideTheFight = { http: 422, status: 'rejected', code: 'ILLEGAL_ACTION' };
    expect(fight.slice(5)).toEqual([
      { ...outsideTheFight, message: 'TARGET_IN_COMBAT' },
      { ...outsideTheFight, message: 'TARGET_IN_COMBAT' },
    ]);
  });
});
