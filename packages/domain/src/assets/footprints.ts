import type { KernelEvent, Restore } from '../kernel/events.ts';
import { facts, type FactKey } from '../kernel/fact-keys.ts';

/**
 * Asset footprints (docs/adr/0022-asset-identity.md). A request reads the
 * existence of the entity it depicts, and a derived one the canonical
 * reference it derives from: undo of either is refused while the request
 * stands. What settles external work — the worker's reports, a cancel, a
 * retraction — reads nothing a world command wrote: it never blocks a world
 * undo by itself. The undo hold (`hold.ts`) keeps a running job, or an asset
 * not yet retracted, from losing what it depicts.
 */
type AssetEventType =
  | 'AssetRequested'
  | 'AssetJobStarted'
  | 'AssetGenerated'
  | 'AssetJobFailed'
  | 'AssetRequestCancelled'
  | 'AssetRetracted'
  | 'AssetApproved';

export function assetFootprint(event: Extract<KernelEvent, { type: AssetEventType }>): {
  reads: FactKey[];
  writes: FactKey[];
} {
  switch (event.type) {
    case 'AssetRequested': {
      const { requestId, entityId, derivedFrom } = event.payload;
      return {
        reads: [
          facts.clock(),
          facts.entity(entityId),
          ...(derivedFrom === null ? [] : [facts.assetCanonical(entityId)]),
        ],
        writes: [facts.assetRequest(requestId)],
      };
    }
    case 'AssetJobStarted':
    case 'AssetJobFailed':
    case 'AssetRequestCancelled':
      return { reads: [], writes: [facts.assetJob(event.payload.requestId)] };
    case 'AssetGenerated':
      return {
        reads: [],
        writes: [facts.assetJob(event.payload.requestId), facts.asset(event.payload.assetId)],
      };
    case 'AssetRetracted': {
      const { assetId, entityId, wasCanonical } = event.payload;
      return {
        reads: [],
        writes: [facts.asset(assetId), ...(wasCanonical ? [facts.assetCanonical(entityId)] : [])],
      };
    }
    case 'AssetApproved': {
      // What it approved, and each picture it superseded: the canonical reference before it, or
      // the approved pictures of its kind (ADR 0035 amendment).
      const { assetId, entityId, previous, supersedes = [] } = event.payload;
      const written = [
        facts.asset(assetId),
        facts.assetCanonical(entityId),
        ...(previous === null ? [] : [facts.asset(previous)]),
        ...supersedes.map((replaced) => facts.asset(replaced)),
      ];
      return { reads: written, writes: written };
    }
  }
}

export function assetRestoredFacts(
  restore: Extract<Restore, { fact: 'assetRequest' | 'asset' | 'assetCanonical' }>,
): FactKey[] {
  switch (restore.fact) {
    case 'assetRequest':
      return [facts.assetRequest(restore.requestId)];
    case 'asset':
      return [facts.asset(restore.assetId)];
    case 'assetCanonical':
      return [facts.assetCanonical(restore.entityId)];
  }
}
