import { z } from 'zod';

import type { EventSummary } from '../kernel/results.ts';
import {
  authoringConfirmationSchema,
  proposalCommandsSchema,
  proposalRevisionSchema,
  proposalSummarySchema,
  traceIdSchema,
  type AuthoringConfirmation,
  type AuthoringSource,
  type AuthoringWarningCode,
  type ProposableCommand,
  type RiskLevel,
} from './commands.ts';

/**
 * Authoring proposals over HTTP (docs/adr/0018-ai-authoring.md §5, §8). DM
 * data only: proposals, previews, and provenance never reach player views.
 */

/** A blocking problem; `commandIndex` is null when it concerns the whole proposal. */
export interface AuthoringIssue {
  readonly commandIndex: number | null;
  /** An authoring issue code or the operation's own World Engine rejection code. */
  readonly code: string;
  readonly message: string;
}

export interface AuthoringWarning {
  readonly key: string;
  readonly code: AuthoringWarningCode;
  readonly commandIndex: number;
  readonly entityIds: readonly string[];
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
  readonly risk: { readonly level: RiskLevel; readonly reasons: readonly RiskReason[] };
  /** What a commit must confirm now; null when the proposal cannot commit. */
  readonly confirmation: AuthoringConfirmation | null;
  /** The events a commit would record now. */
  readonly changes: readonly { readonly type: string; readonly payload: unknown }[];
}

export const PROPOSAL_STATUSES = ['DRAFT', 'COMMITTED', 'UNDONE'] as const;
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

/** `POST …/authoring/proposals`: from an AI trace's proposal, or written by the DM. */
export const createProposalRequestSchema = z.union([
  z.object({ traceId: traceIdSchema }).strict(),
  z.object({ summary: proposalSummarySchema, commands: proposalCommandsSchema }).strict(),
]);
export type CreateProposalRequest = z.infer<typeof createProposalRequestSchema>;

/** `POST …/proposals/:proposalId/revisions`: an edit of the latest revision. */
export const reviseProposalRequestSchema = z
  .object({
    basedOnRevision: proposalRevisionSchema,
    summary: proposalSummarySchema.optional(),
    commands: proposalCommandsSchema,
  })
  .strict();
export type ReviseProposalRequest = z.infer<typeof reviseProposalRequestSchema>;

/** `POST …/proposals/:proposalId/commit`: the DM's confirmation of the latest revision. */
export const commitProposalRequestSchema = z
  .object({ revision: proposalRevisionSchema, confirmation: authoringConfirmationSchema })
  .strict();
export type CommitProposalRequest = z.infer<typeof commitProposalRequestSchema>;
