import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import campaigns from '../../../../tests/e2e/fixtures/live-campaigns.json' with { type: 'json' };
import { loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { seedCombatCampaign } from './ui-combat-campaigns.ts';

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const PLAYER = { actorId: 'player-elowen', kind: 'user' } as const;

/**
 * The two-browser live session journeys (docs/adr/0033-live-session.md; `tests/e2e/live-*.spec.ts`,
 * `dm-history.spec.ts`) each own a campaign cloned from the authorized Ravenford script and
 * advanced only through real commands: the encounter on Elowen's turn (the turn hand-off, the
 * DM skipping her turn, the DM acting as her), the encounter on the Goblin Shaman's turn
 * (before the DM casts: the Counterspell window, and the same window reaching a player who
 * looks at the scene or reads the Chronicle), Elowen at North Gate before any authoring, and
 * untouched Ravenfords (reconnect, the DM history).
 */
export async function seedUiLiveCampaigns(engine: WorldEngine): Promise<void> {
  for (const campaignId of [campaigns.turn, campaigns.skip, campaigns.actAs]) {
    await seedCombatCampaign(engine, campaignId, 'started');
  }
  for (const campaignId of [campaigns.counterspell, campaigns.sceneWindow, campaigns.bookWindow]) {
    await seedCombatCampaign(engine, campaignId, 'started');
    for (const combatantId of [
      'elowen-starwhisper',
      'creature-10fb59d4',
      'creature-589f6668',
      'creature-6513bec0',
    ]) {
      await accept(engine, campaignId, DM, `end-${combatantId}`, {
        type: 'EndTurn',
        combatantId,
      });
    }
  }
  const seed = await loadRavenfordSeed();
  for (const campaignId of [
    campaigns.authoring,
    campaigns.reconnect,
    campaigns.history,
    campaigns.historyView,
    campaigns.historyPages,
  ]) {
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
  await seedTwoPlayerAmbush(engine, campaigns.skipWindow);
}

/**
 * The ambush with a second player's character, Seren Ashgrove (Elowen's sheet, so she knows
 * Counterspell; her player never connects): Elowen's own spell can make the encounter wait on
 * Seren, so the DM's End turn for Elowen meets an open reaction window.
 */
async function seedTwoPlayerAmbush(engine: WorldEngine, campaignId: string): Promise<void> {
  await seedCombatCampaign(engine, campaignId, 'placed');
  const sheet = rulesSeed.commands.find(
    (command) => command.type === 'SetCharacterSheet' && command.entityId === 'elowen-starwhisper',
  );
  if (!sheet) throw new Error('UI live: Elowen has no sheet in the rules seed');
  const steps: [string, Record<string, unknown>][] = [
    [
      'seren',
      {
        type: 'CreateEntity',
        entityId: 'seren-ashgrove',
        kind: 'character',
        name: 'Seren Ashgrove',
        existsSince: null,
        placement: { locationId: 'old-trade-road', since: null },
      },
    ],
    ['seren-sheet', { ...sheet, entityId: 'seren-ashgrove' }],
    [
      'seren-player',
      { type: 'AssignCharacter', characterId: 'seren-ashgrove', playerActorId: 'player-seren' },
    ],
    [
      'start',
      {
        ...ambush.startCombat,
        combatants: [
          ...ambush.startCombat.combatants,
          { entityId: 'seren-ashgrove', side: 'party', position: { x: 2, y: 8 } },
        ],
      },
    ],
  ];
  for (const [name, command] of steps) await accept(engine, campaignId, DM, name, command);
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
