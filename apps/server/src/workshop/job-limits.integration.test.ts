import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashToken, newToken } from '../auth/tokens.ts';
import { emptyCampaignPackage } from '../testing/campaign-packages.ts';
import { createThrowawayDatabase } from '../testing/throwaway-database.ts';
import { PostgresCampaignGenerationRepository } from './generation/postgres-store.ts';
import type { EnqueueGeneration, EnqueueMutation } from './generation/store.ts';
import { WORKSHOP_JOB_LIMITS } from './job-limits.ts';
import { PostgresWorkshopStore } from './postgres-store.ts';
import { issueWorkshopInvitation } from './service.ts';

/**
 * Gate 07, G07-01: an owner's paid jobs are bounded inside the enqueue transaction (one active
 * generation or edit per draft, two per owner) and the serial worker serves owners in turn.
 */
const cleanup: (() => Promise<unknown>)[] = [];
let pool: pg.Pool;
let repository: PostgresCampaignGenerationRepository;
let workshop: PostgresWorkshopStore;
let now: string;
beforeEach(async () => {
  const database = await createThrowawayDatabase({ migrate: true });
  cleanup.push(() => database.drop());
  pool = new pg.Pool({ connectionString: database.url, max: 6 });
  const connections = pool;
  cleanup.push(() => connections.end());
  repository = new PostgresCampaignGenerationRepository(pool);
  workshop = new PostgresWorkshopStore(pool);
  now = new Date().toISOString();
});
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function owner() {
  const ownerId = randomUUID(),
    authSessionId = randomUUID();
  const invite = await issueWorkshopInvitation(
    {
      store: workshop,
      publicOrigin: 'https://table.example',
      clock: { now: () => Date.parse(now) },
    },
    { ownerId, hours: 24, authorizationSource: 'test:gate-07' },
  );
  await workshop.redeem(
    hashToken(invite.link.split('#')[1] ?? ''),
    {
      sessionId: authSessionId,
      tokenHash: hashToken(newToken()),
      createdAt: now,
      expiresAt: new Date(Date.parse(now) + 86400000).toISOString(),
    },
    null,
  );
  return async (): Promise<EnqueueGeneration> => {
    const draftId = randomUUID();
    await workshop.createDraft(
      ownerId,
      { requestId: randomUUID(), title: 'Bell', language: 'ru' },
      draftId,
      now,
    );
    return {
      ownerId,
      draftId,
      authSessionId,
      requestId: randomUUID(),
      basedOnRevision: 0,
      seed: emptyCampaignPackage(),
    };
  };
}
const kinds = (results: readonly EnqueueMutation[]) => results.map((result) => result.kind).sort();
const saved = (result: EnqueueMutation) => {
  if (result.kind !== 'saved') throw new Error(`expected saved: ${result.kind}`);
  return result.job;
};

describe('bounded paid workshop jobs', () => {
  it('admits one active generation per draft even when thirty requests race', async () => {
    const input = await (await owner())();
    const results = await Promise.all(
      Array.from({ length: 30 }, () => repository.enqueue({ ...input, requestId: randomUUID() })),
    );
    expect(kinds(results)).toEqual([...Array<string>(29).fill('busy'), 'saved']);
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM ltw_campaign_generation_jobs')).rows[0],
    ).toEqual({ n: WORKSHOP_JOB_LIMITS.textPerDraft });
  });

  it('bounds an owner across drafts, leaves other owners alone and frees a place when a job ends', async () => {
    const draft = await owner();
    const first = await draft(),
      second = await draft(),
      third = await draft();
    const running = saved(await repository.enqueue(first));
    saved(await repository.enqueue(second));
    expect((await repository.enqueue(third)).kind).toBe('busy');
    saved(await repository.enqueue(await (await owner())()));
    await repository.cancel({ ...first, jobId: running.jobId });
    saved(await repository.enqueue({ ...third, requestId: randomUUID() }));
    // A refused request was not recorded: the same request ID is free for a later attempt.
    expect((await repository.requestById(third, third.requestId))?.status).toBeUndefined();
  });

  it('serves owners in turn: each one oldest job first, then each one next', async () => {
    const draft = await owner();
    const a1 = saved(await repository.enqueue(await draft()));
    const a2 = saved(await repository.enqueue(await draft()));
    const b1 = saved(await repository.enqueue(await (await owner())()));
    expect((await repository.pending(8)).map((job) => job.jobId)).toEqual([
      a1.jobId,
      b1.jobId,
      a2.jobId,
    ]);
  });
});
