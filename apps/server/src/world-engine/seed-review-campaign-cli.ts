import pg from 'pg';

import { describeDatabaseUrl, loadConfig } from '../platform/config/config.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { ReviewCampaignError, seedReviewCampaign } from './review-campaign.ts';
import { createWorldEngine } from './runtime.ts';

/**
 * Seeds the deployment's review campaign, the Russian Ravenford with every seat open
 * (`review-campaign.ts`; deploy/RUNBOOK.md, first install step 7). Idempotent: a rerun reports
 * every command as already present and never takes a seat back. The DM's way in is the operator's
 * `auth:operator dm-invite`, printed by deploy/scripts/review-campaign.sh.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ service: 'ltw-seed', level: config.logLevel });
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  logger.info({ database: describeDatabaseUrl(config.databaseUrl) }, 'seeding the review campaign');
  try {
    const summary = await seedReviewCampaign(createWorldEngine(pool));
    logger.info(summary, 'review campaign seeded');
    console.log(
      `review campaign ${summary.campaignId} («${summary.name}», ${summary.language}): ` +
        `${String(summary.accepted)} accepted, ${String(summary.duplicate)} already present; ` +
        `version ${String(summary.version)}, ${String(summary.entities)} entities; ` +
        `open seats: ${summary.openSeats.join(', ') || 'none'}`,
    );
  } catch (error) {
    if (!(error instanceof ReviewCampaignError)) throw error;
    console.error(`seed-review-campaign: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
