import type pg from 'pg';
import type { CampaignPublication, CampaignPublicationState } from './publication.ts';

/** Never caches absence: a stable target can be reserved after an earlier lookup. */
export class PostgresCampaignPublication implements CampaignPublication {
  readonly #pool: pg.Pool;
  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }
  async state(campaignId: string): Promise<CampaignPublicationState> {
    try {
      const row = (
        await this.#pool.query<{ status: 'PROVISIONING' | 'PUBLISHED' }>(
          'SELECT status FROM ltw_workshop_campaign_activations WHERE campaign_id=$1',
          [campaignId],
        )
      ).rows[0];
      return !row ? 'UNTRACKED' : row.status === 'PUBLISHED' ? 'PUBLISHED' : 'UNPUBLISHED';
    } catch {
      throw new Error('CAMPAIGN_PUBLICATION_UNAVAILABLE');
    }
  }
}
