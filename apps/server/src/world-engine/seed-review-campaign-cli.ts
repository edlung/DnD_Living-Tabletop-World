import pg from 'pg';

import { PostgresAssetContentStore } from '../assets/postgres-content-store.ts';
import { CuratedImportError } from '../images/curated-import.ts';
import { CuratedSetError, loadCuratedSet } from '../images/curated-set.ts';
import { describeDatabaseUrl, loadConfig } from '../platform/config/config.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { ReviewCampaignError, seedReviewCampaign } from './review-campaign.ts';
import { createWorldEngine } from './runtime.ts';

/**
 * Seeds the deployment's review campaign, the Russian Ravenford with every seat open and the
 * curated pictures approved for players (`review-campaign.ts`; deploy/RUNBOOK.md, first install
 * step 7). Idempotent: a rerun reports every command and picture as already present and never
 * takes a seat back. The pictures come from the committed set through the `curated` generator, so
 * no image provider is called; the running server's asset worker leaves these requests alone. The
 * DM's way in is the operator's `auth:operator dm-invite`, printed by
 * deploy/scripts/review-campaign.sh.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ service: 'ltw-seed', level: config.logLevel });
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  logger.info({ database: describeDatabaseUrl(config.databaseUrl) }, 'seeding the review campaign');
  try {
    const summary = await seedReviewCampaign(createWorldEngine(pool), {
      pictures: {
        contents: new PostgresAssetContentStore(pool),
        set: await loadCuratedSet(),
        logger,
      },
    });
    logger.info(summary, 'review campaign seeded');
    const pictures = summary.pictures;
    console.log(
      `review campaign ${summary.campaignId} («${summary.name}», ${summary.language}): ` +
        `${String(summary.accepted)} accepted, ${String(summary.duplicate)} already present; ` +
        `curated pictures: ${String(pictures?.imported ?? 0)} imported, ` +
        `${String(pictures?.present ?? 0)} already present, ${String(pictures?.skipped ?? 0)} skipped; ` +
        `version ${String(summary.version)}, ${String(summary.entities)} entities; ` +
        `open seats: ${summary.openSeats.join(', ') || 'none'}`,
    );
  } catch (error) {
    if (
      !(error instanceof ReviewCampaignError) &&
      !(error instanceof CuratedImportError) &&
      !(error instanceof CuratedSetError)
    ) {
      throw error;
    }
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
