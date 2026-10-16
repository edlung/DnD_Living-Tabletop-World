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
>;

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
      return encounter.reactionWindow?.trigger.caster.entityId === target.entityId
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
    default:
      return null;
  }
}

/** "Ignore": the character lets the spell happen. */
export function ignoreReaction(actorId: string, windowId: string): CombatUiCommand {
  return { type: 'DeclineReaction', combatantId: actorId, windowId };
}
