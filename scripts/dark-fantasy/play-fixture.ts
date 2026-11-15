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
import { buildPackage } from './package.ts';
import type { Source } from './source.ts';

/** Actual package storage, frozen consent and activation in memory; no live accounts or DB. */
type FixtureStorage = Awaited<ReturnType<typeof activationMemoryFixture>>;
interface CollectionPlayFixture {
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
export async function collectionPlayFixture(
  source: Source,
  size = 7,
): Promise<CollectionPlayFixture> {
  const f = await activationMemoryFixture();
  const saved = await f.revisions.append({
    ...f.scope,
    requestId: randomUUID(),
    basedOnRevision: 1,
    content: buildPackage(source, size),
    source: { kind: 'OWNER', actorId: f.ownerId },
    createdAt: new Date(f.now()).toISOString(),
  });
  if (saved.kind !== 'saved') throw new Error(`Collection revision: ${saved.kind}`);
  const reviewed = await loadCampaignActivationReview(f.deps, f.scope, { textOnly: true });
  if (!reviewed?.frozen) throw new Error('Collection activation review missing');
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
  if (!snapshot?.state.campaign) throw new Error('Collection campaign not published');
  const dm = { actorId: snapshot.state.campaign.dmActorId, kind: 'user' as const };
  const app = buildApp({
    engine,
    authenticator: devPersonaAuthenticator({
      personas: [
        { token: 'collection-test-dm', actorId: dm.actorId, description: 'isolated DM' },
        {
          token: 'collection-test-player',
          actorId: 'collection-player',
          description: 'isolated player',
        },
        {
          token: 'collection-test-outsider',
          actorId: 'collection-outsider',
          description: 'outsider',
        },
      ],
    }),
    logger: createLogger({ service: 'collection-play-test', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: { contents: f.contents },
    quests: [],
    campaignEncounters: createCampaignEncounterBooks(f.content),
  });
  const assignment = await engine.execute({
    campaignId,
    commandId: 'collection.assign',
    actor: dm,
    command: {
      type: 'AssignCharacter',
      characterId: saved.revision.identities.entities[source.cast.heroes[0]?.key ?? ''],
      playerActorId: 'collection-player',
    },
  });
  if (assignment.status === 'rejected') throw new Error('Collection player assignment failed');
  await app.ready();
  const id = (key: string) => {
    const value = saved.revision.identities.entities[key];
    if (!value) throw new Error(`Missing collection key ${key}`);
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
    send: (path: string, body?: object, token = 'collection-test-dm') =>
      app.inject({
        method: body ? 'POST' : 'GET',
        url: `/campaigns/${campaignId}${path}`,
        headers: { authorization: `Bearer ${token}` },
        ...(body ? { payload: body } : {}),
      }),
  };
}
