import { randomUUID } from 'node:crypto';

import type {
  CampaignDraftImagesView,
  CampaignPreviewEntityView,
  CampaignPreviewView,
  CampaignRevisionView,
  DraftImageJob,
  DraftVisualManifest,
} from '@ltw/contracts';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { setMonetaryPolicy } from '../../ai/accounting/monetary-policy.ts';
import { PostgresAssetContentStore } from '../../assets/postgres-content-store.ts';
import { contentHashOf } from '../../assets/content-store.ts';
import { RequestLimits, SIGN_IN_LIMITS } from '../../auth/limits.ts';
import { buildApp } from '../../http/app.ts';
import { disabledAuthenticator } from '../../http/auth.ts';
import { createDraftImageRuntime } from '../../images/draft-runtime.ts';
import { setImageCeiling } from '../../images/ledger.ts';
import { NO_STYLE_REFERENCES } from '../../images/style-references.ts';
import { Secret } from '../../platform/config/config.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { TEST_AUTH, accountingDb, type AccountingDb } from '../../testing/accounting.ts';
import { fakeFetch, jsonResponse } from '../../testing/fake-fetch.ts';
import { englishBellCampaign } from '../../testing/generation/bell-english.ts';
import { answer, dataUrl, picture } from '../../testing/image-provider.ts';
import { testAiGateway, testAuthoring, testDm } from '../../testing/ravenford-app.ts';
import { createWorldEngine } from '../../world-engine/runtime.ts';
import { PostgresWorkshopStore } from '../postgres-store.ts';
import { PostgresCampaignRevisionRepository } from '../packages/postgres-store.ts';
import { issueWorkshopInvitation, type WorkshopDependencies } from '../service.ts';
import { PostgresDraftImageRepository } from './postgres-store.ts';
import { DraftImageWorker } from './worker.ts';

const ORIGIN = 'https://table.example';
let db: AccountingDb | undefined;
let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  await db?.close();
});
const cookieOf = (response: LightMyRequestResponse) => {
  const raw = response.headers['set-cookie'];
  return (typeof raw === 'string' ? raw : (raw?.[0] ?? '')).split(';')[0] ?? '';
};

describe('actual private image HTTP generation pipeline', () => {
  it('generates through an admitted workshop claim, selects explicitly and exposes exact bytes only through the character projection', async () => {
    const database = await accountingDb();
    db = database;
    const store = new PostgresWorkshopStore(database.pool);
    const revisions = new PostgresCampaignRevisionRepository(database.pool);
    const images = new PostgresDraftImageRepository(database.pool);
    const observer = database.pool2();
    const png = await picture(24, 24);
    let jobId: string | null = null;
    const transport = fakeFetch(async () => {
      if (!jobId) throw new Error('IMAGE_JOB_NOT_ALLOCATED');
      const row = (
        await observer.query<{
          campaign_id: string | null;
          workshop_job_id: string;
          charge_id: string;
          fence: string;
          request_digest: string;
          provider: string;
          model: string;
        }>(
          `SELECT c.campaign_id,c.workshop_job_id::text,c.charge_id::text,d.fence::text,d.request_digest,c.provider,c.model
         FROM ltw_workshop_image_dispatches d JOIN ltw_image_charges c ON c.charge_id=d.charge_id
         WHERE d.job_id=$1`,
          [jobId],
        )
      ).rows[0];
      expect(row).toMatchObject({
        campaign_id: null,
        workshop_job_id: jobId,
        provider: 'openrouter-openai',
        model: 'openai/gpt-5.4-image-2',
      });
      expect(row?.charge_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row?.fence).toBe('1');
      expect(row?.request_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      return jsonResponse(answer(dataUrl(png), { usage: { cost: 0.012345 } }));
    });
    const logger = createLogger({ service: 'image-http-pipeline-test', level: 'silent' });
    const runtime = createDraftImageRuntime({
      pool: database.pool,
      contents: images,
      logger,
      config: {
        assets: {
          workerIntervalMs: 0,
          generationTimeoutMs: 5000,
          generator: {
            kind: 'openrouter-openai',
            apiKey: new Secret('TEST_ONLY_FAKE_IMAGE_KEY'),
            model: 'openai/gpt-5.4-image-2',
          },
        },
      },
      styleReferences: NO_STYLE_REFERENCES,
      fetch: transport.fetchImpl,
    });
    const workshop: WorkshopDependencies = {
      store,
      packages: revisions,
      images: { repository: images, runtime },
      publicOrigin: ORIGIN,
      clock: { now: Date.now },
      limits: new RequestLimits(SIGN_IN_LIMITS, Date.now),
    };
    const server = buildApp({
      engine: createWorldEngine(database.pool),
      authenticator: disabledAuthenticator,
      logger,
      ai: testAiGateway(),
      authoring: testAuthoring(),
      dm: testDm(),
      assets: { contents: new PostgresAssetContentStore(database.pool) },
      quests: [],
      workshop,
    });
    app = server;
    await server.ready();
    const ownerId = randomUUID();
    const invitation = await issueWorkshopInvitation(workshop, {
      ownerId,
      hours: 1,
      authorizationSource: 'test:420-http',
    });
    const token = invitation.link.split('#')[1];
    if (!token) throw new Error('TEST_INVITATION_MISSING');
    const redeemed = await server.inject({
      method: 'POST',
      url: '/workshop/auth/redeem',
      headers: { origin: ORIGIN },
      payload: { token },
    });
    expect(redeemed.statusCode).toBe(200);
    const cookie = cookieOf(redeemed);
    const send = (method: 'GET' | 'POST', url: string, payload?: object) =>
      server.inject({
        method,
        url,
        headers: { origin: ORIGIN, cookie, 'x-workshop-owner': ownerId },
        ...(payload ? { payload } : {}),
      });
    const created = await send('POST', '/workshop/drafts', {
      requestId: randomUUID(),
      title: 'Independent Bell',
      language: 'en',
    });
    expect(created.statusCode).toBe(200);
    const draftId = created.json<{ draftId: string }>().draftId;
    const base = `/workshop/drafts/${draftId}`;
    const saved = await send('POST', `${base}/revisions`, {
      requestId: randomUUID(),
      basedOnRevision: 0,
      content: englishBellCampaign(),
    });
    expect(saved.statusCode).toBe(200);
    const view = saved.json<CampaignRevisionView>();
    expect(view.assessment.readiness).toBe('READY');
    const revision = view.revision;
    if (!revision) throw new Error('TEST_REVISION_MISSING');
    const ardenId = revision.identities.entities['arden'],
      alenaId = revision.identities.entities['alena'];
    if (!ardenId || !alenaId) throw new Error('TEST_SUBJECT_MISSING');
    expect(
      (
        await observer.query(
          'SELECT version,entries FROM ltw_workshop_visual_manifests WHERE draft_id=$1 AND revision=1',
          [draftId],
        )
      ).rows,
    ).toEqual([{ version: 0, entries: [] }]);
    await setImageCeiling(database.pool, 0n, TEST_AUTH);
    await setMonetaryPolicy(database.pool, {
      scope: 'images',
      mode: 'UNLIMITED',
      authorization: TEST_AUTH,
    });
    const initial = await send('GET', `${base}/images?revision=1&entityId=${ardenId}`);
    expect(initial.statusCode).toBe(200);
    expect(initial.json<CampaignDraftImagesView>()).toMatchObject({
      manifest: { version: 0, entries: [] },
      availability: { available: true, reason: 'READY' },
      candidates: [],
    });
    const request = {
      requestId: randomUUID(),
      revision: 1,
      packageDigest: revision.digest,
      expectedManifestVersion: 0,
      entityId: ardenId,
      purpose: 'image',
      variant: 'reference',
      label: null,
      note: 'Soft winter side light.',
    };
    const queued = await send('POST', `${base}/images/jobs`, request);
    expect(queued.statusCode).toBe(200);
    const job = queued.json<{ job: DraftImageJob }>().job;
    jobId = job.jobId;
    expect(job.status).toBe('QUEUED');
    const worker = new DraftImageWorker({ repository: images, runtime });
    await worker.run({ ownerId, draftId, jobId });
    const finished = await send('GET', `${base}/images?revision=1&entityId=${ardenId}`);
    expect(finished.statusCode).toBe(200);
    const result = finished.json<CampaignDraftImagesView>();
    expect(result.jobs[0]?.status).toBe('SUCCEEDED');
    expect(result.manifest.entries).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    if (!candidate) throw new Error('TEST_CANDIDATE_MISSING');
    expect(candidate).toMatchObject({
      provider: 'openrouter-openai',
      model: 'openai/gpt-5.4-image-2',
      mediaType: 'image/webp',
    });
    const scope = `revision=1&perspective=CHARACTER&characterId=${alenaId}`;
    const preview = await send('GET', `${base}/preview?${scope}`);
    expect(preview.statusCode).toBe(200);
    expect(
      preview.json<CampaignPreviewView>().directory.some((entry) => entry.entityId === ardenId),
    ).toBe(true);
    const bytesUrl = `${base}/preview/content/${candidate.contentHash}?${scope}`;
    expect((await send('GET', bytesUrl)).statusCode).toBe(404);
    const privateBytes = await send(
      'GET',
      `${base}/images/content/${candidate.contentHash}?revision=1`,
    );
    expect(privateBytes.statusCode).toBe(200);
    expect(contentHashOf(privateBytes.rawPayload)).toBe(candidate.contentHash);
    const selected = await send('POST', `${base}/images/selection`, {
      requestId: randomUUID(),
      revision: 1,
      packageDigest: revision.digest,
      expectedManifestVersion: 0,
      entityId: ardenId,
      purpose: 'image',
      variant: 'reference',
      label: null,
      candidateId: candidate.candidateId,
    });
    expect(selected.statusCode).toBe(200);
    expect(selected.json<{ manifest: DraftVisualManifest }>().manifest).toMatchObject({
      version: 1,
      entries: [{ contentHash: candidate.contentHash, state: 'CURRENT' }],
    });
    const visibleBytes = await send('GET', bytesUrl);
    expect(visibleBytes.statusCode).toBe(200);
    expect(visibleBytes.headers['content-type']).toContain('image/webp');
    expect(visibleBytes.headers['cache-control']).toContain('no-store');
    expect(visibleBytes.rawPayload.equals(privateBytes.rawPayload)).toBe(true);
    const entity = await send('GET', `${base}/preview/entities/${ardenId}?${scope}`);
    expect(entity.statusCode).toBe(200);
    const permitted = entity.json<CampaignPreviewEntityView>();
    expect(permitted.perspective.kind).toBe('CHARACTER');
    const image = permitted.presentation.presentation.image;
    expect(image).toEqual({
      variant: 'reference',
      purpose: 'image',
      contentHash: candidate.contentHash,
      mediaType: 'image/webp',
    });
    for (const hidden of [
      'ownerDescription',
      'sourceSignature',
      'candidateId',
      'jobId',
      'provider',
      'model',
      'identities',
    ])
      expect(permitted).not.toHaveProperty(hidden);
    expect(entity.body).not.toContain(candidate.candidateId);
    expect(entity.body).not.toContain(jobId);
    expect(entity.body).not.toContain('openrouter-openai');
    expect(
      (
        await server.inject({
          method: 'GET',
          url: bytesUrl,
          headers: { origin: ORIGIN, authorization: 'Bearer campaign-only-credential' },
        })
      ).statusCode,
    ).toBe(401);
    expect((await send('POST', `${base}/images/jobs`, request)).statusCode).toBe(200);
    await worker.run({ ownerId, draftId, jobId });
    expect(transport.calls).toHaveLength(1);
    expect(
      (await observer.query('SELECT charged_micros::text,cost_reported FROM ltw_image_settlements'))
        .rows,
    ).toEqual([{ charged_micros: '12345', cost_reported: true }]);
    for (const table of ['ltw_event_streams', 'ltw_commands', 'ltw_events'])
      expect(
        (await observer.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`))
          .rows[0]?.count,
      ).toBe(0);
    await worker.stop();
  });
});
