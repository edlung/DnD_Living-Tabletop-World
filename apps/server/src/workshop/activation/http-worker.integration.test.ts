import { randomUUID } from 'node:crypto';

import { campaignActivationReviewSchema, campaignActivationAnswerSchema } from '@ltw/contracts';
import { checkWorldIntegrity, replay } from '@ltw/domain';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { contentHashOf } from '../../assets/content-store.ts';
import { buildApp } from '../../http/app.ts';
import { disabledAuthenticator } from '../../http/auth.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { accountingDb } from '../../testing/accounting.ts';
import { activationPgFixture, activationRequest } from '../../testing/activation-fixture.ts';
import { testAiGateway, testAuthoring, testDm } from '../../testing/ravenford-app.ts';
import { createRawWorldEngine, createWorldEngine } from '../../world-engine/runtime.ts';
import { issueWorkshopInvitation } from '../service.ts';
import { PostgresCampaignActivationRepository } from './postgres-store.ts';
import { CampaignActivationWorker } from './worker.ts';

const ORIGIN = 'https://table.example';
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});
const cookieOf = (response: LightMyRequestResponse) => {
  const raw = response.headers['set-cookie'];
  return (typeof raw === 'string' ? raw : (raw?.[0] ?? '')).split(';')[0] ?? '';
};
async function http(f: Awaited<ReturnType<typeof activationPgFixture>>) {
  const app: FastifyInstance = buildApp({
    engine: f.ordinary,
    authenticator: disabledAuthenticator,
    logger: createLogger({ service: 'activation-http-pg-test', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: { contents: f.contents },
    quests: [],
    workshop: f.deps,
  });
  cleanup.push(() => app.close());
  await app.ready();
  const invitation = await issueWorkshopInvitation(f.deps, {
    ownerId: f.scope.ownerId,
    hours: 1,
    authorizationSource: 'test:440-confirmed-http',
  });
  const token = invitation.link.split('#')[1];
  if (!token) throw new Error('TEST_INVITATION');
  const redeemed = await app.inject({
    method: 'POST',
    url: '/workshop/auth/redeem',
    headers: { origin: ORIGIN },
    payload: { token },
  });
  expect(redeemed.statusCode).toBe(200);
  const cookie = cookieOf(redeemed),
    url = `/workshop/drafts/${f.scope.draftId}/activation`;
  const send = (method: 'GET' | 'POST', path = url, payload?: object) =>
    app.inject({
      method,
      url: path,
      headers: { origin: ORIGIN, cookie, 'x-workshop-owner': f.scope.ownerId },
      ...(payload ? { payload } : {}),
    });
  return { app, url, send };
}

describe('PostgreSQL HTTP confirmation and actual activation recovery', () => {
  it('recovers a committed bootstrap after lost ACK, publishes exact chosen bytes and never executes another command', async () => {
    const db = await accountingDb();
    cleanup.push(() => db.close());
    const f = await activationPgFixture(db.pool, true),
      server = await http(f);
    const response = await server.send('GET', `${server.url}-review`);
    expect(response.statusCode).toBe(200);
    const review = campaignActivationReviewSchema.parse(response.json<unknown>());
    expect(review.confirmable).toBe(true);
    expect(review.visuals.adopted).toBe(1);
    const request = activationRequest(review),
      accepted = await server.send('POST', server.url, request);
    expect(accepted.statusCode).toBe(200);
    const activation = campaignActivationAnswerSchema.parse(accepted.json<unknown>()).activation;
    if (!activation) throw new Error('TEST_ACTIVATION');
    const scope = { ...f.scope, activationId: activation.activationId },
      record = await f.repository.get(scope);
    if (!record || !f.deps.activation) throw new Error('TEST_ACCEPTED_RECORD');
    expect(await f.ordinary.load(activation.campaignId)).toBeNull();
    expect(await f.bootstrap.commandLog(activation.campaignId)).toEqual([]);
    const actual = f.bootstrap.execute.bind(f.bootstrap),
      execute = vi.spyOn(f.bootstrap, 'execute');
    execute.mockImplementationOnce(async (submission) => {
      await actual(submission);
      throw new Error('TEST_COMMITTED_BOOTSTRAP_ACK_LOST');
    });
    const first = new CampaignActivationWorker(f.deps.activation);
    cleanup.push(() => first.shutdown());
    await first.run(scope);
    expect(await f.repository.status(scope)).toMatchObject({
      status: 'PROVISIONING',
      failureCode: 'ACTIVATION_UNAVAILABLE',
      retryable: true,
    });
    expect(await f.bootstrap.commandLog(activation.campaignId)).toHaveLength(1);
    expect(await f.ordinary.load(activation.campaignId)).toBeNull();
    expect(await f.repository.owned(f.scope.ownerId, 10)).toEqual([]);
    const changed = structuredClone(f.revision.content);
    changed.world.opening += ' This later draft does not replace accepted intent.';
    expect(
      (
        await f.revisions.append({
          ...f.scope,
          requestId: randomUUID(),
          basedOnRevision: 1,
          content: changed,
          source: { kind: 'OWNER', actorId: f.scope.ownerId },
          createdAt: new Date().toISOString(),
        })
      ).kind,
    ).toBe('saved');
    const replayed = await server.send('POST', server.url, request);
    expect(replayed.statusCode).toBe(200);
    expect(
      campaignActivationAnswerSchema.parse(replayed.json<unknown>()).activation?.campaignId,
    ).toBe(activation.campaignId);
    expect(
      (await server.send('POST', `${server.url}/${activation.activationId}/retry`, {})).statusCode,
    ).toBe(200);
    const restartedRepository = new PostgresCampaignActivationRepository(db.pool2()),
      restartedRaw = createRawWorldEngine(db.pool2()),
      repeatExecute = vi.spyOn(restartedRaw, 'execute');
    const restarted = new CampaignActivationWorker({
      ...f.deps.activation,
      repository: restartedRepository,
      bootstrap: restartedRaw,
    });
    cleanup.push(() => restarted.shutdown());
    await restarted.run(scope);
    expect(repeatExecute).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await restartedRepository.status(scope)).toMatchObject({
      status: 'PUBLISHED',
      failureCode: null,
    });
    const ordinary = createWorldEngine(db.pool2(), f.publication),
      snapshot = await ordinary.load(activation.campaignId);
    if (!snapshot) throw new Error('TEST_PUBLISHED_STATE');
    expect(snapshot.state.bootstrap?.source.revision).toBe(1);
    expect(snapshot.history.at(-1)?.type).toBe('CampaignBootstrapped');
    expect(
      snapshot.history.every(
        (event) =>
          event.causation.commandId === record.bootstrapCommandId &&
          event.causation.actor.actorId === f.scope.ownerId &&
          event.causation.actor.kind === 'user',
      ),
    ).toBe(true);
    expect(snapshot.state.roster.size).toBe(0);
    expect(snapshot.state.assets.jobs.size).toBe(0);
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    expect(replay(snapshot.history)).toEqual(snapshot.state);
    const asset = record.frozen.assets[0];
    if (!asset) throw new Error('TEST_ADOPTED_ASSET');
    const original = await f.images.content(f.scope, asset.contentHash),
      copied = await f.contents.get(activation.campaignId, asset.contentHash);
    expect(copied).toEqual(original);
    expect(copied && contentHashOf(copied.bytes)).toBe(asset.contentHash);
    expect([...snapshot.state.assets.assets.values()][0]?.origin).toEqual(asset.origin);
    expect(await f.content.get(activation.campaignId)).toMatchObject({
      scenario: record.frozen.revision,
      quests: record.frozen.quests,
    });
    await restarted.run(scope);
    expect(await restartedRaw.commandLog(activation.campaignId)).toHaveLength(1);
    expect(await restartedRepository.owned(f.scope.ownerId, 10)).toHaveLength(1);
    const counts = (
      await db.pool.query<{ commands: number; content: number; ai: number; charges: number }>(
        `SELECT (SELECT count(*)::int FROM ltw_commands) commands,(SELECT count(*)::int FROM ltw_campaign_initial_content) content,(SELECT count(*)::int FROM ltw_ai_requests) ai,(SELECT count(*)::int FROM ltw_image_charges) charges`,
      )
    ).rows[0];
    expect(counts).toEqual({ commands: 1, content: 1, ai: 0, charges: 0 });
  });
});
