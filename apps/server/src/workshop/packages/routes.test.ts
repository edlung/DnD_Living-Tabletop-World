import { randomUUID } from 'node:crypto';

import { InMemoryEventStore, SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import type {
  ApiErrorResponse,
  CampaignRevisionSummary,
  CampaignRevisionView,
} from '@ltw/contracts';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { RequestLimits, SIGN_IN_LIMITS } from '../../auth/limits.ts';
import { buildApp } from '../../http/app.ts';
import { disabledAuthenticator } from '../../http/auth.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import {
  emptyCampaignPackage,
  MemoryCampaignRevisionRepository,
} from '../../testing/campaign-packages.ts';
import { testAiGateway, testAssets, testAuthoring, testDm } from '../../testing/ravenford-app.ts';
import { MemoryWorkshopStore } from '../../testing/workshop-store.ts';
import { issueWorkshopInvitation, type WorkshopDependencies } from '../service.ts';

const ORIGIN = 'https://table.example';
const T0 = Date.parse('2026-10-30T12:00:00.000Z');
interface HistoryView {
  readonly revisions: readonly CampaignRevisionSummary[];
  readonly nextBefore: number | null;
}
const opened: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});
const cookieOf = (response: LightMyRequestResponse) => {
  const raw = response.headers['set-cookie'];
  return (typeof raw === 'string' ? raw : (raw?.[0] ?? '')).split(';')[0] ?? '';
};

async function setup() {
  const store = new MemoryWorkshopStore();
  const repository = new MemoryCampaignRevisionRepository(store);
  const deps: WorkshopDependencies = {
    store,
    packages: repository,
    publicOrigin: ORIGIN,
    clock: { now: () => T0 },
    limits: new RequestLimits(SIGN_IN_LIMITS, () => T0),
  };
  const engine = new WorldEngine({
    store: new InMemoryEventStore(),
    ids: new SequentialIds(),
    clock: new SteppingClock(),
  });
  const app = buildApp({
    engine,
    authenticator: disabledAuthenticator,
    logger: createLogger({ service: 'packages-test', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: testAssets(),
    quests: [],
    workshop: deps,
  });
  opened.push(app);
  await app.ready();
  const send = (method: 'GET' | 'POST', url: string, cookie = '', body?: object, owner?: string) =>
    app.inject({
      method,
      url,
      headers: { origin: ORIGIN, cookie, ...(owner ? { 'x-workshop-owner': owner } : {}) },
      ...(body ? { payload: body } : {}),
    });
  const login = async () => {
    const ownerId = randomUUID();
    const invitation = await issueWorkshopInvitation(deps, {
      ownerId,
      hours: 24,
      authorizationSource: 'test:390',
    });
    const response = await send('POST', '/workshop/auth/redeem', '', {
      token: invitation.link.split('#')[1],
    });
    expect(response.statusCode).toBe(200);
    return { ownerId, cookie: cookieOf(response) };
  };
  const owner = await login();
  const draft = await send('POST', '/workshop/drafts', owner.cookie, {
    requestId: randomUUID(),
    title: 'Bell',
    language: 'ru',
  });
  expect(draft.statusCode).toBe(200);
  const draftId = draft.json<{ draftId: string }>().draftId;
  const url = `/workshop/drafts/${draftId}`;
  const request = { requestId: randomUUID(), basedOnRevision: 0, content: emptyCampaignPackage() };
  return { app, engine, repository, owner, draftId, url, request, send, login };
}

describe('owner-private package HTTP', () => {
  it('stores incomplete packages for correction, assesses versions, and returns bounded metadata history', async () => {
    const t = await setup();
    const empty = await t.send('GET', `${t.url}/package`, t.owner.cookie);
    expect(empty.json<CampaignRevisionView>()).toMatchObject({
      revision: null,
      assessment: { readiness: 'INCOMPLETE' },
    });
    const saved = await t.send('POST', `${t.url}/revisions`, t.owner.cookie, t.request);
    expect(saved.statusCode).toBe(200);
    const first = saved.json<CampaignRevisionView>();
    expect(first.revision).toMatchObject({
      revision: 1,
      basedOnRevision: 0,
      source: { kind: 'OWNER', actorId: t.owner.ownerId },
    });
    expect(first.assessment.readiness).toBe('INCOMPLETE');
    expect(Object.keys(first).sort()).toEqual(['assessment', 'revision']);
    const next = await t.send('POST', `${t.url}/revisions`, t.owner.cookie, {
      ...t.request,
      requestId: randomUUID(),
      basedOnRevision: 1,
      content: { ...t.request.content, firstSession: ['New opening'] },
    });
    expect(next.statusCode).toBe(200);
    expect(
      (await t.send('GET', `${t.url}/package`, t.owner.cookie)).json<CampaignRevisionView>()
        .revision?.revision,
    ).toBe(2);
    expect((await t.send('GET', `${t.url}/revisions/1`, t.owner.cookie)).json()).toEqual(first);
    const history = (
      await t.send('GET', `${t.url}/revisions?before=2`, t.owner.cookie)
    ).json<HistoryView>();
    expect(history).toEqual({
      revisions: [
        {
          revision: 1,
          basedOnRevision: 0,
          digest: first.revision?.digest,
          source: first.revision?.source,
          createdAt: first.revision?.createdAt,
          title: 'Колокол',
        },
      ],
      nextBefore: null,
    });
    expect(await t.engine.load(t.draftId)).toBeNull();
  });

  it('replays exact requests after a later write and rejects changed nonces and stale bases', async () => {
    const t = await setup();
    const first = (
      await t.send('POST', `${t.url}/revisions`, t.owner.cookie, t.request)
    ).json<CampaignRevisionView>();
    await t.send('POST', `${t.url}/revisions`, t.owner.cookie, {
      ...t.request,
      requestId: randomUUID(),
      basedOnRevision: 1,
    });
    const replay = await t.send('POST', `${t.url}/revisions`, t.owner.cookie, t.request);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first);
    const changed = await t.send('POST', `${t.url}/revisions`, t.owner.cookie, {
      ...t.request,
      content: { ...t.request.content, laterOutline: ['Different'] },
    });
    expect(changed.statusCode).toBe(409);
    expect(
      (
        await t.send('POST', `${t.url}/revisions`, t.owner.cookie, {
          ...t.request,
          requestId: randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
    expect(await t.repository.list(t.owner.ownerId, t.draftId, null, 50)).toHaveLength(2);
  });

  it('authenticates before input validation and returns identical foreign and unknown resource errors', async () => {
    const t = await setup();
    const other = await t.login();
    await t.send('POST', `${t.url}/revisions`, t.owner.cookie, t.request);
    expect((await t.send('POST', '/workshop/drafts/invalid/revisions', '', {})).statusCode).toBe(
      401,
    );
    for (const suffix of ['/package', '/revisions', '/revisions/1']) {
      const foreign = await t.send('GET', `${t.url}${suffix}`, other.cookie);
      const unknown = await t.send(
        'GET',
        `/workshop/drafts/${randomUUID()}${suffix}`,
        other.cookie,
      );
      expect(foreign.statusCode).toBe(404);
      expect(unknown.statusCode).toBe(404);
      expect(foreign.json<ApiErrorResponse>().error).toEqual(
        unknown.json<ApiErrorResponse>().error,
      );
    }
    expect((await t.send('POST', `${t.url}/revisions`, other.cookie, t.request)).statusCode).toBe(
      404,
    );
    const stale = await t.send(
      'POST',
      `${t.url}/revisions`,
      other.cookie,
      t.request,
      t.owner.ownerId,
    );
    expect(stale.statusCode).toBe(409);
    expect(stale.headers['set-cookie']).toBeUndefined();
    expect(await t.repository.list(t.owner.ownerId, t.draftId, null, 50)).toHaveLength(1);
  });

  it('rejects caller identities, provenance, unknown fields and malformed revision cursors', async () => {
    const t = await setup();
    for (const extra of [
      { source: { kind: 'AI', jobId: randomUUID() } },
      { ownerId: t.owner.ownerId },
      { digest: 'sha256:forged' },
      { identities: { scene: randomUUID() } },
    ]) {
      expect(
        (await t.send('POST', `${t.url}/revisions`, t.owner.cookie, { ...t.request, ...extra }))
          .statusCode,
      ).toBe(400);
    }
    expect(
      (
        await t.send('POST', `${t.url}/revisions`, t.owner.cookie, {
          ...t.request,
          content: {
            ...t.request.content,
            world: { ...t.request.content.world, canonicalId: randomUUID() },
          },
        })
      ).statusCode,
    ).toBe(400);
    for (const suffix of [
      '/revisions?before=-1',
      '/revisions?before=1e2',
      '/revisions?unknown=1',
      '/revisions/0',
      '/package?x=1',
    ])
      expect((await t.send('GET', `${t.url}${suffix}`, t.owner.cookie)).statusCode).toBe(400);
    expect(await t.repository.latest(t.owner.ownerId, t.draftId)).toBeNull();
  });

  it('accepts a valid package larger than the default request body limit', async () => {
    const t = await setup();
    const content = t.request.content;
    content.brief.include = Array.from({ length: 20 }, () => 'Д'.repeat(2000));
    expect(Buffer.byteLength(JSON.stringify(content))).toBeGreaterThan(64 * 1024);
    const response = await t.send('POST', `${t.url}/revisions`, t.owner.cookie, {
      ...t.request,
      content,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<CampaignRevisionView>().revision?.content.brief.include).toEqual(
      content.brief.include,
    );
  });

  it('paginates old revisions without hiding any version', async () => {
    const t = await setup();
    for (let base = 0; base < 27; base++)
      await t.repository.append({
        ...t.request,
        requestId: randomUUID(),
        basedOnRevision: base,
        ownerId: t.owner.ownerId,
        draftId: t.draftId,
        source: { kind: 'OWNER', actorId: t.owner.ownerId },
        createdAt: new Date(T0).toISOString(),
      });
    const first = (await t.send('GET', `${t.url}/revisions`, t.owner.cookie)).json<HistoryView>();
    expect(first.revisions).toHaveLength(25);
    expect(first.nextBefore).toBe(3);
    const second = (
      await t.send('GET', `${t.url}/revisions?before=${first.nextBefore ?? ''}`, t.owner.cookie)
    ).json<HistoryView>();
    expect(second.revisions.map((r) => r.revision)).toEqual([2, 1]);
    expect(second.nextBefore).toBeNull();
    expect((await t.send('GET', `${t.url}/revisions/1`, t.owner.cookie)).statusCode).toBe(200);
  });
});
