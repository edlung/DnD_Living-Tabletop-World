import type { KernelCommandOf } from '@ltw/contracts';

/**
 * The DM's commands at the table (docs/adr/0043-dm-screen.md §1–2, §6): changes by hand, a ruling
 * (a party memory with a reason), changes of a running fight, a session's start and end —
 * submitted like any command, in the DM perspective, decided by the World Engine.
 */
export type DmTableCommand = KernelCommandOf<
  | 'AdjustHitPoints'
  | 'SetCondition'
  | 'SetInspiration'
  | 'RecordMemory'
  | 'AddCombatant'
  | 'RemoveCombatant'
  | 'DelayTurn'
  | 'SetInitiative'
  | 'CommandCreature'
  | 'StartSession'
  | 'EndSession'
>;
