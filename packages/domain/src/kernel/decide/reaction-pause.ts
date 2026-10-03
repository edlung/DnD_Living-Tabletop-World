import {
  COMBAT_COMMAND_TYPES,
  REACTION_COMMAND_TYPES,
  type KernelCommand,
  type KernelCommandType,
} from '@ltw/contracts';

import { openReactionWindow } from '../../combat/reactions.ts';
import { isCombatant } from '../../combat/records.ts';
import { reject, type Decision } from '../decision.ts';
import type { KernelEvent } from '../events.ts';
import { footprintOf } from '../facts.ts';
import type { WorldState } from '../state.ts';

/**
 * The pause rule (docs/adr/0016-reaction-engine.md §1). While a reaction
 * window is open the encounter waits: combat commands other than the
 * window's answers and close are refused outright, and any other command is
 * refused if it would change a fact the window depends on, which are exactly
 * the facts its opening read (the encounter, the clock, and each considered
 * combatant's existence, status, location, sheet, or stat block). Undo keeps
 * its own rule (ADR 0006 §8), which already rejects what the window read.
 */
const COMBAT: ReadonlySet<string> = new Set(COMBAT_COMMAND_TYPES);
const ANSWERS: ReadonlySet<string> = new Set(REACTION_COMMAND_TYPES);

const pending = () => reject('REACTION_PENDING', 'A reaction is pending');

/**
 * Checked before deciding: combat waits for the window. A command for a
 * creature outside the encounter is left to the combat engine, which answers
 * as if no encounter ran (`NOT_IN_COMBAT`): the pause reveals nothing to
 * someone outside the fight.
 */
export function pausedCombat(state: WorldState, command: KernelCommand): Decision | null {
  if (!COMBAT.has(command.type) || ANSWERS.has(command.type)) return null;
  if ('combatantId' in command && !isCombatant(state, command.combatantId)) return null;
  return openReactionWindow(state) ? pending() : null;
}

/** Checked after deciding: nothing else may change what the window depends on. */
export function pausedByChanges(
  state: WorldState,
  type: KernelCommandType,
  events: readonly KernelEvent[],
): Decision | null {
  if (ANSWERS.has(type) || type === 'UndoCommand') return null;
  const window = openReactionWindow(state);
  if (!window) return null;
  const opened = footprintOf({ type: 'ReactionWindowOpened', payload: { window } });
  const depends = new Set([...opened.reads, ...opened.writes]);
  const touches = events.some((event) => footprintOf(event).writes.some((f) => depends.has(f)));
  return touches ? pending() : null;
}
