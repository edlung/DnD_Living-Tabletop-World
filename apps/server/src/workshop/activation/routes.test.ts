import { randomUUID } from 'node:crypto';

import { campaignActivationReviewSchema } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { RequestLimits, SIGN_IN_LIMITS } from '../../auth/limits.ts';
import { hashToken, newToken } from '../../auth/tokens.ts';
import { buildApp } from '../../http/app.ts';
import { disabledAuthenticator } from '../../http/auth.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { activationMemoryFixture, activationRequest } from '../../testing/activation-fixture.ts';
import { finishImage, imageRequestFor } from '../../testing/draft-image-fixture.ts';
import { testAiGateway, testAuthoring, testDm } from '../../testing/ravenford-app.ts';
import { imageDigest } from '../images/manifest.ts';

const ORIGIN = 'https://table.example';
const opened: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});
async function setup() {
  const f = await activationMemoryFixture();
  const app = buildApp({
    engine: f.ordinary,
    authenticator: disabledAuthenticator,
    logger: createLogger({ service: 'activation-http-test', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: { contents: f.contents },
    quests: [],
    workshop: {
      ...f.deps,
      limits: new RequestLimits({ ...SIGN_IN_LIMITS, expensivePerMinute: 100 }, f.now),
    },
  });
  opened.push(app);
  await app.ready();
  const url = `/workshop/drafts/${f.draftId}/activation`;
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
  const review = async (query = '?textOnly=true') => {
    const response = await send('GET', `${url}-review${query}`);
    expect(response.statusCode).toBe(200);
    return campaignActivationReviewSchema.parse(response.json<unknown>());
  };
  const choose = async () => {
    const made = await finishImage(
      f.images,
      imageRequestFor(f.revision, f.scope, f.authSessionId),
      57,
    );
    expect(
      (
        await f.images.select({
          ...f.scope,
          authSessionId: f.authSessionId,
          requestId: randomUUID(),
          revision: 1,
          packageDigest: f.revision.digest,
          expectedManifestVersion: 0,
          entityId: made.candidate.entityId,
          purpose: 'image',
          variant: 'reference',
          label: null,
          candidateId: made.candidate.candidateId,
        })
      ).kind,
    ).toBe('saved');
  };
  const append = async () => {
    const content = structuredClone(f.revision.content);
    content.world.opening += ' A later owner correction.';
    const result = await f.revisions.append({
      ...f.scope,
      requestId: randomUUID(),
      basedOnRevision: 1,
      content,
      source: { kind: 'OWNER', actorId: f.ownerId },
      createdAt: new Date(f.now()).toISOString(),
    });
    expect(result.kind).toBe('saved');
  };
  return { ...f, app, url, send, review, choose, append };
}

describe('owner activation review and explicit HTTP confirmation', () => {
  it('offers honest picture status, requires explicit text-only mode and acknowledges the exact warnings', async () => {
    const f = await setup(),
      empty = await f.review('');
    expect(empty.confirmable).toBe(false);
    expect(empty.visuals).toMatchObject({ current: 0, adopted: 0, requiresTextOnly: true });
    expect(
      empty.findings.some((finding) => finding.code === 'ACTIVATION_NO_CURRENT_PICTURES'),
    ).toBe(true);
    expect((await f.send('POST', f.url, activationRequest(empty))).statusCode).toBe(409);
    await f.choose();
    const chosen = await f.review(''),
      text = await f.review();
    expect(chosen.confirmable).toBe(true);
    expect(chosen.visuals.adopted).toBe(1);
    expect(text.confirmable).toBe(true);
    expect(text.visuals).toMatchObject({ selected: 1, adopted: 0 });
    expect(
      text.findings.some(
        (finding) => finding.code === 'ACTIVATION_TEXT_ONLY' && finding.severity === 'warning',
      ),
    ).toBe(true);
    expect(text.reviewDigest).not.toBe(chosen.reviewDigest);
    const input = activationRequest(text);
    const missing = await f.send('POST', f.url, { ...input, acknowledgedFindingIds: [] });
    expect(missing.statusCode).toBe(409);
    expect(missing.json<unknown>()).toEqual({ conflict: { reason: 'ACKNOWLEDGEMENTS' } });
    const extra = await f.send('POST', f.url, {
      ...input,
      acknowledgedFindingIds: [...input.acknowledgedFindingIds, imageDigest('unknown-warning')],
    });
    expect(extra.json<unknown>()).toEqual({ conflict: { reason: 'ACKNOWLEDGEMENTS' } });
    const accepted = await f.send('POST', f.url, input);
    expect(accepted.statusCode).toBe(200);
    expect(
      await f.bootstrap.commandLog(
        accepted.json<{ activation: { campaignId: string } }>().activation.campaignId,
      ),
    ).toEqual([]);
    expect((await f.repository.get(f.scope))?.frozen.assets).toEqual([]);
    expect(text).not.toHaveProperty('content');
    expect(text).not.toHaveProperty('identities');
    expect(text).not.toHaveProperty('frozen');
  });

  it('replays an accepted nonce before fresh-head checks and refuses changed intent without starting the worker', async () => {
    const f = await setup(),
      input = activationRequest(await f.review());
    const accepted = await f.send('POST', f.url, input);
    expect(accepted.statusCode).toBe(200);
    const initial = accepted.json<unknown>();
    await f.append();
    expect((await f.send('POST', f.url, input)).json<unknown>()).toEqual(initial);
    expect((await f.send('POST', f.url, { ...input, textOnly: false })).json<unknown>()).toEqual({
      conflict: { reason: 'REQUEST_REUSED' },
    });
    expect(
      (await f.send('POST', f.url, { ...input, requestId: randomUUID() })).json<unknown>(),
    ).toEqual({ conflict: { reason: 'ALREADY_ACTIVATED' } });
    const stored = await f.repository.get(f.scope);
    if (!stored) throw new Error('TEST_ACTIVATION');
    expect(stored.frozen.revision.revision).toBe(1);
    expect(await f.bootstrap.commandLog(stored.campaignId)).toEqual([]);
    expect(await f.ordinary.load(stored.campaignId)).toBeNull();
    expect((await f.send('GET')).json<{ activation: object }>().activation).not.toHaveProperty(
      'frozen',
    );
  });

  it.each(['revision', 'locks', 'manifest'] as const)(
    'rejects a %s race after review with no accepted intent',
    async (changed) => {
      const f = await setup(),
        review = await f.review(),
        input = activationRequest(review);
      if (changed === 'revision') await f.append();
      else if (changed === 'manifest') await f.choose();
      else
        expect(
          (
            await f.controls.replaceLocks({
              ...f.scope,
              authSessionId: f.authSessionId,
              requestId: randomUUID(),
              revision: 1,
              packageDigest: f.revision.digest,
              expectedLockVersion: 0,
              manifestVersion: review.manifestVersion,
              manifestDigest: review.manifestDigest,
              targets: [],
            })
          ).kind,
        ).toBe('saved');
      const response = await f.send('POST', f.url, input);
      expect(response.statusCode).toBe(409);
      expect(response.json<unknown>()).toEqual({
        conflict: {
          reason:
            changed === 'revision'
              ? 'STALE_REVISION'
              : changed === 'locks'
                ? 'STALE_LOCKS'
                : 'STALE_MANIFEST',
        },
      });
      expect(await f.repository.get(f.scope)).toBeNull();
    },
  );

  it('keeps historical review readable but requires restoration before activation', async () => {
    const f = await setup();
    await f.append();
    const historical = await f.review('?revision=1&textOnly=true');
    expect(historical.readiness).toBe('READY');
    expect(historical.confirmable).toBe(false);
    expect(
      historical.findings.some((finding) => finding.code === 'ACTIVATION_HISTORICAL_REVISION'),
    ).toBe(true);
    const response = await f.send('POST', f.url, activationRequest(historical));
    expect(response.statusCode).toBe(409);
    expect(await f.repository.get(f.scope)).toBeNull();
    expect((await f.review()).revision).toBe(2);
  });

  it('reauthorizes every owner request and hides both status and review from a different owner', async () => {
    const f = await setup(),
      ownerId = randomUUID(),
      token = newToken(),
      invitation = newToken(),
      at = new Date(f.now()).toISOString(),
      expiresAt = new Date(f.now() + 86400000).toISOString();
    await f.workshop.issueInvitation({
      ownerId,
      invitationId: randomUUID(),
      tokenHash: hashToken(invitation),
      createdAt: at,
      expiresAt,
      authorizationSource: 'test:440-other-owner',
    });
    await f.workshop.redeem(
      hashToken(invitation),
      { sessionId: randomUUID(), tokenHash: hashToken(token), createdAt: at, expiresAt },
      null,
    );
    const other = { cookie: `ltw_workshop=${token}`, 'x-workshop-owner': ownerId };
    for (const suffix of ['', '-review?textOnly=true'])
      expect((await f.send('GET', `${f.url}${suffix}`, undefined, other)).statusCode).toBe(404);
    expect((await f.send('POST', f.url, f.request, other)).statusCode).toBe(404);
    expect(
      (await f.send('POST', f.url, { ...f.request, content: f.revision.content })).statusCode,
    ).toBe(400);
    await f.workshop.revokeOwner(f.ownerId, at, 'test:440-http-revoke');
    expect((await f.send('GET', `${f.url}-review?textOnly=true`)).statusCode).toBe(401);
    expect((await f.send('POST', f.url, f.request)).statusCode).toBe(401);
    expect(await f.repository.get(f.scope)).toBeNull();
  });
});
