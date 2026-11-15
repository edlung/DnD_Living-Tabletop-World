import type { CampaignPackage, CampaignRevision } from '../../packages/contracts/src/index.ts';

import { materializeCampaign } from '../../apps/server/src/workshop/packages/compiler.ts';
import { campaignContentDigest } from '../../apps/server/src/workshop/packages/content.ts';
import { allocateCampaignIdentities } from '../../apps/server/src/workshop/packages/identities.ts';

/** Local assessment identity only: no session, invitation, account, database or live campaign. */
export const ASSESSMENT_OWNER = 'a9000000-0000-4000-8000-000000000001';

export function assessmentRevision(content: CampaignPackage): CampaignRevision {
  const allocation = allocateCampaignIdentities(content, []);
  if (allocation.kind !== 'allocated') throw new Error('Could not allocate isolated identities');
  const identities = allocation.identities;
  return {
    draftId: 'a9000000-0000-4000-8000-000000000002',
    revision: 1,
    basedOnRevision: 0,
    content,
    identities,
    digest: campaignContentDigest(content, identities),
    source: { kind: 'OWNER', actorId: ASSESSMENT_OWNER },
    createdAt: '2026-11-08T12:00:00.000Z',
  };
}

export async function validatePackage(content: CampaignPackage) {
  return materializeCampaign(assessmentRevision(content), ASSESSMENT_OWNER);
}
