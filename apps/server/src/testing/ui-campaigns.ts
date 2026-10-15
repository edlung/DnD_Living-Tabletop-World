import { submissionsFromScript, type WorldEngine } from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';

import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import hiddenCharacter from '../../../../tests/e2e/fixtures/hidden-character.json' with { type: 'json' };
import { seededEngine } from './ravenford-app.ts';
import { seedCombatCampaign, seedUiCombatCampaigns } from './ui-combat-campaigns.ts';
import { seedUiAuthoringCampaigns } from './ui-authoring-campaigns.ts';
import { seedUiInvestigationCampaigns } from './ui-investigation-campaigns.ts';
import { seedUiLiveCampaigns } from './ui-live-campaigns.ts';
import { seedUiRussianCampaigns } from './ui-ru-campaigns.ts';

const COMBAT_CAMPAIGN = 'ui-combat';
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

/** Read-only baseline worlds plus independent Stage 210 investigation worlds. */
export async function uiCampaigns(): Promise<WorldEngine> {
  // All scripted checks get the same result, independent of parallel campaigns.
  const engine = await seededEngine(undefined, scriptedDice(Array<number>(512).fill(15)));
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
  await seedUiLiveCampaigns(engine);
  return engine;
}

async function executeSeed(engine: WorldEngine, submission: unknown): Promise<void> {
  const result = await engine.execute(submission);
  if (result.status !== 'accepted') throw new Error('UI campaign seed was not accepted');
}
