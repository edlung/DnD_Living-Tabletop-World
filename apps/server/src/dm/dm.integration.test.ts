import type { AuthoringProposalResponse, CommandResult, DmHistoryResponse } from '@ltw/contracts';
import { SequentialIds, SteppingClock } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PostgresProposalStore } from '../authoring/postgres-proposal-store.ts';
import { PostgresSavedEncounterStore } from '../combat/postgres-saved-encounter-store.ts';
import {
  TOKENS,
  get,
  post,
  ravenfordApp,
  testAiGateway,
  testAssets,
} from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { createWorldEngine } from '../world-engine/runtime.ts';
import { PostgresDmNoteStore } from './postgres-note-store.ts';
import { PostgresSubstitutionStore } from './postgres-substitution-store.ts';
import type { SubstitutionRecord } from './substitution-store.ts';

/**
 * The DM's reasons on PostgreSQL (migration 0009, docs/adr/0033-live-session.md §6): append-only,
 * one per command ID within a campaign however records race, and the DM history read from the
 * database lists the same after a restart (§7).
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

const record = (changes: Partial<SubstitutionRecord> = {}): SubstitutionRecord => ({
  campaignId: 'ravenford',
  commandId: 'http:dm-ravenford:skip-1',
  characterId: 'elowen-starwhisper',
  reason: 'absent',
  note: null,
  createdAt: '2026-10-15T20:00:00.000Z',
  ...changes,
});

describe('the substitutions table', () => {
  it('records once, answers repeats against the stored row, and keeps campaigns apart', async () => {
    const store = new PostgresSubstitutionStore(pool);
    expect(await store.record(record({ note: 'Back soon' }))).toBe('recorded');
    expect(
      await store.record(record({ note: 'Back soon', createdAt: '2026-10-16T00:00:00Z' })),
    ).toBe('duplicate');
    expect(await store.record(record({ note: 'Gone home' }))).toBe('conflict');
    expect(await store.record(record({ campaignId: 'elsewhere', reason: 'other' }))).toBe(
      'recorded',
    );
    expect(await store.find('ravenford', 'http:dm-ravenford:skip-1')).toEqual(
      record({ note: 'Back soon' }),
    );
    const found = await store.forCommands('ravenford', [
      'http:dm-ravenford:skip-1',
      'http:dm-ravenford:none',
    ]);
    expect([...found.keys()]).toEqual(['http:dm-ravenford:skip-1']);
    expect(await store.forCommands('ravenford', [])).toEqual(new Map());
  });

  it('settles racing records of one command on a single row', async () => {
    const stores = [new PostgresSubstitutionStore(pool), new PostgresSubstitutionStore(pool)];
    const same = await Promise.all(stores.map((store) => store.record(record())));
    expect(same.sort()).toEqual(['duplicate', 'recorded']);
    const different = await Promise.all([
      stores[0]?.record(record({ commandId: 'http:dm-ravenford:skip-2' })),
      stores[1]?.record(record({ commandId: 'http:dm-ravenford:skip-2', reason: 'asked' })),
    ]);
    expect(different.sort()).toEqual(['conflict', 'recorded']);
    const { rows } = await pool.query<{ n: string }>(
      'SELECT count(*) AS n FROM ltw_dm_substitutions',
    );
    expect(Number(rows[0]?.n)).toBe(2);
  });

  it('refuses updates, deletes, truncation and malformed rows', async () => {
    const store = new PostgresSubstitutionStore(pool);
    await store.record(record());
    for (const statement of [
      `UPDATE ltw_dm_substitutions SET reason = 'other'`,
      'DELETE FROM ltw_dm_substitutions',
      'TRUNCATE ltw_dm_substitutions',
    ]) {
      await expect(pool.query(statement), statement).rejects.toThrow(/append-only/);
    }
    for (const bad of [
      record({ commandId: 'http:dm-ravenford:long', note: 'n'.repeat(201) }),
      record({ commandId: 'http:dm-ravenford:empty', note: '' }),
      record({ commandId: 'http:dm-ravenford:why', reason: 'bored' as never }),
      record({ commandId: 'has space' }),
    ]) {
      await expect(store.record(bad)).rejects.toThrow();
    }
  });
});

describe('the DM history on PostgreSQL', () => {
  /** A server process: its own World Engine and stores over the shared database. */
  async function server(namespace: number): Promise<FastifyInstance> {
    const clock = new SteppingClock();
    const app = await ravenfordApp(
      createWorldEngine(pool),
      testAiGateway(),
      { proposals: new PostgresProposalStore(pool), ids: new SequentialIds(namespace), clock },
      testAssets().contents,
      {
        substitutions: new PostgresSubstitutionStore(pool),
        notes: new PostgresDmNoteStore(pool),
        encounters: new PostgresSavedEncounterStore(pool),
        clock,
      },
    );
    apps.push(app);
    return app;
  }

  async function seed(): Promise<void> {
    const seeding = createWorldEngine(pool);
    for (const submission of (await loadRavenfordSeed()).submissions) {
      const result = await seeding.execute(submission);
      if (result.status === 'rejected') throw new Error(`seed rejected: ${result.code}`);
    }
  }

  it('lists the same commits, substitutions and reasons after a restart', async () => {
    await seed();
    const first = await server(0xd1);
    const drafted = await post(
      first,
      '/campaigns/ravenford/authoring/proposals',
      {
        summary: 'Tomas Reed guards North Gate.',
        commands: [
          {
            type: 'CreateEntity',
            entityId: 'tomas-reed',
            kind: 'npc',
            name: 'Tomas Reed',
            existsSince: null,
            placement: { locationId: 'north-gate', since: null },
          },
        ],
      },
      TOKENS.dm,
    );
    const { proposal, preview } = drafted.json<AuthoringProposalResponse>();
    const committed = await post(
      first,
      `/campaigns/ravenford/authoring/proposals/${proposal.proposalId}/commit`,
      { revision: proposal.revision, confirmation: preview?.confirmation },
      TOKENS.dm,
    );
    expect(committed.json<CommandResult>().status).toBe('accepted');
    const reason = {
      clientCommandId: 'walk',
      characterId: 'elowen-starwhisper',
      reason: 'asked',
      note: 'Take her to the gate',
    };
    expect(
      (await post(first, '/campaigns/ravenford/dm/substitutions', reason, TOKENS.dm)).statusCode,
    ).toBe(201);
    const walked = await post(
      first,
      '/campaigns/ravenford/commands',
      {
        commandId: 'walk',
        command: {
          type: 'EnterLocation',
          characterId: 'elowen-starwhisper',
          locationId: 'north-gate',
        },
      },
      TOKENS.dm,
    );
    expect(walked.json<CommandResult>().status).toBe('accepted');
    const url = '/campaigns/ravenford/dm/history?perspective=DM';
    const before = (await get(first, url, TOKENS.dm)).json<DmHistoryResponse>();
    expect(before.entries).toMatchObject([
      {
        kind: 'substitution',
        commandId: 'http:dm-ravenford:walk',
        reason: { reason: 'asked', note: 'Take her to the gate' },
        status: 'COMMITTED',
        undo: { possible: true },
      },
      { kind: 'authoring', summary: 'Tomas Reed guards North Gate.', status: 'COMMITTED' },
    ]);
    await first.close();
    apps.splice(apps.indexOf(first), 1);

    const restarted = await server(0xd2);
    expect((await get(restarted, url, TOKENS.dm)).json()).toEqual(before);
    // Undo after the restart goes through the existing routes and shows as undone.
    const undone = await post(
      restarted,
      '/campaigns/ravenford/commands',
      {
        commandId: 'undo-walk',
        command: { type: 'UndoCommand', targetCommandId: 'http:dm-ravenford:walk' },
      },
      TOKENS.dm,
    );
    expect(undone.json<CommandResult>().status).toBe('accepted');
    const after = (await get(restarted, url, TOKENS.dm)).json<DmHistoryResponse>();
    expect(after.entries[0]).toMatchObject({ status: 'UNDONE', undo: null });
  });

  it('lists the DM’s day change after a restart, and its undo returns the clock', async () => {
    await seed();
    const first = await server(0xd3);
    const advance = { type: 'AdvanceWorldTime', to: 122_400 };
    const advanced = await post(
      first,
      '/campaigns/ravenford/commands',
      { commandId: 'day-two', command: advance },
      TOKENS.dm,
    );
    expect(advanced.json<CommandResult>().status).toBe('accepted');
    const url = '/campaigns/ravenford/dm/history?perspective=DM';
    const before = (await get(first, url, TOKENS.dm)).json<DmHistoryResponse>();
    expect(before.entries).toMatchObject([
      {
        kind: 'world',
        commandId: 'http:dm-ravenford:day-two',
        change: { kind: 'time', from: 36_000, to: 122_400 },
        status: 'COMMITTED',
        undo: { possible: true },
      },
    ]);
    await first.close();
    apps.splice(apps.indexOf(first), 1);

    const restarted = await server(0xd4);
    expect((await get(restarted, url, TOKENS.dm)).json()).toEqual(before);
    const undone = await post(
      restarted,
      '/campaigns/ravenford/commands',
      {
        commandId: 'undo-day-two',
        command: { type: 'UndoCommand', targetCommandId: 'http:dm-ravenford:day-two' },
      },
      TOKENS.dm,
    );
    expect(undone.json<CommandResult>().status).toBe('accepted');
    const after = (await get(restarted, url, TOKENS.dm)).json<DmHistoryResponse>();
    expect(after.entries[0]).toMatchObject({ status: 'UNDONE', undo: null });
    const scene = await get(
      restarted,
      '/campaigns/ravenford/locations/market-square/scene?perspective=DM',
      TOKENS.dm,
    );
    expect(scene.json<{ worldTime: number }>().worldTime).toBe(36_000);
  });
});
