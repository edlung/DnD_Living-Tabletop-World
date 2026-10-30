import type {
  AssetPurpose,
  CampaignRevision,
  DraftImageJob,
  DraftImageSubject,
  DraftVisualManifest,
} from '@ltw/contracts';

import { resolveDraftImageVisual } from '../../images/draft-input.ts';
import type { DraftImageRuntime } from '../../images/draft-runtime-types.ts';
import { inheritVisualEntries } from './manifest.ts';

/** Never serialize StoredDraftImageJob structurally: its immutable input/session is private. */
export function publicDraftImageJob(job: DraftImageJob): DraftImageJob {
  return {
    jobId: job.jobId,
    revision: job.revision,
    entityId: job.entityId,
    purpose: job.purpose,
    variant: job.variant,
    label: job.label,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    failureCode: job.failureCode,
  };
}

export function draftImageSubjects(
  revision: CampaignRevision,
  manifest: DraftVisualManifest,
): DraftImageSubject[] {
  const selected = inheritVisualEntries(revision, manifest.entries);
  return revision.content.entities.flatMap((entity) => {
    const purposes: AssetPurpose[] = ['image'];
    if (['character', 'npc', 'creature'].includes(entity.kind)) purposes.push('figure');
    if (entity.kind === 'location') purposes.push('battle-map');
    const briefs = purposes.flatMap((purpose) => {
      const visual = resolveDraftImageVisual(revision.content, entity.key, purpose);
      return visual && visual.description.trim() !== ''
        ? [{ purpose, appearance: visual.description, style: visual.style }]
        : [];
    });
    const first = briefs[0];
    if (!first) return [];
    const entityId = revision.identities.entities[entity.key] ?? '';
    return [
      {
        entityId,
        kind: entity.kind,
        name: entity.name,
        appearance: first.appearance,
        style: first.style,
        briefs,
        allowedPurposes: briefs.map((brief) => brief.purpose),
        referenceHash:
          selected.find(
            (entry) =>
              entry.entityId === entityId &&
              entry.purpose === 'image' &&
              entry.variant === 'reference' &&
              entry.state === 'CURRENT',
          )?.contentHash ?? null,
      },
    ];
  });
}

export async function imageAvailability(runtime: DraftImageRuntime, ownerId: string) {
  const result = await runtime.availability(ownerId);
  return {
    available: result.available,
    reason: result.available
      ? ('READY' as const)
      : result.reason === 'NO_ROUTE'
        ? ('NO_ROUTE' as const)
        : result.reason === 'NO_POLICY'
          ? ('NO_POLICY' as const)
          : ('UNAVAILABLE' as const),
    providers: result.available && result.provider !== null ? [result.provider] : [],
  };
}
