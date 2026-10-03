import { PLAYER_COMMAND_TYPES, type KernelCommand } from '@ltw/contracts';

import type { Actor } from './actor.ts';
import type { Rejection } from './decision.ts';
import type { WorldState } from './state.ts';

/**
 * Who may issue a command. World authoring (ARCHITECTURE_INVARIANTS.md #3)
 * is for the campaign's DM or a trusted system process; any user may create
 * a campaign and becomes its DM. Player commands (docs/adr/0013-investigation.md)
 * may also be issued by the player who controls the named character.
 * Decided from the actor and the roster only: a character ID that is not
 * the actor's own is FORBIDDEN whether or not it exists.
 */
const PLAYER_TYPES: ReadonlySet<string> = new Set(PLAYER_COMMAND_TYPES);

export function authorize(
  state: WorldState,
  actor: Actor,
  command: KernelCommand,
): Rejection | null {
  if (command.type === 'CreateCampaign') {
    return actor.kind === 'user'
      ? null
      : { code: 'FORBIDDEN', message: 'A campaign is created by the user who will be its DM' };
  }
  if (actor.kind === 'system' || actor.actorId === state.campaign?.dmActorId) {
    return null;
  }
  if (
    PLAYER_TYPES.has(command.type) &&
    'characterId' in command &&
    state.roster.get(command.characterId) === actor.actorId
  ) {
    return null;
  }
  return { code: 'FORBIDDEN', message: `Not permitted to issue ${command.type}` };
}
