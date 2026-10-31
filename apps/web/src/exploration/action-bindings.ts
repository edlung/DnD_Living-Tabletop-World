import type { ContextAction, KernelCommandOf } from '@ltw/contracts';

export type ExplorationCommand = KernelCommandOf<
  | 'EnterLocation'
  | 'AskAbout'
  | 'ShowEvidence'
  | 'InsightCheck'
  | 'ExamineEntity'
  | 'FormHypothesis'
  | 'CastSpell'
  | 'EquipItem'
  | 'UnequipItem'
  | 'UseItem'
  | 'GiveItem'
  | 'DropItem'
  | 'TakeItem'
>;

/**
 * Bind a server-provided exploration option to its existing command shape.
 * Availability is only a snapshot; the World Engine checks every submission again.
 * Talk, recall, and topic/statement pickers have their own interaction flows.
 */
export function commandFor(
  action: ContextAction,
  characterId: string,
  targetId: string,
): ExplorationCommand | null {
  if (!action.legal || !characterId || !targetId) return null;
  switch (action.id) {
    case 'inspect':
      return { type: 'ExamineEntity', characterId, entityId: targetId, method: 'inspect' };
    case 'investigation_check':
      return { type: 'ExamineEntity', characterId, entityId: targetId, method: 'investigation' };
    case 'perception_check':
      return { type: 'ExamineEntity', characterId, entityId: targetId, method: 'perception' };
    case 'ask_about':
      return action.topic?.entityId
        ? { type: 'AskAbout', characterId, npcId: targetId, topicId: action.topic.entityId }
        : null;
    case 'show_evidence':
      return action.evidence?.knowledgeId
        ? {
            type: 'ShowEvidence',
            characterId,
            npcId: targetId,
            knowledgeId: action.evidence.knowledgeId,
          }
        : null;
    case 'take_item':
      return { type: 'TakeItem', characterId, itemId: targetId };
    case 'enter_location':
      return { type: 'EnterLocation', characterId, locationId: targetId };
    case 'detect_magic':
      return action.cost
        ? {
            type: 'CastSpell',
            combatantId: characterId,
            spellId: 'detect-magic',
            using: action.cost.kind === 'free' ? 'free' : { slotLevel: action.cost.slotLevel },
          }
        : null;
    default:
      return null;
  }
}
