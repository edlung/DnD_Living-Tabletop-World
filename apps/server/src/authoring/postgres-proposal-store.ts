import type pg from 'pg';

import {
  ProposalConflictError,
  type ProposalRevision,
  type ProposalStore,
} from './proposal-store.ts';

/**
 * PostgreSQL proposal revisions (migration 0003_authoring_proposals.sql,
 * docs/adr/0018-ai-authoring.md §9). Insert-only; the table rejects updates
 * and deletes. A proposal is found only within its own campaign.
 */
const UNIQUE_VIOLATION = '23505';

export class PostgresProposalStore implements ProposalStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async append(revision: ProposalRevision): Promise<void> {
    try {
      await this.#pool.query(
        `INSERT INTO ltw_authoring_revisions
           (proposal_id, revision, campaign_id, created_by, revision_doc, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          revision.proposalId,
          revision.revision,
          revision.campaignId,
          revision.createdBy,
          JSON.stringify(revision),
          revision.createdAt,
        ],
      );
    } catch (error) {
      if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) {
        throw new ProposalConflictError(revision.proposalId, revision.revision);
      }
      throw error;
    }
  }

  async latest(campaignId: string, proposalId: string): Promise<ProposalRevision | null> {
    const result = await this.#pool.query<{ revision_doc: ProposalRevision }>(
      `SELECT revision_doc FROM ltw_authoring_revisions
        WHERE campaign_id = $1 AND proposal_id = $2
        ORDER BY revision DESC LIMIT 1`,
      [campaignId, proposalId],
    );
    return result.rows[0]?.revision_doc ?? null;
  }
}
