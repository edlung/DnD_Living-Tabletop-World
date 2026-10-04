import type { WorldState } from '../kernel/state.ts';

/**
 * Every chapter's sources are still in canon (ADR 0024 §4): the memories and
 * knowledge it cites exist, and the command of every event it tells stands
 * (Gate 05, G05-H02).
 */
export function chronicleViolations(state: WorldState): string[] {
  const violations: string[] = [];
  for (const record of state.chronicles.values()) {
    for (const entry of record.entries) {
      if (entry.source.kind === 'memory' && !state.memories.has(entry.source.memoryId)) {
        violations.push(
          `chronicle ${record.chronicleId} tells missing memory ${entry.source.memoryId}`,
        );
      }
      if (entry.source.kind === 'event') {
        const { commandId } = entry.source;
        const command = state.commands.get(commandId);
        if (!command || command.undoneBy !== null) {
          violations.push(`chronicle ${record.chronicleId} tells undone command ${commandId}`);
        }
      }
      for (const { knowledgeId } of entry.knowledge) {
        if (!state.knowledge.has(knowledgeId)) {
          violations.push(`chronicle ${record.chronicleId} cites missing knowledge ${knowledgeId}`);
        }
      }
    }
  }
  return violations;
}
