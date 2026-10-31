import type { KernelCommand } from '@ltw/contracts';

import { decideSetCharacterSheet } from '../character/character.ts';
import { decideSetStatBlock } from '../combat/authoring.ts';
import { decideAddClue, decideSetDisclosure } from '../investigation/authoring.ts';
import { decideGrantItem } from '../items/decide.ts';
import { decideAddKnowledge } from '../knowledge/decide.ts';
import { decideChangeEntityStatus, decideCreateEntity } from '../kernel/decide/entities.ts';
import { decideStartScene } from '../kernel/decide/world.ts';
import { reject, type Decision } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { decideSetRelationship } from '../relationships/decide.ts';
import { decideSetWeather } from '../weather/weather.ts';

/** Initial-only allowlist. This never widens the ordinary in-play authoring policy. */
export function decideInitialOperation(state: WorldState, command: KernelCommand): Decision {
  switch (command.type) {
    case 'CreateEntity':
      return command.entityId === undefined
        ? invalid()
        : decideCreateEntity(state, { ...command, entityId: command.entityId });
    case 'AddKnowledge':
      return command.knowledgeId === undefined
        ? invalid()
        : decideAddKnowledge(state, { ...command, knowledgeId: command.knowledgeId });
    case 'AddClue':
      return command.clueId === undefined
        ? invalid()
        : decideAddClue(state, { ...command, clueId: command.clueId });
    case 'StartScene':
      return command.sceneId === undefined
        ? invalid()
        : decideStartScene(state, { ...command, sceneId: command.sceneId });
    case 'GrantItem':
      return decideGrantItem(state, command);
    case 'SetCharacterSheet':
      return decideSetCharacterSheet(state, command);
    case 'SetStatBlock':
      return decideSetStatBlock(state, command);
    case 'SetDisclosure':
      return decideSetDisclosure(state, command);
    case 'SetRelationship':
      return decideSetRelationship(state, command);
    case 'ChangeEntityStatus':
      return decideChangeEntityStatus(state, command);
    case 'SetWeather':
      return decideSetWeather(state, command);
    default:
      return invalid();
  }
}
const invalid = () => reject('INVALID_BOOTSTRAP', 'Unsupported or unresolved initial operation');
