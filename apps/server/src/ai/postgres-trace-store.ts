import type { AiTraceStore } from '@ltw/ai';
import type { AiTraceView } from '@ltw/contracts';
import type pg from 'pg';

/**
 * PostgreSQL trace store (migration 0002_ai_traces.sql, docs/adr/0017-ai-gateway.md §7).
 * Insert-only; the table rejects updates and deletes. A trace is returned
 * only within its own campaign.
 */
export class PostgresAiTraceStore implements AiTraceStore {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async append(trace: AiTraceView): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ltw_ai_traces (trace_id, campaign_id, actor_id, purpose, status, trace, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        trace.traceId,
        trace.campaignId,
        trace.actorId,
        trace.purpose,
        trace.status,
        JSON.stringify(trace),
        trace.createdAt,
      ],
    );
  }

  async get(campaignId: string, traceId: string): Promise<AiTraceView | null> {
    const result = await this.#pool.query<{ trace: AiTraceView }>(
      'SELECT trace FROM ltw_ai_traces WHERE campaign_id = $1 AND trace_id = $2',
      [campaignId, traceId],
    );
    return result.rows[0]?.trace ?? null;
  }
}
