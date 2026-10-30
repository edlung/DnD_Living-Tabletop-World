import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashToken, newToken } from '../../auth/tokens.ts';
import { emptyCampaignPackage } from '../../testing/campaign-packages.ts';
import { createThrowawayDatabase } from '../../testing/throwaway-database.ts';
import { PostgresWorkshopStore } from '../postgres-store.ts';
import { PostgresCampaignRevisionRepository } from '../packages/postgres-store.ts';
import { issueWorkshopInvitation } from '../service.ts';
import { PostgresCampaignGenerationRepository } from './postgres-store.ts';
import type { GenerationJobScope, GenerationLease } from './store.ts';
import { generationJobView, generationStepProgress } from './views.ts';

const cleanup: (() => Promise<unknown>)[] = [];
let pool: pg.Pool;
let repository: PostgresCampaignGenerationRepository;
beforeEach(async () => {
  const database = await createThrowawayDatabase({ migrate: true });
  cleanup.push(() => database.drop());
  pool = new pg.Pool({ connectionString: database.url, max: 3 });
  const connections = pool;
  cleanup.push(() => connections.end());
  repository = new PostgresCampaignGenerationRepository(pool);
});
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function fixture() {
  const workshop = new PostgresWorkshopStore(pool);
  const ownerId = randomUUID(),
    draftId = randomUUID(),
    authSessionId = randomUUID();
  const at =
    (
      await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now')
    ).rows[0]?.now.toISOString() ?? '';
  const invite = await issueWorkshopInvitation(
    {
      store: workshop,
      publicOrigin: 'https://table.example',
      clock: { now: () => Date.parse(at) },
    },
    { ownerId, hours: 24, authorizationSource: 'test:410-progress' },
  );
  await workshop.redeem(
    hashToken(invite.link.split('#')[1] ?? ''),
    {
      sessionId: authSessionId,
      tokenHash: hashToken(newToken()),
      createdAt: at,
      expiresAt: new Date(Date.parse(at) + 86400000).toISOString(),
    },
    null,
  );
  await workshop.createDraft(
    ownerId,
    { requestId: randomUUID(), title: 'Progress', language: 'en' },
    draftId,
    at,
  );
  const seed = emptyCampaignPackage();
  seed.world.opening = 'DO_NOT_LOAD_SEED';
  const created = await repository.enqueue({
    ownerId,
    draftId,
    authSessionId,
    requestId: randomUUID(),
    basedOnRevision: 0,
    seed,
  });
  if (created.kind !== 'saved') throw new Error('TEST_ENQUEUE_FAILED');
  const scope = { ownerId, draftId, jobId: created.job.jobId };
  return { scope, seed };
}
async function expected(scope: GenerationJobScope) {
  const job = await repository.get(scope);
  if (!job) throw new Error('TEST_JOB_MISSING');
  const candidate = await repository.candidate(scope);
  return {
    job: generationJobView(job),
    brief: job.seed.brief,
    steps: (await repository.steps(scope)).map(generationStepProgress),
    candidate: candidate
      ? {
          contentDigest: candidate.contentDigest,
          baseRevision: candidate.baseRevision,
          createdAt: candidate.createdAt,
        }
      : null,
  };
}
async function complete(scope: GenerationJobScope, inspect = false) {
  const claimed = await repository.claim(scope, randomUUID());
  if (claimed.kind !== 'claimed') throw new Error('TEST_CLAIM_FAILED');
  const lease: GenerationLease = claimed.lease;
  let content = claimed.job.seed;
  for (let ordinal = 0; ordinal < 7; ordinal++) {
    await repository.prepareStep(lease, {
      ordinal,
      input: content,
      prompt: 'DO_NOT_LOAD_PROMPT',
      provider: 'test',
      model: 'offline',
      traceId: randomUUID(),
    });
    if (inspect) expect(await repository.progress(scope)).toEqual(await expected(scope));
    await repository.beginDispatch(lease, ordinal);
    if (inspect) expect(await repository.progress(scope)).toEqual(await expected(scope));
    content = { ...content, firstSession: [`DO_NOT_LOAD_OUTPUT_${ordinal}`] };
    await repository.completeStep(lease, ordinal, {
      content,
      providerRequestId: `response-${ordinal}`,
    });
    if (inspect) expect(await repository.progress(scope)).toEqual(await expected(scope));
  }
  await repository.finalize(lease);
}

describe('lightweight PostgreSQL preparation progress', () => {
  it('matches the full projection through every step state and candidate without private artifacts', async () => {
    const { scope } = await fixture();
    expect(await repository.progress(scope)).toEqual(await expected(scope));
    await complete(scope, true);
    const progress = await repository.progress(scope);
    expect(progress).toEqual(await expected(scope));
    expect(progress?.job).toMatchObject({
      status: 'SUCCEEDED',
      nextStep: 7,
      attachedRevision: 1,
      candidateAvailable: true,
    });
    expect(progress?.steps).toHaveLength(7);
    expect(progress?.candidate).not.toBeNull();
    expect(JSON.stringify(progress)).not.toContain('DO_NOT_LOAD');
    for (const step of progress?.steps ?? []) {
      expect(step).not.toHaveProperty('content');
      expect(step).not.toHaveProperty('input');
      expect(step).not.toHaveProperty('prompt');
    }
    expect(progress?.job).not.toHaveProperty('seed');
    expect(progress?.job).not.toHaveProperty('mode');
    expect(progress?.job).not.toHaveProperty('authSessionId');
    expect(progress?.candidate).not.toHaveProperty('content');
    expect(await repository.progress({ ...scope, ownerId: randomUUID() })).toBeNull();
    expect(await repository.progress({ ...scope, draftId: randomUUID() })).toBeNull();
    expect(await repository.progress({ ...scope, jobId: randomUUID() })).toBeNull();
  });
  it('reads only the brief and metadata even when full stored artifacts cannot be decoded', async () => {
    const { scope } = await fixture();
    await complete(scope);
    const before = await repository.progress(scope);
    const jobs = await repository.list(scope, 10);
    // Corrupt private body columns in this throwaway database. Light reads must not parse them.
    await pool.query(
      'ALTER TABLE ltw_campaign_generation_jobs DISABLE TRIGGER ltw_campaign_generation_control',
    );
    await pool.query(
      `UPDATE ltw_campaign_generation_jobs SET seed=jsonb_build_object('brief',seed->'brief','private_artifact','DO_NOT_LOAD')
      WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3`,
      [scope.ownerId, scope.draftId, scope.jobId],
    );
    await pool.query(
      'ALTER TABLE ltw_campaign_generation_jobs ENABLE TRIGGER ltw_campaign_generation_control',
    );
    for (const table of ['steps', 'results', 'candidates']) {
      await pool.query(
        `ALTER TABLE ltw_campaign_generation_${table} DISABLE TRIGGER ltw_generation_immutable`,
      );
      await pool.query(
        `UPDATE ltw_campaign_generation_${table} SET ${table === 'steps' ? 'input' : 'content'}='{}'::jsonb
        WHERE owner_id=$1 AND draft_id=$2 AND job_id=$3`,
        [scope.ownerId, scope.draftId, scope.jobId],
      );
      await pool.query(
        `ALTER TABLE ltw_campaign_generation_${table} ENABLE TRIGGER ltw_generation_immutable`,
      );
    }
    expect(await repository.progress(scope)).toEqual(before);
    expect(await repository.list(scope, 10)).toEqual(jobs);
    await expect(repository.get(scope)).rejects.toThrow('CAMPAIGN_GENERATION_STORAGE_UNAVAILABLE');
    await expect(repository.steps(scope)).rejects.toThrow(
      'CAMPAIGN_GENERATION_STORAGE_UNAVAILABLE',
    );
    await expect(repository.candidate(scope)).rejects.toThrow(
      'CAMPAIGN_GENERATION_STORAGE_UNAVAILABLE',
    );
    expect(
      await new PostgresCampaignRevisionRepository(pool).latest(scope.ownerId, scope.draftId),
    ).not.toBeNull();
  });
});
