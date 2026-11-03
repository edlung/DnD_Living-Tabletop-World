import { expect as baseExpect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openCharacter } from './support/shell.ts';

/**
 * Magic items at the table (docs/adr/0054-items-as-data.md §5): the DM gives Elowen a Ring of
 * Protection and opens a Short Rest; her player puts it on, attunes to it in the rest, and the
 * pack counts it — out of a rest no attunement is offered. A potion given unidentified is known by
 * a taste; a wand spends a charge, and at dawn the charges come back.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = 'ui-items-attune';

test('a player attunes to a Ring of Protection in a short rest', async ({ page }) => {
  const dm = { authorization: `Bearer ${TOKENS.dm}` };
  const given = await page.request.post(
    `/api/campaigns/${CAMPAIGN}/items/catalog/srd-ring-of-protection/give`,
    { headers: dm, data: { requestId: crypto.randomUUID(), holderId: 'elowen-starwhisper' } },
  );
  expect(given.status()).toBe(200);
  await enterWorld(page, TOKENS.player, CAMPAIGN);
  const pack = await openCharacter(page, 'Inventory');
  await pack
    .getByRole('button', { name: /^Ring of Protection/ })
    .first()
    .click();
  const card = pack.locator('.item-card');
  await expect(card).toContainText('Rare · Needs attunement');
  // No rest yet: no attunement offered.
  await expect(card.getByRole('button', { name: /Attune/ })).toHaveCount(0);
  await card.getByRole('button', { name: 'Wear', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You put it on.' })).toBeVisible();

  const rest = await page.request.post(`/api/campaigns/${CAMPAIGN}/rest?perspective=DM`, {
    headers: dm,
    data: { requestId: crypto.randomUUID(), kind: 'short' },
  });
  expect(rest.status()).toBe(201);
  // The table learns of the rest; the card offers attunement in it.
  await pack
    .getByRole('button', { name: /^Ring: Ring of Protection|^Ring of Protection/ })
    .first()
    .click();
  const attune = card.getByRole('button', { name: 'Attune in this short rest' });
  await expect(attune).toBeVisible({ timeout: 20_000 });
  await expectAccessible(page, 'the attunement card');
  await attune.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Attuned: its magic is yours.' }),
  ).toBeVisible();
  await expect(pack).toContainText('Attuned to 1 of 3 items.');
  await expect(card).toContainText('Rare · Attuned');
  await expect(card).toContainText('+1 to Armor Class, +1 to saving throws');
});

test('a potion known by a taste, a wand’s charge spent, and the dawn that brings it back', async ({
  page,
}) => {
  const campaign = 'ui-items-charges';
  const dm = { authorization: `Bearer ${TOKENS.dm}` };
  for (const [catalogId, extra] of [
    ['srd-wand-of-magic-missiles', {}],
    ['srd-potion-of-healing-greater', { unidentified: true }],
  ] as const) {
    const given = await page.request.post(
      `/api/campaigns/${campaign}/items/catalog/${catalogId}/give`,
      {
        headers: dm,
        data: { requestId: crypto.randomUUID(), holderId: 'elowen-starwhisper', ...extra },
      },
    );
    expect(given.status()).toBe(200);
  }
  await enterWorld(page, TOKENS.player, campaign);
  const pack = await openCharacter(page, 'Inventory');
  const card = pack.locator('.item-card');
  await pack
    .getByRole('button', { name: /^An unknown magic item/ })
    .first()
    .click();
  await expect(card).toContainText('Not identified');
  await card.getByRole('button', { name: 'Taste it', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Identified: it is Potion of Healing (Greater).' }),
  ).toBeVisible();
  await expect(card).toContainText('Restores 4d4 + 4 hit points');

  await pack
    .getByRole('button', { name: /^Wand of Magic Missiles/ })
    .first()
    .click();
  await expect(card).toContainText('7 of 7');
  await card.getByRole('button', { name: 'Use a charge', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'A charge spent: 6 left.' }),
  ).toBeVisible();
  await expect(card).toContainText('6 of 7');
  const dawn = await page.request.post(`/api/campaigns/${campaign}/commands`, {
    headers: dm,
    data: { commandId: crypto.randomUUID(), command: { type: 'DawnRecharge' } },
  });
  expect(dawn.status()).toBe(200);
  await expect(card).toContainText('7 of 7', { timeout: 20_000 });
});
