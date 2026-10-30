import { randomUUID } from 'node:crypto';

import type { CampaignPackage, CampaignRevisionReview } from '@ltw/contracts';
import { InMemoryEventStore, SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import { RequestLimits, SIGN_IN_LIMITS } from '../auth/limits.ts';
import { buildApp } from '../http/app.ts';
import { disabledAuthenticator } from '../http/auth.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { registerCampaignRevisionControlRoutes } from '../workshop/revisions/routes.ts';
import { issueWorkshopInvitation, type WorkshopDependencies } from '../workshop/service.ts';
import { editFixture } from './generation/edit-fixture.ts';
import { MemoryCampaignRevisionControlRepository } from './revision-controls.ts';
import { testAiGateway, testAssets, testAuthoring, testDm } from './ravenford-app.ts';

export const REVISION_ORIGIN = 'https://table.example';
export async function revisionHttpFixture() {
  const f = await editFixture();
  const controls = new MemoryCampaignRevisionControlRepository(
    f.workshop,
    f.revisions,
    f.images,
    [f.repository, f.edit],
    f.now,
  );
  const readers = {
    locksWithinDraftLock: controls.locksWithinDraftLock.bind(controls),
    manifest: f.images.snapshotManifest.bind(f.images),
  };
  f.edit.configureControls(readers);
  f.repository.configureControls(readers);
  const events = new InMemoryEventStore(),
    engine = new WorldEngine({
      store: events,
      ids: new SequentialIds(),
      clock: new SteppingClock(),
    });
  const deps: WorkshopDependencies = {
    store: f.workshop,
    packages: f.revisions,
    revisionControls: controls,
    edits: { repository: f.edit, preparation: f.preparation },
    generation: { repository: f.repository, preparation: f.preparation },
    images: {
      repository: f.images,
      runtime: {
        availability: () =>
          Promise.resolve({ available: false, provider: null, model: null, reason: 'NO_ROUTE' }),
        prepare: () => Promise.resolve({ status: 'UNAVAILABLE', reason: 'NO_ROUTE' }),
        forJob: () => Promise.resolve(null),
      },
    },
    publicOrigin: REVISION_ORIGIN,
    clock: { now: f.now },
    limits: new RequestLimits({ ...SIGN_IN_LIMITS, expensivePerMinute: 100 }, f.now),
  };
  const app = buildApp({
    engine,
    authenticator: disabledAuthenticator,
    logger: createLogger({ service: 'revision-test', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: testAssets(),
    quests: [],
    workshop: deps,
  });
  if (!app.hasRoute({ method: 'GET', url: '/workshop/drafts/:draftId/editing' }))
    registerCampaignRevisionControlRoutes(app, deps);
  await app.ready();
  const url = `/workshop/drafts/${f.draftId}`;
  const send = (
    method: 'GET' | 'POST',
    path: string,
    payload?: object,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url: path,
      headers: {
        origin: REVISION_ORIGIN,
        cookie: `ltw_workshop=${f.token}`,
        'x-workshop-owner': f.ownerId,
        ...headers,
      },
      ...(payload ? { payload } : {}),
    });
  const complete = async (after: CampaignPackage = structuredClone(f.content)) => {
    const scope = await f.enqueue(),
      claim = await f.edit.claim(scope, randomUUID());
    if (claim.kind !== 'claimed') throw new Error('TEST_EDIT_LEASE');
    const prepared = await f.edit.prepareStep(claim.lease, {
      ordinal: 0,
      input: f.content,
      prompt: 'test private edit',
      provider: 'test',
      model: 'offline',
      traceId: randomUUID(),
    });
    if (prepared.kind !== 'prepared') throw new Error('TEST_EDIT_PREPARE');
    if ((await f.edit.beginDispatch(claim.lease, 0)).kind !== 'dispatch')
      throw new Error('TEST_EDIT_DISPATCH');
    if (
      (await f.edit.completeStep(claim.lease, 0, { content: after, providerRequestId: null }))
        .kind !== 'stored'
    )
      throw new Error('TEST_EDIT_RESULT');
    if ((await f.edit.finalize(claim.lease)).kind !== 'candidate')
      throw new Error('TEST_EDIT_CANDIDATE');
    return scope;
  };
  const loginOther = async () => {
    const ownerId = randomUUID(),
      invitation = await issueWorkshopInvitation(deps, {
        ownerId,
        hours: 24,
        authorizationSource: 'test:430-other',
      });
    const response = await send(
      'POST',
      '/workshop/auth/redeem',
      { token: invitation.link.split('#')[1] },
      { cookie: '', 'x-workshop-owner': ownerId },
    );
    const raw = response.headers['set-cookie'];
    const cookie = (typeof raw === 'string' ? raw : (raw?.[0] ?? '')).split(';')[0] ?? '';
    if (response.statusCode !== 200 || cookie === '') throw new Error('TEST_OTHER_SESSION');
    return { ownerId, cookie };
  };
  return { ...f, controls, app, url, send, complete, loginOther, events };
}
export function reviewedWrite(review: CampaignRevisionReview) {
  return {
    requestId: randomUUID(),
    basedOnRevision: review.before.revision,
    packageDigest: review.before.digest,
    expectedLockVersion: review.locks.version,
    manifestVersion: review.manifest.version,
    manifestDigest: review.manifest.digest,
    reviewDigest: review.reviewDigest,
  };
}
