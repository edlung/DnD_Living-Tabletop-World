import { randomUUID } from 'node:crypto';

import { expect as baseExpect, test, type Page } from '@playwright/test';

import { UI_ITEM_CAMPAIGNS } from '../../apps/server/src/testing/ui-item-campaigns.ts';
import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { battlefield } from './support/combat.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { closeCharacter, openCharacter, openSheet } from './support/shell.ts';

/**
 * Loot, treasure and the party's stash (Stage 670e, docs/adr/0057-encounters-maps-loot.md §7). The
 * DM leaves silver at Market Square and Elowen picks it up; she puts part of her crowns in the
 * party's stash and takes them back, then shares her coins out with Brann. In a fight on the road
 * the DM gives a goblin gold, the goblin falls, and once the fight is over its gold lies on the
 * road for her to take.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

const worldObjects = (page: Page) => page.getByRole('list', { name: 'Visible world objects' });

/** A thing lying here, unknown until looked at, picked up from the scene. */
async function pickUp(page: Page) {
  await worldObjects(page)
    .getByRole('button', { name: /Unidentified item/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Pick up', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You picked it up.' })).toBeVisible();
}

test('the DM leaves treasure; Elowen takes it, and shares her crowns through the stash', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const campaign = UI_ITEM_CAMPAIGNS.loot;
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);

  // The DM leaves twelve silver marks at the place.
  await openSheet(dm, 'Encounter');
  await dm.getByText('Leave treasure here', { exact: true }).click();
  const form = dm.locator('form.give-item-form');
  await form.getByLabel('Find by name', { exact: true }).fill('silver marks');
  await form.getByLabel('How many', { exact: true }).fill('12');
  await expectAccessible(dm, 'treasure left at a place');
  await form.getByRole('button', { name: 'Leave it here', exact: true }).click();
  await expect(form.getByRole('status')).toHaveText('Left here: Silver marks.');

  // Elowen sees something lying there and takes it: the silver.
  await pickUp(player);
  const sheet = await openCharacter(player, 'Inventory');
  await expect(sheet.getByRole('button', { name: /^Silver marks/ }).first()).toBeVisible();

  // Five of her crowns go to the stash, and come back.
  await sheet
    .getByRole('button', { name: /^Purse of crowns/ })
    .first()
    .click();
  const card = sheet.locator('.item-card');
  await card.getByLabel('How many of Purse of crowns', { exact: true }).fill('5');
  await card.getByRole('button', { name: 'Put in the stash', exact: true }).click();
  const stash = sheet.getByRole('region', { name: 'The party’s stash' });
  await expect(stash).toContainText('Purse of crowns, 5');
  await expectAccessible(player, 'the party’s stash');
  await stash.getByRole('button', { name: 'Take Purse of crowns from the stash' }).click();
  await expect(stash).toContainText('Nothing in the stash yet');

  // She shares her coins out with Brann, here with her: an even worth each, change made.
  await sheet.getByText('Share the coins out', { exact: true }).click();
  const share = sheet.locator('.share-coins');
  for (const name of ['Maren Ashby', 'Tamsin Quickfoot'])
    await share.getByLabel(name, { exact: true }).uncheck();
  await expect(share.getByRole('status')).toContainText('Each gets');
  await expectAccessible(player, 'coins shared out');
  await share.getByRole('button', { name: 'Share them out', exact: true }).click();
  await expect(
    player.getByRole('status').filter({ hasText: 'You shared the coins out.' }),
  ).toBeVisible();
  const brann = (await (
    await dm.request.get(`/api/campaigns/${campaign}/entities/brann-ironvale/inventory`, {
      headers: { authorization: `Bearer ${TOKENS.dm}` },
      params: { perspective: 'DM' },
    })
  ).json()) as { items: { catalog: { category: string } | null }[] };
  expect(brann.items.some((item) => item.catalog?.category === 'coins')).toBe(true);
  await closeCharacter(player);
});

test('a fallen goblin’s gold lies on the road once the fight is over', async ({ browser }) => {
  test.setTimeout(180_000);
  const campaign = UI_PARTY_CAMPAIGNS.lootFight;
  const headers = { authorization: `Bearer ${TOKENS.dm}` };
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, campaign);
  const base = `/api/campaigns/${campaign}/encounters/saved/${randomUUID()}`;
  const saved = await dm.request.post(base, {
    headers,
    data: {
      name: 'Loot',
      locationId: 'old-trade-road',
      battlefield: { width: 16, height: 12, difficult: [], cover: [] },
      foes: [{ kind: 'bestiary', monsterId: 'goblin-warrior', position: { x: 8, y: 5 } }],
      partyStart: [
        { x: 1, y: 1 },
        { x: 1, y: 4 },
        { x: 1, y: 7 },
        { x: 1, y: 10 },
      ],
    },
  });
  expect(saved.status()).toBe(201);
  expect(
    (
      await dm.request.post(`${base}/start`, { headers, data: { requestId: randomUUID() } })
    ).status(),
  ).toBe(200);
  const fight = async () =>
    (
      (await (
        await dm.request.get(`/api/campaigns/${campaign}/encounter`, {
          headers,
          params: { perspective: 'DM' },
        })
      ).json()) as {
        encounter: {
          encounterId: string;
          combatants: { entity: { entityId: string; kind: string } }[];
        };
      }
    ).encounter;
  const goblin = (await fight()).combatants.find((one) => one.entity.kind === 'creature');
  if (!goblin) throw new Error('no goblin');
  const given = await dm.request.post(`/api/campaigns/${campaign}/items/catalog/gold-crown/give`, {
    headers,
    data: { requestId: randomUUID(), holderId: goblin.entity.entityId, quantity: 7 },
  });
  expect(given.status()).toBe(200);

  // The DM sees what it carries on its card.
  await battlefield(dm).getByRole('button', { name: 'Flat board', exact: true }).click();
  await dm.locator('.board-square[data-x="8"][data-y="5"]').dispatchEvent('click');
  await expect(dm.locator('.creature-goods')).toContainText('It carries: Gold crowns, 7.');

  // It falls; the fight ends; its gold lies on the road.
  const command = (body: object) =>
    dm.request.post(`/api/campaigns/${campaign}/commands`, {
      headers,
      data: { commandId: `${campaign}.${randomUUID()}`, command: body },
    });
  expect(
    await (
      await command({
        type: 'AdjustHitPoints',
        targetId: goblin.entity.entityId,
        change: 'damage',
        amount: 999,
        damageType: 'force',
        reason: 'The goblin falls',
      })
    ).json(),
  ).toMatchObject({ status: 'accepted' });
  const { encounterId } = await fight();
  expect(await (await command({ type: 'EndCombat', encounterId })).json()).toMatchObject({
    status: 'accepted',
  });

  await enterWorld(player, TOKENS.player, campaign);
  await pickUp(player);
  const sheet = await openCharacter(player, 'Inventory');
  await expect(sheet.getByRole('button', { name: /^Gold crowns/ }).first()).toBeVisible();
});
