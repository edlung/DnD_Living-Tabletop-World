import { PostgresAssetContentStore } from '../../apps/server/src/assets/postgres-content-store.ts';
import { PostgresCampaignInitialContentStore } from '../../apps/server/src/campaigns/postgres-content.ts';
import { initialScenarioDigest } from '../../apps/server/src/workshop/activation/digests.ts';
import { importCuratedSet } from '../../apps/server/src/images/curated-import.ts';
import { createPool } from '../../apps/server/src/platform/db/pool.ts';
import { createLogger } from '../../apps/server/src/platform/logging/logger.ts';
import { createWorldEngine } from '../../apps/server/src/world-engine/runtime.ts';
import { acornArt } from './curated-art.ts';

const args = process.argv.slice(2);
if (
  args.length < 2 ||
  args[0] !== '--campaign' ||
  args.some((v, i) => i > 1 && v !== '--confirm')
) {
  process.stdout.write(
    'Usage: DATABASE_URL=<configured database> node --conditions=@ltw/source scripts/acorn-express/import-art.ts --campaign <id> [--confirm]\nWithout --confirm: read-only verification. After normal owner activation only. No environment file is read.',
  );
  process.exitCode = args.includes('--help') ? 0 : 1;
} else {
  const campaignId = args[1];
  const connection = process.env['DATABASE_URL'];
  if (!connection || !campaignId)
    throw new Error('Set DATABASE_URL explicitly and pass the published campaign ID.');
  const logger = createLogger({ service: 'acorn-express-curated-import', level: 'warn' });
  const pool = createPool(connection, logger);
  try {
    const engine = createWorldEngine(pool),
      initial = await new PostgresCampaignInitialContentStore(pool).get(campaignId);
    const snapshot = await engine.load(campaignId);
    if (
      !initial ||
      !snapshot?.state.campaign ||
      !snapshot.state.bootstrap ||
      initialScenarioDigest(initial.scenario) !== snapshot.state.bootstrap.source.scenarioDigest
    )
      throw new Error('Published campaign and frozen source do not match.');
    const set = await acornArt(initial.scenario);
    if (!args.includes('--confirm'))
      process.stdout.write(
        JSON.stringify({
          mode: 'read-only',
          pictures: set.entries.length,
          bindings: set.entries.reduce((n, e) => n + e.entityIds.length, 0),
          campaign: snapshot.state.campaign.name,
        }),
      );
    else
      process.stdout.write(
        JSON.stringify(
          await importCuratedSet(
            {
              engine,
              contents: new PostgresAssetContentStore(pool),
              set,
              logger,
              reason:
                'Экспресс «Тысяча Желудей»: original built-in imagegen art, campaigns/acorn-express/assets/manifest.json',
            },
            campaignId,
            { kind: 'user', actorId: snapshot.state.campaign.dmActorId },
          ),
        ),
      );
  } finally {
    await pool.end();
  }
}
