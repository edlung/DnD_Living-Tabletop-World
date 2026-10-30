import { randomUUID } from 'node:crypto';

import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import type { CredentialStore } from '../auth/credential-store.ts';
import { RequestLimits, SIGN_IN_LIMITS } from '../auth/limits.ts';
import { systemAuthClock } from '../auth/session-authenticator.ts';
import { hashToken } from '../auth/tokens.ts';
import type { WorkshopDependencies } from '../workshop/service.ts';
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { MemoryWorkshopStore } from './workshop-store.ts';
import { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import { bellCampaign } from '../../../../packages/domain/src/campaign/testing/bell.ts';
import { englishBellCampaign } from './generation/bell-english.ts';
import { seedWorkshopGeneration } from './ui-workshop-generation.ts';
import { SIGN_IN_ORIGIN, dmInvitationToken } from './ui-sign-in-links.ts';
import {
  WORKSHOP_CAMPAIGN,
  WORKSHOP_FIXTURES,
  workshopInvitationToken,
  workshopOwnerId,
  workshopDraftId,
} from './ui-workshop-links.ts';

/** All identities/campaigns here are fixtures of this one browser journey collection. */
export async function seedWorkshopAccess(
  credentials: CredentialStore,
  engine: WorldEngine,
  seed: string,
): Promise<{
  readonly workshop: WorkshopDependencies;
  readonly stopGeneration: () => Promise<void>;
}> {
  const store = new MemoryWorkshopStore();
  const revisions = new MemoryCampaignRevisionRepository(store);
  const workshop: WorkshopDependencies = {
    store,
    packages: revisions,
    publicOrigin: SIGN_IN_ORIGIN,
    clock: systemAuthClock,
    limits: new RequestLimits(
      {
        ...SIGN_IN_LIMITS,
        redeemPerMinute: 1_000,
        failuresPerHour: 1_000,
        refusedRedeemsPerMinute: 1_000,
      },
      () => Date.now(),
    ),
  };
  const now = Date.now();
  for (const name of WORKSHOP_FIXTURES) {
    await workshop.store.issueInvitation({
      invitationId: randomUUID(),
      ownerId: workshopOwnerId(seed, name),
      tokenHash: hashToken(workshopInvitationToken(seed, name)),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 24 * 60 * 60_000).toISOString(),
      authorizationSource: name.startsWith('scenario-')
        ? 'browser-test:stage-410'
        : 'browser-test:stage-380',
    });
    if (name.startsWith('scenario-')) {
      const content = name === 'scenario-ru' ? bellCampaign() : englishBellCampaign();
      const ownerId = workshopOwnerId(seed, name),
        draftId = workshopDraftId(seed, name);
      await store.createDraft(
        ownerId,
        { requestId: randomUUID(), title: content.world.name, language: content.world.language },
        draftId,
        new Date(now).toISOString(),
      );
      if (!['scenario-generation', 'scenario-retry', 'scenario-unavailable'].includes(name)) {
        const saved = await revisions.append({
          ownerId,
          draftId,
          requestId: randomUUID(),
          basedOnRevision: 0,
          content,
          source: { kind: 'OWNER', actorId: ownerId },
          createdAt: new Date(now).toISOString(),
        });
        if (saved.kind !== 'saved') throw new Error('WORKSHOP_SCENARIO_SEED_FAILED');
      }
    }
  }
  const campaign = await loadRavenfordSeed();
  for (const input of campaign.submissions) {
    const submission = commandSubmissionSchema.parse(input);
    const result = await engine.execute({
      ...submission,
      campaignId: WORKSHOP_CAMPAIGN,
      commandId: `${WORKSHOP_CAMPAIGN}.${submission.commandId}`,
    });
    if (result.status === 'rejected') throw new Error('WORKSHOP_CAMPAIGN_SEED_FAILED');
  }
  // Independent one-use credentials for the Stage380 coexist and Stage410 isolation journeys.
  for (const index of [0, 1])
    await credentials.createInvitation({
      invitationId: randomUUID(),
      tokenHash: hashToken(dmInvitationToken(seed, WORKSHOP_CAMPAIGN, index)),
      campaignId: WORKSHOP_CAMPAIGN,
      purpose: 'dm',
      characterId: null,
      actorId: 'dm-ravenford',
      createdBy: 'operator',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 24 * 60 * 60_000).toISOString(),
    });
  const { generation, cancelGeneration, stopGeneration } = seedWorkshopGeneration(
    store,
    revisions,
    seed,
  );
  return { workshop: { ...workshop, generation, cancelGeneration }, stopGeneration };
}
