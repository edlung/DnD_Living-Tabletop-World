import { randomUUID } from 'node:crypto';
import { devPersonaAuthenticator } from '../http/auth.ts';
import { buildLiveApp } from '../live/live-app.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import {
  acceptedActivation,
  activationMemoryFixture,
  executeActivation,
} from '../testing/activation-fixture.ts';
import { testAiGateway, testAuthoring, testDm } from '../testing/ravenford-app.ts';
import { InMemoryCredentialStore } from '../auth/credential-store.ts';
import { issueInvitation } from '../auth/sign-in.ts';
import { PublishedEventStore, CampaignUnpublishedError } from './published-event-store.ts';
import { activationSubmission } from '../workshop/activation/submission.ts';

const opened: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});
describe('ordinary campaign publication boundary', () => {
  it('cannot use an untracked ID to bypass the dedicated raw bootstrap path', async () => {
    const f = await activationMemoryFixture(),
      activation = await acceptedActivation(f.repository, {
        ...f.scope,
        authSessionId: f.authSessionId,
        request: f.request,
        frozen: f.frozen,
      });
    const untracked = randomUUID();
    await expect(
      f.ordinary.execute(activationSubmission({ ...activation, campaignId: untracked })),
    ).rejects.toBeInstanceOf(CampaignUnpublishedError);
    expect(await f.rawStore.loadStream(untracked)).toBeNull();
  });
  it('hides a fully appended provisioning stream from routes, assets, presence, live and invitations until verified publication', async () => {
    const f = await activationMemoryFixture(),
      activation = await acceptedActivation(f.repository, {
        ...f.scope,
        authSessionId: f.authSessionId,
        request: f.request,
        frozen: f.frozen,
      });
    const scope = { ...f.scope, activationId: activation.activationId },
      claim = await f.repository.claim(scope, randomUUID());
    if (!claim) throw new Error('TEST_CLAIM');
    await f.content.prepare(activation);
    await f.repository.phase(claim.lease, 'CONTENT_READY');
    const proof = await executeActivation(f.bootstrap, activation);
    await f.repository.phase(claim.lease, 'BOOTSTRAPPED');
    const { app } = buildLiveApp({
      engine: f.ordinary,
      authenticator: devPersonaAuthenticator({
        personas: [{ token: 'publication-owner-token', actorId: f.ownerId, description: 'owner' }],
      }),
      logger: createLogger({ service: 'publication-test', level: 'silent' }),
      ai: testAiGateway(),
      authoring: testAuthoring(),
      dm: testDm(),
      assets: { contents: f.contents },
      quests: f.frozen.quests,
    });
    opened.push(app);
    await app.ready();
    const base = `/campaigns/${activation.campaignId}`,
      headers = {
        authorization: 'Bearer publication-owner-token',
        origin: 'https://table.example',
      };
    for (const path of [
      '/session',
      '/entities?perspective=DM',
      '/knowledge?perspective=DM',
      '/quests?perspective=DM',
      '/assets',
      `/assets/content/sha256:${'0'.repeat(64)}?perspective=DM`,
      '/presence?perspective=DM',
      '/live?perspective=DM',
    ]) {
      const response = await app.inject({ method: 'GET', url: base + path, headers });
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain('event: ready');
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: base + '/commands',
          headers,
          payload: {
            commandId: 'blocked-weather',
            command: { type: 'SetWeather', weather: 'rain' },
          },
        })
      ).statusCode,
    ).toBe(404);
    const credentials = new InMemoryCredentialStore(),
      deps = {
        credentials,
        clock: { now: f.now },
        publicOrigin: 'https://table.example',
        publication: f.publication,
      };
    const intent = {
      campaignId: activation.campaignId,
      purpose: 'dm' as const,
      characterId: null,
      actorId: f.ownerId,
      createdBy: 'test',
      hours: 1,
    };
    await expect(issueInvitation(deps, intent)).rejects.toThrow('CAMPAIGN_UNPUBLISHED');
    expect(await credentials.listInvitations(activation.campaignId, 10)).toEqual([]);
    expect(await f.repository.publish(claim.lease, proof)).toBe(true);
    expect((await app.inject({ method: 'GET', url: base + '/session', headers })).statusCode).toBe(
      200,
    );
    expect((await issueInvitation(deps, intent)).link).toContain('/join#');
    expect((await f.content.get(activation.campaignId))?.quests).toEqual(f.frozen.quests);
  });
  it('does not cache an earlier UNTRACKED lookup and denies ordinary append while provisioning', async () => {
    const f = await activationMemoryFixture();
    let published = false;
    const store = new PublishedEventStore(f.rawStore, {
      state: () => Promise.resolve(published ? 'UNPUBLISHED' : 'UNTRACKED'),
    });
    expect(await store.loadStream('future')).toBeNull();
    published = true;
    const activation = await acceptedActivation(f.repository, {
      ...f.scope,
      authSessionId: f.authSessionId,
      request: f.request,
      frozen: f.frozen,
    });
    await executeActivation(f.bootstrap, activation);
    const command = (await f.bootstrap.commandLog(activation.campaignId))[0],
      snapshot = await f.bootstrap.load(activation.campaignId);
    if (!command || !snapshot) throw new Error('TEST_BOOTSTRAP');
    expect(await store.loadStream(activation.campaignId)).toBeNull();
    expect(await store.findCommand(command.commandId)).toBeNull();
    expect(await store.loadCommands(activation.campaignId)).toEqual([]);
    await expect(
      store.append({
        campaignId: activation.campaignId,
        expectedVersion: 0,
        command,
        events: snapshot.history,
      }),
    ).rejects.toBeInstanceOf(CampaignUnpublishedError);
    const failed = new PublishedEventStore(f.rawStore, {
      state: () => Promise.reject(new Error('unavailable')),
    });
    await expect(failed.loadStream(activation.campaignId)).rejects.toThrow('unavailable');
  });
});
