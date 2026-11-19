import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { PostgresCredentialStore } from '../auth/postgres-credential-store.ts';
import { loadCampaignLibrary } from '../campaigns/library.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { accountingDb } from '../testing/accounting.ts';
import { activationPgFixture } from '../testing/activation-fixture.ts';
import { CampaignActivationWorker } from '../workshop/activation/worker.ts';
import { startCampaignActivationLoop } from '../workshop/activation/worker-loop.ts';
import { libraryCreationIds, startLibraryCampaign } from './library-campaigns.ts';
import { hashPassword } from './passwords.ts';
import { PostgresAccountStore } from './postgres-account-store.ts';

/**
 * A library campaign the hub starts, on PostgreSQL (ADR 0058, notes of 2026-11-19): the workshop's
 * activation under an internal owner, the worker publishing it with its pictures, the account
 * seated as its DM once, and a repeated request continuing the same creation.
 */
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe('a library campaign from the hub on PostgreSQL', () => {
  it('starts the campaign, seats the account as DM once and replays the same creation', async () => {
    const db = await accountingDb();
    cleanup.push(() => db.close());
    const f = await activationPgFixture(db.pool);
    const library = await loadCampaignLibrary();
    const logger = createLogger({ service: 'hub-library-test', level: 'silent' });
    if (!f.deps.activation) throw new Error('TEST_SETUP');
    const worker = new CampaignActivationWorker({
      ...f.deps.activation,
      libraryPictures: { library, logger },
    });
    const stop = startCampaignActivationLoop(f.repository, worker, logger, 200);
    cleanup.push(async () => {
      await stop();
      await worker.shutdown();
    });
    const accounts = new PostgresAccountStore(db.pool);
    const credentials = new PostgresCredentialStore(db.pool);
    const accountId = randomUUID();
    const now = new Date().toISOString();
    await accounts.createAccount({
      accountId,
      login: 'hub-dm',
      passwordHash: await hashPassword('a long enough phrase'),
      displayName: 'Hub DM',
      createdAt: now,
      passwordChangedAt: now,
    });
    const deps = {
      engine: f.ordinary,
      workshop: f.deps,
      library,
      accounts,
      credentials,
      clock: { now: Date.now },
      waitMs: 150_000,
      pollMs: 200,
    };
    const entry = library.entries.find((e) => e.id === 'rain-check');
    if (!entry) throw new Error('TEST_LIBRARY');
    const input = {
      accountId,
      requestId: randomUUID(),
      libraryId: entry.id,
      variantId: entry.defaultVariant,
    };

    const first = await startLibraryCampaign(deps, input);
    if (first.kind !== 'entered') throw new Error(`TEST_NOT_ENTERED:${JSON.stringify(first)}`);
    const seats = await accounts.seats(accountId);
    expect(seats).toHaveLength(1);
    expect(seats[0]).toMatchObject({ campaignId: first.campaignId, role: 'dm' });
    const state = (await f.ordinary.load(first.campaignId))?.state;
    expect(state?.campaign?.dmActorId).toBe(seats[0]?.actorId);

    // The same request again: the same campaign, the same seat, a fresh DM session.
    const again = await startLibraryCampaign(deps, input);
    if (again.kind !== 'entered') throw new Error('TEST_REPLAY');
    expect(again.campaignId).toBe(first.campaignId);
    expect(again.sessionToken).not.toBe(first.sessionToken);
    expect(await accounts.seats(accountId)).toHaveLength(1);

    // The internal owner keeps no live workshop session: nothing can act as it afterwards.
    const { scope } = libraryCreationIds(accountId, input);
    const live = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ltw_workshop_sessions
       WHERE owner_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [scope.ownerId],
    );
    expect(live.rows[0]?.n).toBe(0);
    // No paid work was ever queued for it.
    const jobs = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM ltw_campaign_generation_jobs WHERE owner_id = $1',
      [scope.ownerId],
    );
    expect(jobs.rows[0]?.n).toBe(0);

    // A variant the library does not have is not found.
    expect(
      await startLibraryCampaign(deps, { ...input, requestId: randomUUID(), variantId: 'nope' }),
    ).toEqual({ kind: 'not-found' });
  }, 300_000);

  it('begins every variant of every library campaign', async () => {
    const db = await accountingDb();
    cleanup.push(() => db.close());
    const f = await activationPgFixture(db.pool);
    const library = await loadCampaignLibrary();
    const accounts = new PostgresAccountStore(db.pool);
    const deps = {
      engine: f.ordinary,
      workshop: f.deps,
      library,
      accounts,
      credentials: new PostgresCredentialStore(db.pool),
      clock: { now: Date.now },
      waitMs: 0,
    };
    const refused: string[] = [];
    for (const entry of library.entries)
      for (const variant of entry.variants) {
        const result = await startLibraryCampaign(deps, {
          accountId: randomUUID(),
          requestId: randomUUID(),
          libraryId: entry.id,
          variantId: variant.id,
        });
        if (result.kind !== 'preparing')
          refused.push(`${entry.id}/${variant.id}: ${JSON.stringify(result)}`);
      }
    expect(refused).toEqual([]);
    expect(library.entries.length).toBeGreaterThanOrEqual(15);
  }, 600_000);
});
