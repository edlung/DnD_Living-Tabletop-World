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
  await expect(library.getByRole('listitem')).toHaveCount(53);
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
  // In the game as its DM. A library campaign has a book, so the dock holds one tool more and
  // its last, Players, may wait under More.
  await expect(dockButton(page, 'Игроки')).toBeAttached();
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

test('a library campaign starts its fight on the battle map with the heroes standing as figures', async ({
  page,
}) => {
  // Ember Crown (collection-2026, art of 2026-11-17): the heroes have painted miniatures of their
  // own, derived from their portraits, and the North Gate its GPT battle map.
  await page.goto(`/workshop/join#${workshopInvitationToken(signInSeed(), 'library-figures')}`);
  await page.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
  const created = await page.request.post('/api/workshop/drafts', {
    headers: {
      'x-workshop-owner': workshopOwnerId(signInSeed(), 'library-figures'),
      origin: SIGN_IN_ORIGIN,
    },
    data: { requestId: randomUUID(), title: 'Ember Crown pick', language: 'ru' },
  });
  expect(created.status()).toBe(200);
  const draft = (await created.json()) as { draftId: string };
  await page.goto(`/workshop/drafts/${draft.draftId}`);
  await page.getByRole('tab', { name: /^(Scenario|Сценарий)$/ }).click();
  const library = page.getByRole('region', { name: /^(Ready campaigns|Готовые кампании)$/ });
  const card = library.getByRole('listitem').filter({ hasText: 'Корона Последнего Угля' });
  await card.getByRole('button', { name: /Корона Последнего Угля/ }).click();
  const panel = page.getByRole('region', {
    name: /^(Import a prepared campaign|Загрузить готовую кампанию)$/,
  });
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
  await chooseTextOnly(page);
  await acknowledgeActivation(page);
  await activationConfirm(page).click();
  await expectPublished(page);
  const campaignId = (await ownedCampaigns(page)).campaigns[0]?.campaignId;
  if (!campaignId) throw new Error('no started campaign');
  await enterActivatedGame(page);
  const presentation = async (key: string) => {
    const response = await page.request.get(
      `/api/campaigns/${campaignId}/entities/${identities[key] ?? ''}/presentation?perspective=DM`,
    );
    expect(response.status()).toBe(200);
    return ((await response.json()) as EntityPresentationResponse).presentation;
  };
  await expect
    .poll(async () => (await presentation('north-gate')).battleMap !== null, { timeout: 30_000 })
    .toBe(true);
  const party = saved.revision?.content.party ?? [];
  for (const hero of party) {
    const shown = await presentation(hero);
    expect(shown.image, hero).not.toBeNull();
    expect(shown.figure, hero).not.toBeNull();
  }
  const post = (path: string, data: object) =>
    page.request.post(`/api/campaigns/${campaignId}${path}`, {
      headers: { origin: SIGN_IN_ORIGIN },
      data,
    });
  for (const hero of party) {
    const placed = await post('/commands', {
      commandId: randomUUID(),
      command: {
        type: 'PlaceEntity',
        entityId: identities[hero],
        locationId: identities['north-gate'],
      },
    });
    expect(placed.status()).toBe(200);
  }
  const index = (saved.revision?.content.encounters ?? []).findIndex(
    (e) => e.key === 'battle-for-the-gate',
  );
  const started = await post(`/encounters/prepared/scenario-${String(index + 1)}/start`, {
    requestId: randomUUID(),
  });
  expect(started.status()).toBe(200);
  await page.reload();
  await chooseLocation(page, identities['north-gate'] ?? '', { sheet: 'Места', label: 'Место' });
  await expect(page.locator('img.board-map')).toBeVisible({ timeout: 20_000 });
  // Every hero on the board stands as a figure, not a medallion.
  await expect(page.locator('.token--party .miniature-art')).toHaveCount(party.length, {
    timeout: 20_000,
  });
  await page.screenshot({ path: 'test-results/library-figures-board.png' });
});
