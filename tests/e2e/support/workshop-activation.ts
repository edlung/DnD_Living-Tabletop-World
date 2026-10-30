import {
  campaignActivationAnswerSchema,
  ownedCampaignListSchema,
} from '../../../packages/contracts/src/index.ts';
import { expect, type Page } from '@playwright/test';

import type { WorkshopFixture } from '../../../apps/server/src/testing/ui-workshop-links.ts';
import { accessState, takeSeat, WORDS } from './sign-in.ts';
import { draftApi, openWorkshopDraft } from './workshop.ts';

export const activationRegion = (page: Page) =>
  page.getByRole('region', { name: /^(Campaign activation|Запуск кампании)$/ });
export const activationConfirm = (page: Page) =>
  page.getByRole('button', { name: /^(Confirm campaign activation|Подтвердить запуск кампании)$/ });

export async function openActivation(page: Page, name: WorkshopFixture) {
  await openWorkshopDraft(page, name);
  await page.getByRole('tab', { name: /^(Activation|Запуск)$/ }).click();
  await expect(
    page.getByRole('heading', {
      name: /^(Review campaign activation|Проверка перед запуском кампании)$/,
    }),
  ).toBeVisible();
  await expect(activationConfirm(page)).toBeVisible();
}

export async function chooseTextOnly(page: Page) {
  await page
    .getByRole('radio', { name: /^(Text-only campaign|Текстовая кампания без изображений)$/ })
    .check();
  await expect(
    activationRegion(page).getByText(/^(Pictures to copy: 0|Изображений для переноса: 0)$/),
  ).toBeVisible();
}

export async function acknowledgeActivation(page: Page) {
  const warnings = activationRegion(page).getByRole('checkbox');
  const count = await warnings.count();
  if (count) await expect(activationConfirm(page)).toBeDisabled();
  for (const warning of await warnings.all()) await warning.check();
  await expect(activationConfirm(page)).toBeEnabled();
  return count;
}

export async function expectPublished(page: Page) {
  await expect(
    page.getByRole('heading', { name: /^(Campaign ready to play|Кампания готова к игре)$/ }),
  ).toBeVisible({ timeout: 20000 });
}

export async function activationOf(page: Page, name: WorkshopFixture) {
  const response = await page.request.get(`${draftApi(name)}/activation`);
  expect(response.status()).toBe(200);
  const body = campaignActivationAnswerSchema.parse(await response.json());
  if (!body.activation) throw new Error('Expected a confirmed activation');
  return body.activation;
}

export async function ownedCampaigns(page: Page) {
  const response = await page.request.get('/api/workshop/campaigns');
  expect(response.status()).toBe(200);
  return ownedCampaignListSchema.parse(await response.json());
}

export async function enterActivatedGame(
  page: Page,
  language: 'en' | 'ru' = 'en',
  replace = false,
) {
  const words = WORDS[language];
  await page.getByRole('button', { name: /^(Enter campaign|Войти в кампанию)$/ }).click();
  await expect(accessState(page, words.invited)).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await takeSeat(page, words);
  if (replace) {
    const question = accessState(page, words.replaceQuestion);
    await expect(question.getByRole('button', { name: words.keep })).toBeFocused();
    await page.keyboard.press('Tab');
    const button = question.getByRole('button', { name: words.replace });
    await expect(button).toBeEnabled();
    await button.click();
  }
}
