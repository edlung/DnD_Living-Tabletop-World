import { assetIdFor, type CampaignSnapshot } from '@ltw/domain';

import type { CampaignActivationDependencies } from './runtime.ts';
import { imageDigest } from '../images/manifest.ts';
import { initialScenarioDigest, initialQuestDigest } from './digests.ts';
import { activationProvenance } from './proof.ts';
import type { StoredCampaignActivation } from './store.ts';

export class ActivationFailure extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, retryable: boolean) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}
export function requireActivation(
  condition: boolean,
  code = 'ACTIVATION_PROVENANCE_MISMATCH',
): asserts condition {
  if (!condition) throw new ActivationFailure(code, false);
}
export async function verifyInitialContent(
  deps: CampaignActivationDependencies,
  record: StoredCampaignActivation,
): Promise<void> {
  const content = await deps.initialContent.get(record.campaignId);
  requireActivation(content !== null, 'ACTIVATION_CONTENT_MISSING');
  requireActivation(
    content.campaignId === record.campaignId &&
      content.activationId === record.activationId &&
      content.scenarioDigest === record.frozen.scenarioDigest &&
      content.questDigest === record.frozen.questDigest &&
      content.planDigest === record.frozen.planDigest &&
      content.manifestDigest === record.frozen.manifest.digest &&
      initialScenarioDigest(content.scenario) === content.scenarioDigest &&
      initialQuestDigest(content.quests) === content.questDigest &&
      imageDigest(content.assets) === imageDigest(record.frozen.assets),
  );
}
export function verifyBootstrapSnapshot(
  record: StoredCampaignActivation,
  snapshot: CampaignSnapshot,
): void {
  const { state } = snapshot;
  const world = record.frozen.revision.content.world;
  requireActivation(
    state.bootstrap !== undefined &&
      state.campaign?.dmActorId === record.ownerId &&
      state.campaign.name === world.name &&
      state.campaign.worldName === world.worldName &&
      state.campaign.language === world.language &&
      imageDigest(state.bootstrap) === imageDigest(activationProvenance(record)),
  );
  const party = record.frozen.revision.content.party
    .map((key) => record.frozen.revision.identities.entities[key])
    .sort();
  requireActivation(imageDigest([...(state.preparedParty ?? [])].sort()) === imageDigest(party));
  requireActivation(
    state.roster.size === 0 &&
      state.assets.jobs.size === 0 &&
      state.assets.requests.size === 0 &&
      state.assets.assets.size === record.frozen.assets.length,
  );
  for (const [index, expected] of record.frozen.assets.entries()) {
    const actual = state.assets.assets.get(
      assetIdFor(`${record.bootstrapCommandId}#${String(index)}`),
    );
    requireActivation(actual !== undefined);
    const reference = record.frozen.assets.findIndex(
      (asset) =>
        asset.entityId === expected.entityId &&
        asset.purpose === 'image' &&
        asset.variant === 'reference',
    );
    requireActivation(
      actual.entityId === expected.entityId &&
        actual.contentHash === expected.contentHash &&
        actual.mediaType === expected.mediaType &&
        actual.purpose === expected.purpose &&
        actual.variant === expected.variant &&
        actual.label === expected.label &&
        actual.audience === 'players' &&
        actual.origin !== undefined &&
        imageDigest(actual.generator) === imageDigest(expected.generator) &&
        imageDigest(actual.origin) === imageDigest(expected.origin) &&
        (expected.variant === 'reference'
          ? actual.status === 'CANONICAL' && actual.derivedFrom === null
          : actual.status === 'APPROVED' &&
            reference >= 0 &&
            actual.derivedFrom === assetIdFor(`${record.bootstrapCommandId}#${String(reference)}`)),
    );
  }
}
