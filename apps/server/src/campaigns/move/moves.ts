import { randomUUID } from 'node:crypto';

import type { CampaignAway } from '@ltw/contracts';
import type pg from 'pg';

/**
 * Where a campaign plays (migration 0039, docs/adr/0061-local-mode.md §5): at home, or away since a
 * move took it to another server. Screens read it; the HTTP layer refuses changes to an away
 * campaign (`guard.ts`); only the move's operator command marks or ends a move.
 */
export interface CampaignMoves {
  awayOf(campaignId: string): Promise<CampaignAway | null>;
}

/** For compositions without a database: nothing ever moves. */
export const NOTHING_AWAY: CampaignMoves = { awayOf: () => Promise.resolve(null) };

export class PostgresCampaignMoves implements CampaignMoves {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  awayOf(campaignId: string): Promise<CampaignAway | null> {
    return openMove(this.#pool, campaignId);
  }
}

/** A campaign's open move, or null at home. */
export async function openMove(
  db: pg.Pool | pg.ClientBase,
  campaignId: string,
  options: { readonly lock?: boolean } = {},
): Promise<CampaignAway | null> {
  const { rows } = await db.query<{ destination: string; moved_at: Date }>(
    `SELECT destination, moved_at FROM ltw_campaign_moves
      WHERE campaign_id = $1 AND ended_at IS NULL${options.lock === true ? ' FOR UPDATE' : ''}`,
    [campaignId],
  );
  const row = rows[0];
  return row ? { destination: row.destination, movedAt: row.moved_at.toISOString() } : null;
}

/** Marks a campaign away; false when it is away already. */
export async function markAway(
  db: pg.Pool | pg.ClientBase,
  campaignId: string,
  destination: string,
  at: Date,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO ltw_campaign_moves (move_id, campaign_id, destination, moved_at)
     VALUES ($1, $2, $3, $4) ON CONFLICT (campaign_id) WHERE ended_at IS NULL DO NOTHING`,
    [randomUUID(), campaignId, destination, at],
  );
  return rowCount === 1;
}

/** Ends a campaign's open move: it came back, or the move never happened. False when none is open. */
export async function endMove(
  db: pg.Pool | pg.ClientBase,
  campaignId: string,
  as: 'returned' | 'cancelled',
  at: Date,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE ltw_campaign_moves SET ended_at = GREATEST($3::timestamptz, moved_at), ended_as = $2
      WHERE campaign_id = $1 AND ended_at IS NULL`,
    [campaignId, as, at],
  );
  return rowCount === 1;
}
