import type { AuthoringSource } from '@ltw/contracts';
import type { ResolvedProposable } from '@ltw/domain';

/**
 * Authoring proposal revisions (docs/adr/0018-ai-authoring.md §5, §9): DM
 * working data, not canonical state. Revisions are append-only; whether a
 * proposal was committed or undone comes from canonical state, never from
 * here.
 */
export interface ProposalRevision {
  readonly campaignId: string;
  readonly proposalId: string;
  readonly revision: number;
  readonly summary: string;
  readonly source: AuthoringSource;
  /** With every generated ID resolved, so a preview shows exactly what commits. */
  readonly commands: readonly ResolvedProposable[];
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface ProposalStore {
  /** Throws `ProposalConflictError` when that revision of the proposal already exists. */
  append(revision: ProposalRevision): Promise<void>;
  /** The latest revision, or null when the proposal does not exist in that campaign. */
  latest(campaignId: string, proposalId: string): Promise<ProposalRevision | null>;
}

export class ProposalConflictError extends Error {
  constructor(proposalId: string, revision: number) {
    super(`Revision ${String(revision)} of proposal ${proposalId} already exists`);
    this.name = 'ProposalConflictError';
  }
}

export class InMemoryProposalStore implements ProposalStore {
  readonly #revisions = new Map<string, ProposalRevision[]>();

  append(revision: ProposalRevision): Promise<void> {
    const list = this.#revisions.get(revision.proposalId) ?? [];
    if (list.some((stored) => stored.revision === revision.revision)) {
      return Promise.reject(new ProposalConflictError(revision.proposalId, revision.revision));
    }
    this.#revisions.set(revision.proposalId, [...list, structuredClone(revision)]);
    return Promise.resolve();
  }

  latest(campaignId: string, proposalId: string): Promise<ProposalRevision | null> {
    const list = this.#revisions.get(proposalId) ?? [];
    const latest = list.reduce<ProposalRevision | null>(
      (best, stored) => (best === null || stored.revision > best.revision ? stored : best),
      null,
    );
    return Promise.resolve(latest?.campaignId === campaignId ? structuredClone(latest) : null);
  }
}
