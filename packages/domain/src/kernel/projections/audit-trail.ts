import type { KernelCommandType } from '@ltw/contracts';

import type { Actor } from '../actor.ts';
import type { StoredCommand } from '../engine/event-store.ts';
import type { RecordedEvent } from '../events.ts';
import { footprintOf, isFactOfEntity, isFactOfScene } from '../facts.ts';

/**
 * Audit trail (invariant 11): who changed what, when (record order and world
 * time), why, and whether the change was later undone. Canonical/DM view;
 * it must not be exposed to player perspectives as-is.
 */
export interface AuditEntry {
  readonly sequence: number;
  readonly eventId: string;
  readonly type: RecordedEvent['type'];
  readonly worldTime: number;
  readonly recordedAt: string;
  readonly commandId: string;
  readonly commandType: KernelCommandType;
  readonly actor: Actor;
  readonly reason: string | null;
  /** Command ID of the undo that compensated this event's command, if any. */
  readonly undoneBy: string | null;
  /** For CommandUndone events: the compensated command. */
  readonly compensates: string | null;
}

export interface AuditFilter {
  readonly entityId?: string;
  readonly sceneId?: string;
  readonly commandId?: string;
  readonly actorId?: string;
}

export function auditTrail(
  history: readonly RecordedEvent[],
  options: { readonly commands?: readonly StoredCommand[]; readonly filter?: AuditFilter } = {},
): AuditEntry[] {
  const reasons = new Map(options.commands?.map((command) => [command.commandId, command.reason]));
  const undoneBy = new Map<string, string>();
  for (const event of history) {
    if (event.type === 'CommandUndone') {
      undoneBy.set(event.payload.targetCommandId, event.causation.commandId);
    }
  }

  const filter = options.filter ?? {};
  return history
    .filter((event) => matches(event, filter))
    .map((event) => ({
      sequence: event.sequence,
      eventId: event.eventId,
      type: event.type,
      worldTime: event.worldTime,
      recordedAt: event.recordedAt,
      commandId: event.causation.commandId,
      commandType: event.causation.commandType,
      actor: event.causation.actor,
      reason: reasons.get(event.causation.commandId) ?? null,
      undoneBy: undoneBy.get(event.causation.commandId) ?? null,
      compensates: event.type === 'CommandUndone' ? event.payload.targetCommandId : null,
    }));
}

function matches(event: RecordedEvent, filter: AuditFilter): boolean {
  if (filter.commandId !== undefined && event.causation.commandId !== filter.commandId) {
    return false;
  }
  if (filter.actorId !== undefined && event.causation.actor.actorId !== filter.actorId) {
    return false;
  }
  if (filter.entityId === undefined && filter.sceneId === undefined) return true;
  const { reads, writes } = footprintOf(event);
  const touched = [...reads, ...writes];
  const { entityId, sceneId } = filter;
  return (
    (entityId !== undefined && touched.some((fact) => isFactOfEntity(fact, entityId))) ||
    (sceneId !== undefined && touched.some((fact) => isFactOfScene(fact, sceneId)))
  );
}
