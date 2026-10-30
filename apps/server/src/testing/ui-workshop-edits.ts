import type { CampaignEditTarget, CampaignPackage, CampaignRevision } from '@ltw/contracts';
import { campaignEditTargets } from '@ltw/domain';

import { createLogger } from '../platform/logging/logger.ts';
import { CampaignEditWorker } from '../workshop/generation/edit-worker.ts';
import type { CampaignPreparationRuntime } from '../workshop/generation/runtime.ts';
import { startCampaignGenerationLoop } from '../workshop/generation/worker-loop.ts';
import type { StoredGenerationJob } from '../workshop/generation/store.ts';
import type { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import type { MemoryDraftImageRepository } from './draft-image-store.ts';
import { MemoryCampaignGenerationRepository } from './generation-store.ts';
import { MemoryCampaignRevisionControlRepository } from './revision-controls.ts';
import type { MemoryWorkshopStore } from './workshop-store.ts';
import { WORKSHOP_FIXTURES, workshopOwnerId } from './ui-workshop-links.ts';

export const WORKSHOP_EDIT_FIXTURE_PROVIDER = 'browser-edit-fixture';
export const WORKSHOP_EDIT_FIXTURE_MODEL = 'scripted-offline-edit-1';
export const WORKSHOP_EDIT_FIXTURE_MARKER = 'Updated at the owner’s request.';
const ruMarker = 'Изменено по запросу владельца.';

function pause(signal: AbortSignal, duration: number): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, duration);
    signal.addEventListener('abort', finish, { once: true });
  });
}
function editObject(output: CampaignPackage, target: CampaignEditTarget, suffix: string): boolean {
  const key = target.key;
  switch (target.section) {
    case 'entities': {
      const row = output.entities.find((item) => item.key === key);
      if (!row) return false;
      row.description += suffix;
      return true;
    }
    case 'visuals': {
      const row = output.visuals.find((item) => `${item.entity}:${item.purpose}` === key);
      if (!row) return false;
      row.description += suffix;
      return true;
    }
    case 'knowledge': {
      const row = output.knowledge.find((item) => item.key === key);
      if (!row) return false;
      row.statement += suffix;
      return true;
    }
    case 'clues': {
      const row = output.clues.find((item) => item.key === key);
      if (!row) return false;
      row.statement += suffix;
      return true;
    }
    case 'conflicts': {
      const row = output.conflicts.find((item) => item.key === key);
      if (!row) return false;
      row.description += suffix;
      return true;
    }
    case 'situations': {
      const row = output.situations.find((item) => item.key === key);
      if (!row) return false;
      row.description += suffix;
      return true;
    }
    case 'encounters': {
      const row = output.encounters.find((item) => item.key === key);
      if (!row) return false;
      row.trigger += suffix;
      return true;
    }
    case 'quests': {
      const row = output.quests.find((item) => item.questId === key);
      if (!row) return false;
      row.title += suffix;
      return true;
    }
    case 'relationships': {
      const row = output.relationships.find((item) => item.npc === key);
      if (!row) return false;
      row.attitude = row.attitude === 'FRIENDLY' ? 'TRUSTED' : 'FRIENDLY';
      return true;
    }
    default:
      return false;
  }
}
/** A deterministic test proposal from the frozen job seed; never an alternative production generator. */
function proposal(job: StoredGenerationJob, base: CampaignRevision): CampaignPackage | null {
  const spec = job.editSpec;
  if (!spec) return null;
  const output = structuredClone(job.seed),
    ru = output.world.language === 'ru';
  const instruction = spec.instruction.toLowerCase();
  let suffix = ` ${ru ? ruMarker : WORKSHOP_EDIT_FIXTURE_MARKER}`;
  if (instruction.includes('river travelers'))
    suffix = ' He protects river travelers because his family once depended on a ferryman’s help.';
  if (instruction.includes('red cloak'))
    suffix = ru ? ' На плечах красный плащ.' : ' A red cloak rests on the shoulders.';
  const allowed = new Set(
    spec.closure.filter((item) => !item.readOnly).map((item) => item.targetId),
  );
  const catalog = campaignEditTargets(base),
    byId = new Map(catalog.map((item) => [item.targetId, item]));
  let changed = false;
  for (const id of spec.requestedTargets) {
    if (!allowed.has(id)) continue;
    const target = byId.get(id);
    if (!target || target.ambiguous) continue;
    if (target.key !== null) {
      changed = editObject(output, target, suffix) || changed;
      continue;
    }
    switch (target.section) {
      case 'brief':
        output.brief.intent += suffix;
        changed = true;
        break;
      case 'world':
        output.world.opening += suffix;
        changed = true;
        break;
      case 'firstSession':
        output.firstSession.push(suffix.trim());
        changed = true;
        break;
      case 'laterOutline':
        output.laterOutline.push(suffix.trim());
        changed = true;
        break;
      default: {
        const member = catalog.find(
          (item) =>
            item.section === target.section &&
            item.key !== null &&
            !item.ambiguous &&
            allowed.has(item.targetId),
        );
        if (member) changed = editObject(output, member, suffix) || changed;
      }
    }
  }
  if (instruction.includes('outside scope')) output.brief.intent += ' SCRIPTED_OUTSIDE_SCOPE';
  return changed ? output : null;
}

/** Browser-only runtime: actual mode-qualified storage, directed-scope validator and durable worker. */
export function seedWorkshopEdits(
  store: MemoryWorkshopStore,
  revisions: MemoryCampaignRevisionRepository,
  images: MemoryDraftImageRepository,
  generation: MemoryCampaignGenerationRepository,
  seed: string,
) {
  const repository = new MemoryCampaignGenerationRepository(store, revisions, Date.now, 'EDIT');
  const revisionControls = new MemoryCampaignRevisionControlRepository(store, revisions, images, [
    generation,
    repository,
  ]);
  const readers = {
    locksWithinDraftLock: (scope: { ownerId: string; draftId: string }, head: CampaignRevision) =>
      revisionControls.locksWithinDraftLock(scope, head),
    manifest: (scope: { ownerId: string; draftId: string }, revision: number) =>
      images.snapshotManifest(scope, revision),
  };
  generation.configureControls(readers);
  repository.configureControls(readers);
  const owners = new Set(
    WORKSHOP_FIXTURES.filter((name) => name.startsWith('edit-') && name !== 'edit-unavailable').map(
      (name) => workshopOwnerId(seed, name),
    ),
  );
  const slow = new Set([workshopOwnerId(seed, 'edit-late'), workshopOwnerId(seed, 'edit-revoked')]);
  const failed = new Set<string>();
  const preparation: CampaignPreparationRuntime = {
    availability: (ownerId) =>
      Promise.resolve(
        owners.has(ownerId)
          ? {
              available: true,
              reason: 'READY',
              providers: [`${WORKSHOP_EDIT_FIXTURE_PROVIDER}:${WORKSHOP_EDIT_FIXTURE_MODEL}`],
            }
          : { available: false, reason: 'NO_ROUTE', providers: [] },
      ),
    forJob: async (lease) => {
      if (!owners.has(lease.ownerId)) return null;
      const job = await repository.get(lease),
        base = job ? await revisions.get(job.ownerId, job.draftId, job.baseRevision) : null;
      if (!job?.editSpec || !base) return null;
      const spec = job.editSpec;
      return {
        provider: WORKSHOP_EDIT_FIXTURE_PROVIDER,
        model: WORKSHOP_EDIT_FIXTURE_MODEL,
        run: async (input) => {
          await pause(
            input.signal,
            slow.has(lease.ownerId) || spec.instruction.toLowerCase().includes('slow') ? 500 : 150,
          );
          const identity = {
            traceId: input.traceId,
            provider: WORKSHOP_EDIT_FIXTURE_PROVIDER,
            model: WORKSHOP_EDIT_FIXTURE_MODEL,
            attempts: [],
          };
          if (input.signal.aborted)
            return {
              ...identity,
              status: 'AI_UNAVAILABLE',
              value: null,
              issues: ['SCRIPTED_FIXTURE_CANCELLED'],
            };
          if (input.stage !== 'edit') throw new Error('TEST_EDIT_MODE_ONLY');
          if (spec.instruction.toLowerCase().includes('dispatch unknown'))
            return {
              ...identity,
              status: 'DISPATCH_UNKNOWN',
              value: null,
              issues: ['SCRIPTED_FIXTURE_DISPATCH_UNKNOWN'],
            };
          const failureKey = `${job.ownerId}/${spec.instruction}`;
          if (spec.instruction.toLowerCase().includes('fail once') && !failed.has(failureKey)) {
            failed.add(failureKey);
            return {
              ...identity,
              status: 'INVALID_OUTPUT',
              value: null,
              issues: ['SCRIPTED_FIXTURE_INVALID'],
            };
          }
          const value = proposal(job, base);
          const checked = value
            ? input.validate(value)
            : { ok: false as const, issues: ['SCRIPTED_FIXTURE_TARGET_UNSUPPORTED'] };
          return checked.ok
            ? { ...identity, status: 'GENERATED', value: checked.value, issues: [] }
            : { ...identity, status: 'INVALID_OUTPUT', value: null, issues: checked.issues };
        },
      };
    },
  };
  const edits = { repository, preparation },
    worker = new CampaignEditWorker({ ...edits, packages: revisions });
  const stopEdits = startCampaignGenerationLoop(
    repository,
    worker,
    createLogger({ service: 'ui-workshop-edits-fixture', level: 'silent' }),
  );
  return {
    edits,
    revisionControls,
    cancelEdit: (jobId: string) => {
      worker.cancel(jobId);
    },
    stopEdits,
  };
}
