import type { CampaignBootstrapAsset } from '@ltw/contracts';

import { accept, reject, type Decision } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { assetIdFor, purposeField, requestIdFor } from './records.ts';

/** Already-owned exact bytes, not a newly requested or completed external job. Bootstrap only. */
export function adoptBootstrapAsset(
  state: WorldState,
  commandId: string,
  ordinal: number,
  asset: CampaignBootstrapAsset,
): Decision {
  const requestId = requestIdFor(commandId, ordinal),
    assetId = assetIdFor(requestId);
  const derivedFrom =
    asset.variant === 'derived' ? (state.assets.canonical.get(asset.entityId) ?? null) : null;
  if (
    !state.entities.has(asset.entityId) ||
    state.assets.assets.has(assetId) ||
    ordinal < 0 ||
    ordinal > 999 ||
    (asset.variant === 'derived' &&
      (!derivedFrom ||
        state.assets.assets.get(derivedFrom)?.contentHash !== asset.origin.referenceHash))
  )
    return reject('INVALID_BOOTSTRAP', 'The adopted picture has invalid initial lineage');
  return accept({
    type: 'AssetAdopted',
    payload: {
      assetId,
      requestId,
      entityId: asset.entityId,
      variant: asset.variant,
      ...purposeField(asset.purpose),
      label: asset.label,
      audience: asset.audience,
      version: 1,
      derivedFrom,
      contentHash: asset.contentHash,
      mediaType: asset.mediaType,
      generator: { ...asset.generator },
      origin: { ...asset.origin },
      status: 'CANDIDATE',
    },
  });
}
