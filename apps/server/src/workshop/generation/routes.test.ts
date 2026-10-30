import { randomUUID } from 'node:crypto';

import { InMemoryEventStore, SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import type { CampaignGenerationJob, CampaignGenerationView } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { RequestLimits, SIGN_IN_LIMITS } from '../../auth/limits.ts';
import { hashToken } from '../../auth/tokens.ts';
import { buildApp } from '../../http/app.ts';
import { disabledAuthenticator } from '../../http/auth.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { generationFixture, T0 } from '../../testing/generation/fixture.ts';
import { testAiGateway, testAssets, testAuthoring, testDm } from '../../testing/ravenford-app.ts';
import { CampaignGenerationWorker } from './worker.ts';

const ORIGIN = 'https://table.example';
const opened: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});
async function setup() {
  const f = await generationFixture();
  const events = new InMemoryEventStore();
  const engine = new WorldEngine({
    store: events,
    ids: new SequentialIds(),
    clock: new SteppingClock(),
  });
  const deps = { repository: f.repository, preparation: f.preparation };
  const app = buildApp({
    engine,
    authenticator: disabledAuthenticator,
    logger: createLogger({ service: 'generation-test', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: testAssets(),
    quests: [],
    workshop: {
      store: f.workshop,
      packages: f.revisions,
      generation: deps,
      clock: { now: f.now },
      publicOrigin: ORIGIN,
      limits: new RequestLimits({ ...SIGN_IN_LIMITS, expensivePerMinute: 100 }, f.now),
    },
  });
  opened.push(app);
  await app.ready();
  const url = `/workshop/drafts/${f.draftId}/generation`;
  const request = { requestId: randomUUID(), basedOnRevision: 0, brief: f.content.brief };
  const send = (
    method: 'GET' | 'POST',
    path = url,
    payload?: object,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url: path,
      headers: {
        origin: ORIGIN,
        cookie: `ltw_workshop=${f.token}`,
        'x-workshop-owner': f.ownerId,
        ...headers,
      },
      ...(payload ? { payload } : {}),
    });
  return { ...f, app, url, request, send, events, worker: new CampaignGenerationWorker(deps) };
}

describe('owner-private campaign generation HTTP', () => {
  it('enqueues idempotently and exposes only public owner-job metadata', async () => {
    const f = await setup();
    const first = await f.send('POST', f.url, f.request),
      retry = await f.send('POST', f.url, f.request);
    expect(first.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());
    const job = first.json<{ job: CampaignGenerationJob }>().job;
    expect(job.status).toBe('QUEUED');
    for (const forbidden of [
      'authSessionId',
      'workerId',
      'leaseUntil',
      'fence',
      'seed',
      'tokenHash',
    ])
      expect(first.body).not.toContain(forbidden);
    expect(first.headers['cache-control']).toContain('no-store');
    expect(
      (
        await f.send('POST', f.url, {
          ...f.request,
          brief: { ...f.request.brief, intent: 'changed' },
        })
      ).statusCode,
    ).toBe(409);
    expect(await f.repository.list({ ownerId: f.ownerId, draftId: f.draftId }, 100)).toHaveLength(
      1,
    );
  });
  it('accepts a schema-valid brief above the generic 64 KiB body default', async () => {
    const f = await setup();
    const response = await f.send('POST', f.url, {
      ...f.request,
      brief: {
        ...f.request.brief,
        include: Array.from({ length: 20 }, (_, index) => `${index}: ${'Тема '.repeat(600)}`),
      },
    });
    expect(response.statusCode).toBe(200);
  });
  it('returns the generated revision and complete private artifacts without creating a live world', async () => {
    const f = await setup();
    const queued = await f.send('POST', f.url, f.request),
      job = queued.json<{ job: CampaignGenerationJob }>().job;
    await f.worker.run({ ownerId: f.ownerId, draftId: f.draftId, jobId: job.jobId });
    const response = await f.send('GET', `${f.url}/${job.jobId}`);
    const view = response.json<CampaignGenerationView>();
    expect(view.job.status).toBe('SUCCEEDED');
    expect(view.steps).toHaveLength(7);
    expect(view.candidate?.content).toEqual(f.content);
    expect(view.job.attachedRevision).toBe(1);
    expect(await f.events.loadStream(f.draftId)).toBeNull();
    for (const forbidden of ['authSessionId', 'workerId', 'leaseUntil', 'inputDigest', 'tokenHash'])
      expect(response.body).not.toContain(forbidden);
    const packageResponse = await f.send('GET', f.url.replace('/generation', '/package'));
    expect(packageResponse.json<{ assessment: { readiness: string } }>().assessment.readiness).toBe(
      'READY',
    );
  });
  it('refuses campaign-only, stale owner, other-owner, cross-origin and malformed requests', async () => {
    const f = await setup();
    expect((await f.send('POST', f.url, f.request, { cookie: '' })).statusCode).toBe(401);
    expect(
      (
        await f.send('GET', `${f.url}/availability`, undefined, {
          'x-workshop-owner': randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await f.send('POST', f.url, f.request, { origin: 'https://hostile.example' })).statusCode,
    ).toBe(403);
    for (const forged of [
      { ownerId: randomUUID() },
      { sessionId: randomUUID() },
      { approvalId: 'fake' },
      { provider: 'fake' },
    ])
      expect((await f.send('POST', f.url, { ...f.request, ...forged })).statusCode).toBe(400);
    const other = await generationFixture();
    const otherSession = await other.workshop.session(
      hashToken(other.token),
      new Date(T0).toISOString(),
    );
    if (!otherSession) throw new Error('test session missing');
    f.workshop.sessions.set(hashToken(other.token), { ...otherSession, revokedAt: null });
    const foreign = await f.send('GET', f.url, undefined, {
      cookie: `ltw_workshop=${other.token}`,
      'x-workshop-owner': other.ownerId,
    });
    expect(foreign.statusCode).toBe(404);
    const missing = await f.send('GET', f.url.replace(f.draftId, randomUUID()));
    expect(missing.statusCode).toBe(404);
    expect(missing.body).not.toContain(f.content.world.name);
    expect(foreign.json<{ error: unknown }>().error).toEqual(
      missing.json<{ error: unknown }>().error,
    );
  });
  it('never calls a provider or fabricates generated output when preparation is unavailable', async () => {
    const f = await setup();
    f.preparation.availability = () =>
      Promise.resolve({ available: false, reason: 'NO_ROUTE', providers: [] });
    const response = await f.send('POST', f.url, f.request);
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      availability: { available: false, reason: 'NO_ROUTE', providers: [] },
    });
    expect(await f.repository.list({ ownerId: f.ownerId, draftId: f.draftId }, 25)).toEqual([]);
    expect(f.calls).toEqual([]);
  });
  it('cancels a job and reauthorizes every subsequent progress request after revocation', async () => {
    const f = await setup();
    const response = await f.send('POST', f.url, f.request),
      job = response.json<{ job: CampaignGenerationJob }>().job;
    expect(
      (await f.send('POST', `${f.url}/${job.jobId}/cancel`, {})).json<{
        job: CampaignGenerationJob;
      }>().job.status,
    ).toBe('CANCELLED');
    await f.worker.run({ ownerId: f.ownerId, draftId: f.draftId, jobId: job.jobId });
    expect(f.calls).toEqual([]);
    await f.workshop.revokeOwner(f.ownerId, new Date(T0).toISOString(), 'test:400');
    const progress = await f.send('GET', `${f.url}/${job.jobId}`);
    expect(progress.statusCode).toBe(401);
    expect(progress.body).not.toContain(job.jobId);
  });
  it('keeps all jobs reachable through an owner-qualified history cursor', async () => {
    const f = await setup();
    for (let i = 0; i < 27; i++)
      expect(
        (await f.send('POST', f.url, { ...f.request, requestId: randomUUID() })).statusCode,
      ).toBe(200);
    const first = (await f.send('GET')).json<{
      jobs: CampaignGenerationJob[];
      nextCursor: string;
    }>();
    const second = (await f.send('GET', `${f.url}?after=${first.nextCursor}`)).json<{
      jobs: CampaignGenerationJob[];
      nextCursor: null;
    }>();
    expect(first.jobs).toHaveLength(25);
    expect(second.jobs).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.jobs, ...second.jobs].map((job) => job.jobId)).size).toBe(27);
    expect((await f.send('GET', `${f.url}?after=${randomUUID()}`)).statusCode).toBe(404);
  });
});
