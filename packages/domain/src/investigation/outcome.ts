import type { KernelCommandType, PlayerOutcome } from '@ltw/contracts';

import type { KernelEvent } from '../kernel/events.ts';

/**
 * The player-visible outcome of an accepted player command
 * (docs/adr/0013-investigation.md §6), derived from its events. Never
 * carries clue IDs, DCs, or the NPC records a testimony came from.
 */
export function playerOutcome(
  commandType: KernelCommandType,
  events: readonly KernelEvent[],
): PlayerOutcome | undefined {
  const assigned = events.flatMap((event) =>
    event.type === 'KnowledgeAssigned' ? [event.payload.knowledgeId] : [],
  );
  switch (commandType) {
    case 'EnterLocation': {
      const placed = events.find((event) => event.type === 'EntityPlaced');
      return placed ? { kind: 'EnterLocation', locationId: placed.payload.locationId } : undefined;
    }
    case 'AskAbout':
      return { kind: 'AskAbout', shared: assigned };
    case 'ExamineEntity': {
      const examined = events.find((event) => event.type === 'EvidenceExamined');
      if (!examined) return undefined;
      const roll = examined.payload.roll;
      return {
        kind: 'ExamineEntity',
        roll: roll ? { d20: roll.d20, modifier: roll.modifier, total: roll.total } : null,
        discovered: assigned,
      };
    }
    case 'FormHypothesis': {
      const [knowledgeId] = assigned;
      return knowledgeId === undefined ? undefined : { kind: 'FormHypothesis', knowledgeId };
    }
    default:
      return undefined;
  }
}
