import type { AuthoringProposalResponse, CommandResult } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SequentialIds, SteppingClock } from '@ltw/domain';

import { TOKENS, get, post, ravenfordApp, testAiGateway } from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { createWorldEngine } from '../world-engine/runtime.ts';
import { PostgresProposalStore } from './postgres-proposal-store.ts';
import { ProposalConflictError, type ProposalRevision } from './proposal-store.ts';

/**
 * Authoring on PostgreSQL (migration 0003, docs/adr/0018-ai-authoring.md):
 * revisions are append-only and per campaign; a commit is one command in the
 * event store or nothing; a restarted server sees the same proposal status;
 * two processes racing to create the same NPC end with exactly one.
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

const PROPOSALS = '/campaigns/ravenford/authoring/proposals';
const tomas = {
  type: 'CreateEntity',
  entityId: 'tomas-reed',
  kind: 'npc',
  name: 'Tomas Reed',
  existsSince: null,
  placement: { locationId: 'north-gate', since: null },
};

const count = async (table: string) =>
  Number((await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n);

async function seeded() {
  const engine = createWorldEngine(pool);
  for (const submission of (await loadRavenfordSeed()).submissions) {
    const result = await engine.execute(submission);
    if (result.status === 'rejected') throw new Error(`seed rejected: ${result.code}`);
  }
  return engine;
}

/** A server process: its own World Engine over the shared database, PostgreSQL proposals. */
async function server(namespace: number) {
  const clock = new SteppingClock();
  const app = await ravenfordApp(createWorldEngine(pool), testAiGateway(), {
    proposals: new PostgresProposalStore(pool),
    ids: new SequentialIds(namespace),
    clock: { now: () => clock.now() },
  });
  apps.push(app);
  return app;
}

const revision = (changes: Partial<ProposalRevision> = {}): ProposalRevision => ({
  campaignId: 'ravenford',
  proposalId: '00000000-0000-4000-8000-0000000000d1',
  revision: 1,
  summary: 'Tomas.',
  source: { kind: 'dm' },
  commands: [],
  createdBy: 'dm-ravenford',
  createdAt: '2026-10-04T12:00:00.000Z',
  ...changes,
});

describe('PostgresProposalStore', () => {
  it('keeps every revision, returns the latest per campaign, and refuses rewrites', async () => {
    const store = new PostgresProposalStore(pool);
    await store.append(revision());
    await store.append(revision({ revision: 2, summary: 'Tomas, edited.' }));

    expect(await store.latest('ravenford', revision().proposalId)).toMatchObject({
      revision: 2,
      summary: 'Tomas, edited.',
    });
    expect(await store.latest('elsewhere', revision().proposalId)).toBeNull();
    await expect(store.append(revision({ revision: 2 }))).rejects.toBeInstanceOf(
      ProposalConflictError,
    );
    await expect(
      pool.query(`UPDATE ltw_authoring_revisions SET created_by = 'someone-else'`),
    ).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM ltw_authoring_revisions')).rejects.toThrow(/append-only/);
    await expect(pool.query('TRUNCATE ltw_authoring_revisions')).rejects.toThrow(/append-only/);
  });
});

describe('authoring over the PostgreSQL event store', () => {
  it('commits one command or nothing, and a restarted server agrees', async () => {
    await seeded();
    const first = await server(0xb1);
    const created = (
      await post(first, PROPOSALS, { summary: 'Tomas.', commands: [tomas] }, TOKENS.dm)
    ).json<AuthoringProposalResponse>();
    const at = `${PROPOSALS}/${created.proposal.proposalId}`;
    const events = await count('ltw_events');
    const commands = await count('ltw_commands');

    const low = { revision: 1, confirmation: { riskLevel: 'L1', acknowledgedWarnings: [] } };
    expect((await post(first, `${at}/commit`, low, TOKENS.dm)).statusCode).toBe(409);
    expect([await count('ltw_events'), await count('ltw_commands')]).toEqual([events, commands]);

    const confirmation = created.preview?.confirmation;
    const committed = await post(first, `${at}/commit`, { revision: 1, confirmation }, TOKENS.dm);
    expect(committed.json<CommandResult>().status).toBe('accepted');
    expect(await count('ltw_commands')).toBe(commands + 1);
    expect(await count('ltw_events')).toBe(events + 2);

    const restarted = await server(0xb2);
    const viewed = (await get(restarted, at, TOKENS.dm)).json<AuthoringProposalResponse>();
    expect(viewed.proposal).toMatchObject({ status: 'COMMITTED', commit: { revision: 1 } });
    expect((await post(restarted, `${at}/undo`, {}, TOKENS.dm)).statusCode).toBe(200);
    expect(
      (await get(first, at, TOKENS.dm)).json<AuthoringProposalResponse>().proposal.status,
    ).toBe('UNDONE');
  });

  it('lets exactly one of two racing processes create the same NPC', async () => {
    await seeded();
    const [a, b] = [await server(0xc1), await server(0xc2)];
    const draft = async (app: FastifyInstance, name: string) =>
      (
        await post(app, PROPOSALS, { summary: name, commands: [{ ...tomas, name }] }, TOKENS.dm)
      ).json<AuthoringProposalResponse>();
    const [one, two] = [await draft(a, 'Tomas Reed'), await draft(b, 'Tomas Reeve')];
    const commit = (app: FastifyInstance, draft: AuthoringProposalResponse) =>
      post(
        app,
        `${PROPOSALS}/${draft.proposal.proposalId}/commit`,
        { revision: 1, confirmation: { riskLevel: 'L3', acknowledgedWarnings: [] } },
        TOKENS.dm,
      );

    const results = await Promise.all([commit(a, one), commit(b, two)]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 422]);
    const rejected = results.find((result) => result.statusCode === 422)?.json<CommandResult>();
    expect(rejected).toMatchObject({
      code: 'AUTHORING_INVALID',
      details: { issues: [{ code: 'ID_ALREADY_USED' }] },
    });
  });
});
