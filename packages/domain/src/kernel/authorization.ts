import {
  ASSET_WORKER_COMMAND_TYPES,
  PLAYER_COMMAND_TYPES,
  type KernelCommand,
} from '@ltw/contracts';

import type { Actor } from './actor.ts';
import type { Rejection } from './decision.ts';
import type { WorldState } from './state.ts';

/**
 * Who may issue a command, and on what authority. World authoring
 * (ARCHITECTURE_INVARIANTS.md #3) is for the campaign's DM or a trusted
 * system process; any user may create a campaign and becomes its DM. Player
 * commands (docs/adr/0013-investigation.md) may also be issued by the player
 * who controls the named character. Decided from the actor and the roster
 * only: a character ID that is not the actor's own is FORBIDDEN whether or
 * not it exists.
 *
 * The authority is returned so that a player command authorized by the
 * roster records that premise: undoing the assignment while the action
 * stands is then UNDO_UNSAFE (Gate 02, G02-H03).
 */
export type Authority = 'campaign-creator' | 'system' | 'dm' | 'controller';

export type Authorization =
  | { readonly ok: true; readonly authority: Authority }
  | { readonly ok: false; readonly rejection: Rejection };

const PLAYER_TYPES: ReadonlySet<string> = new Set(PLAYER_COMMAND_TYPES);
const WORKER_TYPES: ReadonlySet<string> = new Set(ASSET_WORKER_COMMAND_TYPES);

export function authorize(state: WorldState, actor: Actor, command: KernelCommand): Authorization {
  if (command.type === 'CreateCampaign') {
    return actor.kind === 'user'
      ? { ok: true, authority: 'campaign-creator' }
      : forbidden('A campaign is created by the user who will be its DM');
  }
  if (command.type === 'ApplyAuthoring') {
    // AI-assisted authoring needs the DM's own confirmation (invariant 3, ADR 0018 §1).
    return actor.kind === 'user' && actor.actorId === state.campaign?.dmActorId
      ? { ok: true, authority: 'dm' }
      : forbidden('Only the DM can confirm authoring');
  }
  if (command.type === 'ReleaseCharacter') {
    // Taking a seat away is the DM's decision alone (docs/adr/0036-production-sign-in.md §4).
    return actor.kind === 'user' && actor.actorId === state.campaign?.dmActorId
      ? { ok: true, authority: 'dm' }
      : forbidden('Only the DM can release a character');
  }
  if (WORKER_TYPES.has(command.type)) {
    // Only the asset worker reports what external work did (ADR 0022 §4).
    return actor.kind === 'system'
      ? { ok: true, authority: 'system' }
      : forbidden('Only the asset worker reports asset jobs');
  }
  const acting = !PLAYER_TYPES.has(command.type)
    ? null
    : 'characterId' in command
      ? command.characterId
      : 'combatantId' in command
        ? command.combatantId
        : null;
  const authorization = authorizeActingFor(state, actor, acting);
  return authorization.ok ? authorization : forbidden(`Not permitted to issue ${command.type}`);
}

/**
 * Who may act for a character: the DM, a trusted system process, or the
 * player who controls it. Shared by player commands and by speech that is
 * no command (Talk, docs/adr/0020-npc-intelligence.md §3).
 */
export function authorizeActingFor(
  state: WorldState,
  actor: Actor,
  characterId: string | null,
): Authorization {
  if (actor.kind === 'system') return { ok: true, authority: 'system' };
  if (actor.actorId === state.campaign?.dmActorId) return { ok: true, authority: 'dm' };
  if (characterId !== null && state.roster.get(characterId) === actor.actorId) {
    return { ok: true, authority: 'controller' };
  }
  return forbidden('Not permitted to act for this character');
}

const forbidden = (message: string): Authorization => ({
  ok: false,
  rejection: { code: 'FORBIDDEN', message },
});
