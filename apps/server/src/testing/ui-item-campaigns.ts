import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';
import { seedCombatCampaign } from './ui-combat-campaigns.ts';

/**
 * Browser-test campaigns for item possession (docs/adr/0039-item-possession.md); each journey
 * owns one, seeded through real commands. Item IDs are opaque: players meet them unnamed (Gate 06). Elowen carries a brigandine, a buckler, a cloak and two
 * balms and is wounded; a lantern lies on the ground where she stands.
 */
export const UI_ITEM_CAMPAIGNS = {
  play: 'ui-items-play',
  take: 'ui-items-take',
  ru: 'ui-items-ru',
  /** Read-only: only looked at, at three widths. */
  axe: 'ui-items-axe',
  /** Elowen's turn in the road ambush, wounded, with the seeded gear (Stage 490). */
  fight: 'ui-items-fight',
  /** Part of a stack is handed over (Stage 490). */
  split: 'ui-items-split',
  /** The DM gives items from the catalog (docs/adr/0054-items-as-data.md §4). */
  catalog: 'ui-items-catalog',
  /** The same in Russian: the SRD's names and words, and an item's look (ADR 0055 §5–6). */
  catalogRu: 'ui-items-catalog-ru',
  /** A player makes a character of their own (docs/adr/0056-…md §2). */
  builder: 'ui-builder-player',
  /** The DM grants a level and a player takes it (docs/adr/0056-…md §3). */
  levels: 'ui-builder-levels',
  /** The class features in play, in English and in Russian (docs/adr/0056-…md §4). */
  features: 'ui-class-features',
  featuresRu: 'ui-class-features-ru',
  /** A player attunes in a Short Rest (docs/adr/0054-items-as-data.md §5). */
  attune: 'ui-items-attune',
  /** Charges, dawn, and a potion known by a taste (§5). */
  charges: 'ui-items-charges',
  /**
   * The DM's campaign options (docs/adr/0056-…md §3), in English and in Russian: Elowen also
   * carries four mail shirts, more than her Strength carries.
   */
  options: 'ui-campaign-options',
  optionsRu: 'ui-campaign-options-ru',
  /** The spells that return the dead (docs/adr/0056-…md §5): Elowen also knows them. */
  raising: 'ui-raising',
  raisingRu: 'ui-raising-ru',
} as const;

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const ELOWEN = 'elowen-starwhisper';

const NAMES = {
  en: {
    brigandine: 'Ravenford brigandine',
    buckler: 'Oak buckler',
    cloak: 'Grey road cloak',
    balm: 'Spare balm',
    lantern: 'Dented lantern',
    blade: 'Practice blade',
    crowns: 'Purse of crowns',
    mail: 'Spare mail shirt',
  },
  ru: {
    brigandine: 'Равенфордский бригандин',
    buckler: 'Дубовый баклер',
    cloak: 'Серый дорожный плащ',
    balm: 'Запасной бальзам',
    lantern: 'Помятый фонарь',
    blade: 'Учебный клинок',
    crowns: 'Кошель крон',
    mail: 'Запасная кольчуга',
  },
} as const;

export async function seedUiItemCampaigns(engine: WorldEngine): Promise<void> {
  await seedCombatCampaign(engine, UI_ITEM_CAMPAIGNS.fight, 'started');
  const fight = (await engine.load(UI_ITEM_CAMPAIGNS.fight))?.state.characterSheets.get(ELOWEN);
  if (!fight) throw new Error('UI items fight: no sheet');
  const wounded = await engine.execute({
    campaignId: UI_ITEM_CAMPAIGNS.fight,
    commandId: `${UI_ITEM_CAMPAIGNS.fight}.items.wounded`,
    actor: DM,
    command: {
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...fight, hitPoints: { ...fight.hitPoints, current: fight.hitPoints.max - 30 } },
    },
  });
  if (wounded.status !== 'accepted') throw new Error('UI items fight: wounding failed');
  for (const [campaignId, language] of [
    [UI_ITEM_CAMPAIGNS.play, 'en'],
    [UI_ITEM_CAMPAIGNS.take, 'en'],
    [UI_ITEM_CAMPAIGNS.ru, 'ru'],
    [UI_ITEM_CAMPAIGNS.axe, 'en'],
    [UI_ITEM_CAMPAIGNS.split, 'en'],
    [UI_ITEM_CAMPAIGNS.catalog, 'en'],
    [UI_ITEM_CAMPAIGNS.catalogRu, 'ru'],
    [UI_ITEM_CAMPAIGNS.builder, 'en'],
    [UI_ITEM_CAMPAIGNS.levels, 'en'],
    [UI_ITEM_CAMPAIGNS.features, 'en'],
    [UI_ITEM_CAMPAIGNS.featuresRu, 'ru'],
    [UI_ITEM_CAMPAIGNS.attune, 'en'],
    [UI_ITEM_CAMPAIGNS.charges, 'en'],
    [UI_ITEM_CAMPAIGNS.options, 'en'],
    [UI_ITEM_CAMPAIGNS.optionsRu, 'ru'],
    [UI_ITEM_CAMPAIGNS.raising, 'en'],
    [UI_ITEM_CAMPAIGNS.raisingRu, 'ru'],
  ] as const) {
    const seed = await loadRavenfordSeed(language === 'ru' ? RAVENFORD_RU_FIXTURES_DIR : undefined);
    for (const input of seed.submissions) {
      const submission = commandSubmissionSchema.parse(input);
      const result = await engine.execute({
        ...submission,
        campaignId,
        commandId: `${campaignId}.${submission.commandId}`,
      });
      if (result.status !== 'accepted') throw new Error(`UI items ${campaignId} seed failed`);
    }
    await seedItems(engine, campaignId, NAMES[language], campaignId !== UI_ITEM_CAMPAIGNS.take);
    if (campaignId === UI_ITEM_CAMPAIGNS.options || campaignId === UI_ITEM_CAMPAIGNS.optionsRu)
      await seedLoad(engine, campaignId, NAMES[language].mail);
    if (campaignId === UI_ITEM_CAMPAIGNS.raising || campaignId === UI_ITEM_CAMPAIGNS.raisingRu)
      await seedRaiser(engine, campaignId);
  }
}

/** Elowen also knows the spells that return the dead, with a cleric's Wisdom behind them. */
async function seedRaiser(engine: WorldEngine, campaignId: string): Promise<void> {
  const sheet = (await engine.load(campaignId))?.state.characterSheets.get(ELOWEN);
  if (!sheet) throw new Error(`UI raising ${campaignId}: no sheet`);
  const result = await engine.execute({
    campaignId,
    commandId: `${campaignId}.raiser`,
    actor: DM,
    command: {
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: {
        ...sheet,
        spellcasting: [
          ...sheet.spellcasting,
          {
            source: 'cleric',
            ability: 'wis',
            spells: ['revivify', 'raise-dead', 'cure-wounds'],
          },
        ],
      },
    },
  });
  if (result.status !== 'accepted') throw new Error(`UI raising ${campaignId}: sheet refused`);
}

/** Four 40 lb mail shirts beside her gear: about 190 lb against the 150 her Strength carries. */
async function seedLoad(engine: WorldEngine, campaignId: string, name: string): Promise<void> {
  for (const itemId of ['item-2b8e41d7', 'item-7c05f9a3', 'item-e41a6c28', 'item-93d7b05e']) {
    for (const command of [
      { type: 'CreateEntity', entityId: itemId, kind: 'item', name, existsSince: null },
      { type: 'GrantItem', itemId, holderId: ELOWEN, catalogId: 'watchman-mail', quantity: 1 },
    ]) {
      const result = await engine.execute({
        campaignId,
        commandId: `${campaignId}.load.${command.type}.${itemId}`,
        actor: DM,
        command,
      });
      if (result.status !== 'accepted') throw new Error(`UI options ${campaignId}: load failed`);
    }
  }
}

async function seedItems(
  engine: WorldEngine,
  campaignId: string,
  names: (typeof NAMES)[keyof typeof NAMES],
  carried: boolean,
): Promise<void> {
  const state = (await engine.load(campaignId))?.state;
  const sheet = state?.characterSheets.get(ELOWEN);
  if (!state || !sheet) throw new Error(`UI items ${campaignId}: no sheet`);
  const here = state.entities.get(ELOWEN)?.placement?.locationId;
  if (!here) throw new Error(`UI items ${campaignId}: Elowen is nowhere`);
  const run = async (step: string, command: Record<string, unknown>) => {
    const result = await engine.execute({
      campaignId,
      commandId: `${campaignId}.items.${step}`,
      actor: DM,
      command,
    });
    if (result.status !== 'accepted') {
      throw new Error(
        `UI items ${campaignId} ${step}: ${result.status === 'rejected' ? result.code : result.status}`,
      );
    }
  };
  const create = (id: string, name: string, placement?: string) =>
    run(`create-${id}`, {
      type: 'CreateEntity',
      entityId: id,
      kind: 'item',
      name,
      existsSince: null,
      ...(placement ? { placement: { locationId: placement, since: null } } : {}),
    });
  await create('item-4c1e9a07', names.lantern, here);
  if (!carried) return;
  await run('wounded', {
    type: 'SetCharacterSheet',
    entityId: ELOWEN,
    sheet: { ...sheet, hitPoints: { ...sheet.hitPoints, current: sheet.hitPoints.max - 30 } },
  });
  for (const [id, name, catalogId, quantity] of [
    ['item-8d2b5f31', names.brigandine, 'ravenford-brigandine', 1],
    ['item-1a7c3e92', names.buckler, 'oak-buckler', 1],
    ['item-6e0f4b58', names.cloak, 'caravan-cloak', 1],
    ['item-b93d2a16', names.balm, 'woodland-balm', 2],
    // A weapon to wield and a purse (Stage 520).
    ['item-5f7a1c3e', names.blade, 'ranger-shortsword', 1],
    ['item-0c9e2d71', names.crowns, 'gold-crown', 12],
  ] as const) {
    await create(id, name);
    await run(`grant-${id}`, {
      type: 'GrantItem',
      itemId: id,
      holderId: ELOWEN,
      catalogId,
      quantity,
    });
  }
}
