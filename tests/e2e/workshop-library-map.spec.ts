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
import { closeSheet, dockButton, openSheet } from './support/shell.ts';
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

/**
 * A library campaign's world map (docs/adr/0057-encounters-maps-loot.md §10, ADR 0058 notes of
 * 2026-11-17): the DM starts «Караван Белой Ночи» from the workshop and finds the Places sheet
 * opening on the GPT map of the Frost Spine, every place of the road pinned and the stages between
 * them listed with their miles; the party, at Cedar Edge, goes down to Smoke Junction along the
 * forest road, eight miles at a normal pace: three hours.
 */
test('a library campaign starts with its world map, and the DM leads the party along a route', async ({
  page,
}) => {
  await page.goto(`/workshop/join#${workshopInvitationToken(signInSeed(), 'library-map')}`);
  await page.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
  const created = await page.request.post('/api/workshop/drafts', {
    headers: {
      'x-workshop-owner': workshopOwnerId(signInSeed(), 'library-map'),
      origin: SIGN_IN_ORIGIN,
    },
    data: { requestId: randomUUID(), title: 'Winter Caravan pick', language: 'ru' },
  });
  expect(created.status()).toBe(200);
  const draft = (await created.json()) as { draftId: string };
  await page.goto(`/workshop/drafts/${draft.draftId}`);
  await page.getByRole('tab', { name: /^(Scenario|Сценарий)$/ }).click();
  const library = page.getByRole('region', { name: /^(Ready campaigns|Готовые кампании)$/ });
  const card = library.getByRole('listitem').filter({ hasText: 'Караван Белой Ночи' });
  await card.getByRole('button', { name: /Караван Белой Ночи/ }).click();
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
  const revision = saved.revision;
  if (!revision) throw new Error('no saved package');
  const { content } = revision;
  const identities = revision.identities.entities;
  const pins = content.maps?.[0]?.pins ?? [];
  const named = (key: string) => content.entities.find((e) => e.key === key)?.name ?? key;
  expect(pins.length).toBeGreaterThan(5);

  await page.getByRole('tab', { name: /^(Activation|Запуск)$/ }).click();
  await chooseTextOnly(page);
  await acknowledgeActivation(page);
  await activationConfirm(page).click();
  await expectPublished(page);
  const campaignId = (await ownedCampaigns(page)).campaigns[0]?.campaignId;
  if (!campaignId) throw new Error('no started campaign');
  await enterActivatedGame(page);
  // In the game as its DM. A library campaign has a book, so the dock holds one tool more and
  // its last, Players, may wait under More.
  await expect(dockButton(page, 'Игроки')).toBeAttached();
  // The map's picture arrives right after the campaign is published, with the other pictures.
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/campaigns/${campaignId}/entities/${identities['world-map'] ?? ''}/presentation?perspective=DM`,
        );
        return ((await response.json()) as EntityPresentationResponse).presentation.image !== null;
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  // The party starts on Cedar Edge, as the package places it.
  for (const hero of content.party)
    expect(content.entities.find((e) => e.key === hero)?.placement?.location).toBe('cedar-edge');
  await page.reload();
  await openSheet(page, 'Места');
  const map = page.locator('.world-map');
  await expect(map.getByRole('heading', { level: 3 })).toHaveText(`Карта: ${named('world-map')}`);
  const canvas = map.locator('.map-canvas').first();
  await expect(canvas.locator('.map-pin')).toHaveCount(pins.length);
  const art = canvas.locator('img.map-art');
  await expect(art).toHaveAttribute('src', /^blob:/, { timeout: 20_000 });
  await expect
    .poll(() => art.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(1000);
  await expect(
    map.getByRole('button', { name: `${named('cedar-edge')} — вы здесь`, exact: true }),
  ).toBeVisible();
  await expect(map.locator('.map-route-list')).toContainText(
    `${named('cedar-edge')} — ${named('smoke-junction')}: миль 8, лес · хорошая дорога`,
  );
  // Nine names on one map: at every width none lies on another, and the party's place is named.
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await canvas.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        canvas.evaluate((box) => {
          const shown = [...box.querySelectorAll('.map-pin-name')]
            .filter((name) => getComputedStyle(name).visibility === 'visible')
            .map((name) => name.getBoundingClientRect());
          return shown.filter((a, i) =>
            shown.some(
              (b, j) =>
                j > i &&
                a.left < b.right &&
                b.left < a.right &&
                a.top < b.bottom &&
                b.top < a.bottom,
            ),
          ).length;
        }),
      )
      .toBe(0);
    await expect(canvas.locator('.map-pin--here .map-pin-name')).toBeVisible();
    await page.screenshot({ path: `test-results/library-world-map-${String(width)}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectAccessible(page, 'a library campaign’s world map');

  // Down to Smoke Junction: eight miles of forest road at a normal pace, three hours.
  await map.getByText('Путешествие', { exact: true }).click();
  const travel = map.locator('.travel-form');
  await travel.getByLabel('Куда').selectOption({ label: `${named('smoke-junction')}, миль: 8` });
  await travel.getByRole('radio', { name: /^Обычный темп/ }).check();
  await expect(travel.locator('.travel-sum')).toContainText('Часов в пути: 3; дней: 1.');
  await travel.getByRole('button', { name: 'В путь' }).click();
  await expect(
    map.getByRole('button', { name: `${named('smoke-junction')} — вы здесь`, exact: true }),
  ).toBeVisible();
  await closeSheet(page, 'Места');
});
