import type {
  AssetAudience,
  AssetFailure,
  AssetMediaType,
  BattleMapGrid,
  AssetPurpose,
  AssetStatus,
  AssetVariant,
  CampaignBootstrapAsset,
} from '@ltw/contracts';

/**
 * Asset lineage (docs/adr/0022-asset-identity.md). Requests, the external jobs
 * that ran them, and the assets they produced, by ID; and each entity's
 * canonical visual reference. None of it is world state (invariant 14):
 * nothing here is read by a gameplay decision.
 */
export type AssetSource =
  { readonly kind: 'dm' } | { readonly kind: 'authoring'; readonly proposalId: string };

export interface AssetRequestRecord {
  readonly requestId: string;
  readonly entityId: string;
  readonly variant: AssetVariant;
  /** `image` for every request written before purposes existed (ADR 0035 §4). */
  readonly purpose: AssetPurpose;
  readonly label: string | null;
  readonly audience: AssetAudience;
  readonly note: string | null;
  /** The canonical reference a derived variant derives from. */
  readonly derivedFrom: string | null;
  readonly source: AssetSource;
  readonly requestedAt: number;
  /** Cancelled before any job started. */
  readonly cancelled: boolean;
}

/** One external run of a request; it outlives an undone request, for lineage. */
export interface AssetJobRecord {
  readonly requestId: string;
  readonly entityId: string;
  readonly variant: AssetVariant;
  readonly purpose: AssetPurpose;
  readonly label: string | null;
  readonly audience: AssetAudience;
  readonly note: string | null;
  readonly derivedFrom: string | null;
  readonly source: AssetSource;
  readonly requestedAt: number;
  readonly status: 'STARTED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  readonly failure: AssetFailure | null;
}

export interface AssetRecord {
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
  /** Exact already-generated draft bytes; absent for ordinary external jobs. */
  readonly origin?: CampaignBootstrapAsset['origin'] | undefined;
  /** A battle map's grid as the DM lined it up (docs/adr/0057-encounters-maps-loot.md §3). */
  readonly grid?: BattleMapGrid | undefined;
}

export interface AssetState {
  readonly requests: ReadonlyMap<string, AssetRequestRecord>;
  readonly jobs: ReadonlyMap<string, AssetJobRecord>;
  readonly assets: ReadonlyMap<string, AssetRecord>;
  /** Entity ID → its canonical reference asset ID (approved by the DM). */
  readonly canonical: ReadonlyMap<string, string>;
}

export const EMPTY_ASSETS: AssetState = {
  requests: new Map(),
  jobs: new Map(),
  assets: new Map(),
  canonical: new Map(),
};

/** Request IDs come from the requesting command's ID, so they are unique and never reused. */
export const requestIdFor = (commandId: string, index: number) => `${commandId}#${String(index)}`;
export const assetIdFor = (requestId: string) => `${requestId}~asset`;

/** Statuses that settle an asset: retracted by the DM, or discarded because its job was cancelled. */
export const SETTLED_ASSET: ReadonlySet<AssetStatus> = new Set(['RETRACTED', 'DISCARDED']);
/** Statuses players may ever see. */
export const SHOWN_ASSET: ReadonlySet<AssetStatus> = new Set(['CANONICAL', 'APPROVED']);

/**
 * A purpose as an event payload carries it (ADR 0035 §4): absent for `image`, so an image request
 * is written exactly as before purposes existed and re-decides identically against old histories.
 */
export const purposeField = (purpose: AssetPurpose): { readonly purpose?: AssetPurpose } =>
  purpose === 'image' ? {} : { purpose };

/**
 * Whether two pictures of one entity are of the same kind, the kind presentation shows one of
 * (ADR 0035, amendment "an approval supersedes its kind"): the reference; a derived image per
 * label (chosen by its label's state tags, ADR 0023 §4); a figure; a battle map. A figure's or a
 * battle map's label chooses nothing, so any two figures of an entity are of one kind. Approving
 * a picture supersedes the approved pictures of its kind.
 */
export const sameKind = (
  a: Pick<AssetRecord, 'entityId' | 'variant' | 'purpose' | 'label'>,
  b: Pick<AssetRecord, 'entityId' | 'variant' | 'purpose' | 'label'>,
): boolean =>
  a.entityId === b.entityId &&
  a.variant === b.variant &&
  a.purpose === b.purpose &&
  (a.purpose !== 'image' || a.label === b.label);

/** Which entity kinds each non-image purpose depicts (ADR 0035 §4). */
export const PURPOSE_KINDS: Readonly<Record<Exclude<AssetPurpose, 'image'>, ReadonlySet<string>>> =
  {
    figure: new Set(['character', 'npc', 'creature']),
    'battle-map': new Set(['location']),
  };
