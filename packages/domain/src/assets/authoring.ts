import type { KernelEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import { assetRequest } from './decide.ts';

/** Entity kinds an authoring commit queues a visual reference for (owner decision, ADR 0022 §2). */
const DEPICTED_ON_CREATION: ReadonlySet<string> = new Set(['npc', 'location']);

/**
 * The asset requests an authoring commit adds: one reference for each NPC
 * or location it creates, for players, sourced from the proposal. They are
 * part of the commit, so undoing it removes them while no job has started.
 */
export function authoringAssetRequests(
  state: WorldState,
  commandId: string,
  proposalId: string,
  drafts: readonly KernelEvent[],
): KernelEvent[] {
  const requests: KernelEvent[] = [];
  for (const draft of drafts) {
    if (draft.type !== 'EntityCreated' || !DEPICTED_ON_CREATION.has(draft.payload.kind)) continue;
    const made = assetRequest(state, commandId, requests.length, {
      entityId: draft.payload.entityId,
      variant: 'reference',
      label: null,
      audience: 'players',
      note: null,
      source: { kind: 'authoring', proposalId },
    });
    if (!made.ok)
      throw new Error(`a reference request cannot be refused: ${made.rejection.message}`);
    requests.push(made.event);
  }
  return requests;
}
