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
  /** A player attunes in a Short Rest (docs/adr/0054-items-as-data.md §5). */
  attune: 'ui-items-attune',
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
  },
  ru: {
    brigandine: 'Равенфордский бригандин',
    buckler: 'Дубовый баклер',
    cloak: 'Серый дорожный плащ',
    balm: 'Запасной бальзам',
    lantern: 'Помятый фонарь',
    blade: 'Учебный клинок',
    crowns: 'Кошель крон',
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
    [UI_ITEM_CAMPAIGNS.attune, 'en'],
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
