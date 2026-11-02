import type { ContextAction, EncounterView, KernelCommandOf, Square } from '@ltw/contracts';

export type CombatUiCommand = KernelCommandOf<
  | 'MoveCombatant'
  | 'Attack'
  | 'CastSpell'
  | 'EndTurn'
  | 'UseReaction'
  | 'DeclineReaction'
  | 'StartCombat'
  | 'EndCombat'
  | 'CloseReactionWindow'
  | 'TakeAction'
  | 'MakeReadiedAttack'
>;

/**
 * The actions that ask the player more before they are sent (docs/adr/0045-conditions-and-actions.md
 * §5): a check's skill for Search, Study and Influence; the attack and its trigger for Ready.
 */
export const CHOSEN_ACTIONS: ReadonlySet<string> = new Set([
  'search',
  'study',
  'influence',
  'ready',
]);

/** Spell actions the Context Engine lists that name a single target combatant. */
const TARGETED_SPELLS = { healing_word: 'healing-word', hunters_mark: 'hunters-mark' } as const;

/**
 * Bind a server-listed combat option to its existing command. Availability is
 * only a snapshot of the Rules Engine's answer; the World Engine decides again
 * on submission, and the client never spends or checks a resource itself.
 */
export function combatCommandFor(
  action: ContextAction,
  actorId: string,
  target: { readonly entityId: string; readonly position: Square },
  encounter: EncounterView,
): CombatUiCommand | null {
  if (!action.legal) return null;
  const using = !action.cost
    ? undefined
    : action.cost.kind === 'free'
      ? ('free' as const)
      : { slotLevel: action.cost.slotLevel };
  switch (action.id) {
    case 'longbow_attack':
      return {
        type: 'Attack',
        combatantId: actorId,
        attackId: 'longbow',
        targetId: target.entityId,
      };
    case 'weapon_attack':
      return action.weapon
        ? {
            type: 'Attack',
            combatantId: actorId,
            attackId: action.weapon,
            targetId: target.entityId,
          }
        : null;
    case 'fireball':
      return {
        type: 'CastSpell',
        combatantId: actorId,
        spellId: 'fireball',
        ...(using === undefined ? {} : { using }),
        point: { x: target.position.x, y: target.position.y },
      };
    case 'healing_word':
    case 'hunters_mark':
      return {
        type: 'CastSpell',
        combatantId: actorId,
        spellId: TARGETED_SPELLS[action.id],
        ...(using === undefined ? {} : { using }),
        targetId: target.entityId,
      };
    case 'counterspell':
      return encounter.reactionWindow?.trigger.kind === 'spell' &&
        encounter.reactionWindow.trigger.caster.entityId === target.entityId
        ? {
            type: 'UseReaction',
            combatantId: actorId,
            windowId: encounter.reactionWindow.windowId,
            reaction: 'counterspell',
            ...(action.cost?.kind === 'slot'
              ? { using: { slotLevel: action.cost.slotLevel } }
              : {}),
          }
        : null;
    case 'dodge':
    case 'dash':
    case 'disengage':
    case 'hide':
    case 'utilize':
      return { type: 'TakeAction', combatantId: actorId, action: action.id };
    case 'help':
      return {
        type: 'TakeAction',
        combatantId: actorId,
        action: 'help',
        targetId: target.entityId,
      };
    default:
      return null;
  }
}

/** "Ignore": the character lets the spell happen. */
export function ignoreReaction(actorId: string, windowId: string): CombatUiCommand {
  return { type: 'DeclineReaction', combatantId: actorId, windowId };
}

/** An opportunity attack with one of the reactor's melee attacks (ADR 0046 §2). */
export function opportunityAttack(
  reactorId: string,
  windowId: string,
  attackId: string,
): CombatUiCommand {
  return {
    type: 'UseReaction',
    combatantId: reactorId,
    windowId,
    reaction: 'opportunity-attack',
    attackId,
  };
}
