import { randomUUID } from 'node:crypto';

import type { CampaignPackage, CampaignRevision } from '@ltw/contracts';
import { InMemoryEventStore, SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import type { LightMyRequestResponse } from 'fastify';

import { bellCampaign } from '../../../../packages/domain/src/campaign/testing/bell.ts';
import { RequestLimits, SIGN_IN_LIMITS } from '../auth/limits.ts';
import { buildApp } from '../http/app.ts';
import { disabledAuthenticator } from '../http/auth.ts';
import { createLogger } from '../platform/logging/logger.ts';
import type { DraftImageDependencies } from '../workshop/images/runtime.ts';
import { issueWorkshopInvitation, type WorkshopDependencies } from '../workshop/service.ts';
import { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import { testAiGateway, testAssets, testAuthoring, testDm } from './ravenford-app.ts';
import { MemoryWorkshopStore } from './workshop-store.ts';

export const PREVIEW_ORIGIN = 'https://table.example';
export const PREVIEW_T0 = Date.parse('2026-10-30T12:00:00.000Z');
function cookieOf(response: LightMyRequestResponse) {
  const raw = response.headers['set-cookie'];
  return (typeof raw === 'string' ? raw : (raw?.[0] ?? '')).split(';')[0] ?? '';
}

/** Real HTTP and domain engine, test-only private storage/provider ports. */
export async function workshopPreviewHarness(
  options: {
    readonly content?: CampaignPackage;
    readonly images?: (
      store: MemoryWorkshopStore,
      packages: MemoryCampaignRevisionRepository,
    ) => DraftImageDependencies;
  } = {},
) {
  const store = new MemoryWorkshopStore();
  const packages = new MemoryCampaignRevisionRepository(store);
  const images = options.images?.(store, packages);
  const events = new InMemoryEventStore();
  const engine = new WorldEngine({
    store: events,
    ids: new SequentialIds(),
    clock: new SteppingClock(),
  });
  const deps: WorkshopDependencies = {
    store,
    packages,
    ...(images ? { images } : {}),
    publicOrigin: PREVIEW_ORIGIN,
    clock: { now: () => PREVIEW_T0 },
    limits: new RequestLimits(SIGN_IN_LIMITS, () => PREVIEW_T0),
  };
  const app = buildApp({
    engine,
    authenticator: disabledAuthenticator,
    logger: createLogger({ service: 'preview-test', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: testAssets(),
    quests: [],
    workshop: deps,
  });
  await app.ready();
  const send = (
    url: string,
    cookie = '',
    extra: {
      readonly owner?: string;
      readonly method?: 'GET' | 'POST';
      readonly body?: object;
    } = {},
  ) =>
    app.inject({
      method: extra.method ?? 'GET',
      url,
      headers: {
        origin: PREVIEW_ORIGIN,
        cookie,
        ...(extra.owner ? { 'x-workshop-owner': extra.owner } : {}),
      },
      ...(extra.body ? { payload: extra.body } : {}),
    });
  const login = async () => {
    const ownerId = randomUUID();
    const invitation = await issueWorkshopInvitation(deps, {
      ownerId,
      hours: 24,
      authorizationSource: 'test:420',
    });
    const response = await send('/workshop/auth/redeem', '', {
      method: 'POST',
      body: { token: invitation.link.split('#')[1] },
    });
    if (response.statusCode !== 200) throw new Error('TEST_WORKSHOP_SIGN_IN_FAILED');
    return { ownerId, cookie: cookieOf(response) };
  };
  const owner = await login();
  const draftId = randomUUID();
  await store.createDraft(
    owner.ownerId,
    { requestId: randomUUID(), title: 'Bell', language: 'ru' },
    draftId,
    new Date(PREVIEW_T0).toISOString(),
  );
  const saved = await packages.append({
    ownerId: owner.ownerId,
    draftId,
    requestId: randomUUID(),
    basedOnRevision: 0,
    content: options.content ?? bellCampaign(),
    source: { kind: 'OWNER', actorId: owner.ownerId },
    createdAt: new Date(PREVIEW_T0).toISOString(),
  });
  if (saved.kind !== 'saved') throw new Error('TEST_CAMPAIGN_REVISION_FAILED');
  const revision: CampaignRevision = saved.revision;
  return {
    app,
    store,
    packages,
    images,
    engine,
    events,
    owner,
    draftId,
    revision,
    send,
    login,
    url: `/workshop/drafts/${draftId}`,
  };
}
