import type { EntityKind } from '../kernel/commands.ts';
import type { Condition } from '../rules/character-sheet.ts';
import type { Battlefield, Side } from './commands.ts';

/**
 * Perspective-scoped encounter view (docs/adr/0015-combat-engine.md §6).
 * Everything on the battlefield is visible to its combatants; initiative
 * rolls, stat blocks and non-party hit points are DM data.
 */
export interface EncounterCombatantView {
  readonly entity: {
    readonly entityId: string;
    readonly kind: EntityKind;
    readonly name: string | null;
  };
  readonly side: Side;
  readonly position: { readonly x: number; readonly y: number };
  /** `down`: at 0 HP but alive (a character making death saves). */
  readonly state: 'up' | 'down' | 'dead';
  readonly conditions: readonly Condition[];
  /** Party members (and every combatant for the DM). */
  readonly hitPoints?: { readonly current: number; readonly max: number };
  /** DM only. */
  readonly initiative?: {
    readonly roll: number;
    readonly modifier: number;
    readonly total: number;
  };
}

export interface EncounterView {
  readonly encounterId: string;
  readonly round: number;
  readonly currentCombatantId: string;
  /** Combatant entity IDs in turn order. */
  readonly order: readonly string[];
  readonly battlefield: Battlefield;
  readonly combatants: readonly EncounterCombatantView[];
}

export interface EncounterResponse {
  readonly perspective: string;
  /** Null when no encounter runs that the perspective takes part in. */
  readonly encounter: EncounterView | null;
}
