import { randomUUID } from 'node:crypto';

import type { CampaignEditPlanView, CampaignGenerationJob } from '@ltw/contracts';
import { InMemoryEventStore, SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { RequestLimits, SIGN_IN_LIMITS } from '../../auth/limits.ts';
import { buildApp } from '../../http/app.ts';
import { disabledAuthenticator } from '../../http/auth.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { editFixture } from '../../testing/generation/edit-fixture.ts';
import { testAiGateway, testAssets, testAuthoring, testDm } from '../../testing/ravenford-app.ts';
import { MemoryCampaignRevisionControlRepository } from '../../testing/revision-controls.ts';
import { CampaignEditWorker } from './edit-worker.ts';
import type { CampaignPreparationRuntime } from './runtime.ts';

const ORIGIN = 'https://table.example';
const opened: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

async function setup() {
  const f = await editFixture();
  const controls = new MemoryCampaignRevisionControlRepository(
    f.workshop,
    f.revisions,
    f.images,
    [f.repository, f.edit],
    f.now,
  );
  const events = new InMemoryEventStore();
  const engine = new WorldEngine({
    store: events,
    ids: new SequentialIds(),
    clock: new SteppingClock(),
  });
  let available = true;
  let calls = 0;
  const preparation: CampaignPreparationRuntime = {
    availability: () =>
      Promise.resolve(
        available
          ? { available: true, reason: 'READY', providers: ['offline:edit'] }
          : { available: false, reason: 'NO_ROUTE', providers: [] },
      ),
    forJob: () =>
      Promise.resolve({
        provider: 'offline',
        model: 'edit',
        run: (input) => {
          calls++;
          const proposal = structuredClone(f.base.content);
          proposal.world.opening += ' The ice is breaking.';
          const result = input.validate(proposal);
          return Promise.resolve({
            status: result.ok ? 'GENERATED' : 'INVALID_OUTPUT',
            value: result.ok ? result.value : null,
            traceId: input.traceId,
            provider: 'offline',
            model: 'edit',
            issues: result.ok ? [] : result.issues,
            attempts: [],
          });
        },
      }),
  };
  const edits = { repository: f.edit, preparation };
  const worker = new CampaignEditWorker({ ...edits, packages: f.revisions });
  const app = buildApp({
    engine,
    authenticator: disabledAuthenticator,
    logger: createLogger({ service: 'edit-http-test', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: testAssets(),
    quests: [],
    workshop: {
      store: f.workshop,
      packages: f.revisions,
      revisionControls: controls,
      images: {
        repository: f.images,
        runtime: {
          availability: () =>
            Promise.resolve({ available: false, reason: 'NO_ROUTE', provider: null, model: null }),
          prepare: () => Promise.resolve({ status: 'UNAVAILABLE', reason: 'NO_ROUTE' }),
          forJob: () => Promise.resolve(null),
        },
      },
      generation: { repository: f.repository, preparation: f.preparation },
      edits,
      cancelEdit: (id) => {
        worker.cancel(id);
      },
      clock: { now: f.now },
      publicOrigin: ORIGIN,
      limits: new RequestLimits({ ...SIGN_IN_LIMITS, expensivePerMinute: 100 }, f.now),
    },
  });
  opened.push(app);
  await app.ready();
  const url = `/workshop/drafts/${f.draftId}/edits`;
  const request = {
    requestId: randomUUID(),
    revision: 1,
    packageDigest: f.base.digest,
    expectedLockVersion: 0,
    manifestVersion: 0,
    manifestDigest: f.manifest.digest,
    instruction: 'Make the opening urgent.',
    targets: ['section:world'],
  };
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
  return {
    ...f,
    app,
    events,
    controls,
    worker,
    url,
    request,
    send,
    calls: () => calls,
    unavailable: () => {
      available = false;
    },
  };
}

describe('selective edit request HTTP', () => {
  it('resolves scope on the server and keeps successful candidates separate from revisions', async () => {
    const f = await setup();
    const { requestId, ...plan } = f.request;
    expect(requestId).toBeTruthy();
    const planned = await f.send('POST', `${f.url}/plan`, plan);
    expect(planned.statusCode).toBe(200);
    expect(planned.json<CampaignEditPlanView>().spec?.requestedTargets).toEqual(['section:world']);
    const queued = await f.send('POST', f.url, f.request);
    expect(queued.statusCode).toBe(200);
    const job = queued.json<{ job: CampaignGenerationJob }>().job;
    await f.worker.run({ ...f, jobId: job.jobId });
    expect(f.calls()).toBe(1);
    expect((await f.revisions.latest(f.ownerId, f.draftId))?.revision).toBe(1);
    expect((await f.edit.candidate({ ...f, jobId: job.jobId }))?.content.world.opening).toContain(
      'ice is breaking',
    );
    expect((await f.send('GET', `${f.url}/${job.jobId}/progress`)).json()).toMatchObject({
      job: { status: 'SUCCEEDED', attachedRevision: null },
    });
    expect(await f.events.loadStream(f.draftId)).toBeNull();
  });
  it('replays accepted nonce before a changed head or unavailable provider and binds every request field', async () => {
    const f = await setup();
    const first = await f.send('POST', f.url, f.request);
    expect(first.statusCode).toBe(200);
    await f.revisions.append({
      ...f,
      requestId: randomUUID(),
      basedOnRevision: 1,
      content: f.base.content,
      source: { kind: 'OWNER', actorId: f.ownerId },
      createdAt: new Date(f.now()).toISOString(),
    });
    f.unavailable();
    const replay = await f.send('POST', f.url, f.request);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    for (const change of [
      { instruction: 'Changed instruction' },
      { targets: ['section:brief'] },
      { expectedLockVersion: 1 },
      { manifestVersion: 1 },
      { revision: 2 },
    ]) {
      const response = await f.send('POST', f.url, { ...f.request, ...change });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ conflict: { reason: 'REQUEST_REUSED' } });
    }
    expect(f.calls()).toBe(0);
  });
  it('rejects stale head, locks and manifest without creating or dispatching work', async () => {
    const f = await setup();
    for (const [change, reason] of [
      [{ revision: 2 }, 'STALE_REVISION'],
      [{ expectedLockVersion: 1 }, 'STALE_LOCKS'],
      [{ manifestVersion: 1 }, 'STALE_MANIFEST'],
    ] as const) {
      const response = await f.send('POST', f.url, { ...f.request, ...change });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ conflict: { reason } });
    }
    expect(await f.edit.list(f, 25)).toEqual([]);
    expect(f.calls()).toBe(0);
  });
  it('treats directly requested locked targets as conflicts and rejects forged permissions', async () => {
    const f = await setup();
    const locked = await f.controls.replaceLocks({
      ownerId: f.ownerId,
      draftId: f.draftId,
      authSessionId: f.sessionId,
      requestId: randomUUID(),
      revision: 1,
      packageDigest: f.base.digest,
      expectedLockVersion: 0,
      manifestVersion: 0,
      manifestDigest: f.manifest.digest,
      targets: [{ kind: 'content', targetId: 'section:world' }],
    });
    expect(locked.kind).toBe('saved');
    const { requestId, ...plan } = f.request;
    expect(requestId).toBeTruthy();
    const response = await f.send('POST', `${f.url}/plan`, { ...plan, expectedLockVersion: 1 });
    expect(response.json<CampaignEditPlanView>()).toMatchObject({
      spec: null,
      conflicts: [{ targetId: 'section:world', reason: 'LOCKED' }],
    });
    expect((await f.send('POST', f.url, { ...f.request, expectedLockVersion: 1 })).json()).toEqual({
      conflict: { reason: 'INVALID_TARGET' },
    });
    for (const forged of [
      { closure: [] },
      { seed: f.content },
      { ownerId: randomUUID() },
      { provider: 'fake' },
    ])
      expect((await f.send('POST', f.url, { ...f.request, ...forged })).statusCode).toBe(400);
    expect(f.calls()).toBe(0);
  });
  it('keeps edit jobs inaccessible through full-generation paths and requires the current owner on every poll', async () => {
    const f = await setup();
    const queued = await f.send('POST', f.url, f.request);
    const job = queued.json<{ job: CampaignGenerationJob }>().job;
    const path = `${f.url}/${job.jobId}/progress`;
    expect((await f.send('GET', path.replace('/edits/', '/generation/'))).statusCode).toBe(404);
    expect(
      (await f.send('GET', path, undefined, { 'x-workshop-owner': randomUUID() })).statusCode,
    ).toBe(409);
    expect(
      (await f.send('POST', f.url, f.request, { origin: 'https://hostile.example' })).statusCode,
    ).toBe(403);
    expect((await f.send('POST', f.url, f.request, { cookie: '' })).statusCode).toBe(401);
    await f.workshop.revokeOwner(f.ownerId, new Date(f.now()).toISOString(), 'test:430');
    expect((await f.send('GET', path)).statusCode).toBe(401);
    expect((await f.send('POST', f.url, f.request)).statusCode).toBe(401);
  });
  it('reports unavailable preparation without fabricating a candidate or calling a provider', async () => {
    const f = await setup();
    f.unavailable();
    const response = await f.send('POST', f.url, f.request);
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      availability: { available: false, reason: 'NO_ROUTE', providers: [] },
    });
    expect(await f.edit.list(f, 25)).toEqual([]);
    expect(f.calls()).toBe(0);
  });
});
