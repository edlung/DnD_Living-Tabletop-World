import type { RecordedPremise } from '../investigation/events.ts';
import { scopedKey, shownKey } from '../investigation/records.ts';
import { entityChecked, facts, type FactKey } from './fact-keys.ts';

/**
 * The facts a recorded premise stands for (Gate 02, G02-H02): what an
 * accepted player or combat command relied on, so undo sees the dependency.
 */
export function premiseFacts(characterId: string, premise: RecordedPremise): FactKey[] {
  const party = [facts.preparedParty(), facts.rosterCharacter(characterId)];
  switch (premise.kind) {
    case 'perceived':
      // Seen where both stood: the target's existence and placement, and the character's.
      return [
        facts.entity(premise.entityId),
        facts.entityPlacement(premise.entityId),
        facts.entityPlacement(characterId),
      ];
    case 'self':
      return [];
    case 'party-member':
      return [facts.rosterCharacter(premise.characterId), ...party];
    case 'knowledge':
      return [facts.knowledge(premise.knowledgeId), ...(premise.viaParty ? party : [])];
    case 'memory':
      return [facts.memory(premise.memoryId), ...(premise.viaParty ? party : [])];
    case 'sheet':
      return [facts.sheet(characterId)];
    case 'party':
      return party;
    case 'controller':
      return [facts.rosterCharacter(characterId), facts.rosterPlayer(premise.playerActorId)];
    case 'vitals':
      // Everything a combat decision may read about a creature (Gate 03, G03-H02).
      return [
        ...entityChecked(premise.entityId),
        facts.sheet(premise.entityId),
        facts.statBlock(premise.entityId),
      ];
    case 'revealed':
      // Negative premises: passed over because found before, or out of reach (Gate 03).
      return [facts.clue(premise.clueId), facts.revealed(scopedKey(premise.scope, premise.clueId))];
    case 'unreached':
      return [
        facts.clue(premise.clueId),
        facts.entity(premise.entityId),
        facts.entityPlacement(premise.entityId),
      ];
    case 'attitude':
      return [facts.entity(premise.npcId), facts.relationship(premise.npcId)];
    case 'shown':
      return [facts.shown(shownKey(premise.scope, premise.npcId, premise.subjectId))];
    case 'considered':
      return [
        facts.knowledge(premise.knowledgeId),
        facts.disclosure(premise.knowledgeId),
        facts.shared(scopedKey(premise.scope, premise.knowledgeId)),
      ];
    case 'placement':
      // Legacy (revision 88d8137, G03-H05), read with its original meaning: where the
      // entity was. Its command rests on everything before it anyway (G03-H07).
      return [facts.entity(premise.entityId), facts.entityPlacement(premise.entityId)];
  }
}
