import { createPlaceholderImageGenerator } from '@ltw/ai';
import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import campaigns from '../../../../tests/e2e/fixtures/image-campaigns.json' with { type: 'json' };
import entities from '../../../../tests/e2e/fixtures/image-entities.json' with { type: 'json' };
import type { AssetContentStore } from '../assets/content-store.ts';
import { ASSET_WORKER, AssetWorker } from '../assets/worker.ts';
import { startAssetWorkerLoop } from '../assets/worker-loop.ts';
import { importCuratedSet } from '../images/curated-import.ts';
import { isOwnRequest } from '../images/own-requests.ts';
import { UI_PARTY_CAMPAIGNS } from './ui-party-campaigns.ts';
import {
  createCuratedImageGenerator,
  loadCuratedSet,
  type CuratedSet,
} from '../images/curated-set.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { EN_SCRIPT } from './scenario/script.ts';
import { RU_SCRIPT } from './scenario/script-ru.ts';
import { seedCombatCampaign } from './ui-combat-campaigns.ts';

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const silent = createLogger({ service: 'ui-image-journeys', level: 'silent' });

/**
 * The browser journeys of Stage 330 part B (docs/STAGE_330_DESIGN.md "DM controls"; the campaigns
 * of `tests/e2e/fixtures/image-campaigns.json`), each in English and Russian, every step a real
 * command:
 *
 * - `site`: the curated set, and Elowen standing at the Abandoned Caravan Site among the
 *   investigation objects;
 * - `battle`: the curated set and the Old Trade Road ambush on Elowen's turn;
 * - `tomas` (and `retry`, for a second journey): the curated set, Tomas Reed (no picture yet) at
 *   Market Square beside Elowen, and a request the curated generator could not answer (failed,
 *   `UNAVAILABLE`). The test server's asset worker answers the DM's requests here with the
 *   placeholder generator;
 * - `review`: the curated set with two pictures made but not yet approved (candidates), one
 *   request waiting for the image generator, one being generated and one failed. No worker runs
 *   here, so these states stay as seeded;
 * - the review fixes' journeys (`tests/e2e/images-commands.spec.ts`): `supersede` as `tomas`, with
 *   the worker; `pending`, `double` and `panel` as `review`; `keyboard` as `review` without the
 *   request waiting for the generator, so Captain Thorne leaves the Images sheet once his
 *   candidate is decided.
 */
export const UI_IMAGE_WORKER_CAMPAIGNS: readonly string[] = [
  campaigns.tomas,
  campaigns.tomasRu,
  campaigns.retry,
  campaigns.supersede,
  // The worker runs beside the DM's upload and must leave its request alone (Stage 670b).
  UI_PARTY_CAMPAIGNS.battleMap,
];

/** Curated pictures the review campaigns hold as candidates: made, never approved. */
const HELD = ['captain-thorne--figure.webp', 'north-gate--night.webp'];

type Command = Readonly<Record<string, unknown>> & { readonly type: string };

async function dm(
  engine: WorldEngine,
  campaignId: string,
  name: string,
  command: Command,
): Promise<string> {
  const commandId = `${campaignId}.img.${name}`;
  const result = await engine.execute({ commandId, campaignId, actor: DM, command });
  if (result.status !== 'accepted') {
    throw new Error(
      `UI image journey ${campaignId} ${command.type}: ${result.status === 'rejected' ? result.code : result.status}`,
    );
  }
  return commandId;
}

async function seedRavenford(engine: WorldEngine, campaignId: string, ru: boolean): Promise<void> {
  const seed = await loadRavenfordSeed(ru ? RAVENFORD_RU_FIXTURES_DIR : undefined);
  for (const input of seed.submissions) {
    const submission = commandSubmissionSchema.parse(input);
    const result = await engine.execute({
      ...submission,
      campaignId,
      commandId: `${campaignId}.${submission.commandId}`,
    });
    if (result.status !== 'accepted') throw new Error(`UI image journey ${campaignId} seed failed`);
  }
}

/** A DM request for a derived image of a place or person; its request ID. */
const requestVariant = async (
  engine: WorldEngine,
  campaignId: string,
  entityId: string,
  label: string,
) =>
  `${await dm(engine, campaignId, `${entityId}.${label}`, {
    type: 'RequestAsset',
    entityId,
    variant: 'derived',
    label,
    audience: 'players',
  })}#0`;

/** Runs requests with the curated generator: the committed picture, or `UNAVAILABLE`. */
const curatedRun = (
  engine: WorldEngine,
  contents: AssetContentStore,
  set: CuratedSet,
  campaignId: string,
  requestIds: readonly string[],
) =>
  new AssetWorker({
    engine,
    contents,
    generator: createCuratedImageGenerator(set),
    timeoutMs: 30_000,
    logger: silent,
  }).runOnce(campaignId, new Set(requestIds));

async function seedReview(
  engine: WorldEngine,
  contents: AssetContentStore,
  set: CuratedSet,
  campaignId: string,
  /** Whether Captain Thorne also has a request waiting for the image generator. */
  waiting = true,
): Promise<void> {
  const made: string[] = [];
  for (const entry of set.entries.filter((candidate) => HELD.includes(candidate.file))) {
    for (const entityId of entry.entityIds) {
      const commandId = await dm(engine, campaignId, `review.${entry.file}.${entityId}`, {
        type: 'RequestAsset',
        entityId,
        variant: entry.variant,
        ...(entry.label === null ? {} : { label: entry.label }),
        ...(entry.purpose === 'image' ? {} : { purpose: entry.purpose }),
        audience: 'players',
      });
      made.push(`${commandId}#0`);
    }
  }
  // The set holds no snowy North Gate: that request fails as UNAVAILABLE, as without a budget.
  const snow = await requestVariant(engine, campaignId, 'north-gate', 'snow');
  await curatedRun(engine, contents, set, campaignId, [...made, snow]);
  if (waiting) await requestVariant(engine, campaignId, 'captain-thorne', 'wounded');
  const storm = await requestVariant(engine, campaignId, 'north-gate', 'storm');
  const started = await engine.execute({
    commandId: `${campaignId}.img.start-storm`,
    campaignId,
    actor: ASSET_WORKER,
    command: { type: 'StartAssetJob', requestId: storm },
  });
  if (started.status !== 'accepted') throw new Error(`UI image review ${campaignId}: no job`);
}

export async function seedUiImageJourneys(
  engine: WorldEngine,
  contents: AssetContentStore,
): Promise<void> {
  const set = await loadCuratedSet();
  const importInto = (campaignId: string, from: CuratedSet = set) =>
    importCuratedSet({ engine, contents, set: from, logger: silent }, campaignId, DM);
  const languages = [
    { ru: false, site: campaigns.site, battle: campaigns.battle },
    { ru: true, site: campaigns.siteRu, battle: campaigns.battleRu },
  ];
  for (const { ru, site, battle } of languages) {
    await seedRavenford(engine, site, ru);
    await dm(engine, site, 'site', {
      type: 'PlaceEntity',
      entityId: 'elowen-starwhisper',
      locationId: 'location-f3b82c8b',
    });
    await importInto(site);
    await seedCombatCampaign(engine, battle, 'started', ru ? RAVENFORD_RU_FIXTURES_DIR : undefined);
    await importInto(battle);
  }
  for (const [campaignId, ru] of [
    [campaigns.tomas, false],
    [campaigns.tomasRu, true],
    [campaigns.retry, false],
    [campaigns.supersede, false],
  ] as const) {
    await seedRavenford(engine, campaignId, ru);
    await dm(engine, campaignId, 'tomas', {
      type: 'CreateEntity',
      // Players meet him unnamed: an opaque ID (ADR 0008, Gate 06 remediation).
      entityId: entities.tomas,
      kind: 'npc',
      name: ru ? 'Томас Рид' : 'Tomas Reed',
      description: (ru ? RU_SCRIPT : EN_SCRIPT).tomasEdited,
      existsSince: null,
      placement: { locationId: 'market-square', since: null },
    });
    await importInto(campaignId);
    await curatedRun(engine, contents, set, campaignId, [
      await requestVariant(engine, campaignId, 'north-gate', 'snow'),
    ]);
  }
  const reviews = [
    campaigns.review,
    campaigns.reviewRu,
    campaigns.pending,
    campaigns.double,
    campaigns.panel,
    campaigns.keyboard,
  ];
  for (const campaignId of reviews) {
    await seedRavenford(engine, campaignId, campaignId === campaigns.reviewRu);
    await importInto(campaignId, {
      ...set,
      entries: set.entries.filter((entry) => !HELD.includes(entry.file)),
    });
    await seedReview(engine, contents, set, campaignId, campaignId !== campaigns.keyboard);
  }
}

/**
 * The test server's asset worker (ADR 0022 §4): the local placeholder generator, only for the
 * campaigns whose journeys request pictures. Every other campaign keeps what it was seeded with.
 * Returns a stop function.
 */
export function startUiImageWorker(
  engine: WorldEngine,
  contents: AssetContentStore,
): () => Promise<void> {
  return startAssetWorkerLoop({
    engine,
    contents,
    generator: createPlaceholderImageGenerator(),
    timeoutMs: 10_000,
    intervalMs: 300,
    campaigns: () => Promise.resolve(UI_IMAGE_WORKER_CAMPAIGNS),
    skip: isOwnRequest,
    logger: silent,
  });
}
