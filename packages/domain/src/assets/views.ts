import type {
  AssetLineageResponse,
  AssetMediaType,
  AssetRequestView,
  PlayerAssetView,
} from '@ltw/contracts';

import { perceivedEntityIds } from '../investigation/perception.ts';
import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { knownEntityIds } from '../knowledge/projection.ts';
import { SHOWN_ASSET, type AssetRecord } from './records.ts';

/**
 * Who sees which assets (docs/adr/0022-asset-identity.md §5, owner decision).
 * A non-DM perspective sees approved player assets of the entities it knows
 * or perceives, as variant, purpose (ADR 0035 §4), and content hash only
 * (no version since Gate 06), and only what presentation could choose for it
 * (`../visual/views.ts`); anything else is indistinguishable from an entity that does not
 * exist. The DM sees every approved asset, and the whole lineage separately.
 */

/** The entities a perspective may see assets of; `ALL` for the DM. */
export function assetVisibleEntityIds(
  state: WorldState,
  perspective: ResolvedPerspective,
): ReadonlySet<string> | 'ALL' {
  if (perspective.scopes === 'ALL') return 'ALL';
  const visible = knownEntityIds(state, perspective);
  // Perceived by the holder itself, or, for the party, by any party member.
  const perceivers =
    perspective.kind === 'PARTY'
      ? [...state.roster.keys()]
      : perspective.holderId === null
        ? []
        : [perspective.holderId];
  for (const perceiver of perceivers) {
    for (const entityId of perceivedEntityIds(state, perceiver)) visible.add(entityId);
  }
  return visible;
}

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
 * An entity's approved assets the perspective's audience and visibility allow; null when the
 * entity is not visible. The route lists these for the DM only: anyone else is given only what
 * presentation could choose for it (`entityAssetsAt` in `../visual/views.ts`, Gate 06).
 */
export function entityAssetsFor(
  state: WorldState,
  perspective: ResolvedPerspective,
  entityId: string,
): PlayerAssetView[] | null {
  const visible = assetVisibleEntityIds(state, perspective);
  if (!state.entities.has(entityId) || (visible !== 'ALL' && !visible.has(entityId))) return null;
  return sortedViews(
    [...state.assets.assets.values()].filter(
      (asset) => asset.entityId === entityId && shownTo(perspective, asset),
    ),
  );
}

/**
 * Whether the perspective may fetch these bytes: some asset with this
 * content it may see, of an entity it may see. Null otherwise, exactly as
 * for content that does not exist. The DM may fetch any asset's bytes, so
 * it can look at a candidate before approving it. The route serves anyone
 * else only what presentation could choose (`assetContentAt`, Gate 06).
 */
export function assetContentFor(
  state: WorldState,
  perspective: ResolvedPerspective,
  contentHash: string,
  /** The entities it may see; by default those it knows or perceives now (ADR 0023 adds a past time). */
  visible: ReadonlySet<string> | 'ALL' = assetVisibleEntityIds(state, perspective),
): { readonly mediaType: AssetMediaType } | null {
  for (const asset of state.assets.assets.values()) {
    if (asset.contentHash !== contentHash) continue;
    if (visible === 'ALL') return { mediaType: asset.mediaType };
    if (!shownTo(perspective, asset)) continue;
    if (!state.entities.has(asset.entityId)) continue;
    if (visible.has(asset.entityId)) return { mediaType: asset.mediaType };
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
