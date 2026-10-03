import type { PlayerOutcome } from '../investigation/commands.ts';

/**
 * Outcome of submitting a World Kernel command. Rejections never change
 * canonical state; `duplicate` reports the original outcome of a command ID
 * that was already accepted (docs/adr/0006-temporal-model-and-undo.md §7).
 */
export const REJECTION_CODES = [
  /** Malformed submission: schema validation failed. */
  'INVALID_COMMAND',
  /** The actor may not issue this command. Checked before any state is inspected. */
  'FORBIDDEN',
  'CAMPAIGN_NOT_FOUND',
  'CAMPAIGN_ALREADY_EXISTS',
  /** An entity or scene ID was used before (IDs are never reused). */
  'ID_ALREADY_USED',
  'ENTITY_NOT_FOUND',
  'NOT_A_LOCATION',
  'ENTITY_DESTROYED',
  /** Location data present/absent inconsistently with the entity kind. */
  'INVALID_ENTITY_DEFINITION',
  'INVALID_PLACEMENT',
  'INVALID_STATUS',
  /** World-time rule violated (future existence, backstory before a parent, clock rewind, …). */
  'TEMPORAL_CONFLICT',
  /** The command would not change anything. */
  'NO_EFFECT',
  'SCENE_NOT_FOUND',
  'SCENE_ALREADY_ACTIVE',
  'SCENE_NOT_ACTIVE',
  'COMMAND_NOT_FOUND',
  'UNDO_NOT_SUPPORTED',
  'ALREADY_UNDONE',
  /** Later effective events depend on what the target command changed. */
  'UNDO_UNSAFE',
  /** `expectedVersion` did not match the campaign stream. */
  'VERSION_MISMATCH',
  /** The command ID was already used for a different command. */
  'COMMAND_ID_CONFLICT',
  /** Concurrent writers kept winning; safe to retry with the same command ID. */
  'CONCURRENCY_CONFLICT',
  /** Knowledge record violates ADR 0008 rules (holder kind, attribution, relations, types). */
  'INVALID_KNOWLEDGE',
  'KNOWLEDGE_NOT_FOUND',
  /** Character assignment targets a non-character or the DM. */
  'INVALID_ASSIGNMENT',
  /** The character or the player is already assigned. */
  'ALREADY_ASSIGNED',
  /** Memory shape violates ADR 0010 (holder kind, kind-specific fields). */
  'INVALID_MEMORY',
  /** The holder could not have this memory (future, before existence, absent, uncitable). */
  'IMPOSSIBLE_MEMORY',
  'MEMORY_NOT_FOUND',
  'SESSION_NOT_FOUND',
  'SESSION_ALREADY_ACTIVE',
  'SESSION_NOT_ACTIVE',
  /** Investigation (ADR 0013): the acting character is dead. */
  'ACTOR_DEAD',
  /** The acting character is Incapacitated (speech and checks). */
  'ACTOR_INCAPACITATED',
  /** The target is not where the acting character is. */
  'NOT_PRESENT',
  'TARGET_DEAD',
  /** One skill-check attempt per character, entity, and method. */
  'ALREADY_ATTEMPTED',
  /** A skill check needs the acting character's canonical sheet. */
  'NO_CHARACTER_SHEET',
  /** Clue shape violates ADR 0013 (DC, target, statement). */
  'INVALID_CLUE',
  /** Disclosure targets a non-NPC record or a never-shareable type. */
  'INVALID_DISCLOSURE',
  /** Claim violates ADR 0014 (target scope/type, subject, already set). */
  'INVALID_CLAIM',
  /** Combat (ADR 0015): no encounter is running. */
  'NOT_IN_COMBAT',
  'COMBAT_ALREADY_ACTIVE',
  /** Battlefield or combatant setup violates ADR 0015 §1. */
  'INVALID_ENCOUNTER',
  'NOT_A_COMBATANT',
  'NOT_YOUR_TURN',
  /** A creature without a stat block (or a character without a sheet) cannot fight. */
  'NO_STAT_BLOCK',
  /** The Rules Engine refused the action; the message is the rules reason (for example OUT_OF_RANGE). */
  'ILLEGAL_ACTION',
  /** A reaction window is open: the encounter waits for its answers (docs/adr/0016-reaction-engine.md). */
  'REACTION_PENDING',
  /** No open reaction window has this ID: it closed, expired, was undone, or never existed. */
  'REACTION_WINDOW_CLOSED',
  /** The combatant is not a candidate of this reaction window. */
  'NOT_A_CANDIDATE',
  /** The candidate already answered this reaction window. */
  'ALREADY_RESPONDED',
] as const;

export type RejectionCode = (typeof REJECTION_CODES)[number];

export interface EventSummary {
  readonly sequence: number;
  readonly eventId: string;
  readonly type: string;
}

export interface CommandAccepted {
  readonly status: 'accepted' | 'duplicate';
  readonly commandId: string;
  readonly campaignId: string;
  readonly events: readonly EventSummary[];
  /** Player-visible outcome of a player command (docs/adr/0013-investigation.md §6). */
  readonly outcome?: PlayerOutcome;
}

export interface CommandRejected {
  readonly status: 'rejected';
  /** `null` only when the submission was too malformed to carry a command ID. */
  readonly commandId: string | null;
  readonly code: RejectionCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type CommandResult = CommandAccepted | CommandRejected;
