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
  /** The option this revision applied (ADR 0019 §1); absent in revisions stored before Stage 120. */
  readonly appliedOption?: { readonly optionId: string; readonly label: string } | null;
  /**
   * True on the revision that records the DM's cancel (owner decisions 11, SI-D1): the draft is
   * closed and never commits. Absent in revisions stored before it.
   */
  readonly cancelled?: boolean;
}

export interface ProposalStore {
  /**
   * Runs `work` while no other `exclusive` section of the same proposal runs,
   * in any process (Gate 04, G04-H01). Every check-then-act on a proposal (an
   * edit, a commit, an undo) runs inside one, so an edit and a commit of the
   * same proposal take turns: the later sees the earlier's effect.
   */
  exclusive<T>(campaignId: string, proposalId: string, work: () => Promise<T>): Promise<T>;
  /** Throws `ProposalConflictError` when that revision of the proposal already exists. */
  append(revision: ProposalRevision): Promise<void>;
  /** The latest revision, or null when the proposal does not exist in that campaign. */
  latest(campaignId: string, proposalId: string): Promise<ProposalRevision | null>;
  /**
   * One page of the campaign's proposals whose latest revision is not cancelled, the most
   * recently changed first (ties: the larger proposal ID first), after `after` when given. Only
   * what a list shows. Whether one was committed is canon's: a store may leave committed ones out
   * already, and the caller still filters by canon.
   */
  uncancelled(campaignId: string, page: DraftPage): Promise<readonly DraftSummary[]>;
}

/** A proposal's latest revision, as the DM's list of drafts shows it. */
export interface DraftSummary {
  readonly proposalId: string;
  readonly revision: number;
  readonly summary: string;
  readonly source: AuthoringSource;
  readonly createdAt: string;
}

export interface DraftPage {
  readonly limit: number;
  /** The last summary of the previous page; null for the first. */
  readonly after: { readonly createdAt: string; readonly proposalId: string } | null;
}

/** Newest first, then the larger proposal ID: the order of `uncancelled`. */
export function compareDrafts(
  a: { readonly createdAt: string; readonly proposalId: string },
  b: { readonly createdAt: string; readonly proposalId: string },
): number {
  return (
    Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
    (a.proposalId < b.proposalId ? 1 : a.proposalId > b.proposalId ? -1 : 0)
  );
}

export class ProposalConflictError extends Error {
  constructor(proposalId: string, revision: number) {
    super(`Revision ${String(revision)} of proposal ${proposalId} already exists`);
    this.name = 'ProposalConflictError';
  }
}

export class InMemoryProposalStore implements ProposalStore {
  readonly #revisions = new Map<string, ProposalRevision[]>();
  /** The tail of each proposal's queue of exclusive sections (one process only). */
  readonly #turns = new Map<string, Promise<void>>();

  async exclusive<T>(campaignId: string, proposalId: string, work: () => Promise<T>): Promise<T> {
    const key = `${campaignId}|${proposalId}`;
    const previous = this.#turns.get(key) ?? Promise.resolve();
    let done: () => void = () => undefined;
    const turn = new Promise<void>((resolve) => (done = resolve));
    const tail = previous.then(() => turn);
    this.#turns.set(key, tail);
    await previous;
    try {
      return await work();
    } finally {
      done();
      if (this.#turns.get(key) === tail) this.#turns.delete(key);
    }
  }

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

  async uncancelled(campaignId: string, page: DraftPage): Promise<readonly DraftSummary[]> {
    const found: DraftSummary[] = [];
    for (const proposalId of this.#revisions.keys()) {
      const latest = await this.latest(campaignId, proposalId);
      if (!latest || latest.cancelled === true) continue;
      const { revision, summary, source, createdAt } = latest;
      found.push({ proposalId, revision, summary, source, createdAt });
    }
    const { after } = page;
    return found
      .sort(compareDrafts)
      .filter((draft) => after === null || compareDrafts(after, draft) < 0)
      .slice(0, page.limit);
  }
}
