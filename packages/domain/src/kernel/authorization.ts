import {
  ASSET_WORKER_COMMAND_TYPES,
  PLAYER_COMBAT_COMMAND_TYPES,
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
export type Authority = 'campaign-creator' | 'system' | 'dm' | 'controller' | 'commander';

export type Authorization =
  | { readonly ok: true; readonly authority: Authority }
  | { readonly ok: false; readonly rejection: Rejection };

const PLAYER_TYPES: ReadonlySet<string> = new Set(PLAYER_COMMAND_TYPES);
const WORKER_TYPES: ReadonlySet<string> = new Set(ASSET_WORKER_COMMAND_TYPES);

export function authorize(state: WorldState, actor: Actor, command: KernelCommand): Authorization {
  // A table display reads; it never changes the world (docs/adr/0042-table-display.md §2).
  if (actor.kind === 'display') return forbidden('A display issues no command');
  if (command.type === 'BootstrapCampaign')
    return actor.kind === 'user' && actor.actorId === command.source.ownerId
      ? { ok: true, authority: 'campaign-creator' }
      : forbidden('Only the confirming owner can bootstrap a campaign');
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
  if (command.type === 'CreateCharacter') {
    // The DM makes a character for anyone or to invite a player to; a seated player makes one
    // of their own (docs/adr/0056-characters-from-the-srd.md §2).
    if (actor.kind !== 'user') return forbidden('A character is made by a person');
    if (actor.actorId === state.campaign?.dmActorId) return { ok: true, authority: 'dm' };
    const seated = [...state.roster.values()].includes(actor.actorId);
    return seated && command.playerActorId === actor.actorId
      ? { ok: true, authority: 'controller' }
      : forbidden('A player makes only their own character');
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
  const authorization = authorizeActingFor(state, actor, acting, COMMANDABLE.has(command.type));
  return authorization.ok ? authorization : forbidden(`Not permitted to issue ${command.type}`);
}

/** What a player may do for a creature their character commands (ADR 0044 §7): its turn's acts. */
const COMMANDABLE: ReadonlySet<string> = new Set(PLAYER_COMBAT_COMMAND_TYPES);

/** The party character commanding a creature in the running fight, if any (ADR 0044 §7). */
export function commanderOf(state: WorldState, combatantId: string): string | null {
  return (
    state.encounter?.combatants.find((combatant) => combatant.entityId === combatantId)
      ?.commandedBy ?? null
  );
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
  /** A fight's act, which a creature's commander may also do for it. */
  commandable = false,
): Authorization {
  if (actor.kind === 'display') return forbidden('A display acts for no character');
  if (actor.kind === 'system') return { ok: true, authority: 'system' };
  if (actor.actorId === state.campaign?.dmActorId) return { ok: true, authority: 'dm' };
  if (characterId !== null && state.roster.get(characterId) === actor.actorId) {
    return { ok: true, authority: 'controller' };
  }
  const commander = commandable && characterId !== null ? commanderOf(state, characterId) : null;
  if (commander !== null && state.roster.get(commander) === actor.actorId) {
    return { ok: true, authority: 'commander' };
  }
  return forbidden('Not permitted to act for this character');
}

const forbidden = (message: string): Authorization => ({
  ok: false,
  rejection: { code: 'FORBIDDEN', message },
});
