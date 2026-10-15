import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import campaigns from '../../../../tests/e2e/fixtures/live-campaigns.json' with { type: 'json' };
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { seedCombatCampaign } from './ui-combat-campaigns.ts';

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const PLAYER = { actorId: 'player-elowen', kind: 'user' } as const;

/**
 * The two-browser live session journeys (docs/adr/0033-live-session.md; `tests/e2e/live-*.spec.ts`)
 * each own a campaign cloned from the authorized Ravenford script and advanced only through
 * real commands: the encounter on Elowen's turn, the encounter on the Goblin Shaman's turn
 * (before the DM casts), Elowen at North Gate before any authoring, and an untouched Ravenford.
 */
export async function seedUiLiveCampaigns(engine: WorldEngine): Promise<void> {
  await seedCombatCampaign(engine, campaigns.turn, 'started');
  await seedCombatCampaign(engine, campaigns.counterspell, 'started');
  for (const combatantId of [
    'elowen-starwhisper',
    'goblin-raider-1',
    'goblin-raider-2',
    'goblin-raider-3',
  ]) {
    await accept(engine, campaigns.counterspell, DM, `end-${combatantId}`, {
      type: 'EndTurn',
      combatantId,
    });
  }
  const seed = await loadRavenfordSeed();
  for (const campaignId of [campaigns.authoring, campaigns.reconnect]) {
    for (const input of seed.submissions) {
      const submission = commandSubmissionSchema.parse(input);
      const result = await engine.execute({
        ...submission,
        campaignId,
        commandId: `${campaignId}.${submission.commandId}`,
      });
      if (result.status !== 'accepted') throw new Error(`UI live ${campaignId} seed failed`);
    }
  }
  await accept(engine, campaigns.authoring, PLAYER, 'to-gate', {
    type: 'EnterLocation',
    characterId: 'elowen-starwhisper',
    locationId: 'north-gate',
  });
}

async function accept(
  engine: WorldEngine,
  campaignId: string,
  actor: typeof DM | typeof PLAYER,
  name: string,
  command: Record<string, unknown>,
): Promise<void> {
  const result = await engine.execute({
    commandId: `${campaignId}.live.${name}`,
    campaignId,
    actor,
    command,
  });
  if (result.status !== 'accepted') throw new Error(`UI live ${campaignId} ${name} was refused`);
}
