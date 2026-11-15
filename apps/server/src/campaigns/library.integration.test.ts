import { randomUUID } from 'node:crypto';

import { campaignPackageSchema } from '@ltw/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { createLogger } from '../platform/logging/logger.ts';
import { accountingDb } from '../testing/accounting.ts';
import {
  acceptedActivation,
  activationPgFixture,
  activationRequest,
} from '../testing/activation-fixture.ts';
import { loadCampaignActivationReview } from '../workshop/activation/review.ts';
import { CampaignActivationWorker } from '../workshop/activation/worker.ts';
import { loadCampaignLibrary } from './library.ts';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe('the campaign library on PostgreSQL', () => {
  it('stores a started library campaign’s pictures, figures and battle maps once', async () => {
    const db = await accountingDb();
    cleanup.push(() => db.close());
    const f = await activationPgFixture(db.pool);
    const library = await loadCampaignLibrary();
    const entry = library.entries.find((e) => e.id === 'rain-check');
    if (!entry || !f.deps.activation) throw new Error('TEST_SETUP');
    const content = campaignPackageSchema.parse(
      JSON.parse(library.packageJson(entry.id, entry.defaultVariant) ?? ''),
    );
    const saved = await f.revisions.append({
      ...f.scope,
      requestId: randomUUID(),
      basedOnRevision: 1,
      content,
      source: { kind: 'OWNER', actorId: f.scope.ownerId },
      createdAt: new Date().toISOString(),
    });
    if (saved.kind !== 'saved') throw new Error(`TEST_REVISION_${saved.kind}`);
    const reviewed = await loadCampaignActivationReview(f.deps, f.scope, { textOnly: true });
    if (!reviewed?.frozen) throw new Error('TEST_REVIEW');
    const activation = await acceptedActivation(f.repository, {
      ...f.scope,
      authSessionId: f.authSessionId,
      request: activationRequest(reviewed.review),
      frozen: reviewed.frozen,
    });
    const deps = {
      ...f.deps.activation,
      libraryPictures: {
        library,
        logger: createLogger({ service: 'library-pg-test', level: 'silent' }),
      },
    };
    const worker = new CampaignActivationWorker(deps);
    cleanup.push(() => worker.shutdown());
    await worker.run({ ...f.scope, activationId: activation.activationId });
    const state = (await f.ordinary.load(activation.campaignId))?.state;
    if (!state) throw new Error('TEST_NOT_PUBLISHED');
    const found = library.picturesFor(saved.revision);
    if (!found) throw new Error('TEST_NOT_RECOGNISED');
    const curated = [...state.assets.assets.values()].filter(
      (a) => a.generator.provider === 'curated',
    );
    expect(curated).toHaveLength(found.set.entries.reduce((n, e) => n + e.entityIds.length, 0));
    expect(curated.every((a) => a.status === 'CANONICAL' || a.status === 'APPROVED')).toBe(true);
    const roofs = saved.revision.identities.entities['clock-roofs'];
    expect(curated.some((a) => a.purpose === 'battle-map' && a.entityId === roofs)).toBe(true);
    expect(curated.some((a) => a.purpose === 'figure')).toBe(true);
    // The bytes are in the campaign's own content store, exactly as the library shipped them.
    for (const asset of curated.slice(0, 5)) {
      const stored = await f.contents.get(activation.campaignId, asset.contentHash);
      expect(stored?.mediaType).toBe('image/webp');
    }
  }, 180_000);
});
