import type { QuestDefinition, QuestListResponse } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../http/app.ts';
import { devPersonaAuthenticator } from '../http/auth.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { acceptedActivation, activationMemoryFixture } from '../testing/activation-fixture.ts';
import { testAiGateway, testAuthoring, testDm, testAssets } from '../testing/ravenford-app.ts';
import { CampaignActivationWorker } from '../workshop/activation/worker.ts';
import type { CampaignQuestBooks } from './quest-books.ts';
import { createCampaignQuestBooks } from './quest-books.ts';

const opened: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});
function appFor(
  engine: WorldEngine,
  ownerId: string,
  quests: readonly QuestDefinition[],
  books?: CampaignQuestBooks,
) {
  const app = buildApp({
    engine,
    authenticator: devPersonaAuthenticator({
      personas: [
        { token: 'quest-owner-token', actorId: ownerId, description: 'test owner' },
        { token: 'quest-outsider-token', actorId: 'outsider-440', description: 'outsider' },
      ],
    }),
    logger: createLogger({ service: 'quest-books-route-test', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: testAssets(),
    quests,
    ...(books ? { campaignQuests: books } : {}),
  });
  opened.push(app);
  return app;
}
async function published() {
  const f = await activationMemoryFixture(),
    record = await acceptedActivation(f.repository, {
      ...f.scope,
      authSessionId: f.authSessionId,
      request: f.request,
      frozen: f.frozen,
    });
  if (!f.deps.activation) throw new Error('TEST_DEPS');
  const worker = new CampaignActivationWorker(f.deps.activation);
  await worker.run({ ...f.scope, activationId: record.activationId });
  await worker.shutdown();
  expect((await f.repository.status(f.scope))?.status).toBe('PUBLISHED');
  const decoy = record.frozen.quests.map((quest) => ({
    ...quest,
    title: 'GLOBAL_BOOK_MUST_NOT_APPEAR',
  }));
  return { ...f, record, decoy };
}

describe('per-campaign quest route boundary', () => {
  it('reads the confirmed campaign book and keeps party/public/outsider projections separate', async () => {
    const f = await published(),
      adapter = createCampaignQuestBooks(f.content),
      get = vi.spyOn(adapter, 'get'),
      app = appFor(f.ordinary, f.ownerId, f.decoy, adapter);
    const response = await app.inject({
      method: 'GET',
      url: `/campaigns/${f.record.campaignId}/quests?perspective=DM`,
      headers: { authorization: 'Bearer quest-owner-token' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<QuestListResponse>().quests.map((quest) => quest.title)).toEqual(
      f.record.frozen.quests.map((quest) => quest.title),
    );
    expect(get).toHaveBeenCalledWith(f.record.campaignId, f.record.frozen.questDigest);
    expect(response.body).not.toContain('GLOBAL_BOOK_MUST_NOT_APPEAR');
    const publicResponse = await app.inject({
      method: 'GET',
      url: `/campaigns/${f.record.campaignId}/quests?perspective=PUBLIC`,
      headers: { authorization: 'Bearer quest-owner-token' },
    });
    expect(publicResponse.json<QuestListResponse>().quests).toEqual([]);
    const outsider = await app.inject({
      method: 'GET',
      url: `/campaigns/${f.record.campaignId}/quests?perspective=DM`,
      headers: { authorization: 'Bearer quest-outsider-token' },
    });
    expect(outsider.statusCode).toBe(404);
    expect(outsider.body).not.toContain(f.record.frozen.quests[0]?.title ?? 'IMPOSSIBLE_TITLE');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it.each(['absent', 'missing', 'corrupt', 'storage-error'] as const)(
    'fails closed for %s campaign definitions without falling back to the global fixture',
    async (failure) => {
      const f = await published(),
        stored = await f.content.get(f.record.campaignId);
      if (!stored) throw new Error('TEST_CONTENT');
      const quests = structuredClone(stored.quests);
      const quest = quests[0];
      if (!quest) throw new Error('TEST_QUEST');
      quest.title = 'CORRUPTED_BOOK_SECRET';
      const books =
        failure === 'absent'
          ? undefined
          : createCampaignQuestBooks({
              prepare: () => Promise.resolve(),
              get: () =>
                failure === 'storage-error'
                  ? Promise.reject(new Error('TEST_PRIVATE_STORAGE_DETAIL'))
                  : Promise.resolve(failure === 'missing' ? null : { ...stored, quests }),
            });
      const app = appFor(f.ordinary, f.ownerId, f.decoy, books),
        response = await app.inject({
          method: 'GET',
          url: `/campaigns/${f.record.campaignId}/quests?perspective=DM`,
          headers: { authorization: 'Bearer quest-owner-token' },
        });
      expect(response.statusCode).toBe(500);
      for (const marker of [
        'GLOBAL_BOOK_MUST_NOT_APPEAR',
        'CORRUPTED_BOOK_SECRET',
        'TEST_PRIVATE_STORAGE_DETAIL',
      ])
        expect(response.body).not.toContain(marker);
    },
  );
});
