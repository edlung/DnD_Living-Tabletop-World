import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { seedCombatCampaign } from './ui-combat-campaigns.ts';

/**
 * Browser-test campaigns for the summons and Wild Shape (docs/adr/0056-characters-from-the-srd.md
 * §5): Elowen's wizard's book also holds Find Steed, Giant Insect, Summon Dragon and Animate
 * Objects — two campaigns outside any fight, in English and in Russian, one her turn in the road
 * ambush — and she is a 4th-level Druid in two more, her turn in the ambush and a Russian table.
 */
export const UI_SUMMON_CAMPAIGNS = {
  scene: 'ui-summons',
  sceneRu: 'ui-summons-ru',
  fight: 'ui-summons-fight',
  /** Elowen as a 4th-level Druid with Wild Shape: her turn in the ambush, and a Russian table. */
  shapeFight: 'ui-wild-shape',
  shapeRu: 'ui-wild-shape-ru',
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
  await seedCombatCampaign(engine, UI_SUMMON_CAMPAIGNS.shapeFight, 'started');
  await seedDruid(engine, UI_SUMMON_CAMPAIGNS.shapeFight);
  const seed = await loadRavenfordSeed(RAVENFORD_RU_FIXTURES_DIR);
  for (const input of seed.submissions) {
    const submission = commandSubmissionSchema.parse(input);
    const campaignId = UI_SUMMON_CAMPAIGNS.shapeRu;
    const result = await engine.execute({
      ...submission,
      campaignId,
      commandId: `${campaignId}.${submission.commandId}`,
    });
    if (result.status !== 'accepted') throw new Error(`UI Wild Shape ${campaignId} seed failed`);
  }
  await seedDruid(engine, UI_SUMMON_CAMPAIGNS.shapeRu);
}

/** Elowen as a 4th-level Druid: two uses of Wild Shape, Beast forms up to Challenge Rating 1/2. */
async function seedDruid(engine: WorldEngine, campaignId: string): Promise<void> {
  const sheet = (await engine.load(campaignId))?.state.characterSheets.get(ELOWEN);
  if (!sheet) throw new Error(`UI Wild Shape ${campaignId}: no sheet`);
  const result = await engine.execute({
    campaignId,
    commandId: `${campaignId}.druid`,
    actor: DM,
    command: {
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...sheet, classes: [{ classId: 'druid', level: 4 }] },
    },
  });
  if (result.status !== 'accepted') throw new Error(`UI Wild Shape ${campaignId}: sheet refused`);
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
