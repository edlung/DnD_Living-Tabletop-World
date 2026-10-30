import type { CampaignGenerationAvailability } from '@ltw/contracts';

import type { CampaignPreparationRuntime } from '../workshop/generation/runtime.ts';
import { CampaignGenerationWorker } from '../workshop/generation/worker.ts';
import { startCampaignGenerationLoop } from '../workshop/generation/worker-loop.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { bellCampaign } from '../../../../packages/domain/src/campaign/testing/bell.ts';
import { englishBellCampaign } from './generation/bell-english.ts';
import { specimenOutput } from './generation/fixture.ts';
import { MemoryCampaignGenerationRepository } from './generation-store.ts';
import type { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import type { MemoryWorkshopStore } from './workshop-store.ts';
import { WORKSHOP_FIXTURES, workshopOwnerId } from './ui-workshop-links.ts';

export const WORKSHOP_FIXTURE_PROVIDER = 'browser-fixture';
export const WORKSHOP_FIXTURE_MODEL = 'scripted-offline';

function pause(signal: AbortSignal, duration = 150): Promise<void> {
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

/** Scripted test port only. Production imports neither this runtime nor its Bell responses. */
export function seedWorkshopGeneration(
  store: MemoryWorkshopStore,
  revisions: MemoryCampaignRevisionRepository,
  seed: string,
) {
  const repository = new MemoryCampaignGenerationRepository(store, revisions);
  const availableOwners = new Set(
    WORKSHOP_FIXTURES.filter(
      (name) => name.startsWith('scenario-') && name !== 'scenario-unavailable',
    ).map((name) => workshopOwnerId(seed, name)),
  );
  const cancelOwner = workshopOwnerId(seed, 'scenario-cancel');
  const retryOwner = workshopOwnerId(seed, 'scenario-retry');
  const failedOnce = new Set<string>();
  const availability = (ownerId: string): CampaignGenerationAvailability =>
    availableOwners.has(ownerId)
      ? {
          available: true,
          reason: 'READY',
          providers: [`${WORKSHOP_FIXTURE_PROVIDER}:${WORKSHOP_FIXTURE_MODEL}`],
        }
      : { available: false, reason: 'NO_ROUTE', providers: [] };
  const preparation: CampaignPreparationRuntime = {
    availability: (ownerId) => Promise.resolve(availability(ownerId)),
    forJob: async (lease) => {
      if (!availability(lease.ownerId).available) return null;
      const job = await repository.get(lease);
      if (!job) return null;
      const content = job.seed.world.language === 'ru' ? bellCampaign() : englishBellCampaign();
      return {
        provider: WORKSHOP_FIXTURE_PROVIDER,
        model: WORKSHOP_FIXTURE_MODEL,
        run: async (input) => {
          await pause(input.signal, lease.ownerId === cancelOwner ? 500 : 150);
          const identity = {
            traceId: input.traceId,
            provider: WORKSHOP_FIXTURE_PROVIDER,
            model: WORKSHOP_FIXTURE_MODEL,
            attempts: [],
          };
          if (input.signal.aborted)
            return {
              ...identity,
              status: 'AI_UNAVAILABLE',
              value: null,
              issues: ['SCRIPTED_FIXTURE_CANCELLED'],
            };
          if (
            lease.ownerId === retryOwner &&
            input.stage === 'knowledge' &&
            !failedOnce.has(retryOwner)
          ) {
            failedOnce.add(retryOwner);
            return {
              ...identity,
              status: 'INVALID_OUTPUT',
              value: null,
              issues: ['SCRIPTED_FIXTURE_FAILURE'],
            };
          }
          const checked = input.validate(specimenOutput(input.stage, content));
          return checked.ok
            ? { ...identity, status: 'GENERATED', value: checked.value, issues: [] }
            : { ...identity, status: 'INVALID_OUTPUT', value: null, issues: checked.issues };
        },
      };
    },
  };
  const generation = { repository, preparation };
  const worker = new CampaignGenerationWorker(generation);
  const stopGeneration = startCampaignGenerationLoop(
    repository,
    worker,
    createLogger({ service: 'ui-workshop-fixture', level: 'silent' }),
  );
  return {
    generation,
    cancelGeneration: (jobId: string) => {
      worker.cancel(jobId);
    },
    stopGeneration,
  };
}
