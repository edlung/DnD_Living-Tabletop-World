import type { KernelEvent } from '../kernel/events.ts';
import { findEntity } from '../kernel/decide/lookups.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { assetIdFor, requestIdFor, type AssetSource } from './records.ts';

/**
 * Asset commands (docs/adr/0022-asset-identity.md). The DM requests,
 * cancels, retracts, and approves; the asset worker reports what external
 * work did. Nothing here reads or writes world state beyond an entity's
 * existence: a generated image never canonizes anything (invariant 14).
 */
const invalid = (message: string) => reject('INVALID_ASSET', message);

/** One request for an entity, as `RequestAsset` or an authoring commit makes it. */
export function assetRequest(
  state: WorldState,
  commandId: string,
  index: number,
  request: {
    readonly entityId: string;
    readonly variant: 'reference' | 'derived';
    readonly label: string | null;
    readonly audience: 'players' | 'dm';
    readonly note: string | null;
    readonly source: AssetSource;
  },
): { readonly ok: true; readonly event: KernelEvent } | (Decision & { ok: false }) {
  const derivedFrom = state.assets.canonical.get(request.entityId) ?? null;
  if (request.variant === 'derived') {
    if (request.label === null) return invalid('A derived variant needs a label');
    if (derivedFrom === null)
      return invalid('The entity has no canonical reference to derive from');
  } else if (request.label !== null) {
    return invalid('A reference has no label');
  }
  return {
    ok: true,
    event: {
      type: 'AssetRequested',
      payload: {
        requestId: requestIdFor(commandId, index),
        ...request,
        derivedFrom: request.variant === 'derived' ? derivedFrom : null,
      },
    },
  };
}

export function decideRequestAsset(
  state: WorldState,
  commandId: string,
  command: ResolvedCommandOf<'RequestAsset'>,
): Decision {
  const entity = findEntity(state, command.entityId);
  if (!entity.ok) return entity;
  const made = assetRequest(state, commandId, 0, {
    entityId: command.entityId,
    variant: command.variant,
    label: command.label ?? null,
    audience: command.audience ?? 'players',
    note: command.note ?? null,
    source: { kind: 'dm' },
  });
  return made.ok ? accept(made.event) : made;
}

export function decideStartAssetJob(
  state: WorldState,
  command: ResolvedCommandOf<'StartAssetJob'>,
): Decision {
  const request = state.assets.requests.get(command.requestId);
  if (!request || state.assets.jobs.has(command.requestId)) {
    return invalid('No queued request with this ID');
  }
  const { cancelled, ...copied } = request;
  if (cancelled) return invalid('No queued request with this ID');
  return accept({ type: 'AssetJobStarted', payload: { ...copied, source: { ...copied.source } } });
}

export function decideCompleteAssetJob(
  state: WorldState,
  command: ResolvedCommandOf<'CompleteAssetJob'>,
): Decision {
  const run = state.assets.jobs.get(command.requestId);
  if (!run || (run.status !== 'STARTED' && run.status !== 'CANCELLED')) {
    return invalid('No running job with this ID');
  }
  const assetId = assetIdFor(run.requestId);
  if (state.assets.assets.has(assetId)) return invalid('This job already produced its asset');
  const earlier = [...state.assets.assets.values()].filter(
    (asset) =>
      asset.entityId === run.entityId && asset.variant === run.variant && asset.label === run.label,
  );
  return accept({
    type: 'AssetGenerated',
    payload: {
      assetId,
      requestId: run.requestId,
      entityId: run.entityId,
      variant: run.variant,
      label: run.label,
      audience: run.audience,
      version: earlier.length + 1,
      derivedFrom: run.derivedFrom,
      contentHash: command.contentHash,
      mediaType: command.mediaType,
      generator: { ...command.generator },
      status: run.status === 'CANCELLED' ? 'DISCARDED' : 'CANDIDATE',
    },
  });
}

export function decideFailAssetJob(
  state: WorldState,
  command: ResolvedCommandOf<'FailAssetJob'>,
): Decision {
  const run = state.assets.jobs.get(command.requestId);
  if (!run || (run.status !== 'STARTED' && run.status !== 'CANCELLED') || run.failure !== null) {
    return invalid('No running job with this ID');
  }
  return accept({
    type: 'AssetJobFailed',
    payload: { requestId: run.requestId, reason: command.reason },
  });
}

export function decideCancelAssetRequest(
  state: WorldState,
  command: ResolvedCommandOf<'CancelAssetRequest'>,
): Decision {
  const { requestId } = command;
  const run = state.assets.jobs.get(requestId);
  if (run) {
    if (run.status !== 'STARTED') return invalid('The job is no longer running');
    return accept({ type: 'AssetRequestCancelled', payload: { requestId, phase: 'started' } });
  }
  const request = state.assets.requests.get(requestId);
  if (!request || request.cancelled) return invalid('No queued request with this ID');
  return accept({ type: 'AssetRequestCancelled', payload: { requestId, phase: 'queued' } });
}

export function decideRetractAsset(
  state: WorldState,
  command: ResolvedCommandOf<'RetractAsset'>,
): Decision {
  const asset = state.assets.assets.get(command.assetId);
  if (!asset || asset.status === 'RETRACTED' || asset.status === 'DISCARDED') {
    return invalid('No asset to retract');
  }
  return accept({
    type: 'AssetRetracted',
    payload: {
      assetId: asset.assetId,
      entityId: asset.entityId,
      wasCanonical: state.assets.canonical.get(asset.entityId) === asset.assetId,
    },
  });
}

export function decideApproveAsset(
  state: WorldState,
  command: ResolvedCommandOf<'ApproveAsset'>,
): Decision {
  const asset = state.assets.assets.get(command.assetId);
  if (asset?.status !== 'CANDIDATE') return invalid('Only a candidate asset can be approved');
  return accept({
    type: 'AssetApproved',
    payload: {
      assetId: asset.assetId,
      entityId: asset.entityId,
      variant: asset.variant,
      previous:
        asset.variant === 'reference' ? (state.assets.canonical.get(asset.entityId) ?? null) : null,
    },
  });
}
