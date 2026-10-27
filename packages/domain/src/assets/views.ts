import type {
  AssetLineageResponse,
  AssetMediaType,
  AssetRequestView,
  PlayerAssetView,
} from '@ltw/contracts';

import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { SHOWN_ASSET, type AssetRecord } from './records.ts';

/**
 * Who sees which assets (docs/adr/0022-asset-identity.md §5, owner decision).
 * A non-DM perspective sees approved player assets, as variant, purpose (ADR
 * 0035 §4), and content hash only (no version since Gate 06), and only what
 * presentation could choose for it (`../visual/views.ts`, the only player
 * entry points); anything else is indistinguishable from an entity or content
 * that does not exist. The DM sees every approved asset, and the whole lineage
 * separately (this file).
 */

export function shownTo(perspective: ResolvedPerspective, asset: AssetRecord): boolean {
  return (
    SHOWN_ASSET.has(asset.status) && (perspective.scopes === 'ALL' || asset.audience === 'players')
  );
}

const ORDER = { reference: 0, derived: 1 } as const;

/**
 * The only fields of an asset a player sees: never IDs, labels, notes, generator, lineage, or the
 * version, which counts the DM-only, candidate and retracted pictures of its kind as well (Gate
 * 06, G06-images-03); the DM reads versions in the lineage.
 */
export const playerAssetView = ({
  variant,
  purpose,
  contentHash,
  mediaType,
}: AssetRecord): PlayerAssetView => ({ variant, purpose, contentHash, mediaType });

/** Reference first, then derived pictures in the order they were made. */
export const sortedViews = (assets: readonly AssetRecord[]): PlayerAssetView[] =>
  [...assets]
    .sort((a, b) => ORDER[a.variant] - ORDER[b.variant] || a.version - b.version)
    .map(playerAssetView);

/**
 * The DM's view of an entity's approved assets, every audience; null when the entity does not
 * exist. DM only by construction (no perspective): a player's list is `entityAssetsAt` in
 * `../visual/views.ts` (Gate 06), never this broader pool.
 */
export function dmEntityAssets(state: WorldState, entityId: string): PlayerAssetView[] | null {
  if (!state.entities.has(entityId)) return null;
  return sortedViews(
    [...state.assets.assets.values()].filter(
      (asset) => asset.entityId === entityId && SHOWN_ASSET.has(asset.status),
    ),
  );
}

/**
 * Whether the DM may fetch these bytes: any asset's, a candidate's included, so the DM can look
 * at it before approving it. Null for content no asset holds. DM only by construction: a player's
 * check is `assetContentAt` in `../visual/views.ts` (Gate 06).
 */
export function dmAssetContent(
  state: WorldState,
  contentHash: string,
): { readonly mediaType: AssetMediaType } | null {
  for (const asset of state.assets.assets.values()) {
    if (asset.contentHash === contentHash) return { mediaType: asset.mediaType };
  }
  return null;
}

/**
 * The DM's full lineage: requests (with the jobs that ran them), assets, canonical references, and
 * the recorded descriptions an image request sends the image model (Gate 06, G06-images-04).
 */
export function assetLineage(state: WorldState): AssetLineageResponse {
  const { requests, jobs, assets, canonical } = state.assets;
  const views: AssetRequestView[] = [];
  for (const request of requests.values()) {
    const { cancelled, ...fields } = request;
    const job = jobs.get(request.requestId);
    views.push({
      ...fields,
      status: job ? job.status : cancelled ? 'CANCELLED' : 'QUEUED',
      failure: job?.failure ?? null,
    });
  }
  // A job outlives a request an undo removed: its copy keeps the lineage.
  for (const job of jobs.values()) {
    if (requests.has(job.requestId)) continue;
    const { status, failure, ...fields } = job;
    views.push({ ...fields, status, failure });
  }
  return {
    requests: views.sort((a, b) => a.requestedAt - b.requestedAt),
    assets: [...assets.values()],
    canonical: [...canonical].map(([entityId, assetId]) => ({ entityId, assetId })),
    // As the image prompt reads it (`taskText`): trimmed, and nothing when empty.
    descriptions: [...state.entities.values()].flatMap(({ entityId, description }) =>
      description.trim() === '' ? [] : [{ entityId, description: description.trim() }],
    ),
  };
}
