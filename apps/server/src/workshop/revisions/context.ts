import type { CampaignEditingContext } from '@ltw/contracts';
import { campaignEditTargets } from '@ltw/domain';

import { assessCampaignRevision } from '../packages/compiler.ts';
import type { WorkshopDependencies } from '../service.ts';
import type { RevisionControlScope } from './store.ts';

/** Caller supplies an authenticated owner scope; all underlying reads remain owner-qualified. */
export async function loadCampaignEditingContext(
  deps: WorkshopDependencies,
  scope: RevisionControlScope,
  revision?: number,
): Promise<CampaignEditingContext | null> {
  if (!deps.packages || !deps.revisionControls || !deps.images) return null;
  const stored =
    revision === undefined
      ? await deps.packages.latest(scope.ownerId, scope.draftId)
      : await deps.packages.get(scope.ownerId, scope.draftId, revision);
  if (!stored) return null;
  const [locks, manifest] = await Promise.all([
    deps.revisionControls.locks(scope),
    deps.images.repository.manifest(scope, stored.revision),
  ]);
  if (!locks || !manifest) return null;
  const locked = new Set(
    locks.entries.flatMap((entry) =>
      entry.target.kind === 'content' ? [entry.target.targetId] : [],
    ),
  );
  return {
    revision: stored,
    locks,
    manifest,
    targets: campaignEditTargets(stored, locked),
    assessment: await assessCampaignRevision(stored, scope.ownerId),
  };
}
