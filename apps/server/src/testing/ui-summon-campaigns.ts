import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { seedCombatCampaign } from './ui-combat-campaigns.ts';

/**
 * Browser-test campaigns for the summons (docs/adr/0056-characters-from-the-srd.md §5): Elowen's
 * wizard's book also holds Find Steed, Giant Insect, Summon Dragon and Animate Objects. Two are
 * outside any fight, in English and in Russian; one is her turn in the road ambush.
 */
export const UI_SUMMON_CAMPAIGNS = {
  scene: 'ui-summons',
  sceneRu: 'ui-summons-ru',
  fight: 'ui-summons-fight',
} as const;

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const ELOWEN = 'elowen-starwhisper';
const SUMMONS = ['find-steed', 'giant-insect', 'summon-dragon', 'animate-objects'];

export async function seedUiSummonCampaigns(engine: WorldEngine): Promise<void> {
  for (const [campaignId, language] of [
    [UI_SUMMON_CAMPAIGNS.scene, 'en'],
    [UI_SUMMON_CAMPAIGNS.sceneRu, 'ru'],
  ] as const) {
    const seed = await loadRavenfordSeed(language === 'ru' ? RAVENFORD_RU_FIXTURES_DIR : undefined);
    for (const input of seed.submissions) {
      const submission = commandSubmissionSchema.parse(input);
      const result = await engine.execute({
        ...submission,
        campaignId,
        commandId: `${campaignId}.${submission.commandId}`,
      });
      if (result.status !== 'accepted') throw new Error(`UI summons ${campaignId} seed failed`);
    }
    await seedSummoner(engine, campaignId);
  }
  await seedCombatCampaign(engine, UI_SUMMON_CAMPAIGNS.fight, 'started');
  await seedSummoner(engine, UI_SUMMON_CAMPAIGNS.fight);
}

async function seedSummoner(engine: WorldEngine, campaignId: string): Promise<void> {
  const sheet = (await engine.load(campaignId))?.state.characterSheets.get(ELOWEN);
  if (!sheet) throw new Error(`UI summons ${campaignId}: no sheet`);
  const result = await engine.execute({
    campaignId,
    commandId: `${campaignId}.summoner`,
    actor: DM,
    command: {
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: {
        ...sheet,
        spellcasting: sheet.spellcasting.map((source) =>
          source.source === 'wizard'
            ? { ...source, spells: [...source.spells, ...SUMMONS] }
            : source,
        ),
      },
    },
  });
  if (result.status !== 'accepted') throw new Error(`UI summons ${campaignId}: sheet refused`);
}
