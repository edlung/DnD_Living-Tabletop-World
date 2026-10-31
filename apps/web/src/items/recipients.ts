import type { EntityRef, ScenePresentationResponse } from '@ltw/contracts';

import type { Recipient } from './items-sheet.tsx';

/** Who the acting character can hand something to: the people they perceive in the viewed place. */
export function recipientsOf(
  view: ScenePresentationResponse | null,
  directory: readonly EntityRef[],
  actorId: string | null,
): Recipient[] {
  if (view === null || actorId === null) return [];
  return view.present
    .filter(
      (entity) =>
        entity.observed &&
        entity.entityId !== actorId &&
        (entity.kind === 'character' || entity.kind === 'npc') &&
        entity.status === 'active',
    )
    .flatMap((entity) => {
      const name = directory.find((known) => known.entityId === entity.entityId)?.name;
      return name ? [{ entityId: entity.entityId, name }] : [];
    });
}
