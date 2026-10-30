import type { BootstrapCampaignCommand } from '@ltw/contracts';

import type { AssetRecord } from './records.ts';

/** Draft lineage remains verifiable after supersession, retraction and undo restores. */
export function adoptedProofMatches(
  asset: AssetRecord,
  source: BootstrapCampaignCommand['source'] | undefined,
  assets: ReadonlyMap<string, AssetRecord>,
): boolean {
  const origin = asset.origin;
  if (
    !origin ||
    !source ||
    origin.draftId !== source.draftId ||
    origin.revision > source.revision ||
    origin.manifestDigest !== source.visualManifestDigest
  )
    return false;
  if (asset.variant === 'reference')
    return asset.purpose === 'image' && asset.label === null && origin.referenceHash === null;
  const reference = asset.derivedFrom === null ? undefined : assets.get(asset.derivedFrom);
  return (
    asset.label !== null &&
    reference?.variant === 'reference' &&
    reference.entityId === asset.entityId &&
    reference.contentHash === origin.referenceHash
  );
}
