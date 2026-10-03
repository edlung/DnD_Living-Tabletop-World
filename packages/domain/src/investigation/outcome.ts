import type { KernelCommandType, PlayerOutcome } from '@ltw/contracts';

import type { KernelEvent } from '../kernel/events.ts';

/**
 * The player-visible outcome of an accepted player command
 * (docs/adr/0013-investigation.md §6), derived from its events. Never
 * carries clue IDs, DCs, claims, the NPC records a testimony came from, or
 * records the engine created in other scopes (ADR 0014 §4).
 */
export function playerOutcome(
  commandType: KernelCommandType,
  events: readonly KernelEvent[],
): PlayerOutcome | undefined {
  switch (commandType) {
    case 'EnterLocation': {
      const placed = events.find((event) => event.type === 'EntityPlaced');
      return placed ? { kind: 'EnterLocation', locationId: placed.payload.locationId } : undefined;
    }
    case 'AskAbout':
      return {
        kind: 'AskAbout',
        shared: events.flatMap((event) =>
          event.type === 'InformationShared' ? [event.payload.knowledgeId] : [],
        ),
      };
    case 'ExamineEntity': {
      const examined = events.find((event) => event.type === 'EvidenceExamined');
      if (!examined) return undefined;
      const roll = examined.payload.roll;
      return {
        kind: 'ExamineEntity',
        roll: roll ? { d20: roll.d20, modifier: roll.modifier, total: roll.total } : null,
        discovered: examined.payload.revealed.map(({ knowledgeId }) => knowledgeId),
      };
    }
    case 'FormHypothesis': {
      const formed = events.find(
        (event) =>
          event.type === 'KnowledgeAssigned' && event.payload.knowledgeType === 'HYPOTHESIS',
      );
      return formed?.type === 'KnowledgeAssigned'
        ? { kind: 'FormHypothesis', knowledgeId: formed.payload.knowledgeId }
        : undefined;
    }
    default:
      return undefined;
  }
}
