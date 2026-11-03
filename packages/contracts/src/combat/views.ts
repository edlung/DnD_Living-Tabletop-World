import type { EntityKind, KernelCommandOf } from '../kernel/commands.ts';
import type { Ability, Condition, CreatureSize, Senses, Speeds } from '../rules/character-sheet.ts';
import type { Battlefield, Side } from './commands.ts';
import type { ReactionId, ReactionResponse, SpellComponent } from './reactions.ts';
import type { ObjectMaterial, ObjectSize } from './stat-block.ts';

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
  /** Its north-west square (docs/adr/0049-space-and-movement.md §1). */
  readonly position: { readonly x: number; readonly y: number };
  /** Its size when not Medium: a Large creature fills 2×2 squares, and so on (ADR 0049 §1). */
  readonly size?: CreatureSize;
  /** Squeezed through a space a size smaller (ADR 0049 §4): it fills that smaller space. */
  readonly squeezed?: true;
  /** Feet above the ground of its squares: flying; below it, burrowing (ADR 0049 §6, §9). */
  readonly altitudeFt?: number;
  /** It can fly, as anyone sees its wings (ADR 0049 §5): the turn tray offers to rise. */
  readonly flies?: true;
  /** Its speeds beside walking, seen as its hit points are: the route's advisory cost uses them. */
  readonly speeds?: Speeds;
  /** Its senses, seen the same way (docs/adr/0050-the-world-around.md §2). */
  readonly senses?: Senses;
  /** Its breath held under water, seen the same way: the rounds it has left (ADR 0050 §8). */
  readonly breath?: { readonly roundsLeft: number };
  /** Its legendary actions' attacks and the uses left this round, for the DM (ADR 0053 §4). */
  readonly legendary?: {
    readonly usesLeft: number;
    readonly attacks: readonly { readonly attackId: string; readonly name: string }[];
  };
  /**
   * A creature's attacks, for the DM and the player whose character commands it (docs/adr/
   * 0056-characters-from-the-srd.md §5): that player picks one and its target on its turn.
   */
  readonly attacks?: readonly {
    readonly attackId: string;
    readonly name: string;
    readonly kind: 'melee' | 'ranged';
  }[];
  /**
   * A creature's actions with a save, for the DM and its commander's player (docs/adr/0053-
   * monsters-as-data.md §2): whether each is ready, aimed at a square (a breath) or a creature,
   * its Recharge and uses.
   */
  readonly creatureActions?: readonly {
    readonly actionId: string;
    readonly name: string;
    readonly ready: boolean;
    readonly aim: 'square' | 'creature';
    readonly recharge?: number;
    readonly usesLeft?: number;
    /** Part of its Multiattack: once a turn, with its attacks (ADR 0056 §5). */
    readonly inMultiattack?: true;
  }[];
  /** The creature it rides, as anyone sees (ADR 0049 §10); it shares that one's space. */
  readonly mountedOn?: { readonly entityId: string; readonly name: string | null };
  /** `down`: at 0 HP but alive (a character making death saves). */
  readonly state: 'up' | 'down' | 'dead';
  readonly conditions: readonly Condition[];
  /** Exhaustion's level (ADR 0045 §3); absent: none. */
  readonly exhaustion?: number;
  /** How its conditions in this fight end and their sources (§2); absent when none has any. */
  readonly conditionNotes?: readonly ConditionNoteView[];
  /** Party members, and a creature the viewer's party commands (and every combatant for the DM). */
  /**
   * Hit points against the maximum an effect may have lowered, and temporary ones beside them
   * (docs/adr/0048-hit-points.md §1–2).
   */
  readonly hitPoints?: {
    readonly current: number;
    readonly max: number;
    readonly temporary?: number;
  };
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
  /** DM only; never an object's. */
  readonly initiative?: {
    readonly roll: number;
    readonly modifier: number;
    readonly total: number;
    /** Surprised as the fight started: rolled with Disadvantage (ADR 0045 §5). */
    readonly surprised?: true;
  };
  /**
   * An object the party attacks (docs/adr/0048-hit-points.md §5): it takes no turn; `dead` is
   * destroyed. What it is made of and its size, as anyone looking at it sees.
   */
  readonly object?: { readonly material: ObjectMaterial; readonly size: ObjectSize };
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
      }
    | {
        /**
         * An attack roll (ADR 0046 §3): a missed one its attacker may roll again, a hit its target
         * may answer. What a table hears: the total, the AC it met, the damage a hit would do.
         */
        readonly kind: 'attack';
        readonly attacker: WindowActor;
        readonly target: WindowActor;
        readonly phase: 'missed' | 'hit';
        readonly total: number;
        /** The target's and the DM's to know; null for the attacker's player. */
        readonly armorClass: number | null;
        readonly critical: boolean;
        /** Rolled when it hit, before anyone answers. */
        readonly damage: number | null;
      }
    | {
        /** Damage taken (ADR 0046 §4): the creature that did it may be rebuked. */
        readonly kind: 'damage';
        readonly source: WindowActor;
        readonly target: WindowActor;
        readonly amount: number;
      }
    | {
        /**
         * Creatures falling (docs/adr/0049-space-and-movement.md §8): a caster may slow them with
         * Feather Fall before they land. How far each falls.
         */
        readonly kind: 'fall';
        readonly fallers: readonly { readonly creature: WindowActor; readonly feet: number }[];
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
  /** The place of the fight, where every combatant stands: the DM's hand adds from it. */
  readonly locationId: string;
  readonly round: number;
  readonly currentCombatantId: string;
  /** Combatant entity IDs in turn order. */
  readonly order: readonly string[];
  readonly battlefield: Battlefield;
  readonly combatants: readonly EncounterCombatantView[];
  /** The open reaction window, as this perspective may see it; null when none (or not visible). */
  readonly reactionWindow: ReactionWindowView | null;
  /**
   * The fight's difficulty for the party, the DM's alone (docs/adr/0053-monsters-as-data.md §3):
   * the foes' XP against the party's budgets; `unknown`: foes whose stat block names no XP.
   */
  readonly difficulty?: {
    readonly xp: number;
    readonly unknown: number;
    readonly budget: { readonly low: number; readonly moderate: number; readonly high: number };
    readonly rating: 'low' | 'moderate' | 'high' | 'beyond';
  };
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
