import { formatWorldTime } from '@ltw/domain';
import pg from 'pg';

import { importCuratedSet } from '../images/curated-import.ts';
import { loadCuratedSet } from '../images/curated-set.ts';
import { PostgresAssetContentStore } from '../assets/postgres-content-store.ts';
import { describeDatabaseUrl, loadConfig } from '../platform/config/config.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { loadRavenfordSeed, seedRefusal } from './ravenford-seed.ts';
import { createWorldEngine } from './runtime.ts';

/**
 * Seeds the minimum Ravenford world through the World Engine (development
 * and CI bootstrap), then imports the curated Ravenford pictures into it
 * through real commands, approved by the DM for players (docs/adr/0035-images.md §3).
 * Idempotent: rerunning reports every command as duplicate. Run it while the
 * server is stopped, so that no other asset worker runs the curated jobs.
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
        const commandId = String(result.commandId);
        throw new Error(await seedRefusal(engine, seed.campaignId, 'en', commandId, result));
      }
      counts[result.status] += 1;
    }
    const curated = await importCuratedSet(
      {
        engine,
        contents: new PostgresAssetContentStore(pool),
        set: await loadCuratedSet(),
        logger,
      },
      seed.campaignId,
      seed.dm,
    );
    const state = (await engine.load(seed.campaignId))?.state;
    logger.info(
      {
        campaignId: seed.campaignId,
        ...counts,
        version: state?.version,
        entities: state?.entities.size,
        worldTime: state ? formatWorldTime(state.clock) : null,
        curated,
      },
      'Ravenford seeded',
    );
    console.log(
      `ravenford: ${String(counts.accepted)} accepted, ${String(counts.duplicate)} already present; ` +
        `curated pictures: ${String(curated.imported)} imported, ${String(curated.present)} already present; ` +
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
