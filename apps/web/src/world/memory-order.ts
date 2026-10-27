import type { RecalledMemory } from '@ltw/contracts';

/**
 * The Journal's remembered events in the order they happened, the latest first (Stage 360). The
 * recall projection ranks memories by relevance, which read as a jumbled timeline under their
 * dates; the same memories are shown, only reordered. Memories of one moment keep their order.
 */
export const latestFirst = (memories: readonly RecalledMemory[]): RecalledMemory[] =>
  memories
    .map((recalled, index) => ({ recalled, index }))
    .sort(
      (a, b) => b.recalled.memory.occurredAt - a.recalled.memory.occurredAt || a.index - b.index,
    )
    .map(({ recalled }) => recalled);
