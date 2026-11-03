import type { AssetPurpose } from '@ltw/contracts';

import type { KernelEvent } from '../kernel/events.ts';
import { findEntity } from '../kernel/decide/lookups.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import {
  assetIdFor,
  purposeField,
  PURPOSE_KINDS,
  requestIdFor,
  sameKind,
  type AssetSource,
} from './records.ts';

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
    readonly purpose: AssetPurpose;
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
  // A figure or a battle map is a derived variant of the canonical reference (ADR 0035 §4).
  if (request.purpose !== 'image') {
    if (request.variant !== 'derived') {
      return invalid('A figure or a battle map is a derived variant');
    }
    const kind = state.entities.get(request.entityId)?.kind;
    if (kind === undefined || !PURPOSE_KINDS[request.purpose].has(kind)) {
      return invalid(
        request.purpose === 'figure'
          ? 'Only a character, an NPC or a creature has a figure'
          : 'Only a location has a battle map',
      );
    }
  }
  const { purpose, ...fields } = request;
  return {
    ok: true,
    event: {
      type: 'AssetRequested',
      payload: {
        requestId: requestIdFor(commandId, index),
        ...fields,
        ...purposeField(purpose),
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
    purpose: command.purpose ?? 'image',
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
  const { cancelled, purpose, ...copied } = request;
  if (cancelled) return invalid('No queued request with this ID');
  return accept({
    type: 'AssetJobStarted',
    payload: { ...copied, ...purposeField(purpose), source: { ...copied.source } },
  });
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
  // Versions count per purpose too (ADR 0035 §4): a `wounded` figure is not the next `wounded`
  // image. Completions are folded as recorded, and histories before purposes hold only images.
  const earlier = [...state.assets.assets.values()].filter(
    (asset) =>
      asset.entityId === run.entityId &&
      asset.variant === run.variant &&
      asset.label === run.label &&
      asset.purpose === run.purpose,
  );
  return accept({
    type: 'AssetGenerated',
    payload: {
      assetId,
      requestId: run.requestId,
      entityId: run.entityId,
      variant: run.variant,
      ...purposeField(run.purpose),
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

/**
 * Approving a candidate makes it the picture of its kind (docs/STAGE_330_DESIGN.md "DM controls":
 * a new request's approval supersedes the approved one; ADR 0035 amendment): a reference becomes
 * the canonical reference and supersedes the one before (`previous`); a derived picture supersedes
 * the approved pictures of its kind (`supersedes`: an earlier writer may have left several).
 */
export function decideApproveAsset(
  state: WorldState,
  command: ResolvedCommandOf<'ApproveAsset'>,
): Decision {
  const asset = state.assets.assets.get(command.assetId);
  if (asset?.status !== 'CANDIDATE') return invalid('Only a candidate asset can be approved');
  const supersedes =
    asset.variant === 'derived'
      ? [...state.assets.assets.values()]
          .filter((other) => other.status === 'APPROVED' && sameKind(other, asset))
          .map((other) => other.assetId)
      : [];
  return accept({
    type: 'AssetApproved',
    payload: {
      assetId: asset.assetId,
      entityId: asset.entityId,
      variant: asset.variant,
      previous:
        asset.variant === 'reference' ? (state.assets.canonical.get(asset.entityId) ?? null) : null,
      ...(supersedes.length > 0 ? { supersedes } : {}),
    },
  });
}

/**
 * The DM lines a battle map's grid up with the board (docs/adr/0057-encounters-maps-loot.md §3):
 * a candidate or approved battle map, its first full cell's corner inside one cell. Visual state:
 * the picture's record changes, never a world fact; undo puts the earlier grid back.
 */
export function decideAlignBattleMap(
  state: WorldState,
  command: ResolvedCommandOf<'AlignBattleMap'>,
): Decision {
  const asset = state.assets.assets.get(command.assetId);
  if (asset?.purpose !== 'battle-map') return invalid('Only a battle map has a grid');
  if (asset.status !== 'CANDIDATE' && asset.status !== 'APPROVED')
    return invalid('Only a standing battle map takes a grid');
  const { grid } = command;
  if (grid.originX >= grid.cellPx || grid.originY >= grid.cellPx)
    return invalid('The first cell starts inside one cell of the picture');
  const known = asset.grid;
  if (
    known &&
    known.cellPx === grid.cellPx &&
    known.originX === grid.originX &&
    known.originY === grid.originY &&
    known.columns === grid.columns &&
    known.rows === grid.rows
  )
    return reject('NO_EFFECT', 'The grid is already so');
  return accept({
    type: 'BattleMapAligned',
    payload: { assetId: asset.assetId, grid: { ...grid } },
  });
}
