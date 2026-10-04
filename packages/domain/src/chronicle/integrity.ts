import type { WorldState } from '../kernel/state.ts';

/** Every chapter's memory and knowledge sources still exist (ADR 0024 §4). */
export function chronicleViolations(state: WorldState): string[] {
  const violations: string[] = [];
  for (const record of state.chronicles.values()) {
    for (const entry of record.entries) {
      if (entry.source.kind === 'memory' && !state.memories.has(entry.source.memoryId)) {
        violations.push(
          `chronicle ${record.chronicleId} tells missing memory ${entry.source.memoryId}`,
        );
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
