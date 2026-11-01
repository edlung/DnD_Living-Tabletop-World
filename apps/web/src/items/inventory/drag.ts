import type { InventoryItem } from '@ltw/contracts';
import type { DragEvent } from 'react';

/** The drag's data type: an item of this pack, by ID (Stage 520). */
export const DRAG_TYPE = 'application/x-ltw-item';

/** The pack's item a drag carries, if any (only items of this pack are ever accepted). */
export function draggedItem(
  event: DragEvent,
  items: readonly InventoryItem[],
): InventoryItem | null {
  const itemId = event.dataTransfer.getData(DRAG_TYPE);
  return items.find((item) => item.itemId === itemId) ?? null;
}
