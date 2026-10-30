import { bootstrapCampaignCommandSchema } from '@ltw/contracts';
import { commandSubmissionSchema } from '@ltw/domain';

import type { StoredCampaignActivation } from './store.ts';

/** Stable caller/IDs/consent come from the accepted server row, never a worker or HTTP assertion. */
export function activationSubmission(
  record: Pick<
    StoredCampaignActivation,
    'activationId' | 'campaignId' | 'bootstrapCommandId' | 'ownerId' | 'frozen'
  >,
) {
  const { frozen } = record;
  const command = bootstrapCampaignCommandSchema.parse({
    type: 'BootstrapCampaign',
    content: frozen.revision.content,
    identities: frozen.revision.identities,
    source: {
      activationId: record.activationId,
      ownerId: record.ownerId,
      draftId: frozen.revision.draftId,
      revision: frozen.revision.revision,
      packageDigest: frozen.revision.digest,
      planDigest: frozen.planDigest,
      visualManifestDigest: frozen.manifest.digest,
      scenarioDigest: frozen.scenarioDigest,
      questDigest: frozen.questDigest,
      lockDigest: frozen.lockDigest,
    },
    visualMode: frozen.textOnly ? 'TEXT_ONLY' : 'CHOSEN',
    selectedAssets: frozen.assets,
    confirmation: {
      packageDigest: frozen.revision.digest,
      planDigest: frozen.planDigest,
      visualManifestDigest: frozen.manifest.digest,
      reviewDigest: frozen.reviewDigest,
      acknowledgedFindingIds: frozen.acknowledgedFindingIds,
    },
  });
  return commandSubmissionSchema.parse({
    commandId: record.bootstrapCommandId,
    campaignId: record.campaignId,
    actor: { actorId: record.ownerId, kind: 'user' },
    expectedVersion: 0,
    reason: 'Confirmed campaign activation',
    command,
  });
}
