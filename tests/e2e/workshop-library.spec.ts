import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { SIGN_IN_ORIGIN, signInSeed } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import {
  workshopInvitationToken,
  workshopOwnerId,
} from '../../apps/server/src/testing/ui-workshop-links.ts';
import type {
  CampaignRevisionView,
  EntityPresentationResponse,
} from '../../packages/contracts/src/index.ts';
import { expectAccessible } from './support/axe.ts';
import { chooseLocation, dockButton } from './support/shell.ts';
import {
  acknowledgeActivation,
  activationConfirm,
  chooseTextOnly,
  enterActivatedGame,
  expectPublished,
  ownedCampaigns,
} from './support/workshop-activation.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(180_000);

test('a DM picks a library campaign, starts it and gets its pictures, figures and battle maps', async ({
  page,
}) => {
  await page.goto(`/workshop/join#${workshopInvitationToken(signInSeed(), 'library')}`);
  await page.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
  const created = await page.request.post('/api/workshop/drafts', {
    headers: {
      'x-workshop-owner': workshopOwnerId(signInSeed(), 'library'),
      origin: SIGN_IN_ORIGIN,
    },
    data: { requestId: randomUUID(), title: 'Library pick', language: 'ru' },
  });
  expect(created.status()).toBe(200);
  const draft = (await created.json()) as { draftId: string };
  await page.goto(`/workshop/drafts/${draft.draftId}`);
  await page.getByRole('tab', { name: /^(Scenario|Сценарий)$/ }).click();

  const library = page.getByRole('region', { name: /^(Ready campaigns|Готовые кампании)$/ });
  await expect(library.getByRole('listitem')).toHaveCount(8);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectAccessible(page, `campaign library ${String(width)}`);
    await page.screenshot({ path: `test-results/library-${String(width)}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const card = library.getByRole('listitem').filter({ hasText: 'Дождь по страховому случаю' });
  await card.getByRole('combobox').selectOption({ label: '4 игрока' });
  await card.getByRole('button', { name: /Дождь по страховому случаю/ }).click();
  const panel = page.getByRole('region', {
    name: /^(Import a prepared campaign|Загрузить готовую кампанию)$/,
  });
  await expect(
    panel.getByRole('heading', { name: 'Дождь по страховому случаю', exact: true }),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: /^(Save package to this draft|Сохранить пакет в этот черновик)$/ })
    .click();
  await expect(panel).toHaveCount(0);
  const saved = (await (
    await page.request.get(`/api/workshop/drafts/${draft.draftId}/package`)
  ).json()) as CampaignRevisionView;
  expect(saved.assessment.readiness).toBe('READY');
  const identities = saved.revision?.identities.entities ?? {};

  await page.getByRole('tab', { name: /^(Activation|Запуск)$/ }).click();
  await expect(activationConfirm(page)).toBeVisible();
  await chooseTextOnly(page);
  await acknowledgeActivation(page);
  await activationConfirm(page).click();
  await expectPublished(page);
  const owned = await ownedCampaigns(page);
  const campaignId = owned.campaigns[0]?.campaignId;
  if (!campaignId) throw new Error('no started campaign');
  await enterActivatedGame(page);
  await expect(dockButton(page, 'Игроки')).toBeVisible();
  const presentation = async (key: string) => {
    const entityId = identities[key];
    if (!entityId) throw new Error(`no entity ${key}`);
    const response = await page.request.get(
      `/api/campaigns/${campaignId}/entities/${entityId}/presentation?perspective=DM`,
    );
    expect(response.status()).toBe(200);
    return ((await response.json()) as EntityPresentationResponse).presentation;
  };
  // The pictures arrive right after the campaign is published, through the curated import.
  await expect
    .poll(async () => (await presentation('clock-roofs')).battleMap !== null, { timeout: 30_000 })
    .toBe(true);
  expect((await presentation('rain-cemetery')).image).not.toBeNull();
  expect((await presentation('nina-run')).image).not.toBeNull();
  const foe = Object.keys(identities).find((key) => key.startsWith('dock-catchers-'));
  if (!foe) throw new Error('no dock foe');
  expect((await presentation(foe)).figure).not.toBeNull();

  // The finale on the roofs: the party stands there, the DM starts the prepared fight, and the
  // board lies on the GPT battle map with the foes' figures.
  const post = (path: string, data: object) =>
    page.request.post(`/api/campaigns/${campaignId}${path}`, {
      headers: { origin: SIGN_IN_ORIGIN },
      data,
    });
  for (const hero of saved.revision?.content.party ?? []) {
    const placed = await post('/commands', {
      commandId: randomUUID(),
      command: {
        type: 'PlaceEntity',
        entityId: identities[hero],
        locationId: identities['clock-roofs'],
      },
    });
    expect(placed.status()).toBe(200);
  }
  const index = (saved.revision?.content.encounters ?? []).findIndex((e) => e.key === 'roof-duel');
  const started = await post(`/encounters/prepared/scenario-${String(index + 1)}/start`, {
    requestId: randomUUID(),
  });
  expect(started.status()).toBe(200);
  await page.reload();
  await chooseLocation(page, identities['clock-roofs'] ?? '', { sheet: 'Места', label: 'Место' });
  const map = page.locator('img.board-map');
  await expect(map).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => map.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/library-board.png' });
});
