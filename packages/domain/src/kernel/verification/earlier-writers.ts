import { writtenEarlier } from '../event-versions.ts';
import type { RecordedEvent } from '../events.ts';
import type { WorldState } from '../state.ts';

/**
 * Independent check of undo on history earlier writers decided (ADR 0006,
 * Gate 03 retest 3 amendment; G03-H07). An undo the current writer accepted
 * must not have reached beneath a command an earlier writer decided while
 * that command still stood: such a command rests on everything before it.
 * Returns the undo commands that broke this, by ID. Used by tests and audits.
 */
export function undoneBeneathEarlierWriters(
  state: WorldState,
  history: readonly RecordedEvent[],
): string[] {
  const undoneAt = new Map<string, number>();
  const earlier = new Set<string>();
  for (const event of history) {
    if (event.type === 'CommandUndone') {
      undoneAt.set(event.payload.targetCommandId, event.sequence);
    } else if (writtenEarlier(event)) {
      earlier.add(event.causation.commandId);
    }
  }
  const standing = [...earlier].flatMap((commandId) => {
    const command = state.commands.get(commandId);
    return command ? [command] : [];
  });
  const broken: string[] = [];
  for (const event of history) {
    if (event.type !== 'CommandUndone' || writtenEarlier(event)) continue;
    const target = state.commands.get(event.payload.targetCommandId);
    if (!target) continue;
    const beneath = standing.some(
      (command) =>
        command.firstSequence > target.lastSequence &&
        command.firstSequence < event.sequence &&
        (undoneAt.get(command.commandId) ?? Infinity) > event.sequence,
    );
    if (beneath) broken.push(event.causation.commandId);
  }
  return broken;
}
