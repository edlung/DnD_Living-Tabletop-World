import { reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { isCombatant } from '../combat/records.ts';
import { mayHandle, ownItem, played, portion } from './handling.ts';
import { PARTY_STASH, isPartyCharacter, possessionOf } from './records.ts';

/**
 * The party's stash (docs/adr/0057-encounters-maps-loot.md §7): one store every member of the party
 * gives to and takes from, wherever they are, outside a fight — `GiveItem` to `PARTY_STASH`, and
 * `TakeItem` of what lies in it. A member hands over what it carries unworn, all of a stack or part;
 * whoever takes from it takes the whole stack. No turn is spent: the stash is not on the board.
 */
const outsideFights = (state: WorldState, characterId: string) =>
  isCombatant(state, characterId)
    ? reject('COMBAT_ALREADY_ACTIVE', 'The stash waits until the fight is over')
    : null;

export function decideStashItem(
  state: WorldState,
  command: ResolvedCommandOf<'GiveItem'>,
): Decision {
  const own = ownItem(state, command.characterId, command.itemId);
  if (!own.ok) return own;
  if (!isPartyCharacter(state, command.characterId))
    return reject('FORBIDDEN', 'Only the party keeps a stash');
  const fighting = outsideFights(state, command.characterId);
  if (fighting) return fighting;
  if (own.possession.slot !== null)
    return reject('INVALID_ITEM', 'Take the item off before putting it in the stash');
  const part = portion(state, command, own.possession);
  if (!part.ok) return part;
  return played(
    state,
    command.characterId,
    [{ kind: 'self' }],
    [
      ...part.events,
      {
        type: 'ItemTransferred',
        payload: {
          itemId: part.itemId,
          from: command.characterId,
          to: PARTY_STASH,
          catalogId: own.possession.catalogId,
          quantity: part.quantity,
        },
      },
    ],
    'free',
  );
}

/** A member takes a stack from the stash; null when the item is not in it. */
export function decideUnstashItem(
  state: WorldState,
  command: ResolvedCommandOf<'TakeItem'>,
): Decision | null {
  const possession = possessionOf(state, command.itemId);
  if (possession?.holderId !== PARTY_STASH) return null;
  const actor = mayHandle(state, command.characterId);
  if (!actor.ok) return actor;
  if (!isPartyCharacter(state, command.characterId))
    return reject('NOT_PRESENT', `"${command.itemId}" is not here`, { itemId: command.itemId });
  const fighting = outsideFights(state, command.characterId);
  if (fighting) return fighting;
  return played(
    state,
    command.characterId,
    [{ kind: 'self' }],
    [
      {
        type: 'ItemTransferred',
        payload: {
          itemId: command.itemId,
          from: PARTY_STASH,
          to: command.characterId,
          catalogId: possession.catalogId,
          quantity: possession.quantity,
        },
      },
    ],
    'free',
  );
}
