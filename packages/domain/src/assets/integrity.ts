import type { WorldState } from '../kernel/state.ts';
import { adoptedProofMatches } from './adoption-proof.ts';
import { assetIdFor, SETTLED_ASSET } from './records.ts';

/**
 * Structural invariants of the asset lineage (docs/adr/0022-asset-identity.md).
 * What still stands or runs depicts an existing entity; only settled lineage
 * (a finished or cancelled job, a retracted or discarded asset) may outlive
 * the entity an undo removed.
 */
export function assetViolations(state: WorldState): string[] {
  const violations: string[] = [];
  const report = (message: string) => violations.push(message);
  const exists = (entityId: string) => state.entities.has(entityId);
  const { requests, jobs, assets, canonical } = state.assets;

  for (const [id, request] of requests) {
    if (id !== request.requestId) report(`asset request key ${id} != ${request.requestId}`);
    if (!exists(request.entityId))
      report(`asset request ${id} depicts missing ${request.entityId}`);
    if (request.cancelled && jobs.has(id)) report(`cancelled asset request ${id} has a job`);
    if (request.derivedFrom !== null && !assets.has(request.derivedFrom)) {
      report(`asset request ${id} derives from missing ${request.derivedFrom}`);
    }
  }

  for (const [id, job] of jobs) {
    if (id !== job.requestId) report(`asset job key ${id} != ${job.requestId}`);
    const request = requests.get(id);
    if (
      request &&
      (request.entityId !== job.entityId ||
        request.variant !== job.variant ||
        request.purpose !== job.purpose)
    ) {
      report(`asset job ${id} does not copy its request`);
    }
    if (job.status === 'STARTED' && !exists(job.entityId)) {
      report(`running asset job ${id} depicts missing ${job.entityId}`);
    }
    const asset = assets.get(assetIdFor(id));
    if (job.status === 'COMPLETED' && (!asset || asset.status === 'DISCARDED')) {
      report(`completed asset job ${id} has no kept asset`);
    }
    if (job.status === 'CANCELLED' && asset && asset.status !== 'DISCARDED') {
      report(`cancelled asset job ${id} produced a kept asset`);
    }
    if (job.status === 'STARTED' && asset) report(`running asset job ${id} has an asset`);
  }

  for (const [id, asset] of assets) {
    if (id !== asset.assetId || id !== assetIdFor(asset.requestId)) {
      report(`asset key ${id} does not match its request ${asset.requestId}`);
    }
    const job = jobs.get(asset.requestId);
    if (asset.origin && !adoptedProofMatches(asset, state.bootstrap?.source, assets))
      report(`asset ${id} has invalid adopted provenance`);
    if (
      asset.origin
        ? job !== undefined || requests.has(asset.requestId)
        : job?.entityId !== asset.entityId || job.purpose !== asset.purpose
    ) {
      report(`asset ${id} has no matching job`);
    }
    // A figure or a battle map is a derived variant (ADR 0035 §4).
    if (asset.purpose !== 'image' && asset.variant !== 'derived') {
      report(`asset ${id} is a ${asset.purpose} but no derived variant`);
    }
    if (!SETTLED_ASSET.has(asset.status) && !exists(asset.entityId)) {
      report(`asset ${id} depicts missing ${asset.entityId}`);
    }
    if ((asset.status === 'CANONICAL') !== (canonical.get(asset.entityId) === id)) {
      report(`asset ${id} status ${asset.status} disagrees with the canonical reference`);
    }
    if ((asset.variant === 'derived') !== (asset.derivedFrom !== null)) {
      report(`asset ${id} derivation does not match its variant`);
    }
    if (asset.derivedFrom !== null && !assets.has(asset.derivedFrom)) {
      report(`asset ${id} derives from missing ${asset.derivedFrom}`);
    }
  }

  for (const [entityId, assetId] of canonical) {
    const asset = assets.get(assetId);
    if (asset?.status !== 'CANONICAL' || asset.entityId !== entityId || !exists(entityId)) {
      report(`canonical reference of ${entityId} is not a canonical asset of an existing entity`);
    }
  }
  return violations;
}
