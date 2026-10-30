import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  acceptedActivation,
  activationMemoryFixture,
  executeActivation,
} from '../../testing/activation-fixture.ts';
import { imageDigest } from '../images/manifest.ts';

describe('durable memory activation reference', () => {
  it('accepts one frozen owner intent, replays before changed head and rejects changed nonce intent', async () => {
    const f = await activationMemoryFixture(),
      input = { ...f.scope, authSessionId: f.authSessionId, request: f.request, frozen: f.frozen };
    const [a, b] = await Promise.all([f.repository.begin(input), f.repository.begin(input)]);
    expect(a).toEqual(b);
    if (a.kind !== 'saved') throw new Error('TEST_ACCEPT');
    const edit = structuredClone(f.revision.content);
    edit.world.opening += ' Changed after confirmation.';
    await f.revisions.append({
      ...f.scope,
      requestId: randomUUID(),
      basedOnRevision: 1,
      content: edit,
      source: { kind: 'OWNER', actorId: f.ownerId },
      createdAt: new Date(f.now()).toISOString(),
    });
    expect(await f.repository.begin(input)).toEqual(a);
    expect(
      await f.repository.begin({ ...input, request: { ...f.request, textOnly: false } }),
    ).toEqual({ kind: 'conflict', reason: 'REQUEST_REUSED' });
    expect(
      await f.repository.begin({ ...input, request: { ...f.request, requestId: randomUUID() } }),
    ).toEqual({ kind: 'conflict', reason: 'ALREADY_ACTIVATED' });
    expect((await f.repository.byRequest(f.scope, f.request.requestId))?.campaignId).toBe(
      a.activation.campaignId,
    );
    expect(
      await f.repository.byRequest({ ...f.scope, ownerId: randomUUID() }, f.request.requestId),
    ).toBeNull();
    expect((await f.repository.get(f.scope))?.frozen.revision.revision).toBe(1);
    expect(await f.repository.status(f.scope)).not.toHaveProperty('frozen');
  });
  it('continues accepted intent after session revocation, fences old workers and verifies actual proof before publication', async () => {
    const f = await activationMemoryFixture(),
      activation = await acceptedActivation(f.repository, {
        ...f.scope,
        authSessionId: f.authSessionId,
        request: f.request,
        frozen: f.frozen,
      });
    const scope = { ...f.scope, activationId: activation.activationId },
      first = await f.repository.claim(scope, randomUUID());
    if (!first) throw new Error('TEST_CLAIM');
    await f.workshop.revokeOwner(
      f.ownerId,
      new Date(f.now()).toISOString(),
      'test:440-after-confirmation',
    );
    expect(await f.repository.renew(first.lease)).toBe(true);
    f.advance(30001);
    const second = await f.repository.claim(scope, randomUUID());
    if (!second) throw new Error('TEST_RECOVER');
    expect(await f.repository.phase(first.lease, 'BOOTSTRAPPED')).toBe(false);
    expect(
      await f.repository.publish(second.lease, { fingerprint: 'not-a-command', version: 1 }),
    ).toBe(false);
    await f.content.prepare(activation);
    await f.repository.phase(second.lease, 'CONTENT_READY');
    const proof = await executeActivation(f.bootstrap, activation);
    await f.repository.phase(second.lease, 'BOOTSTRAPPED');
    expect(await f.ordinary.load(activation.campaignId)).toBeNull();
    expect(await f.repository.publish(first.lease, proof)).toBe(false);
    expect(await f.repository.publish(second.lease, proof)).toBe(true);
    expect(
      (await f.ordinary.load(activation.campaignId))?.state.bootstrap?.source.activationId,
    ).toBe(activation.activationId);
    expect(await f.repository.retry(scope, f.authSessionId)).toEqual({
      kind: 'conflict',
      reason: 'STALE_REVIEW',
    });
    expect(await f.repository.owned(f.ownerId, 1)).toHaveLength(1);
    expect(await f.repository.ownedActivation(randomUUID(), activation.activationId)).toBeNull();
  });
  it('refuses invalid acknowledgements and stale review without reserving an activation', async () => {
    const f = await activationMemoryFixture(),
      input = { ...f.scope, authSessionId: f.authSessionId, request: f.request, frozen: f.frozen };
    expect(
      await f.repository.begin({
        ...input,
        request: { ...f.request, acknowledgedFindingIds: [imageDigest({ unknown: true })] },
      }),
    ).toEqual({ kind: 'conflict', reason: 'ACKNOWLEDGEMENTS' });
    expect(
      await f.repository.begin({
        ...input,
        request: { ...f.request, reviewDigest: imageDigest({ stale: true }) },
      }),
    ).toEqual({ kind: 'conflict', reason: 'STALE_REVIEW' });
    expect(await f.repository.get(f.scope)).toBeNull();
    expect(await f.repository.pending(10)).toEqual([]);
  });
});
