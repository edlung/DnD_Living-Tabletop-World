import { z } from 'zod';

import type { EventSummary } from '../kernel/results.ts';
import {
  authoringConfirmationSchema,
  proposalCommandsSchema,
  proposalRevisionSchema,
  proposalSummarySchema,
  traceIdSchema,
  type AuthoringConfirmation,
  type AuthoringNoteCode,
  type AuthoringSource,
  type AuthoringWarningCode,
  type ProposableCommand,
  type RiskLevel,
} from './commands.ts';

/**
 * Authoring proposals over HTTP (docs/adr/0018-ai-authoring.md §5, §8). DM
 * data only: proposals, previews, and provenance never reach player views.
 */

/**
 * A way to resolve an issue or warning (docs/adr/0019-continuity-engine.md §1).
 * Never applied automatically: the DM applies one explicitly, which stores
 * `commands` as a new revision that needs its own preview and confirmation.
 */
export interface ResolutionOption {
  /** Unique within a preview; `POST …/revisions` with `{ optionId }` applies it. */
  readonly optionId: string;
  readonly kind: 'edit' | 'remove' | 'acknowledge';
  readonly label: string;
  /** The whole command list of the revision an edit or removal creates; null to acknowledge. */
  readonly commands: readonly ProposableCommand[] | null;
}

/** A blocking problem; `commandIndex` is null when it concerns the whole proposal. */
export interface AuthoringIssue {
  /** `CODE@index[:entityId]`, or `CODE@all` for the whole proposal; option IDs build on it. */
  readonly key: string;
  readonly commandIndex: number | null;
  /** An authoring issue code or the operation's own World Engine rejection code. */
  readonly code: string;
  /** The explanation: what conflicts, with names and world times. */
  readonly message: string;
  /** Present in previews. */
  readonly options?: readonly ResolutionOption[];
}

export interface AuthoringWarning {
  readonly key: string;
  readonly code: AuthoringWarningCode;
  readonly commandIndex: number;
  readonly entityIds: readonly string[];
  /** Related records, for example the account a claim disagrees with. */
  readonly knowledgeIds: readonly string[];
  readonly message: string;
  /** Present in previews. */
  readonly options?: readonly ResolutionOption[];
}

/** Information for the DM; nothing to acknowledge (for example, accounts that agree). */
export interface AuthoringNote {
  readonly code: AuthoringNoteCode;
  readonly commandIndex: number;
  readonly entityIds: readonly string[];
  readonly knowledgeIds: readonly string[];
  readonly message: string;
}

export interface RiskReason {
  readonly commandIndex: number;
  readonly level: RiskLevel;
  readonly reason: string;
}

export interface AuthoringPreview {
  /** The campaign stream version the preview was computed at. */
  readonly stateVersion: number;
  /** True when a confirmed commit would be accepted now. */
  readonly committable: boolean;
  readonly issues: readonly AuthoringIssue[];
  readonly warnings: readonly AuthoringWarning[];
  readonly notes: readonly AuthoringNote[];
  readonly risk: { readonly level: RiskLevel; readonly reasons: readonly RiskReason[] };
  /** What a commit must confirm now; null when the proposal cannot commit. */
  readonly confirmation: AuthoringConfirmation | null;
  /** The events a commit would record now. */
  readonly changes: readonly { readonly type: string; readonly payload: unknown }[];
}

/** `CANCELLED`: the DM discarded the draft (owner decisions 11, SI-D1); it never commits. */
export const PROPOSAL_STATUSES = ['DRAFT', 'COMMITTED', 'UNDONE', 'CANCELLED'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export interface AuthoringProposalView {
  readonly proposalId: string;
  readonly campaignId: string;
  /** The latest revision. */
  readonly revision: number;
  readonly summary: string;
  readonly source: AuthoringSource;
  readonly commands: readonly ProposableCommand[];
  readonly createdBy: string;
  readonly createdAt: string;
  /** The option this revision applied, if it came from one (ADR 0019 §1). */
  readonly appliedOption: { readonly optionId: string; readonly label: string } | null;
  readonly status: ProposalStatus;
  readonly commit: {
    readonly commandId: string;
    readonly revision: number;
    readonly events: readonly EventSummary[];
    readonly undoneBy: string | null;
  } | null;
}

export interface AuthoringProposalResponse {
  readonly proposal: AuthoringProposalView;
  /** Present while the proposal is a draft. */
  readonly preview: AuthoringPreview | null;
}

/** One proposal the DM has not finished: a draft neither committed nor cancelled. */
export interface OpenProposalSummary {
  readonly proposalId: string;
  /** The latest revision. */
  readonly revision: number;
  readonly summary: string;
  readonly source: AuthoringSource;
  /** When its latest revision was stored. */
  readonly updatedAt: string;
}

/**
 * `GET …/authoring/proposals` (DM only; owner decisions 11, SI-D1): the campaign's open drafts,
 * the most recently changed first, so a reload or a change of perspective restores the DM's
 * unfinished proposal instead of losing it (ADR 0029 §6, amendment 2026-10-28).
 */
export interface OpenProposalsResponse {
  readonly proposals: readonly OpenProposalSummary[];
}

/** `POST …/authoring/proposals`: from an AI trace's proposal, or written by the DM. */
export const createProposalRequestSchema = z.union([
  z.object({ traceId: traceIdSchema }).strict(),
  z.object({ summary: proposalSummarySchema, commands: proposalCommandsSchema }).strict(),
]);
export type CreateProposalRequest = z.infer<typeof createProposalRequestSchema>;

/**
 * `POST …/proposals/:proposalId/revisions`: an edit of the latest revision,
 * either written by the DM or one of its preview's options (ADR 0019 §1).
 */
export const reviseProposalRequestSchema = z.union([
  z
    .object({
      basedOnRevision: proposalRevisionSchema,
      summary: proposalSummarySchema.optional(),
      commands: proposalCommandsSchema,
    })
    .strict(),
  z
    .object({
      basedOnRevision: proposalRevisionSchema,
      optionId: z.string().min(1).max(200),
    })
    .strict(),
]);
export type ReviseProposalRequest = z.infer<typeof reviseProposalRequestSchema>;

/** `POST …/proposals/:proposalId/commit`: the DM's confirmation of the latest revision. */
export const commitProposalRequestSchema = z
  .object({ revision: proposalRevisionSchema, confirmation: authoringConfirmationSchema })
  .strict();
export type CommitProposalRequest = z.infer<typeof commitProposalRequestSchema>;
