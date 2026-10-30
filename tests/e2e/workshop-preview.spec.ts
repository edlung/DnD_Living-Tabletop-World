import { expect, test } from '@playwright/test';
import type { CampaignPreviewView } from '../../packages/contracts/src/index.ts';

import { SIGN_IN_ORIGIN } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import { draftApi } from './support/workshop.ts';
import {
  BELL_TRUTH,
  characterView,
  enterCharacter,
  leaveCharacter,
  openWorldPreview,
  picturesRegion,
  restrictedTraffic,
  viewRegion,
} from './support/workshop-preview.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });

test('owner inspects a static prepared layout, then the character sees initial knowledge, own sheet and an unobserved remote camera', async ({
  page,
}) => {
  await openWorldPreview(page, 'preview-en');
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') mutations.push(request.url());
  });
  const owner = viewRegion(page);
  const layout = page.getByLabel('Prepared encounter layout', { exact: true });
  const response = page.waitForResponse((reply) => {
    const url = new URL(reply.url());
    return (
      url.pathname === `${draftApi('preview-en')}/preview` && url.searchParams.has('encounterId')
    );
  });
  await layout.selectOption({ label: 'The Disturbed Crab' });
  const prepared = (await (await response).json()) as CampaignPreviewView;
  expect(prepared.perspective.kind).toBe('OWNER');
  if (!('prepared' in prepared) || !prepared.prepared) throw new Error('PREPARED_LAYOUT_MISSING');
  expect(Object.keys(prepared.prepared.layout).sort()).toEqual(['battlefield', 'combatants']);
  for (const combatant of prepared.prepared.layout.combatants)
    expect(combatant).not.toHaveProperty('initiative');
  await expect(
    owner.getByText('Prepared positions only. No encounter has started.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'End turn', exact: true })).toHaveCount(0);
  expect(mutations.filter((url) => url.includes('/commands'))).toEqual([]);
  await layout.selectOption('');
  await expect(owner.getByRole('button', { name: 'Arden', exact: true })).toBeVisible();
  const traffic = restrictedTraffic(page);
  const characterId = await enterCharacter(page);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(picturesRegion(page)).toHaveCount(0);
  await expect(page.getByLabel('Choose a prepared character', { exact: true })).toHaveCount(0);
  const body = await page.locator('body').textContent();
  expect(body).not.toContain(BELL_TRUTH);
  expect(body).not.toContain('The Sunken Tower');
  await page.getByRole('button', { name: 'Inspect your prepared character', exact: true }).click();
  await page.getByRole('button', { name: 'Full character sheet', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Character sheet', exact: true })).toBeVisible();
  const first = await characterView(page, 'preview-en', characterId);
  expect(first.scene?.present.some((entity) => entity.entityId === characterId)).toBe(true);
  await page.getByLabel('View a location', { exact: true }).selectOption({ label: 'The Archive' });
  await expect(
    viewRegion(page)
      .getByRole('list', { name: 'Visible world objects', exact: true })
      .locator('li'),
  ).toHaveCount(0);
  const camera = await page.getByLabel('View a location', { exact: true }).inputValue();
  const remote = await page.request.get(
    `${draftApi('preview-en')}/preview?revision=1&perspective=CHARACTER&characterId=${characterId}&locationId=${camera}`,
  );
  const remoteView = (await remote.json()) as CampaignPreviewView;
  expect(remoteView.scene?.location.observed).toBe(false);
  expect(remoteView.scene?.present).toEqual([]);
  expect((await characterView(page, 'preview-en', characterId)).scene).toEqual(first.scene);
  await traffic.assertClean([
    'The Sunken Tower',
    'I activated the resonator to open a safe channel through the ice.',
  ]);
  traffic.stop();
  await leaveCharacter(page);
  await expect(page.getByLabel('Prepared encounter layout', { exact: true })).toBeVisible();
  await expect(picturesRegion(page)).toBeVisible();
});

test('Russian character preview stays bilingual and keyboard usable on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorldPreview(page, 'preview-ru');
  const launch = page.getByRole('button', { name: 'Посмотреть глазами персонажа', exact: true });
  await page
    .getByLabel('Выберите подготовленного персонажа', { exact: true })
    .selectOption({ label: 'Алёна' });
  await launch.focus();
  await page.keyboard.press('Enter');
  await expect(
    viewRegion(page).getByText('Начальный вид персонажа Алёна', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page
    .getByRole('button', { name: 'Изучить своего подготовленного персонажа', exact: true })
    .click();
  const sheet = page.getByRole('button', { name: 'Полный лист персонажа', exact: true });
  await sheet.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.character-sheet')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const back = page.getByRole('button', { name: 'Вернуться к превью владельца', exact: true });
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByLabel('Выберите подготовленного персонажа', { exact: true }),
  ).toBeVisible();
});
