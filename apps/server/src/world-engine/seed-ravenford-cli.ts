import { formatWorldTime } from '@ltw/domain';
import pg from 'pg';

import { describeDatabaseUrl, loadConfig } from '../platform/config/config.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { loadRavenfordSeed } from './ravenford-seed.ts';
import { createWorldEngine } from './runtime.ts';

/**
 * Seeds the minimum Ravenford world through the World Engine (development
 * and CI bootstrap). Idempotent: rerunning reports every command as duplicate.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ service: 'ltw-seed', level: config.logLevel });
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  logger.info({ database: describeDatabaseUrl(config.databaseUrl) }, 'seeding Ravenford');
  try {
    const engine = createWorldEngine(pool);
    const seed = await loadRavenfordSeed();
    const counts = { accepted: 0, duplicate: 0 };
    for (const submission of seed.submissions) {
      const result = await engine.execute(submission);
      if (result.status === 'rejected') {
        throw new Error(
          `Seed command ${String(result.commandId)} rejected: ${result.code} (${result.message})`,
        );
      }
      counts[result.status] += 1;
    }
    const state = (await engine.load(seed.campaignId))?.state;
    logger.info(
      {
        campaignId: seed.campaignId,
        ...counts,
        version: state?.version,
        entities: state?.entities.size,
        worldTime: state ? formatWorldTime(state.clock) : null,
      },
      'Ravenford seeded',
    );
    console.log(
      `ravenford: ${String(counts.accepted)} accepted, ${String(counts.duplicate)} already present; ` +
        `version ${String(state?.version)}, ${String(state?.entities.size)} entities`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
