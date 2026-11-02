import type { KernelCommandOf } from '@ltw/contracts';
import { accept, reject, type Decision, type DecisionContext } from '@ltw/domain';

import { encounterOf } from './battlefield.ts';

/**
 * A creature a player commands (docs/adr/0044-online-play.md §7): the DM hands a creature in the
 * fight — a summoned beast, a hireling, a companion — to a character of the party who is in the
 * fight; that character's player then runs its turns through the World Engine (authority
 * `commander`). `null` takes it back. A character is never commanded: it has its own player.
 */
export function decideCommandCreature(
  context: DecisionContext,
  command: KernelCommandOf<'CommandCreature'>,
): Decision {
  const { state } = context;
  const found = encounterOf(state);
  if (!found.ok) return found;
  const encounter = found.value;
  const record = encounter.combatants.find((c) => c.entityId === command.combatantId);
  if (!record) return reject('NOT_A_COMBATANT', 'NOT_A_COMBATANT');
  if (state.entities.get(record.entityId)?.kind === 'character') {
    return reject('INVALID_COMMAND', 'A character is played by its own player');
  }
  const commander = command.characterId;
  if (
    commander !== null &&
    (state.entities.get(commander)?.kind !== 'character' ||
      !encounter.combatants.some((c) => c.entityId === commander))
  ) {
    return reject('INVALID_COMMAND', 'The commander is a character in the fight');
  }
  if ((record.commandedBy ?? null) === commander) return reject('NO_EFFECT', 'Nothing changes');
  return accept({
    type: 'CombatantUpdated',
    payload: { combatant: { ...record, commandedBy: commander } },
  });
}
