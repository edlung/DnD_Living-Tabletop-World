import { createCombatEngine } from '@ltw/combat';
import type { AuthoringProposalResponse, CommandResult } from '@ltw/contracts';
import {
  SequentialIds,
  SteppingClock,
  WorldEngine,
  checkWorldIntegrity,
  replay,
  type EventStore,
} from '@ltw/domain';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MIDDLE_ENTROPY,
  TOKENS,
  get,
  post,
  ravenfordApp,
  testAiGateway,
} from '../testing/ravenford-app.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { PostgresEventStore } from '../world-engine/postgres-event-store.ts';
import { PostgresProposalStore } from './postgres-proposal-store.ts';
import type { ProposalStore } from './proposal-store.ts';

/**
 * Gate 04 regressions on PostgreSQL (reviews/ASTRA_GATE_04_REPORT.md):
 *
 * - G04-H01 `proposal_revision_and_commit_are_serializable`. Two server
 *   processes, each with its own World Engine and proposal store over one
 *   database, race an edit of a proposal against a commit of its earlier
 *   revision, in both orders. Exactly one succeeds and the other answers 409;
 *   canon never holds a revision that is not the proposal's latest, after a
 *   restart too. Sequential controls agree.
 * - G04-M02 `identical_authoring_commit_retry_returns_original_duplicate`:
 *   an identical retry answers the original command as `duplicate` and adds
 *   no event, after a restart too; a different confirmation or revision is 409.
 *
 * A race is scheduled with a pause inside the first request, right before it
 * writes (its events, or its revision). The competing request runs while the
 * first is paused; it may finish or wait, and the first then resumes.
 */
let database: ThrowawayDatabase;
let pool: pg.Pool;
const apps: FastifyInstance[] = [];
const pools: pg.Pool[] = [];

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url });
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(pools.splice(0).map((extra) => extra.end()));
  await pool.end();
  await database.drop();
});

const PROPOSALS = '/campaigns/ravenford/authoring/proposals';
const NPC = 'g04-revision-npc';
const create = {
  type: 'CreateEntity',
  entityId: NPC,
  kind: 'npc',
  name: 'Earlier approved name',
  existsSince: null,
  placement: { locationId: 'north-gate', since: null },
};
const confirm = { revision: 1, confirmation: { riskLevel: 'L2', acknowledgedWarnings: [] } };
const edit = {
  basedOnRevision: 1,
  summary: 'Replace the earlier proposal.',
  commands: [{ ...create, name: 'Latest edited name' }],
};

/** A pause a request hits once, right before it writes. */
function gate() {
  let armed = false;
  let hit: () => void = () => undefined;
  let release: () => void = () => undefined;
  const reached = new Promise<void>((resolve) => (hit = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  return {
    arm: () => (armed = true),
    reached,
    release,
    pass: async () => {
      if (!armed) return;
      armed = false;
      hit();
      await released;
    },
  };
}

interface Process {
  readonly app: FastifyInstance;
  readonly beforeAppend: ReturnType<typeof gate>;
  readonly beforeRevision: ReturnType<typeof gate>;
}

/** A server process over the shared database, with pauses before its writes. */
async function processOn(namespace: number): Promise<Process> {
  const beforeAppend = gate();
  const beforeRevision = gate();
  const events = new PostgresEventStore(pool);
  const store: EventStore = {
    loadStream: (...args) => events.loadStream(...args),
    findCommand: (commandId) => events.findCommand(commandId),
    loadCommands: (campaignId) => events.loadCommands(campaignId),
    append: async (batch) => {
      await beforeAppend.pass();
      return events.append(batch);
    },
  };
  const engine = new WorldEngine({
    store,
    ids: new SequentialIds(namespace),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
    entropy: MIDDLE_ENTROPY,
  });
  const proposals = proposalStore(beforeRevision);
  const clock = new SteppingClock();
  const app = await ravenfordApp(engine, testAiGateway(), {
    proposals,
    ids: new SequentialIds(namespace + 1),
    clock: { now: () => clock.now() },
  });
  apps.push(app);
  return { app, beforeAppend, beforeRevision };
}

function proposalStore(beforeRevision: ReturnType<typeof gate>): ProposalStore {
  const locks = new pg.Pool({ connectionString: database.url, max: 4 });
  pools.push(locks);
  const real = new PostgresProposalStore(pool, locks);
  return {
    exclusive: (campaignId, proposalId, work) => real.exclusive(campaignId, proposalId, work),
    latest: (campaignId, proposalId) => real.latest(campaignId, proposalId),
    latestOfCampaign: (campaignId) => real.latestOfCampaign(campaignId),
    append: async (revision) => {
      if (revision.revision > 1) await beforeRevision.pass();
      return real.append(revision);
    },
  };
}

async function seed() {
  const seeder = new WorldEngine({
    store: new PostgresEventStore(pool),
    ids: new SequentialIds(1),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
  });
  for (const submission of (await loadRavenfordSeed()).submissions) {
    const result = await seeder.execute(submission);
    if (result.status === 'rejected') throw new Error(`seed rejected: ${result.code}`);
  }
}

async function proposal(app: FastifyInstance): Promise<string> {
  const created = await post(
    app,
    PROPOSALS,
    { summary: 'Add the NPC.', commands: [create] },
    TOKENS.dm,
  );
  expect(created.statusCode).toBe(201);
  return created.json<AuthoringProposalResponse>().proposal.proposalId;
}

/** Whether a request finishes within `ms`; a request waiting its turn does not. */
async function settlesWithin(request: Promise<LightMyRequestResponse>, ms: number) {
  const timeout = new Promise<false>((resolve) => {
    setTimeout(() => {
      resolve(false);
    }, ms);
  });
  return Promise.race([request.then(() => true), timeout]);
}

const count = async (table: string) =>
  Number((await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n);

/** After a restart: the proposal and canon agree, and nothing unconfirmed is canonical. */
async function consistent(id: string) {
  const fresh = await processOn(90);
  const view = (
    await get(fresh.app, `${PROPOSALS}/${id}`, TOKENS.dm)
  ).json<AuthoringProposalResponse>();
  const engine = new WorldEngine({
    store: new PostgresEventStore(pool),
    ids: new SequentialIds(91),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
  });
  const snapshot = await engine.load('ravenford');
  if (!snapshot) throw new Error('missing campaign');
  expect(replay(snapshot.history)).toEqual(snapshot.state);
  expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
  const canonical = snapshot.state.entities.get(NPC)?.name ?? null;
  if (view.proposal.status === 'COMMITTED') {
    expect(view.proposal.commit?.revision).toBe(view.proposal.revision);
    expect(canonical).toBe(
      view.proposal.commands[0]?.type === 'CreateEntity' ? view.proposal.commands[0].name : null,
    );
  } else {
    expect(canonical).toBeNull();
  }
  return view.proposal;
}

describe('G04-H01 proposal_revision_and_commit_are_serializable', () => {
  it('an edit racing a commit of the earlier revision: exactly one wins', async () => {
    await seed();
    const [committer, editor] = [await processOn(10), await processOn(20)];
    const id = await proposal(committer.app);

    committer.beforeAppend.arm();
    const commit = post(committer.app, `${PROPOSALS}/${id}/commit`, confirm, TOKENS.dm);
    await committer.beforeAppend.reached;
    const revise = post(editor.app, `${PROPOSALS}/${id}/revisions`, edit, TOKENS.dm);
    // The edit waits for the commit already under way, in the other process.
    expect(await settlesWithin(revise, 500)).toBe(false);
    committer.beforeAppend.release();
    const [committed, revised] = [await commit, await revise];

    expect(committed.statusCode).toBe(200);
    expect(revised.statusCode).toBe(409);
    expect((await consistent(id)).revision).toBe(1);
  });

  it('a commit racing an edit of its revision: exactly one wins', async () => {
    await seed();
    const [committer, editor] = [await processOn(10), await processOn(20)];
    const id = await proposal(committer.app);

    editor.beforeRevision.arm();
    const revise = post(editor.app, `${PROPOSALS}/${id}/revisions`, edit, TOKENS.dm);
    await editor.beforeRevision.reached;
    const commit = post(committer.app, `${PROPOSALS}/${id}/commit`, confirm, TOKENS.dm);
    // The commit waits for the edit already under way, in the other process.
    expect(await settlesWithin(commit, 500)).toBe(false);
    editor.beforeRevision.release();
    const [revised, committed] = [await revise, await commit];

    expect(revised.statusCode).toBe(201);
    expect(committed.statusCode).toBe(409);
    const after = await consistent(id);
    expect([after.status, after.revision]).toEqual(['DRAFT', 2]);
  });

  it('in sequence: an edit voids the earlier confirmation, and a commit ends editing', async () => {
    await seed();
    const [first, second] = [await processOn(10), await processOn(20)];
    const edited = await proposal(first.app);
    expect(
      (await post(first.app, `${PROPOSALS}/${edited}/revisions`, edit, TOKENS.dm)).statusCode,
    ).toBe(201);
    expect(
      (await post(second.app, `${PROPOSALS}/${edited}/commit`, confirm, TOKENS.dm)).statusCode,
    ).toBe(409);
    expect((await consistent(edited)).status).toBe('DRAFT');

    const committed = await proposal(first.app);
    expect(
      (await post(first.app, `${PROPOSALS}/${committed}/commit`, confirm, TOKENS.dm)).statusCode,
    ).toBe(200);
    expect(
      (await post(second.app, `${PROPOSALS}/${committed}/revisions`, edit, TOKENS.dm)).statusCode,
    ).toBe(409);
    expect((await consistent(committed)).status).toBe('COMMITTED');
  });
});

describe('G04-M02 identical_authoring_commit_retry_returns_original_duplicate', () => {
  it('answers an identical retry with the original command, adding nothing', async () => {
    await seed();
    const first = await processOn(10);
    const id = await proposal(first.app);
    const original = await post(first.app, `${PROPOSALS}/${id}/commit`, confirm, TOKENS.dm);
    expect(original.statusCode).toBe(200);
    const accepted = original.json<CommandResult>();
    expect(accepted.status).toBe('accepted');
    const events = await count('ltw_events');

    const retried = await post(first.app, `${PROPOSALS}/${id}/commit`, confirm, TOKENS.dm);
    expect(retried.statusCode).toBe(200);
    expect(retried.json<CommandResult>()).toEqual({ ...accepted, status: 'duplicate' });

    const restarted = await processOn(30);
    const again = await post(restarted.app, `${PROPOSALS}/${id}/commit`, confirm, TOKENS.dm);
    expect(again.json<CommandResult>()).toEqual({ ...accepted, status: 'duplicate' });
    expect(await count('ltw_events')).toBe(events);

    // A different confirmation or revision is not the same request.
    const different = { ...confirm, confirmation: { riskLevel: 'L3', acknowledgedWarnings: [] } };
    expect(
      (await post(restarted.app, `${PROPOSALS}/${id}/commit`, different, TOKENS.dm)).statusCode,
    ).toBe(409);
    expect(
      (
        await post(
          restarted.app,
          `${PROPOSALS}/${id}/commit`,
          { ...confirm, revision: 2 },
          TOKENS.dm,
        )
      ).statusCode,
    ).toBe(409);
    expect(await count('ltw_events')).toBe(events);

    // Undo is retried the same way; the undone commit is never applied again.
    const undo = `${PROPOSALS}/${id}/undo`;
    const undone = await post(restarted.app, undo, {}, TOKENS.dm);
    expect(undone.json<CommandResult>().status).toBe('accepted');
    const afterUndo = await count('ltw_events');
    expect((await post(restarted.app, undo, {}, TOKENS.dm)).json<CommandResult>().status).toBe(
      'duplicate',
    );
    expect(
      (
        await post(restarted.app, `${PROPOSALS}/${id}/commit`, confirm, TOKENS.dm)
      ).json<CommandResult>(),
    ).toEqual({
      ...accepted,
      status: 'duplicate',
    });
    expect(await count('ltw_events')).toBe(afterUndo);
  });
});
