import { submissionsFromScript, type EventStore, type WorldEngine } from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';

import type { AssetContentStore } from '../assets/content-store.ts';
import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import hiddenCharacter from '../../../../tests/e2e/fixtures/hidden-character.json' with { type: 'json' };
import { seededEngine } from './ravenford-app.ts';
import { seedCombatCampaign, seedUiCombatCampaigns } from './ui-combat-campaigns.ts';
import { seedUiAuthoringCampaigns } from './ui-authoring-campaigns.ts';
import { seedUiCuratedImages } from './ui-image-campaigns.ts';
import { seedUiImageJourneys } from './ui-image-journeys.ts';
import { seedUiInvestigationCampaigns } from './ui-investigation-campaigns.ts';
import { seedUiLiveCampaigns } from './ui-live-campaigns.ts';
import { seedUiDiceCampaigns } from './ui-dice-campaigns.ts';
import { seedUiAToZCampaign } from './ui-a-to-z-campaigns.ts';
import { seedUiPartyCampaigns } from './ui-party-campaigns.ts';
import { seedUiRestCampaigns } from './ui-rest-campaigns.ts';
import { seedUiItemCampaigns } from './ui-item-campaigns.ts';
import { seedUiRulesCampaigns } from './ui-rules-campaigns.ts';
import { seedUiRussianCampaigns } from './ui-ru-campaigns.ts';
import { seedUiSummonCampaigns } from './ui-summon-campaigns.ts';

const COMBAT_CAMPAIGN = 'ui-combat';
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

/**
 * Read-only baseline worlds plus independent Stage 210 investigation worlds; the campaigns of
 * `ui-image-campaigns.ts` get the curated pictures, their bytes in `contents`, and the image
 * journeys of Stage 330 part B their own campaigns (`ui-image-journeys.ts`).
 */
export async function uiCampaigns(
  contents: AssetContentStore,
  /** Where the campaigns are stored; the fixture-integrity test passes one it can enumerate. */
  store?: EventStore,
): Promise<WorldEngine> {
  // All scripted checks get the same result, independent of parallel campaigns.
  const engine = await seededEngine(store, scriptedDice(Array<number>(512).fill(15)));
  const referenceSheet = rulesSeed.commands.find((command) => command.type === 'SetCharacterSheet');
  if (!referenceSheet) throw new Error('UI character sheet seed is missing');
  for (const submission of submissionsFromScript({
    campaignId: 'ravenford',
    actor: DM,
    commandIdPrefix: 'ui.hidden-character',
    commands: [hiddenCharacter, { ...referenceSheet, entityId: 'mira-vale' }],
  })) {
    await executeSeed(engine, submission);
  }

  // The read-only baseline: a genuine open Counterspell window.
  await seedCombatCampaign(engine, COMBAT_CAMPAIGN, 'window');
  await seedUiCombatCampaigns(engine);
  await seedUiInvestigationCampaigns(engine);
  await seedUiAuthoringCampaigns(engine);
  await seedUiRussianCampaigns(engine);
  await seedUiItemCampaigns(engine);
  await seedUiSummonCampaigns(engine);
  await seedUiRulesCampaigns(engine);
  await seedUiDiceCampaigns(engine);
  await seedUiRestCampaigns(engine);
  await seedUiPartyCampaigns(engine);
  await seedUiAToZCampaign(engine);
  await seedUiLiveCampaigns(engine);
  await seedUiCuratedImages(engine, contents);
  await seedUiImageJourneys(engine, contents);
  return engine;
}

async function executeSeed(engine: WorldEngine, submission: unknown): Promise<void> {
  const result = await engine.execute(submission);
  if (result.status !== 'accepted') throw new Error('UI campaign seed was not accepted');
}
