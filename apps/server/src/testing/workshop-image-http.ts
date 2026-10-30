import { randomUUID } from 'node:crypto';

import type {
  AssetPurpose,
  CampaignDraftImagesView,
  CampaignPackage,
  DraftImageCandidate,
  DraftImageJob,
} from '@ltw/contracts';
import type { DraftImageRuntime } from '../images/draft-runtime-types.ts';
import { DraftImageWorker } from '../workshop/images/worker.ts';
import { MemoryDraftImageRepository } from './draft-image-store.ts';
import { ScriptedDraftImageRuntime } from './draft-image-runtime.ts';
import { picture } from './image-provider.ts';
import { PREVIEW_T0, workshopPreviewHarness } from './workshop-preview.ts';

export async function workshopImageHttpHarness(content?: CampaignPackage) {
  const baseBytes = await picture(8, 8, 'webp');
  const scripts: ScriptedDraftImageRuntime[] = [];
  const t = await workshopPreviewHarness({
    ...(content ? { content } : {}),
    images: (store, packages) => {
      const repository = new MemoryDraftImageRepository(store, packages, () => PREVIEW_T0);
      const script = new ScriptedDraftImageRuntime(repository, baseBytes);
      scripts.push(script);
      const runtime: DraftImageRuntime = {
        availability: (owner) => script.availability(owner),
        prepare: (input) => script.prepare(input),
        forJob: async (lease) => {
          const runner = await script.forJob(lease);
          return runner
            ? {
                ...runner,
                run: async (input) => {
                  const result = await runner.run(input);
                  // Distinct immutable rasters make hidden/unselected-hash probes meaningful.
                  return result.status === 'GENERATED'
                    ? { ...result, bytes: await picture(8 + script.calls.length, 8, 'webp') }
                    : result;
                },
              }
            : null;
        },
      };
      return { repository, runtime };
    },
  });
  const script = scripts[0];
  if (!t.images || !script) throw new Error('TEST_IMAGE_RUNTIME_MISSING');
  const images = t.images;
  const worker = new DraftImageWorker(images);
  const view = async (entityId?: string) => {
    const response = await t.send(
      `${t.url}/images?revision=1${entityId ? `&entityId=${entityId}` : ''}`,
      t.owner.cookie,
    );
    if (response.statusCode !== 200) throw new Error('TEST_IMAGE_VIEW_FAILED');
    return response.json<CampaignDraftImagesView>();
  };
  const requestBody = async (
    entityId: string,
    purpose: AssetPurpose = 'image',
    note: string | null = null,
  ) => {
    const current = await view(entityId);
    return {
      requestId: randomUUID(),
      revision: 1,
      packageDigest: current.manifest.packageDigest,
      expectedManifestVersion: current.manifest.version,
      entityId,
      purpose,
      variant: purpose === 'image' ? ('reference' as const) : ('derived' as const),
      label: purpose === 'image' ? null : purpose,
      note,
    };
  };
  const generate = async (entityId: string, purpose: AssetPurpose = 'image') => {
    const body = await requestBody(entityId, purpose);
    const requested = await t.send(`${t.url}/images/jobs`, t.owner.cookie, {
      method: 'POST',
      body,
    });
    if (requested.statusCode !== 200) throw new Error('TEST_IMAGE_REQUEST_FAILED');
    const job = requested.json<{ job: DraftImageJob }>().job;
    await worker.run({ ownerId: t.owner.ownerId, draftId: t.draftId, jobId: job.jobId });
    const candidate = (await view(entityId)).candidates.find((entry) => entry.jobId === job.jobId);
    if (!candidate) throw new Error('TEST_IMAGE_CANDIDATE_MISSING');
    return { job, candidate, body };
  };
  const selectionBody = async (
    candidate: DraftImageCandidate,
    candidateId: string | null = candidate.candidateId,
  ) => ({
    requestId: randomUUID(),
    revision: 1,
    packageDigest: t.revision.digest,
    expectedManifestVersion: (await view(candidate.entityId)).manifest.version,
    entityId: candidate.entityId,
    purpose: candidate.purpose,
    variant: candidate.variant,
    label: candidate.label,
    candidateId,
  });
  return { ...t, images, script, worker, view, requestBody, generate, selectionBody };
}
