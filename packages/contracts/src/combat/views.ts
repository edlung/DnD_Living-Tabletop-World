import type { EntityKind, KernelCommandOf } from '../kernel/commands.ts';
import type { Condition } from '../rules/character-sheet.ts';
import type { Battlefield, Side } from './commands.ts';
import type { ReactionResponse, SpellComponent } from './reactions.ts';

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

/**
 * The open reaction window (docs/adr/0016-reaction-engine.md §4). The DM
 * sees all of it; a candidate's player sees the caster, the components,
 * their own answer, and their choices; the caster's player sees that the
 * spell awaits reactions. Other players get no window at all.
 */
export interface ReactionWindowView {
  readonly windowId: string;
  readonly trigger: {
    readonly kind: 'spell';
    readonly caster: {
      readonly entityId: string;
      readonly kind: EntityKind;
      readonly name: string | null;
    };
    readonly components: readonly SpellComponent[];
    /** The DM and the caster's own player only. */
    readonly spellId?: string;
    /** DM only. */
    readonly targetId?: string | null;
    /** DM only. */
    readonly point?: { readonly x: number; readonly y: number } | null;
  };
  /** The DM: every candidate. A player: only their own character, if it is one. */
  readonly candidates: readonly {
    readonly entityId: string;
    readonly response: ReactionResponse;
  }[];
  /** What the viewing player's character may still answer; empty once it answered. */
  readonly choices: readonly ('counterspell' | 'ignore')[];
}

export interface EncounterView {
  readonly encounterId: string;
  readonly round: number;
  readonly currentCombatantId: string;
  /** Combatant entity IDs in turn order. */
  readonly order: readonly string[];
  readonly battlefield: Battlefield;
  readonly combatants: readonly EncounterCombatantView[];
  /** The open reaction window, as this perspective may see it; null when none (or not visible). */
  readonly reactionWindow: ReactionWindowView | null;
}

export interface EncounterResponse {
  readonly perspective: string;
  /** Null when no encounter runs that the perspective takes part in. */
  readonly encounter: EncounterView | null;
}

/**
 * The DM's suggestion for a creature's turn (docs/adr/0020-npc-intelligence.md
 * §5): one legal action by a fixed tactic, with the exact command. Nothing
 * acts by itself; the DM submits it, or another action, as any command.
 */
export interface MonsterTurnSuggestion {
  readonly combatantId: string;
  readonly tactic: 'spell' | 'attack' | 'move' | 'end-turn';
  readonly command: KernelCommandOf<'CastSpell' | 'Attack' | 'MoveCombatant' | 'EndTurn'>;
  readonly explanation: string;
}

/** `GET /campaigns/:campaignId/encounter/suggestion` (DM only). */
export interface EncounterSuggestionResponse {
  /** Null outside combat, or when the current combatant is not a creature. */
  readonly suggestion: MonsterTurnSuggestion | null;
}
