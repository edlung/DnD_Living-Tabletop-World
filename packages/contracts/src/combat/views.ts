import type { EntityKind, KernelCommandOf } from '../kernel/commands.ts';
import type { Ability, Condition } from '../rules/character-sheet.ts';
import type { Battlefield, Side } from './commands.ts';
import type { ReactionId, ReactionResponse, SpellComponent } from './reactions.ts';

/** A condition's end and source in a fight (docs/adr/0045-conditions-and-actions.md §2). */
export interface ConditionNoteView {
  readonly condition: Condition;
  /** As the viewer knows it; absent when none is named. */
  readonly source?: { readonly entityId: string; readonly name: string | null };
  readonly until?: {
    readonly turnOf: { readonly entityId: string; readonly name: string | null };
    readonly at: 'start' | 'end';
    readonly turns: number;
  };
  readonly save?: { readonly ability: Ability; readonly dc: number };
}

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
  /** Exhaustion's level (ADR 0045 §3); absent: none. */
  readonly exhaustion?: number;
  /** How its conditions in this fight end and their sources (§2); absent when none has any. */
  readonly conditionNotes?: readonly ConditionNoteView[];
  /** Party members, and a creature the viewer's party commands (and every combatant for the DM). */
  readonly hitPoints?: { readonly current: number; readonly max: number };
  /**
   * The party character commanding this creature (docs/adr/0044-online-play.md §7), as the
   * viewer knows them; absent when none or not known to the viewer.
   */
  readonly commandedBy?: { readonly entityId: string; readonly name: string | null };
  /**
   * The attack it readied and its trigger (docs/adr/0045-conditions-and-actions.md §5), until its
   * next turn: the DM's, and its own player's.
   */
  readonly readied?: {
    readonly target: { readonly entityId: string; readonly name: string | null };
    readonly attackId: string;
    readonly trigger: string;
  };
  /** DM only. */
  readonly initiative?: {
    readonly roll: number;
    readonly modifier: number;
    readonly total: number;
    /** Surprised as the fight started: rolled with Disadvantage (ADR 0045 §5). */
    readonly surprised?: true;
  };
}

/**
 * The open reaction window (docs/adr/0016-reaction-engine.md §4). The DM
 * sees all of it; a candidate's player sees the caster, the components,
 * their own answer, and their choices; the caster's player sees that the
 * spell awaits reactions. Other players get no window at all.
 */
/** What a viewer may answer in a window: one of its reactions, or let it go. */
export type ReactionChoice = ReactionId | 'ignore';

/** An attack an answer may make (docs/adr/0046-reactions-beyond-counterspell.md §2). */
export interface ReactionAttackOption {
  readonly attackId: string;
  /** A stat block attack's name; null for a character's weapon or Unarmed Strike (named by the client). */
  readonly name: string | null;
}

export interface ReactionCandidateView {
  readonly entityId: string;
  readonly response: ReactionResponse;
  /** What it may still answer: the DM sees each pending candidate's, a player their own. */
  readonly choices?: readonly ReactionChoice[];
  /** The melee attacks an opportunity attack may make. */
  readonly attacks?: readonly ReactionAttackOption[];
}

/** Who a window is about, as the viewer knows them. */
interface WindowActor {
  readonly entityId: string;
  readonly kind: EntityKind;
  readonly name: string | null;
}

export interface ReactionWindowView {
  readonly windowId: string;
  readonly trigger:
    | {
        readonly kind: 'spell';
        readonly caster: WindowActor;
        readonly components: readonly SpellComponent[];
        /** The DM and the caster's own player only. */
        readonly spellId?: string;
        /** DM only. */
        readonly targetId?: string | null;
        /** DM only. */
        readonly point?: { readonly x: number; readonly y: number } | null;
      }
    | {
        /** A creature leaving reach (ADR 0046 §2): it stands on the last square inside it. */
        readonly kind: 'move';
        readonly mover: WindowActor;
        readonly at: { readonly x: number; readonly y: number };
      };
  /** The DM: every candidate. A player: only their own character, if it is one. */
  readonly candidates: readonly ReactionCandidateView[];
  /** What the viewing player's character may still answer; empty once it answered. */
  readonly choices: readonly ReactionChoice[];
  /** The viewing player's melee attacks for an opportunity attack. */
  readonly attacks?: readonly ReactionAttackOption[];
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
