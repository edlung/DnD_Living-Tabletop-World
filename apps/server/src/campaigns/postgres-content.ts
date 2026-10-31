import { bootstrapCampaignAssetSchema, questBookSchema } from '@ltw/contracts';
import type pg from 'pg';
import { z } from 'zod';

import { imageDigest } from '../workshop/images/manifest.ts';
import {
  activationInitialContent,
  activationRevisionSchema,
} from '../workshop/activation/content.ts';
import { initialQuestDigest, initialScenarioDigest } from '../workshop/activation/digests.ts';
import { activationTransaction, loadActivation } from '../workshop/activation/postgres-common.ts';
import type { StoredCampaignActivation } from '../workshop/activation/store.ts';
import type { CampaignInitialContent, CampaignInitialContentStore } from './content.ts';

interface ContentRow {
  campaign_id: string;
  activation_id: string;
  scenario: unknown;
  quests: unknown;
  assets: unknown;
  scenario_digest: string;
  quest_digest: string;
  manifest_digest: string;
  plan_digest: string;
  content_digest: string;
}
export function initialContentView(row: ContentRow): CampaignInitialContent {
  const value = {
    campaignId: row.campaign_id,
    activationId: row.activation_id,
    scenario: activationRevisionSchema.parse(row.scenario),
    quests: questBookSchema.shape.quests.parse(row.quests),
    assets: z.array(bootstrapCampaignAssetSchema).max(1000).parse(row.assets),
    scenarioDigest: row.scenario_digest,
    questDigest: row.quest_digest,
    manifestDigest: row.manifest_digest,
    planDigest: row.plan_digest,
  };
  if (
    imageDigest(value) !== row.content_digest ||
    initialScenarioDigest(value.scenario) !== value.scenarioDigest ||
    initialQuestDigest(value.quests) !== value.questDigest
  )
    throw new Error('CORRUPT_INITIAL_CONTENT');
  return value;
}
export async function readInitialContent(client: pg.PoolClient, campaignId: string) {
  const row = (
    await client.query<ContentRow>(
      'SELECT * FROM ltw_campaign_initial_content WHERE campaign_id=$1',
      [campaignId],
    )
  ).rows[0];
  return row ? initialContentView(row) : null;
}
export class PostgresCampaignInitialContentStore implements CampaignInitialContentStore {
  readonly #pool: pg.Pool;
  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }
  prepare(activation: StoredCampaignActivation): Promise<void> {
    return activationTransaction(this.#pool, async (client) => {
      const actual = await loadActivation(client, activation);
      if (
        !actual ||
        actual.activationId !== activation.activationId ||
        actual.campaignId !== activation.campaignId ||
        imageDigest(actual.frozen) !== imageDigest(activation.frozen)
      )
        throw new Error('ACTIVATION_CONTENT_MISMATCH');
      const content = activationInitialContent(actual),
        digest = imageDigest(content);
      await client.query(
        `INSERT INTO ltw_campaign_initial_content
        (campaign_id,activation_id,scenario,quests,assets,scenario_digest,quest_digest,manifest_digest,plan_digest,content_digest)
        VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10) ON CONFLICT(campaign_id) DO NOTHING`,
        [
          content.campaignId,
          content.activationId,
          JSON.stringify(content.scenario),
          JSON.stringify(content.quests),
          JSON.stringify(content.assets),
          content.scenarioDigest,
          content.questDigest,
          content.manifestDigest,
          content.planDigest,
          digest,
        ],
      );
      const stored = await readInitialContent(client, content.campaignId);
      if (!stored || imageDigest(stored) !== digest) throw new Error('INITIAL_CONTENT_CONFLICT');
    });
  }
  get(campaignId: string) {
    return activationTransaction(this.#pool, (client) => readInitialContent(client, campaignId));
  }
}
