import { randomUUID } from 'node:crypto';

import type { CampaignGenerationStage, CampaignPackage } from '@ltw/contracts';
import { seedCampaignPackage } from '@ltw/domain';

import { bellCampaign } from '../../../../../packages/domain/src/campaign/testing/bell.ts';
import { hashToken, newToken } from '../../auth/tokens.ts';
import type {
  CampaignPreparationRuntime,
  PreparedCampaignRun,
} from '../../workshop/generation/runtime.ts';
import { MemoryWorkshopStore } from '../workshop-store.ts';
import { MemoryCampaignRevisionRepository } from '../campaign-packages.ts';
import { MemoryCampaignGenerationRepository } from '../generation-store.ts';

export const T0 = Date.parse('2026-10-30T12:00:00.000Z');
export const PROVIDER = 'test-provider';
export const MODEL = 'offline-script';

export function specimenOutput(stage: CampaignGenerationStage, content: CampaignPackage): unknown {
  switch (stage) {
    case 'concept': {
      const { name, worldName, startsAt, weather, opening } = content.world;
      return { world: { name, worldName, startsAt, weather, opening } };
    }
    case 'topology':
      return {
        locations: content.entities.filter((entity) => entity.kind === 'location'),
        startLocation: content.world.startLocation,
        conflicts: content.conflicts,
      };
    case 'cast':
      return {
        entities: content.entities.filter((entity) => entity.kind !== 'location'),
        party: content.party,
        relationships: content.relationships,
        visuals: content.visuals,
      };
    case 'knowledge':
      return { knowledge: content.knowledge, clues: content.clues };
    case 'encounters':
      return { encounters: content.encounters };
    case 'first-session':
      return {
        situations: content.situations,
        quests: content.quests,
        firstSession: content.firstSession,
      };
    case 'outline':
      return { laterOutline: content.laterOutline };
  }
}

export async function generationFixture() {
  let now = T0;
  const workshop = new MemoryWorkshopStore();
  const ownerId = randomUUID(),
    draftId = randomUUID(),
    sessionId = randomUUID();
  const invitation = newToken(),
    token = newToken();
  const at = new Date(now).toISOString(),
    expiresAt = new Date(now + 86_400_000).toISOString();
  await workshop.issueInvitation({
    ownerId,
    invitationId: randomUUID(),
    tokenHash: hashToken(invitation),
    createdAt: at,
    expiresAt,
    authorizationSource: 'test:400',
  });
  await workshop.redeem(
    hashToken(invitation),
    { sessionId, tokenHash: hashToken(token), createdAt: at, expiresAt },
    null,
  );
  await workshop.createDraft(
    ownerId,
    { requestId: randomUUID(), title: 'Колокол', language: 'ru' },
    draftId,
    at,
  );
  const revisions = new MemoryCampaignRevisionRepository(workshop);
  const repository = new MemoryCampaignGenerationRepository(workshop, revisions, () => now);
  const content = bellCampaign();
  const seed = seedCampaignPackage({ title: 'Колокол', language: 'ru', brief: content.brief });
  const enqueue = () =>
    repository.enqueue({
      ownerId,
      draftId,
      authSessionId: sessionId,
      requestId: randomUUID(),
      basedOnRevision: 0,
      seed,
    });
  const calls: CampaignGenerationStage[] = [];
  let before: ((input: Parameters<PreparedCampaignRun['run']>[0]) => Promise<void>) | null = null;
  const preparation: CampaignPreparationRuntime = {
    availability: () =>
      Promise.resolve({ available: true, reason: 'READY', providers: [`${PROVIDER}:${MODEL}`] }),
    forJob: () =>
      Promise.resolve({
        provider: PROVIDER,
        model: MODEL,
        run: async (input) => {
          if (input.stage === 'edit') throw new Error('TEST_GENERATE_MODE_ONLY');
          calls.push(input.stage);
          await before?.(input);
          const checked = input.validate(specimenOutput(input.stage, content));
          return checked.ok
            ? {
                status: 'GENERATED',
                value: checked.value,
                traceId: input.traceId,
                provider: PROVIDER,
                model: MODEL,
                issues: [],
                attempts: [],
              }
            : {
                status: 'INVALID_OUTPUT',
                value: null,
                traceId: input.traceId,
                provider: PROVIDER,
                model: MODEL,
                issues: checked.issues,
                attempts: [],
              };
        },
      }),
  };
  return {
    workshop,
    ownerId,
    draftId,
    sessionId,
    token,
    revisions,
    repository,
    content,
    seed,
    enqueue,
    calls,
    preparation,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
    beforeRun: (callback: typeof before) => {
      before = callback;
    },
  };
}
