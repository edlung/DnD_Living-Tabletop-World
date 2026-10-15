import type {
  AssetAudience,
  AssetFailure,
  AssetMediaType,
  AssetPurpose,
  AssetRequestStatus,
  AssetStatus,
  AssetVariant,
} from './commands.ts';

/**
 * Asset views (docs/adr/0022-asset-identity.md, owner decision). A player
 * sees only approved assets of entities its character knows or perceives,
 * addressed by content hash: no IDs, labels, notes, lineage, requests, or
 * names. The DM sees the whole lineage.
 */
export interface PlayerAssetView {
  readonly variant: AssetVariant;
  /** What the image is for (docs/adr/0035-images.md §4); never names its entity. */
  readonly purpose: AssetPurpose;
  readonly version: number;
  readonly contentHash: string;
  readonly mediaType: AssetMediaType;
}

/** `GET /campaigns/:campaignId/entities/:entityId/assets?perspective=…` */
export interface EntityAssetsResponse {
  readonly perspective: string;
  readonly assets: readonly PlayerAssetView[];
}

export interface AssetRequestView {
  readonly requestId: string;
  readonly entityId: string;
  readonly variant: AssetVariant;
  readonly purpose: AssetPurpose;
  readonly label: string | null;
  readonly audience: AssetAudience;
  readonly note: string | null;
  /** The canonical reference a derived variant derives from. */
  readonly derivedFrom: string | null;
  readonly source:
    { readonly kind: 'dm' } | { readonly kind: 'authoring'; readonly proposalId: string };
  readonly status: AssetRequestStatus;
  readonly failure: AssetFailure | null;
  readonly requestedAt: number;
}

export interface AssetView {
  readonly assetId: string;
  readonly requestId: string;
  readonly entityId: string;
  readonly variant: AssetVariant;
  readonly purpose: AssetPurpose;
  readonly label: string | null;
  readonly audience: AssetAudience;
  readonly version: number;
  readonly derivedFrom: string | null;
  readonly contentHash: string;
  readonly mediaType: AssetMediaType;
  readonly generator: { readonly provider: string; readonly model: string };
  readonly status: AssetStatus;
}

/** `GET /campaigns/:campaignId/assets` (DM only): the lineage. */
export interface AssetLineageResponse {
  readonly requests: readonly AssetRequestView[];
  readonly assets: readonly AssetView[];
  readonly canonical: readonly { readonly entityId: string; readonly assetId: string }[];
}
