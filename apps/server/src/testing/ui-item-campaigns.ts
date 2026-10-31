import { commandSubmissionSchema, type WorldEngine } from '@ltw/domain';

import { RAVENFORD_RU_FIXTURES_DIR, loadRavenfordSeed } from '../world-engine/ravenford-seed.ts';

/**
 * Browser-test campaigns for item possession (docs/adr/0039-item-possession.md); each journey
 * owns one, seeded through real commands. Elowen carries a brigandine, a buckler, a cloak and two
 * balms and is wounded; a lantern lies on the ground where she stands.
 */
export const UI_ITEM_CAMPAIGNS = {
  play: 'ui-items-play',
  take: 'ui-items-take',
  ru: 'ui-items-ru',
  /** Read-only: only looked at, at three widths. */
  axe: 'ui-items-axe',
} as const;

const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const ELOWEN = 'elowen-starwhisper';

const NAMES = {
  en: {
    brigandine: 'Ravenford brigandine',
    buckler: 'Oak buckler',
    cloak: 'Grey road cloak',
    balm: "Orin's balm",
    lantern: 'Dented lantern',
  },
  ru: {
    brigandine: 'Равенфордский бригандин',
    buckler: 'Дубовый баклер',
    cloak: 'Серый дорожный плащ',
    balm: 'Бальзам Орина',
    lantern: 'Помятый фонарь',
  },
} as const;

export async function seedUiItemCampaigns(engine: WorldEngine): Promise<void> {
  for (const [campaignId, language] of [
    [UI_ITEM_CAMPAIGNS.play, 'en'],
    [UI_ITEM_CAMPAIGNS.take, 'en'],
    [UI_ITEM_CAMPAIGNS.ru, 'ru'],
    [UI_ITEM_CAMPAIGNS.axe, 'en'],
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
  await create('item-lantern', names.lantern, here);
  if (!carried) return;
  await run('wounded', {
    type: 'SetCharacterSheet',
    entityId: ELOWEN,
    sheet: { ...sheet, hitPoints: { ...sheet.hitPoints, current: sheet.hitPoints.max - 30 } },
  });
  for (const [id, name, catalogId, quantity] of [
    ['item-brigandine', names.brigandine, 'ravenford-brigandine', 1],
    ['item-buckler', names.buckler, 'oak-buckler', 1],
    ['item-cloak', names.cloak, 'caravan-cloak', 1],
    ['item-balm', names.balm, 'woodland-balm', 2],
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
