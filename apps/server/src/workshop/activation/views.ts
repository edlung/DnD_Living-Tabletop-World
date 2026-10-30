import type { CampaignActivationView } from '@ltw/contracts';

import type { StoredCampaignActivation } from './store.ts';

export function activationView(record: StoredCampaignActivation): CampaignActivationView {
  return {
    activationId: record.activationId,
    draftId: record.draftId,
    campaignId: record.campaignId,
    revision: record.revision,
    packageDigest: record.packageDigest,
    planDigest: record.planDigest,
    manifestDigest: record.manifestDigest,
    textOnly: record.textOnly,
    status: record.status,
    phase: record.phase,
    failureCode: record.failureCode,
    retryable: record.retryable,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    publishedAt: record.publishedAt,
  };
}
