import { z } from 'zod';

import type { PlayerCommandType } from '../investigation/commands.ts';
import { entityIdSchema } from '../kernel/identifiers.ts';
import type { KernelCommandOf, KernelCommandType } from '../kernel/commands.ts';
import type { RejectionCode } from '../kernel/results.ts';
import type { EntityRef } from '../knowledge/views.ts';
import type { Weather } from '../visual/commands.ts';

/**
 * The DM's table tools of the live session (docs/adr/0033-live-session.md §6–7;
 * docs/STAGE_310_DESIGN.md §B–C). DM only: everyone else gets the same 404 as a campaign
 * that does not exist. Nothing here is canonical: the stored commands are.
 */
export const SUBSTITUTION_REASONS = ['absent', 'asked', 'other'] as const;
export type SubstitutionReason = (typeof SUBSTITUTION_REASONS)[number];

/** The longest optional note the DM may add to a reason. */
export const SUBSTITUTION_NOTE_CHARS = 200;

/** A client command ID as `POST …/commands` takes it; stored as `http:<actorId>:<id>`. */
export const clientCommandIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);

/**
 * `POST /campaigns/:campaignId/dm/substitutions`: why the DM is about to act for a player's
 * character, recorded before the DM submits the command with the same client command ID.
 */
export const recordSubstitutionRequestSchema = z
  .object({
    clientCommandId: clientCommandIdSchema,
    characterId: entityIdSchema,
    reason: z.enum(SUBSTITUTION_REASONS),
    note: z.string().max(SUBSTITUTION_NOTE_CHARS).optional(),
  })
  .strict();
export type RecordSubstitutionRequest = z.infer<typeof recordSubstitutionRequestSchema>;

/** Whether the reason was recorded now or already was; never any world content. */
export interface RecordSubstitutionResponse {
  readonly status: 'recorded' | 'duplicate';
}

/** Entries per page of the DM history. */
export const DM_HISTORY_PAGE_SIZE = 20;

export interface DmUndoBlocker {
  readonly commandId: string;
  readonly commandType: KernelCommandType;
  readonly sequence: number;
}

/**
 * Whether the DM could undo the entry now: the World Engine's own decision of `UndoCommand`
 * against the current state, made without committing anything. The undo itself is decided
 * again when it is submitted.
 */
export type DmUndoAvailability =
  | { readonly possible: true }
  | {
      readonly possible: false;
      readonly code: RejectionCode;
      /** The later commands that depend on this one (`UNDO_UNSAFE`), newest last. */
      readonly blockers: readonly DmUndoBlocker[];
    };

interface DmHistoryCommon {
  /** The stored command: `UndoCommand` targets it. */
  readonly commandId: string;
  /** Its first event's sequence: the list is newest first, and `before` pages by it. */
  readonly sequence: number;
  readonly worldTime: number;
  readonly recordedAt: string;
  /** Canonical: from the stored commands and `CommandUndone`. */
  readonly status: 'COMMITTED' | 'UNDONE';
  /** Null once undone. */
  readonly undo: DmUndoAvailability | null;
}

/** An authoring commit (`ApplyAuthoring`); undone through its proposal's undo route. */
export interface DmAuthoringEntry extends DmHistoryCommon {
  readonly kind: 'authoring';
  readonly proposalId: string;
  readonly summary: string;
}

/** A player command the DM issued for a character that had a player at the time. */
export interface DmSubstitutionEntry extends DmHistoryCommon {
  readonly kind: 'substitution';
  readonly character: EntityRef;
  /** The command as submitted, without the draws the engine recorded with it. */
  readonly command: KernelCommandOf<PlayerCommandType>;
  /** The DM's stated reason for this command, when one was recorded. */
  readonly reason: {
    readonly reason: SubstitutionReason;
    readonly note: string | null;
  } | null;
}

/**
 * A world-time or weather change the DM made at the table (`AdvanceWorldTime`, `SetWeather`),
 * as the World Engine recorded it; undone as `UndoCommand` (owner decision SI-D4, 2026-10-28).
 */
export interface DmWorldEntry extends DmHistoryCommon {
  readonly kind: 'world';
  readonly change:
    | { readonly kind: 'time'; readonly from: number; readonly to: number }
    | {
        readonly kind: 'weather';
        readonly location: EntityRef;
        /** Null when the place had no weather of its own before. */
        readonly from: Weather | null;
        readonly to: Weather;
      };
}

export type DmHistoryEntry = DmAuthoringEntry | DmSubstitutionEntry | DmWorldEntry;

/** `GET /campaigns/:campaignId/dm/history?perspective=DM[&before=<sequence>]` (DM only). */
export interface DmHistoryResponse {
  readonly perspective: 'DM';
  readonly entries: readonly DmHistoryEntry[];
  /** `before` for the next older page; null when nothing older remains. */
  readonly nextBefore: number | null;
}
