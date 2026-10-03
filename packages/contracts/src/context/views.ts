import type { EntityKind, EntityStatus } from '../kernel/commands.ts';

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
  'inspect',
  'recall',
  'insight_check',
  'investigation_check',
  'perception_check',
  'healing_word',
  'hunters_mark',
  'detect_magic',
  'longbow_attack',
  'enter_location',
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
  'INCAPACITATED',
  'NOT_YOUR_TURN',
  'NO_ACTION',
  'NO_BONUS_ACTION',
  'NO_REACTION',
  'NOT_KNOWN',
  'NO_SLOT',
  'SLOT_TOO_LOW',
  'SLOT_ALREADY_USED_THIS_TURN',
  'NO_FREE_CAST',
  'OUT_OF_RANGE',
  'TARGET_REQUIRED',
  'TARGET_NOT_VISIBLE',
  'DESTINATION_INVALID',
  'NO_VALID_TRIGGER',
  'NO_WEAPON',
  'TOTAL_COVER',
  'NO_ATTACKS_LEFT',
  'INVALID_PATH',
  'NOT_ENOUGH_MOVEMENT',
] as const;
export type ContextIllegalReason = (typeof CONTEXT_ILLEGAL_REASONS)[number];

export const RELEVANCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Relevance = (typeof RELEVANCE_LEVELS)[number];

/** `RANGE_NOT_TRACKED`: no canonical positions exist, so range was not evaluated. */
export const CONTEXT_HINTS = ['RANGE_NOT_TRACKED'] as const;
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

export interface ContextAction {
  readonly id: ContextActionId;
  /** The subject of `ask_about`; always an entity the perspective knows. */
  readonly topic?: ContextEntityRef;
  readonly legal: boolean;
  readonly reason?: ContextIllegalReason;
  readonly resolution?: { readonly moveRequiredFt?: number };
  readonly relevance: Relevance;
  readonly cost?: ContextActionCost;
  readonly hints?: readonly ContextHint[];
}

export interface EntityContextView {
  readonly entity: ContextEntityRef;
  readonly visibleState: ContextVisibleState;
  readonly actions: readonly ContextAction[];
}

/** HTTP body of `GET /campaigns/:campaignId/entities/:entityId/context`. */
export interface EntityContextResponse {
  readonly perspective: string;
  readonly actingCharacterId: string;
  readonly worldTime: number;
  readonly context: EntityContextView;
}
