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
 *
 * An exclusive section holds a transaction-level advisory lock on the
 * proposal, so it excludes every process on the database (G04-H01). The lock
 * lives on a connection of `locks`, which the composition root gives its own
 * pool: a section waits for the event store's connections while it runs, so
 * sharing one pool could leave every connection held by a waiting section.
 * Ending the transaction, or losing the connection, releases the lock.
 */
const UNIQUE_VIOLATION = '23505';
/** The advisory-lock key space of authoring proposals ("AUTH"). */
const PROPOSAL_LOCKS = 0x41555448;

export class PostgresProposalStore implements ProposalStore {
  readonly #pool: pg.Pool;
  readonly #locks: pg.Pool;

  constructor(pool: pg.Pool, locks: pg.Pool = pool) {
    this.#pool = pool;
    this.#locks = locks;
  }

  async exclusive<T>(campaignId: string, proposalId: string, work: () => Promise<T>): Promise<T> {
    const client = await this.#locks.connect();
    let ended = false;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
        PROPOSAL_LOCKS,
        `${campaignId}|${proposalId}`,
      ]);
      try {
        return await work();
      } finally {
        await client.query('COMMIT');
        ended = true;
      }
    } finally {
      // A connection whose transaction did not end cleanly is discarded, releasing the lock.
      client.release(!ended);
    }
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

  async latestOfCampaign(campaignId: string): Promise<readonly ProposalRevision[]> {
    const result = await this.#pool.query<{ revision_doc: ProposalRevision }>(
      `SELECT DISTINCT ON (proposal_id) revision_doc FROM ltw_authoring_revisions
        WHERE campaign_id = $1
        ORDER BY proposal_id, revision DESC`,
      [campaignId],
    );
    return result.rows.map((row) => row.revision_doc);
  }
}
