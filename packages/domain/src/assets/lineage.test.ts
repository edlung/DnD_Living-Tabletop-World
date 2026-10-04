import { describe, expect, it } from 'vitest';

import { ASHEN_CIRCLE, DM, PLAYER } from '../authoring/testing/world.ts';
import type { WorldState } from '../kernel/state.ts';
import { assetIdFor } from './records.ts';
import { WORKER, assetWorld, codeOf, hash } from './testing/world.ts';

/**
 * Asset identity and lineage (docs/adr/0022-asset-identity.md; owner
 * decision of 2026-10-04: a generated image is a candidate until the DM
 * approves it; variants derive from the approved reference; a replacement
 * needs a new approval, and the old one stays in the lineage).
 */
const MIRA = 'mira-vale';
const ORIN = 'orin-stonebeard';

/** Everything but the asset lineage and the bookkeeping of commands. */
const BOOKKEEPING = new Set(['assets', 'version', 'commands']);
const worldFacts = (state: WorldState) =>
  Object.fromEntries(Object.entries(state).filter(([key]) => !BOOKKEEPING.has(key)));

describe('the lineage of one entity', () => {
  it('keeps a generated image a candidate until the DM approves it as the canonical reference', async () => {
    const world = await assetWorld();
    const requestId = await world.request(MIRA);
    const state = await world.state();
    expect(state.assets.requests.get(requestId)).toMatchObject({
      entityId: MIRA,
      variant: 'reference',
      audience: 'players',
      source: { kind: 'dm' },
      cancelled: false,
    });

    expect(codeOf(await world.start(requestId))).toBe('accepted');
    expect((await world.state()).assets.jobs.get(requestId)?.status).toBe('STARTED');
    expect(codeOf(await world.complete(requestId, 1))).toBe('accepted');
    const assetId = assetIdFor(requestId);
    expect((await world.state()).assets.assets.get(assetId)).toMatchObject({
      entityId: MIRA,
      version: 1,
      contentHash: hash(1),
      status: 'CANDIDATE',
    });
    expect((await world.state()).assets.canonical.has(MIRA)).toBe(false);

    expect(codeOf(await world.approve(assetId))).toBe('accepted');
    const approved = await world.state();
    expect(approved.assets.assets.get(assetId)?.status).toBe('CANONICAL');
    expect(approved.assets.canonical.get(MIRA)).toBe(assetId);
    await world.verified();
  });

  it('versions replacements, needs a new approval, and keeps the replaced reference', async () => {
    const world = await assetWorld();
    const first = await world.approved(MIRA, 1);
    const requestId = await world.request(MIRA);
    await world.start(requestId);
    await world.complete(requestId, 2);
    const second = assetIdFor(requestId);

    let state = await world.state();
    expect(state.assets.assets.get(second)).toMatchObject({ version: 2, status: 'CANDIDATE' });
    expect(state.assets.canonical.get(MIRA)).toBe(first);

    await world.approve(second);
    state = await world.state();
    expect(state.assets.canonical.get(MIRA)).toBe(second);
    expect(state.assets.assets.get(first)?.status).toBe('SUPERSEDED');
    expect(state.assets.assets.get(first)?.contentHash).toBe(hash(1));
    await world.verified();
  });

  it('derives variants from the approved reference only, each label versioned on its own', async () => {
    const world = await assetWorld();
    expect(
      codeOf(
        await world.as(DM, {
          type: 'RequestAsset',
          entityId: MIRA,
          variant: 'derived',
          label: 'night',
        }),
      ),
    ).toBe('INVALID_ASSET');
    expect(
      codeOf(
        await world.as(DM, {
          type: 'RequestAsset',
          entityId: MIRA,
          variant: 'reference',
          label: 'x',
        }),
      ),
    ).toBe('INVALID_ASSET');

    const reference = await world.approved(MIRA, 1);
    expect(
      codeOf(await world.as(DM, { type: 'RequestAsset', entityId: MIRA, variant: 'derived' })),
    ).toBe('INVALID_ASSET');
    const night = await world.approved(MIRA, 2, { variant: 'derived', label: 'night' });
    const night2 = await world.approved(MIRA, 3, { variant: 'derived', label: 'night' });
    const wounded = await world.approved(MIRA, 4, { variant: 'derived', label: 'wounded' });

    const state = await world.state();
    expect(state.assets.assets.get(night)).toMatchObject({
      derivedFrom: reference,
      version: 1,
      status: 'APPROVED',
    });
    expect(state.assets.assets.get(night2)).toMatchObject({ version: 2, status: 'APPROVED' });
    expect(state.assets.assets.get(wounded)).toMatchObject({ version: 1, label: 'wounded' });
    // Approving a variant never changes the canonical reference.
    expect(state.assets.canonical.get(MIRA)).toBe(reference);
    await world.verified();
  });

  it('records failures, cancellations, and retractions without losing lineage', async () => {
    const world = await assetWorld();
    const failing = await world.request(MIRA);
    await world.start(failing);
    expect(codeOf(await world.fail(failing))).toBe('accepted');
    expect(codeOf(await world.complete(failing, 1))).toBe('INVALID_ASSET');
    expect((await world.state()).assets.jobs.get(failing)).toMatchObject({
      status: 'FAILED',
      failure: 'PROVIDER_ERROR',
    });

    const queued = await world.request(MIRA);
    expect(codeOf(await world.cancel(queued))).toBe('accepted');
    expect(codeOf(await world.start(queued))).toBe('INVALID_ASSET');

    const running = await world.request(MIRA);
    await world.start(running);
    expect(codeOf(await world.cancel(running))).toBe('accepted');
    expect(codeOf(await world.complete(running, 2))).toBe('accepted');
    const discarded = assetIdFor(running);
    expect((await world.state()).assets.assets.get(discarded)?.status).toBe('DISCARDED');
    expect(codeOf(await world.approve(discarded))).toBe('INVALID_ASSET');

    const canonical = await world.approved(MIRA, 3);
    expect(codeOf(await world.retract(canonical))).toBe('accepted');
    const state = await world.state();
    expect(state.assets.assets.get(canonical)?.status).toBe('RETRACTED');
    expect(state.assets.canonical.has(MIRA)).toBe(false);
    expect(codeOf(await world.retract(canonical))).toBe('INVALID_ASSET');
    await world.verified();
  });
});

describe('identity across entities', () => {
  it('keeps every entity its own lineage, versions, and canonical reference', async () => {
    const world = await assetWorld();
    const mira = await world.approved(MIRA, 1);
    const orin = await world.approved(ORIN, 1);
    const ashen = await world.approved(ASHEN_CIRCLE, 2);
    const mira2Request = await world.request(MIRA);
    await world.start(mira2Request);
    await world.complete(mira2Request, 2);
    await world.approve(assetIdFor(mira2Request));

    const state = await world.state();
    // The same bytes for two entities are still two assets, each its entity's own.
    expect(state.assets.assets.get(orin)).toMatchObject({
      entityId: ORIN,
      version: 1,
      contentHash: hash(1),
    });
    expect(state.assets.assets.get(mira)).toMatchObject({ entityId: MIRA, version: 1 });
    expect(state.assets.assets.get(assetIdFor(mira2Request))).toMatchObject({
      entityId: MIRA,
      version: 2,
    });
    expect(state.assets.canonical.get(ORIN)).toBe(orin);
    expect(state.assets.canonical.get(ASHEN_CIRCLE)).toBe(ashen);
    expect(state.assets.canonical.get(MIRA)).toBe(assetIdFor(mira2Request));
    expect(state.assets.assets.get(orin)?.status).toBe('CANONICAL');

    // A variant of one entity cannot derive from another's reference.
    const orinNight = await world.approved(ORIN, 3, { variant: 'derived', label: 'night' });
    expect((await world.state()).assets.assets.get(orinNight)?.derivedFrom).toBe(orin);
    await world.verified();
  });

  it('refuses requests for entities that do not exist', async () => {
    const world = await assetWorld();
    expect(
      codeOf(
        await world.as(DM, { type: 'RequestAsset', entityId: 'nobody', variant: 'reference' }),
      ),
    ).toBe('ENTITY_NOT_FOUND');
  });
});

describe('assets are never world facts (invariant 14)', () => {
  it('leaves every world fact and the clock as they were', async () => {
    const world = await assetWorld();
    const before = await world.state();
    const reference = await world.approved(MIRA, 1);
    await world.approved(MIRA, 2, { variant: 'derived', label: 'night' });
    const failing = await world.request(ORIN);
    await world.start(failing);
    await world.fail(failing);
    await world.retract(reference);
    const after = await world.state();
    expect(worldFacts(after)).toEqual(worldFacts(before));
    expect(after.clock).toBe(before.clock);
  });
});

describe('who may issue asset commands', () => {
  it('lets only the DM or a system process request, and only the worker report jobs', async () => {
    const world = await assetWorld();
    expect(
      codeOf(
        await world.as(PLAYER, { type: 'RequestAsset', entityId: MIRA, variant: 'reference' }),
      ),
    ).toBe('FORBIDDEN');
    const requestId = await world.request(MIRA);
    expect(codeOf(await world.as(PLAYER, { type: 'CancelAssetRequest', requestId }))).toBe(
      'FORBIDDEN',
    );

    // The DM can never claim external work happened.
    expect(codeOf(await world.as(DM, { type: 'StartAssetJob', requestId }))).toBe('FORBIDDEN');
    expect(codeOf(await world.start(requestId))).toBe('accepted');
    for (const command of [
      { type: 'FailAssetJob', requestId, reason: 'REFUSED' },
      {
        type: 'CompleteAssetJob',
        requestId,
        contentHash: hash(1),
        mediaType: 'image/svg+xml',
        generator: { provider: 'local', model: 'm' },
      },
    ]) {
      expect(codeOf(await world.as(DM, command))).toBe('FORBIDDEN');
      expect(codeOf(await world.as(PLAYER, command))).toBe('FORBIDDEN');
    }
    await world.complete(requestId, 1);
    expect(
      codeOf(await world.as(PLAYER, { type: 'ApproveAsset', assetId: assetIdFor(requestId) })),
    ).toBe('FORBIDDEN');
    expect(
      codeOf(
        await world.as(WORKER, { type: 'RequestAsset', entityId: ORIN, variant: 'reference' }),
      ),
    ).toBe('accepted');
  });
});
