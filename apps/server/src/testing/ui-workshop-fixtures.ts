import { randomUUID } from 'node:crypto';

import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import type { CredentialStore } from '../auth/credential-store.ts';
import { RequestLimits, SIGN_IN_LIMITS } from '../auth/limits.ts';
import { systemAuthClock } from '../auth/session-authenticator.ts';
import { hashToken } from '../auth/tokens.ts';
import type { WorkshopDependencies } from '../workshop/service.ts';
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { MemoryWorkshopStore } from './workshop-store.ts';
import { SIGN_IN_ORIGIN, dmInvitationToken } from './ui-sign-in-links.ts';
import {
  WORKSHOP_CAMPAIGN,
  WORKSHOP_FIXTURES,
  workshopInvitationToken,
  workshopOwnerId,
} from './ui-workshop-links.ts';

/** All identities/campaigns here are fixtures of this one browser journey collection. */
export async function seedWorkshopAccess(
  credentials: CredentialStore,
  engine: WorldEngine,
  seed: string,
): Promise<WorkshopDependencies> {
  const workshop: WorkshopDependencies = {
    store: new MemoryWorkshopStore(),
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
      authorizationSource: 'browser-test:stage-380',
    });
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
  await credentials.createInvitation({
    invitationId: randomUUID(),
    tokenHash: hashToken(dmInvitationToken(seed, WORKSHOP_CAMPAIGN, 0)),
    campaignId: WORKSHOP_CAMPAIGN,
    purpose: 'dm',
    characterId: null,
    actorId: 'dm-ravenford',
    createdBy: 'operator',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 24 * 60 * 60_000).toISOString(),
  });
  return workshop;
}
