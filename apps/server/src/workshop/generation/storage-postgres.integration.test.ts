import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashToken, newToken } from '../../auth/tokens.ts';
import { emptyCampaignPackage } from '../../testing/campaign-packages.ts';
import { createThrowawayDatabase } from '../../testing/throwaway-database.ts';
import { PostgresWorkshopStore } from '../postgres-store.ts';
import { PostgresCampaignRevisionRepository } from '../packages/postgres-store.ts';
import { issueWorkshopInvitation } from '../service.ts';
import { digest } from './postgres-rows.ts';
import { PostgresCampaignGenerationRepository } from './postgres-store.ts';
import type {
  EnqueueGeneration,
  GenerationClaim,
  GenerationJobScope,
  GenerationLease,
  JobMutation,
} from './store.ts';

const cleanup: (() => Promise<unknown>)[] = [];
let pool: pg.Pool;
let repository: PostgresCampaignGenerationRepository;
let revisions: PostgresCampaignRevisionRepository;
let workshop: PostgresWorkshopStore;
let now: string;
beforeEach(async () => {
  const database = await createThrowawayDatabase({ migrate: true });
  cleanup.push(() => database.drop());
  pool = new pg.Pool({ connectionString: database.url, max: 5 });
  const connections = pool;
  cleanup.push(() => connections.end());
  repository = new PostgresCampaignGenerationRepository(pool);
  revisions = new PostgresCampaignRevisionRepository(pool);
  workshop = new PostgresWorkshopStore(pool);
  now =
    (
      await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now')
    ).rows[0]?.now.toISOString() ?? '';
});
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
const job = (result: JobMutation) => {
  if (result.kind !== 'saved') throw new Error(`expected saved ${result.kind}`);
  return result.job;
};
const lease = (result: GenerationClaim) => {
  if (result.kind !== 'claimed') throw new Error('expected claimed');
  return result.lease;
};
async function seed(): Promise<EnqueueGeneration> {
  const ownerId = randomUUID();
  const draftId = randomUUID();
  const authSessionId = randomUUID();
  const invite = await issueWorkshopInvitation(
    {
      store: workshop,
      publicOrigin: 'https://table.example',
      clock: { now: () => Date.parse(now) },
    },
    { ownerId, hours: 24, authorizationSource: 'test:400' },
  );
  await workshop.redeem(
    hashToken(invite.link.split('#')[1] ?? ''),
    {
      sessionId: authSessionId,
      tokenHash: hashToken(newToken()),
      createdAt: now,
      expiresAt: new Date(Date.parse(now) + 86400000).toISOString(),
    },
    null,
  );
  await workshop.createDraft(
    ownerId,
    { requestId: randomUUID(), title: 'Bell', language: 'ru' },
    draftId,
    now,
  );
  return {
    ownerId,
    draftId,
    authSessionId,
    requestId: randomUUID(),
    basedOnRevision: 0,
    seed: emptyCampaignPackage(),
  };
}
async function running() {
  const input = await seed();
  const stored = job(await repository.enqueue(input));
  const scope = { ownerId: input.ownerId, draftId: input.draftId, jobId: stored.jobId };
  const token = lease(await repository.claim(scope, randomUUID()));
  return { input, scope, token, stored };
}
async function prepare(token: GenerationLease, ordinal: number) {
  return repository.prepareStep(token, {
    ordinal,
    input: emptyCampaignPackage(),
    prompt: `Prompt ${ordinal}`,
    provider: 'test-provider',
    model: 'same-model',
    traceId: randomUUID(),
  });
}
async function finishStep(token: GenerationLease, ordinal: number) {
  expect((await prepare(token, ordinal)).kind).toBe('prepared');
  expect((await repository.beginDispatch(token, ordinal)).kind).toBe('dispatch');
  expect(
    (
      await repository.completeStep(token, ordinal, {
        content: emptyCampaignPackage(),
        providerRequestId: `req-${ordinal}`,
      })
    ).kind,
  ).toBe('stored');
}
async function finishAll(token: GenerationLease) {
  for (let ordinal = 0; ordinal < 7; ordinal++) await finishStep(token, ordinal);
}
async function expire(scope: GenerationJobScope) {
  await pool.query(
    `UPDATE ltw_campaign_generation_jobs SET lease_until=clock_timestamp()-interval '1 second'
  WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3`,
    [scope.ownerId, scope.draftId, scope.jobId],
  );
}

describe('durable PostgreSQL campaign generation', () => {
  it('replays the same enqueue after edits and isolates every read/write by owner and draft', async () => {
    const input = await seed();
    const first = job(await repository.enqueue(input));
    const scope = { ownerId: input.ownerId, draftId: input.draftId, jobId: first.jobId };
    await revisions.append({
      ownerId: input.ownerId,
      draftId: input.draftId,
      requestId: randomUUID(),
      basedOnRevision: 0,
      content: input.seed,
      source: { kind: 'OWNER', actorId: input.ownerId },
      createdAt: now,
    });
    expect(job(await repository.enqueue(input))).toEqual(first);
    expect(
      await repository.enqueue({ ...input, seed: { ...input.seed, firstSession: ['Changed'] } }),
    ).toEqual({ kind: 'conflict' });
    const other = await seed();
    const hidden = { ...scope, ownerId: other.ownerId };
    expect(await repository.get(hidden)).toBeNull();
    expect(await repository.steps(hidden)).toEqual([]);
    expect(await repository.candidate(hidden)).toBeNull();
    expect(await repository.list(hidden, 10)).toEqual([]);
    expect(await repository.cancel(hidden)).toEqual({ kind: 'not-found' });
    expect(await repository.claim(hidden, randomUUID())).toEqual({ kind: 'unavailable' });
    expect(await repository.retry(hidden, randomUUID(), other.authSessionId)).toEqual({
      kind: 'not-found',
    });
    expect(
      await repository.enqueue({
        ...input,
        ownerId: other.ownerId,
        authSessionId: other.authSessionId,
      }),
    ).toEqual({ kind: 'not-found' });
  });
  it('serializes claims, renews a lease, and fences an expired prepared worker after takeover', async () => {
    const input = await seed();
    const first = job(await repository.enqueue(input));
    const scope = { ownerId: input.ownerId, draftId: input.draftId, jobId: first.jobId };
    const claims = await Promise.all([
      repository.claim(scope, randomUUID()),
      new PostgresCampaignGenerationRepository(pool).claim(scope, randomUUID()),
    ]);
    expect(claims.filter((result) => result.kind === 'claimed')).toHaveLength(1);
    const old = lease(
      claims.find((result) => result.kind === 'claimed') ?? { kind: 'unavailable' },
    );
    expect((await repository.renew(old)).kind).toBe('saved');
    await prepare(old, 0);
    await expire(scope);
    const next = lease(await repository.claim(scope, randomUUID()));
    expect(BigInt(next.fence)).toBeGreaterThan(BigInt(old.fence));
    expect(await repository.beginDispatch(old, 0)).toEqual({ kind: 'fenced' });
    expect(await repository.renew(old)).toEqual({ kind: 'fenced' });
    expect((await repository.beginDispatch(next, 0)).kind).toBe('dispatch');
  });
  it('recovers lost DISPATCHING leases as unknown and never grants another provider attempt', async () => {
    const t = await running();
    await prepare(t.token, 0);
    await repository.beginDispatch(t.token, 0);
    await expire(t.scope);
    expect(await repository.pending(50)).toContainEqual(t.scope);
    expect(await repository.claim(t.scope, randomUUID())).toEqual({ kind: 'unavailable' });
    expect((await repository.get(t.scope))?.status).toBe('DISPATCH_UNKNOWN');
    expect(await repository.pending(50)).not.toContainEqual(t.scope);
    expect(
      await repository.completeStep(t.token, 0, { content: t.input.seed, providerRequestId: null }),
    ).toEqual({ kind: 'fenced' });
    expect(await repository.claim(t.scope, randomUUID())).toEqual({ kind: 'unavailable' });
    expect(await repository.retry(t.scope, randomUUID(), t.input.authSessionId)).toEqual({
      kind: 'conflict',
    });
    expect(
      (await pool.query('SELECT COUNT(*)::int AS n FROM ltw_campaign_generation_dispatches'))
        .rows[0],
    ).toEqual({ n: 1 });
  });
  it('keeps exact immutable inputs/results through restart and returns stored output without dispatch', async () => {
    const t = await running();
    const prepared = await prepare(t.token, 0);
    expect(prepared.kind).toBe('prepared');
    expect((await repository.beginDispatch(t.token, 0)).kind).toBe('dispatch');
    expect((await repository.beginDispatch(t.token, 0)).kind).toBe('uncertain');
    const output = {
      content: { ...t.input.seed, firstSession: ['Persisted exactly'] },
      providerRequestId: 'provider-id',
    };
    const complete = await repository.completeStep(t.token, 0, output);
    expect(complete.kind).toBe('stored');
    repository = new PostgresCampaignGenerationRepository(pool);
    expect(await repository.beginDispatch(t.token, 0)).toEqual(complete);
    expect(await repository.completeStep(t.token, 0, output)).toEqual(complete);
    expect(
      await repository.completeStep(t.token, 0, { ...output, providerRequestId: 'other' }),
    ).toEqual({ kind: 'conflict' });
    expect((await repository.get(t.scope))?.nextStep).toBe(1);
    const [stored] = await repository.steps(t.scope);
    expect(stored?.content).toEqual(output.content);
    expect(stored?.prompt).toBe('Prompt 0');
    expect(
      (await pool.query('SELECT COUNT(*)::int AS n FROM ltw_campaign_generation_dispatches'))
        .rows[0],
    ).toEqual({ n: 1 });
  });
  it('rejects a prepared input that changes the seed or skips the preceding persisted output', async () => {
    const t = await running();
    const base = {
      ordinal: 0,
      input: { ...t.input.seed, firstSession: ['Spoofed seed'] },
      prompt: 'Same prompt',
      provider: 'test-provider',
      model: 'same-model',
      traceId: randomUUID(),
    };
    expect(await repository.prepareStep(t.token, base)).toEqual({ kind: 'conflict' });
    expect(await repository.steps(t.scope)).toEqual([]);
    await prepare(t.token, 0);
    await repository.beginDispatch(t.token, 0);
    const output = { ...t.input.seed, firstSession: ['Persisted prior output'] };
    await repository.completeStep(t.token, 0, { content: output, providerRequestId: null });
    expect(
      await repository.prepareStep(t.token, { ...base, ordinal: 1, input: t.input.seed }),
    ).toEqual({ kind: 'conflict' });
    expect(
      (await repository.prepareStep(t.token, { ...base, ordinal: 1, input: output })).kind,
    ).toBe('prepared');
    expect(await repository.steps(t.scope)).toHaveLength(2);
  });
  it('recovers a stored output after a lost completion acknowledgement without treating it as unknown', async () => {
    const t = await running();
    await finishStep(t.token, 0);
    // Same durable state as COMMIT succeeding while its acknowledgement is lost.
    const failed = await repository.fail(t.token, 'WORKER_UNAVAILABLE', true);
    expect(failed.kind).toBe('saved');
    expect(await repository.get(t.scope)).toMatchObject({ status: 'RUNNING', nextStep: 1 });
    await expire(t.scope);
    repository = new PostgresCampaignGenerationRepository(pool);
    const next = lease(await repository.claim(t.scope, randomUUID()));
    expect((await repository.beginDispatch(next, 0)).kind).toBe('stored');
    await finishStep(next, 1);
    expect((await repository.get(t.scope))?.nextStep).toBe(2);
    expect(
      (await pool.query('SELECT COUNT(*)::int AS n FROM ltw_campaign_generation_dispatches'))
        .rows[0],
    ).toEqual({ n: 2 });
  });
  it('atomically appends the final revision, preserves AI provenance, and replays that attachment', async () => {
    const t = await running();
    expect(await repository.finalize(t.token)).toEqual({ kind: 'incomplete' });
    await finishAll(t.token);
    const first = await repository.finalize(t.token);
    expect(first.kind).toBe('attached');
    if (first.kind !== 'attached') throw new Error('expected attached');
    expect(first.revision.source).toMatchObject({
      kind: 'AI',
      jobId: t.scope.jobId,
      provider: 'test-provider',
      model: 'same-model',
    });
    expect(first.candidate.contentDigest).toBe(digest(first.candidate.content));
    await revisions.append({
      ownerId: t.scope.ownerId,
      draftId: t.scope.draftId,
      requestId: randomUUID(),
      basedOnRevision: 1,
      content: { ...t.input.seed, firstSession: ['Owner edit'] },
      source: { kind: 'OWNER', actorId: t.scope.ownerId },
      createdAt: now,
    });
    expect(await repository.finalize(t.token)).toEqual(first);
    expect(await repository.get(t.scope)).toMatchObject({
      status: 'SUCCEEDED',
      attachedRevision: 1,
      candidateAvailable: true,
    });
    expect((await revisions.latest(t.scope.ownerId, t.scope.draftId))?.revision).toBe(2);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM ltw_events')).rows[0]).toEqual({
      n: 0,
    });
  });
  it('stores a late candidate and leaves a later manual revision selected', async () => {
    const t = await running();
    await finishAll(t.token);
    const manual = await revisions.append({
      ownerId: t.scope.ownerId,
      draftId: t.scope.draftId,
      requestId: randomUUID(),
      basedOnRevision: 0,
      content: { ...t.input.seed, firstSession: ['Manual wins'] },
      source: { kind: 'OWNER', actorId: t.scope.ownerId },
      createdAt: now,
    });
    const final = await repository.finalize(t.token);
    expect(final.kind).toBe('candidate');
    expect(await repository.get(t.scope)).toMatchObject({
      status: 'SUCCEEDED',
      attachedRevision: null,
      candidateAvailable: true,
    });
    expect(await repository.candidate(t.scope)).not.toBeNull();
    if (manual.kind !== 'saved') throw new Error('expected saved');
    expect(await revisions.latest(t.scope.ownerId, t.scope.draftId)).toEqual(manual.revision);
    expect(await revisions.list(t.scope.ownerId, t.scope.draftId, null, 10)).toHaveLength(1);
  });
  it('serializes cancellation against final attachment and rejects all late worker writes', async () => {
    const t = await running();
    await finishAll(t.token);
    const [final, cancel] = await Promise.all([
      repository.finalize(t.token),
      repository.cancel(t.scope),
    ]);
    const selected = await revisions.latest(t.scope.ownerId, t.scope.draftId);
    if (final.kind === 'attached') {
      expect(cancel.kind).toBe('conflict');
      expect(selected?.revision).toBe(1);
    } else {
      expect(final.kind).toBe('fenced');
      expect(cancel.kind).toBe('saved');
      expect(selected).toBeNull();
    }
    const other = await running();
    await prepare(other.token, 0);
    await repository.beginDispatch(other.token, 0);
    await repository.cancel(other.scope);
    expect(
      await repository.completeStep(other.token, 0, {
        content: other.input.seed,
        providerRequestId: 'late',
      }),
    ).toEqual({ kind: 'fenced' });
    expect(await repository.finalize(other.token)).toEqual({ kind: 'fenced' });
    expect(await repository.candidate(other.scope)).toBeNull();
  });
  it('checks the current durable auth session on every worker mutation', async () => {
    const t = await running();
    await prepare(t.token, 0);
    await pool.query(
      'UPDATE ltw_workshop_sessions SET revoked_at=clock_timestamp() WHERE owner_id=$1 AND session_id=$2',
      [t.scope.ownerId, t.input.authSessionId],
    );
    expect(await repository.renew(t.token)).toEqual({ kind: 'fenced' });
    expect(await repository.beginDispatch(t.token, 0)).toEqual({ kind: 'fenced' });
    expect(
      await repository.completeStep(t.token, 0, { content: t.input.seed, providerRequestId: null }),
    ).toEqual({ kind: 'fenced' });
    expect(await repository.finalize(t.token)).toEqual({ kind: 'fenced' });
    await expire(t.scope);
    expect(await repository.claim(t.scope, randomUUID())).toEqual({ kind: 'unavailable' });
    expect((await repository.get(t.scope))?.status).toBe('CANCELLED');
  });
  it('creates a nonce-idempotent failed-job retry with saved steps and a fresh session binding', async () => {
    const t = await running();
    await finishStep(t.token, 0);
    await finishStep(t.token, 1);
    await prepare(t.token, 2);
    await repository.fail(t.token, 'PROVIDER_FAILED');
    const requestId = randomUUID();
    const [a, b] = await Promise.all([
      repository.retry(t.scope, requestId, t.input.authSessionId),
      repository.retry(t.scope, requestId, t.input.authSessionId),
    ]);
    const child = job(a);
    expect(job(b)).toEqual(child);
    expect(child).toMatchObject({ retryOf: t.scope.jobId, status: 'QUEUED', nextStep: 2 });
    const scope = { ...t.scope, jobId: child.jobId };
    const before = await repository.steps(t.scope);
    const copied = await repository.steps(scope);
    expect(copied).toEqual(before.slice(0, 2));
    const next = lease(await repository.claim(scope, randomUUID()));
    expect((await repository.beginDispatch(next, 0)).kind).toBe('stored');
    await finishStep(next, 2);
    expect((await repository.get(scope))?.nextStep).toBe(3);
    expect((await repository.get(t.scope))?.status).toBe('FAILED');
  });
  it('paginates the complete job history and forbids identity/output history mutation', async () => {
    const input = await seed();
    for (let i = 0; i < 3; i++) await repository.enqueue({ ...input, requestId: randomUUID() });
    const first = await repository.list(input, 2);
    expect(first).toHaveLength(2);
    const second = await repository.list(input, 2, first[1]);
    expect(second).toHaveLength(1);
    expect(new Set([...first, ...second].map((value) => value.jobId)).size).toBe(3);
    const t = await running();
    await finishAll(t.token);
    await repository.finalize(t.token);
    for (const sql of [
      "UPDATE ltw_campaign_generation_jobs SET seed='{}'::jsonb",
      'DELETE FROM ltw_campaign_generation_jobs',
      'TRUNCATE ltw_campaign_generation_jobs',
      ...['steps', 'dispatches', 'results', 'candidates'].flatMap((table) => [
        `DELETE FROM ltw_campaign_generation_${table}`,
        `TRUNCATE ltw_campaign_generation_${table}`,
      ]),
    ])
      await expect(pool.query(sql)).rejects.toThrow();
  });
});
