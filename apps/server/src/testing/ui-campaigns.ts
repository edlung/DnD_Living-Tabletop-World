import { commandSubmissionSchema, submissionsFromScript, type WorldEngine } from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import hiddenCharacter from '../../../../tests/e2e/fixtures/hidden-character.json' with { type: 'json' };
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { seededEngine } from './ravenford-app.ts';
import { seedUiInvestigationCampaigns } from './ui-investigation-campaigns.ts';

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

  // Clone the authorized fixture script into an isolated campaign through the
  // engine. Identity, membership, rules, and all projections remain real.
  for (const input of (await loadRavenfordSeed()).submissions) {
    const submission = commandSubmissionSchema.parse(input);
    await executeSeed(engine, {
      ...submission,
      campaignId: COMBAT_CAMPAIGN,
      commandId: `ui-combat.${submission.commandId}`,
    });
  }
  // Same deterministic setup as reaction-routes.test.ts: initiative is Elowen,
  // three Raiders, then the Shaman. Pause at a genuine open Counterspell window.
  for (const submission of submissionsFromScript({
    campaignId: COMBAT_CAMPAIGN,
    actor: DM,
    commandIdPrefix: 'ui-combat.open-window',
    commands: [
      ...ambush.place,
      ambush.startCombat,
      ...['elowen-starwhisper', 'goblin-raider-1', 'goblin-raider-2', 'goblin-raider-3'].map(
        (combatantId) => ({ type: 'EndTurn', combatantId }),
      ),
      {
        type: 'CastSpell',
        combatantId: 'goblin-shaman',
        spellId: 'ashen-bolt',
        targetId: 'elowen-starwhisper',
      },
    ],
  })) {
    await executeSeed(engine, submission);
  }
  await seedUiInvestigationCampaigns(engine);
  return engine;
}

async function executeSeed(engine: WorldEngine, submission: unknown): Promise<void> {
  const result = await engine.execute(submission);
  if (result.status !== 'accepted') throw new Error('UI campaign seed was not accepted');
}
