import { randomUUID } from 'node:crypto';

import type { CampaignRevision } from '../../packages/contracts/src/index.ts';
import { createCombatEngine } from '../../packages/combat/src/index.ts';
import { WorldEngine, SequentialIds, SteppingClock } from '../../packages/domain/src/index.ts';
import { buildApp } from '../../apps/server/src/http/app.ts';
import { devPersonaAuthenticator } from '../../apps/server/src/http/auth.ts';
import { createCampaignEncounterBooks } from '../../apps/server/src/campaigns/encounter-books.ts';
import { PublishedEventStore } from '../../apps/server/src/campaigns/published-event-store.ts';
import { createLogger } from '../../apps/server/src/platform/logging/logger.ts';
import {
  acceptedActivation,
  activationMemoryFixture,
  activationRequest,
} from '../../apps/server/src/testing/activation-fixture.ts';
import {
  testAiGateway,
  testAuthoring,
  testDm,
} from '../../apps/server/src/testing/ravenford-app.ts';
import { loadCampaignActivationReview } from '../../apps/server/src/workshop/activation/review.ts';
import { CampaignActivationWorker } from '../../apps/server/src/workshop/activation/worker.ts';
import { buildLighthousePackage } from './package.ts';

/** Actual package storage, frozen consent and activation in memory; no live accounts or DB. */
type FixtureStorage = Awaited<ReturnType<typeof activationMemoryFixture>>;
interface LighthousePlayFixture {
  readonly app: ReturnType<typeof buildApp>;
  readonly engine: WorldEngine;
  readonly campaignId: string;
  readonly dm: { actorId: string; kind: 'user' };
  readonly id: (key: string) => string;
  readonly saved: CampaignRevision;
  readonly snapshot: NonNullable<Awaited<ReturnType<WorldEngine['load']>>>;
  readonly content: FixtureStorage['content'];
  readonly contents: FixtureStorage['contents'];
  readonly send: (
    path: string,
    body?: object,
    token?: string,
  ) => Promise<{ statusCode: number; body: string; json: () => unknown }>;
}
export async function lighthousePlayFixture(): Promise<LighthousePlayFixture> {
  const f = await activationMemoryFixture();
  const saved = await f.revisions.append({
    ...f.scope,
    requestId: randomUUID(),
    basedOnRevision: 1,
    content: buildLighthousePackage(),
    source: { kind: 'OWNER', actorId: f.ownerId },
    createdAt: new Date(f.now()).toISOString(),
  });
  if (saved.kind !== 'saved') throw new Error(`Family revision: ${saved.kind}`);
  const reviewed = await loadCampaignActivationReview(f.deps, f.scope, { textOnly: true });
  if (!reviewed?.frozen) throw new Error('Family activation review missing');
  const activation = await acceptedActivation(f.repository, {
    ...f.scope,
    authSessionId: f.authSessionId,
    request: activationRequest(reviewed.review),
    frozen: reviewed.frozen,
  });
  const worker = new CampaignActivationWorker({
    repository: f.repository,
    bootstrap: f.bootstrap,
    initialContent: f.content,
    contents: f.contents,
    draftImages: f.images,
  });
  await worker.run({ ...f.scope, activationId: activation.activationId });
  await worker.shutdown();
  const campaignId = activation.campaignId;
  const engine = new WorldEngine({
    store: new PublishedEventStore(f.rawStore, f.publication),
    ids: new SequentialIds(0x9900),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
    entropy: { next: () => 2 ** 31 },
  });
  const snapshot = await engine.load(campaignId);
  if (!snapshot?.state.campaign) throw new Error('Family campaign not published');
  const dm = { actorId: snapshot.state.campaign.dmActorId, kind: 'user' as const };
  const app = buildApp({
    engine,
    authenticator: devPersonaAuthenticator({
      personas: [
        { token: 'family-test-dm', actorId: dm.actorId, description: 'isolated DM' },
        { token: 'family-test-player', actorId: 'family-player', description: 'isolated player' },
        { token: 'family-test-outsider', actorId: 'family-outsider', description: 'outsider' },
      ],
    }),
    logger: createLogger({ service: 'family-play-test', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: { contents: f.contents },
    quests: [],
    campaignEncounters: createCampaignEncounterBooks(f.content),
  });
  const assignment = await engine.execute({
    campaignId,
    commandId: 'family.assign',
    actor: dm,
    command: {
      type: 'AssignCharacter',
      characterId: saved.revision.identities.entities['finn'],
      playerActorId: 'family-player',
    },
  });
  if (assignment.status === 'rejected') throw new Error('Family player assignment failed');
  await app.ready();
  const id = (key: string) => {
    const value = saved.revision.identities.entities[key];
    if (!value) throw new Error(`Missing family key ${key}`);
    return value;
  };
  return {
    content: f.content,
    contents: f.contents,
    app,
    engine,
    campaignId,
    dm,
    id,
    saved: saved.revision,
    snapshot,
    send: (path: string, body?: object, token = 'family-test-dm') =>
      app.inject({
        method: body ? 'POST' : 'GET',
        url: `/campaigns/${campaignId}${path}`,
        headers: { authorization: `Bearer ${token}` },
        ...(body ? { payload: body } : {}),
      }),
  };
}
