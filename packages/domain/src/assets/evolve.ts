import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import type { RecordedEvent, Restore } from '../kernel/events.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';
import type { AssetJobRecord, AssetRecord, AssetState } from './records.ts';

/**
 * Fold and undo restores of the asset lineage (docs/adr/0022-asset-identity.md).
 * A job's events apply whether or not its request still stands: an undone
 * request leaves the external work it started on record, for lineage.
 */
type AssetEvent = Extract<
  RecordedEvent,
  {
    type:
      | 'AssetRequested'
      | 'AssetJobStarted'
      | 'AssetGenerated'
      | 'AssetJobFailed'
      | 'AssetRequestCancelled'
      | 'AssetRetracted'
      | 'AssetApproved';
  }
>;

const with_ = (state: WorldState, assets: Partial<AssetState>): WorldState => ({
  ...state,
  assets: { ...state.assets, ...assets },
});

function job(state: WorldState, requestId: string): AssetJobRecord {
  const found = state.assets.jobs.get(requestId);
  if (!found) throw new CorruptHistoryError(`no asset job for ${requestId}`);
  return found;
}

export function applyAssetEvent(state: WorldState, event: AssetEvent): WorldState {
  const { assets } = state;
  switch (event.type) {
    case 'AssetRequested': {
      const p = event.payload;
      if (!state.entities.has(p.entityId)) {
        throw new CorruptHistoryError(`asset requested for unknown entity ${p.entityId}`);
      }
      if (assets.requests.has(p.requestId) || assets.jobs.has(p.requestId)) {
        throw new CorruptHistoryError(`asset request ${p.requestId} already exists`);
      }
      return with_(state, {
        requests: withEntry(assets.requests, p.requestId, {
          ...p,
          purpose: p.purpose ?? 'image',
          requestedAt: event.worldTime,
          cancelled: false,
        }),
      });
    }
    case 'AssetJobStarted': {
      const p = event.payload;
      if (assets.jobs.has(p.requestId)) {
        throw new CorruptHistoryError(`asset job ${p.requestId} already started`);
      }
      return with_(state, {
        jobs: withEntry(assets.jobs, p.requestId, {
          ...p,
          purpose: p.purpose ?? 'image',
          status: 'STARTED',
          failure: null,
        }),
      });
    }
    case 'AssetGenerated': {
      const p = event.payload;
      const run = job(state, p.requestId);
      if (assets.assets.has(p.assetId)) {
        throw new CorruptHistoryError(`asset ${p.assetId} already exists`);
      }
      return with_(state, {
        assets: withEntry(assets.assets, p.assetId, { ...p, purpose: p.purpose ?? 'image' }),
        jobs: withEntry(assets.jobs, p.requestId, {
          ...run,
          status: run.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED',
        }),
      });
    }
    case 'AssetJobFailed': {
      const run = job(state, event.payload.requestId);
      return with_(state, {
        jobs: withEntry(assets.jobs, run.requestId, {
          ...run,
          status: run.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
          failure: event.payload.reason,
        }),
      });
    }
    case 'AssetRequestCancelled': {
      const { requestId, phase } = event.payload;
      if (phase === 'started') {
        const run = job(state, requestId);
        return with_(state, {
          jobs: withEntry(assets.jobs, requestId, { ...run, status: 'CANCELLED' }),
        });
      }
      const request = assets.requests.get(requestId);
      // Folding effective history only (the undo oracle), the cancelled
      // request may since have been undone: nothing is left to cancel.
      if (!request) return state;
      return with_(state, {
        requests: withEntry(assets.requests, requestId, { ...request, cancelled: true }),
      });
    }
    case 'AssetRetracted': {
      const { assetId, entityId, wasCanonical } = event.payload;
      const asset = assets.assets.get(assetId);
      if (!asset) throw new CorruptHistoryError(`no asset ${assetId}`);
      return with_(state, {
        assets: withEntry(assets.assets, assetId, { ...asset, status: 'RETRACTED' }),
        canonical: wasCanonical ? withoutEntry(assets.canonical, entityId) : assets.canonical,
      });
    }
    case 'AssetApproved': {
      const { assetId, entityId, variant, previous } = event.payload;
      const asset = assets.assets.get(assetId);
      if (asset?.status !== 'CANDIDATE')
        throw new CorruptHistoryError(`asset ${assetId} is no candidate`);
      let records: ReadonlyMap<string, AssetRecord> = withEntry(assets.assets, assetId, {
        ...asset,
        status: variant === 'reference' ? 'CANONICAL' : 'APPROVED',
      });
      const before = previous === null ? undefined : records.get(previous);
      if (before) records = withEntry(records, before.assetId, { ...before, status: 'SUPERSEDED' });
      return with_(state, {
        assets: records,
        canonical:
          variant === 'reference'
            ? withEntry(assets.canonical, entityId, assetId)
            : assets.canonical,
      });
    }
  }
}

export function applyAssetRestore(
  state: WorldState,
  restore: Extract<Restore, { fact: 'assetRequest' | 'asset' | 'assetCanonical' }>,
): WorldState {
  const { assets } = state;
  switch (restore.fact) {
    case 'assetRequest':
      return with_(state, { requests: withoutEntry(assets.requests, restore.requestId) });
    case 'asset':
      return with_(state, {
        assets: withEntry(assets.assets, restore.assetId, {
          ...restore.value,
          purpose: restore.value.purpose ?? 'image',
        }),
      });
    case 'assetCanonical':
      return with_(state, {
        canonical:
          restore.value === null
            ? withoutEntry(assets.canonical, restore.entityId)
            : withEntry(assets.canonical, restore.entityId, restore.value),
      });
  }
}
