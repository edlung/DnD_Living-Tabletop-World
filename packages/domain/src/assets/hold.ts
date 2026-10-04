import type { RecordedEvent } from '../kernel/events.ts';
import type { UndoBlocker } from '../kernel/decide/undo.ts';
import type { WorldState } from '../kernel/state.ts';
import { assetIdFor, SETTLED_ASSET } from './records.ts';

/**
 * The asset hold on undo (ADR 0006 §9, docs/adr/0022-asset-identity.md): a
 * started external job cannot be recalled, so undoing the command that
 * requested it is refused while the job runs, or while the asset it produced
 * is neither retracted nor discarded. Cancelling the job or retracting the
 * asset releases the hold; the lineage stays on record.
 */
export function assetHoldBlockers(
  state: WorldState,
  history: readonly RecordedEvent[],
  targetEvents: readonly RecordedEvent[],
): UndoBlocker[] {
  const blockers: UndoBlocker[] = [];
  for (const event of targetEvents) {
    if (event.type !== 'AssetRequested') continue;
    const { requestId } = event.payload;
    const job = state.assets.jobs.get(requestId);
    if (!job) continue;
    const assetId = assetIdFor(requestId);
    const asset = state.assets.assets.get(assetId);
    const held =
      job.status === 'STARTED' ||
      (job.status === 'COMPLETED' && asset !== undefined && !SETTLED_ASSET.has(asset.status));
    if (!held) continue;
    // The latest command that moved the job or its asset on.
    const latest = [...history]
      .reverse()
      .find(
        (later) =>
          ((later.type === 'AssetJobStarted' || later.type === 'AssetGenerated') &&
            later.payload.requestId === requestId) ||
          (later.type === 'AssetApproved' && later.payload.assetId === assetId),
      );
    if (latest) {
      blockers.push({
        commandId: latest.causation.commandId,
        commandType: latest.causation.commandType,
        sequence: latest.sequence,
      });
    }
  }
  return blockers;
}
