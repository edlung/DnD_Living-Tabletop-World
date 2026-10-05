import { commandSubmissionSchema, submissionsFromScript, type WorldEngine } from '@ltw/domain';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import campaigns from '../../../../tests/e2e/fixtures/combat-campaigns.json' with { type: 'json' };
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

/** How far the scripted Old Trade Road ambush is played before the browser takes over. */
export type CombatStage = 'placed' | 'started' | 'window';

/**
 * Every mutating combat journey owns a campaign cloned from the authorized
 * Ravenford script and advanced only through real DM commands (initiative is
 * Elowen, three Raiders, then the Shaman, as in reaction-routes.test.ts).
 * `window` pauses at a genuine open Counterspell window.
 */
export async function seedCombatCampaign(
  engine: WorldEngine,
  campaignId: string,
  stage: CombatStage,
): Promise<void> {
  for (const input of (await loadRavenfordSeed()).submissions) {
    const submission = commandSubmissionSchema.parse(input);
    await accept(engine, {
      ...submission,
      campaignId,
      commandId: `${campaignId}.${submission.commandId}`,
    });
  }
  const script = [
    ...ambush.place,
    ...(stage === 'placed' ? [] : [ambush.startCombat]),
    ...(stage === 'window'
      ? [
          ...['elowen-starwhisper', 'goblin-raider-1', 'goblin-raider-2', 'goblin-raider-3'].map(
            (combatantId) => ({ type: 'EndTurn', combatantId }),
          ),
          {
            type: 'CastSpell',
            combatantId: 'goblin-shaman',
            spellId: 'ashen-bolt',
            targetId: 'elowen-starwhisper',
          },
        ]
      : []),
  ];
  for (const submission of submissionsFromScript({
    campaignId,
    actor: DM,
    commandIdPrefix: `${campaignId}.ambush`,
    commands: script,
  })) {
    await accept(engine, submission);
  }
}

const STAGES: Readonly<Record<keyof typeof campaigns, CombatStage>> = {
  turn: 'started',
  area: 'started',
  preview: 'started',
  counter: 'window',
  ignore: 'window',
  expire: 'window',
  stale: 'window',
  lifecycle: 'placed',
};

export async function seedUiCombatCampaigns(engine: WorldEngine): Promise<void> {
  for (const [name, campaignId] of Object.entries(campaigns)) {
    await seedCombatCampaign(engine, campaignId, STAGES[name as keyof typeof campaigns]);
  }
}

async function accept(engine: WorldEngine, submission: unknown): Promise<void> {
  const result = await engine.execute(submission);
  if (result.status !== 'accepted') throw new Error('UI combat campaign seed was not accepted');
}
