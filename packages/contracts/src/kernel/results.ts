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
