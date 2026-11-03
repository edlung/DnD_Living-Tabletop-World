import type { EntityKind, EntityStatus } from '../kernel/commands.ts';
import type { MetamagicId } from '../combat/features.ts';
import type { WeaponId, WeaponMastery } from '../rules/character-sheet.ts';
import type { SummonOption, SummonedCreature } from '../srd/summons.ts';

/**
 * Critical Context Contract (docs/adr/0012-context-engine.md, RAVENFORD_SPEC.md).
 * The context of one selected entity for one acting character. Every field
 * is whitelisted; legality comes from the Rules Engine, relevance from a
 * deterministic heuristic over the acting perspective's own data only.
 */
export const CONTEXT_ACTION_IDS = [
  'talk',
  'trade',
  'ask_about',
  'show_evidence',
  'inspect',
  'recall',
  'take_item',
  'insight_check',
  'investigation_check',
  'perception_check',
  'healing_word',
  'hunters_mark',
  'detect_magic',
  'longbow_attack',
  /** An attack with another weapon the actor wields or lists (Stage 520); `weapon` names it. */
  'weapon_attack',
  /**
   * The extra attacks of docs/adr/0047-weapons.md: the Light property's with the other hand, and
   * Cleave's second; `weapon` names the weapon.
   */
  'offhand_attack',
  'cleave_attack',
  /** An Unarmed Strike: its damage, a grapple or a shove, or an object at hand (ADR 0047 §3, §6). */
  'unarmed_strike',
  /** An attack of a Wild Shape's form (docs/adr/0056-…md §5); `formAttack` names it. */
  'form_attack',
  'enter_location',
  'fireball',
  'counterspell',
  /** Any other SRD spell, cast from its data (docs/adr/0052-spells-as-data.md §5); `spell` names it. */
  'cast_spell',
  /** The actions beside Attack and Magic (docs/adr/0045-conditions-and-actions.md §5). */
  'dash',
  'disengage',
  'dodge',
  'help',
  'hide',
  'influence',
  'ready',
  'search',
  'study',
  'utilize',
  'escape',
  'release',
  /** A DC 10 Medicine check for the dying or the knocked out (docs/adr/0048-hit-points.md §4). */
  'first-aid',
  /** Mounting a creature, and getting down (docs/adr/0049-space-and-movement.md §10). */
  'mount',
  'dismount',
] as const;
export type ContextActionId = (typeof CONTEXT_ACTION_IDS)[number];

/** Reasons from the Rules Engine plus the context-level reasons of ADR 0012. */
export const CONTEXT_ILLEGAL_REASONS = [
  'ACTOR_DEAD',
  'NO_CHARACTER_SHEET',
  'NOT_PRESENT',
  'TARGET_DEAD',
  'ALREADY_HERE',
  'ALREADY_ATTEMPTED',
  'NOT_IN_COMBAT',
  'REACTION_PENDING',
  'INCAPACITATED',
  'IN_COMBAT',
  'NOT_YOUR_TURN',
  'NO_ACTION',
  'NO_BONUS_ACTION',
  'NO_REACTION',
  'NOT_KNOWN',
  'NO_SLOT',
  'SLOT_TOO_LOW',
  'SLOT_ALREADY_USED_THIS_TURN',
  'TAKES_TOO_LONG',
  'TOO_MANY_TARGETS',
  'NOT_A_RITUAL',
  /** A spell that returns the dead, at one alive or dead too long (docs/adr/0056-…md §5). */
  'NOT_DEAD',
  'DEAD_TOO_LONG',
  'NOT_RECHARGED',
  'NO_USES_LEFT',
  'NO_FREE_CAST',
  'OUT_OF_RANGE',
  'TARGET_REQUIRED',
  'TARGET_NOT_VISIBLE',
  'TARGET_IN_COMBAT',
  'DESTINATION_INVALID',
  'NO_VALID_TRIGGER',
  'NO_WEAPON',
  'TOTAL_COVER',
  'NO_ATTACKS_LEFT',
  'INVALID_PATH',
  'NOT_ENOUGH_MOVEMENT',
  'CHARMED_BY_TARGET',
  'CLOSER_TO_FEAR',
  'INVALID_SKILL',
  'NOT_A_FOE',
  'NO_COVER_TO_HIDE',
  /** The weapons' rules (docs/adr/0047-weapons.md). */
  'NO_AMMUNITION',
  'HANDS_FULL',
  'LOADING',
  'NO_EXTRA_ATTACK',
  'ALREADY_GRAPPLED',
  'NOT_GRAPPLED',
  'NOT_GRAPPLING',
  'NEEDS_NO_AID',
  /** Utilize on a square with no trap the party knows of, still to spring (ADR 0057 §6). */
  'NO_KNOWN_TRAP',
  /** An object, where a rule names a creature (docs/adr/0048-hit-points.md §5). */
  'NOT_A_CREATURE',
  /** A grapple's or a shove's target more than one size larger (ADR 0049 §3). */
  'TOO_LARGE',
  /** A move through the air or the earth without its speed; a jump beyond its reach (§5–7). */
  'NO_FLY_SPEED',
  'NO_BURROW_SPEED',
  'JUMP_TOO_FAR',
  /**
   * Mounted combat (ADR 0049 §10): it rides already; it rides nothing; the creature is not willing,
   * not a size larger, or ridden; once a move; a mount its rider controls dashes, disengages or
   * dodges only.
   */
  'MOUNTED',
  'NOT_MOUNTED',
  'NOT_WILLING',
  'MOUNT_TOO_SMALL',
  'MOUNT_TAKEN',
  'MOUNTED_THIS_TURN',
  'CONTROLLED_MOUNT',
  /** Class features (docs/adr/0056-characters-from-the-srd.md §4). */
  'NOT_A_FEATURE',
  'ALREADY_RAGING',
  'NOT_RAGING',
  'HEAVY_ARMOR',
  'ACTION_UNUSED',
  'ALREADY_SURGED',
  'SURGE_NOT_MAGIC',
  'NO_INSPIRATION_DIE',
  'ALREADY_INSPIRED',
  'OUT_OF_FIGHT_ONLY',
  'TOO_MANY_SLOTS',
  'NO_SLOT_EXPENDED',
  'SLOT_TOO_HIGH',
  'POINTS_FULL',
  'NOT_POISONED',
  'NEEDS_NO_HEALING',
  'SELF_ONLY',
  'ONE_METAMAGIC',
  'NOT_FOR_THIS_SPELL',
  /**
   * Summons (docs/adr/0056-characters-from-the-srd.md §5): no option chosen, or one its creature
   * has not, or more objects than the caster animates; no room for it near its square; a
   * Multiattack's breath used already this turn.
   */
  'SUMMON_CHOICE',
  'NO_ROOM',
  'USED_THIS_TURN',
  /**
   * Wild Shape (ADR 0056 §5): a form the Druid cannot take yet; no spells while it wears one; no
   * form to leave.
   */
  'NOT_A_FORM',
  'SHAPED',
  'NOT_SHAPED',
  /** The slice does not carry this action out (Trade: no economy; docs/adr/0020-npc-intelligence.md §1). */
  'NOT_AVAILABLE',
] as const;
export type ContextIllegalReason = (typeof CONTEXT_ILLEGAL_REASONS)[number];

export const RELEVANCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Relevance = (typeof RELEVANCE_LEVELS)[number];

/**
 * `RANGE_NOT_TRACKED`: no canonical positions exist, so range was not evaluated.
 * `ALLY_IN_AREA`: an area spell would also affect a party member (a warning, never a block).
 * `LONG_RANGE`: the attack would be at long range, with Disadvantage.
 */
/**
 * `DISADVANTAGE`, `ADVANTAGE`: an attack the rules tilt one way on the whole (a foe beside an archer,
 * a Heavy weapon too heavy, Vex; docs/adr/0047-weapons.md), beside the long range's own hint.
 */
export const CONTEXT_HINTS = [
  'RANGE_NOT_TRACKED',
  'ALLY_IN_AREA',
  'LONG_RANGE',
  'DISADVANTAGE',
  'ADVANTAGE',
] as const;
export type ContextHint = (typeof CONTEXT_HINTS)[number];

/** An entity as the acting character perceives it: the name only when known. */
export interface ContextEntityRef {
  readonly entityId: string;
  readonly kind: EntityKind;
  readonly name: string | null;
}

export interface ContextVisibleState {
  /** Perceived right now by the acting character. */
  readonly present: boolean;
  /** Only for present entities. */
  readonly status?: EntityStatus;
  /** Only for the acting character and party members. */
  readonly hitPoints?: { readonly current: number; readonly max: number };
  /** Only when canonical battlefield positions exist (combat, Stage 80). */
  readonly distanceFt?: number;
}

/** How the acting character would pay for a spell; their own resources only. */
export type ContextActionCost =
  { readonly kind: 'free' } | { readonly kind: 'slot'; readonly slotLevel: number };

/** The spell of `cast_spell` (docs/adr/0052-spells-as-data.md §5) and how it reaches its target. */
export interface ContextSpell {
  readonly spellId: string;
  /** Its name in the campaign's language: the SRD's, or its Russian once translated. */
  readonly name: string;
  readonly level: number;
  /** The target named this many times at the spell's own level: one per attack or dart. */
  readonly times: number;
  /** Names more for each slot level above the spell's: Magic Missile's dart, Scorching Ray's ray. */
  readonly perSlot?: number;
  /** It names the creature (as many times as `times`); else only its area reaches it. */
  readonly names: boolean;
  /** Its area centered on the target's square, or sent from the caster toward it; absent: at it. */
  readonly aim?: 'point' | 'toward';
  /** What is the DM's to apply: its whole effect, or what its effect leaves out. */
  readonly forDm?: 'effect' | 'rest';
  /** The slot levels the caster could spend on it, lowest first; none for a cantrip. */
  readonly slots: readonly number[];
  /**
   * The Metamagic a Sorcerer could spend on it now, with its cost in Sorcery Points
   * (docs/adr/0056-characters-from-the-srd.md §4); absent: none.
   */
  readonly metamagic?: readonly { readonly optionId: MetamagicId; readonly cost: number }[];
  /**
   * A summoning spell (docs/adr/0056-characters-from-the-srd.md §5): the creature it calls up
   * beside the caster, the options to choose from, or the weight of objects it animates.
   */
  readonly summon?: {
    readonly creature: SummonedCreature;
    readonly options: readonly SummonOption[];
    readonly objects?: { readonly budget: number };
  };
}

export interface ContextAction {
  readonly id: ContextActionId;
  /** The subject of `ask_about`; always an entity the perspective knows. */
  readonly topic?: ContextEntityRef;
  /** What `show_evidence` would show: an EVIDENCE record of the acting character's own scope. */
  readonly evidence?: { readonly knowledgeId: string };
  /** The weapon of `weapon_attack`: a rules weapon ID (Stage 520). */
  readonly weapon?: WeaponId;
  /** The attack of `form_attack`: one of the Wild Shape form's, named (ADR 0056 §5). */
  readonly formAttack?: { readonly attackId: string; readonly name: string };
  /**
   * The mastery the actor uses with that weapon (docs/adr/0047-weapons.md §2): Push and Topple
   * ask their choice before the attack.
   */
  readonly mastery?: WeaponMastery;
  readonly legal: boolean;
  readonly reason?: ContextIllegalReason;
  readonly resolution?: { readonly moveRequiredFt?: number };
  readonly relevance: Relevance;
  readonly cost?: ContextActionCost;
  readonly hints?: readonly ContextHint[];
  /** Area spells: the combatants the area would affect (ADR 0015 §6). */
  readonly area?: { readonly affected: readonly ContextEntityRef[] };
  /** The spell of `cast_spell`. */
  readonly spell?: ContextSpell;
}

export interface EntityContextView {
  readonly entity: ContextEntityRef;
  readonly visibleState: ContextVisibleState;
  readonly actions: readonly ContextAction[];
}

/**
 * How the actions were ranked (docs/adr/0021-ai-relevance.md). `ai`: the
 * relevance ranker re-rated the legal actions; anything else leaves the
 * Context Engine's deterministic ranking as it was.
 */
export const RANKING_STATUSES = [
  'NOT_REQUESTED',
  /** Fewer than two legal actions: there is nothing to rank, and no provider is asked. */
  'NOTHING_TO_RANK',
  'RANKED',
  'AI_UNAVAILABLE',
  'INVALID_OUTPUT',
  'TIMEOUT',
] as const;
export type RankingStatus = (typeof RANKING_STATUSES)[number];

export interface ContextRanking {
  readonly source: 'ai' | 'deterministic';
  readonly status: RankingStatus;
  /** The AI request's trace (DM only); null when the ranker was not asked. */
  readonly traceId: string | null;
}

/** HTTP body of `GET /campaigns/:campaignId/entities/:entityId/context`. */
export interface EntityContextResponse {
  readonly perspective: string;
  readonly actingCharacterId: string;
  readonly worldTime: number;
  readonly context: EntityContextView;
  readonly ranking: ContextRanking;
}
