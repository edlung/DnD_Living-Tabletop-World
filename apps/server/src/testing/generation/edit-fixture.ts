import { randomUUID } from 'node:crypto';

import { buildCampaignEditPlan } from '@ltw/domain';

import { lockSnapshot } from '../../workshop/revisions/policy.ts';
import { MemoryDraftImageRepository } from '../draft-image-store.ts';
import { MemoryCampaignGenerationRepository } from '../generation-store.ts';
import { generationFixture } from './fixture.ts';

export async function editFixture() {
  const f = await generationFixture();
  const images = new MemoryDraftImageRepository(f.workshop, f.revisions, f.now);
  const saved = await f.revisions.append({
    ownerId: f.ownerId,
    draftId: f.draftId,
    requestId: randomUUID(),
    basedOnRevision: 0,
    content: f.content,
    source: { kind: 'OWNER', actorId: f.ownerId },
    createdAt: new Date(f.now()).toISOString(),
  });
  if (saved.kind !== 'saved') throw new Error('baseline absent');
  const base = saved.revision;
  const manifest = images.snapshotManifest(f, base.revision);
  if (!manifest) throw new Error('manifest absent');
  const locks = lockSnapshot(base, manifest, 0, [], base.createdAt);
  const spec = buildCampaignEditPlan(base, locks, manifest, 'Make the opening more urgent.', [
    'section:world',
  ]).spec;
  if (!spec) throw new Error('edit plan absent');
  const controls = { locksWithinDraftLock: () => locks, manifest: () => manifest };
  const edit = new MemoryCampaignGenerationRepository(
    f.workshop,
    f.revisions,
    f.now,
    'EDIT',
    controls,
  );
  f.repository.configureControls(controls);
  const input = {
    ownerId: f.ownerId,
    draftId: f.draftId,
    authSessionId: f.sessionId,
    requestId: randomUUID(),
    basedOnRevision: base.revision,
    seed: base.content,
    lockVersion: locks.version,
    editSpec: spec,
  };
  const enqueue = async () => {
    const result = await edit.enqueueEdit(input);
    if (result.kind !== 'saved') throw new Error('edit missing');
    return { ownerId: f.ownerId, draftId: f.draftId, jobId: result.job.jobId };
  };
  return { ...f, images, base, manifest, locks, spec, edit, input, enqueue };
}
