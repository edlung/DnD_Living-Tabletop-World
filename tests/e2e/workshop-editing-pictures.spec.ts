import { expect, test, type Page } from '@playwright/test';

import type {
  CampaignDraftImagesView,
  CampaignEditingContext,
  CampaignGenerationJob,
} from '../../packages/contracts/src/index.ts';
import { SIGN_IN_ORIGIN } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import type { WorkshopFixture } from '../../apps/server/src/testing/ui-workshop-links.ts';
import { draftApi, openWorkshopDraft } from './support/workshop.ts';
import {
  chooseImageByApi,
  enterCharacter,
  generateImageByApi,
  imagesView,
  openWorldPreview,
  picturesRegion,
  viewRegion,
} from './support/workshop-preview.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(60_000);

const EN = {
  ai: 'Targeted AI edit',
  instruction: 'Instructions for this edit',
  search: 'Find an edit target',
  scope: 'Review edit scope',
  prepare: 'Prepare proposed changes',
  review: 'Review proposed changes',
  apply: 'Apply proposal as a new revision',
};
const RU = {
  ai: 'Адресная AI-правка',
  instruction: 'Инструкции для этой правки',
  search: 'Найти цель правки',
  scope: 'Проверить область правки',
  prepare: 'Подготовить предложение',
  review: 'Изучить предложенные изменения',
  apply: 'Применить предложение новой версией',
};
async function editing(page: Page, name: WorkshopFixture): Promise<CampaignEditingContext> {
  const response = await page.request.get(`${draftApi(name)}/editing`);
  expect(response.status()).toBe(200);
  return (await response.json()) as CampaignEditingContext;
}
async function propose(page: Page, target: string, instruction: string, words: typeof EN = EN) {
  await page.getByRole('button', { name: words.ai, exact: true }).click();
  await page.getByLabel(words.instruction, { exact: true }).fill(instruction);
  await page.getByLabel(words.search, { exact: true }).fill(target);
  await page.getByRole('checkbox', { name: target, exact: true }).first().check();
  await page.getByRole('button', { name: words.scope, exact: true }).click();
  await page.getByRole('button', { name: words.prepare, exact: true }).click();
  await expect(page.getByRole('button', { name: words.review, exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: words.review, exact: true }).click();
  await expect(page.getByRole('heading', { name: words.review, exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: /^(Complete field comparison|Полное сравнение полей)$/ }),
  ).toBeVisible();
}
async function atRevision(page: Page, name: WorkshopFixture, revision: number) {
  await expect
    .poll(async () => {
      const response = await page.request.get(`${draftApi(name)}/revisions`);
      expect(response.status()).toBe(200);
      const history = (await response.json()) as { revisions: { revision: number }[] };
      return history.revisions[0]?.revision;
    })
    .toBe(revision);
}
async function picturesAt(
  page: Page,
  name: WorkshopFixture,
  revision: number,
): Promise<CampaignDraftImagesView> {
  const response = await page.request.get(`${draftApi(name)}/images?revision=${String(revision)}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as CampaignDraftImagesView;
}

test('an AI source change reviews picture staleness before explicit adoption and preserves unrelated chosen bytes', async ({
  page,
}) => {
  const name = 'edit-images';
  await openWorldPreview(page, name);
  const inventory = await imagesView(page, name);
  const arden = inventory.subjects.find((subject) => subject.name === 'Arden'),
    iva = inventory.subjects.find((subject) => subject.name === 'Iva');
  if (!arden || !iva) throw new Error('PICTURE_SUBJECT_MISSING');
  const portrait = await generateImageByApi(page, name, arden.entityId);
  await chooseImageByApi(page, name, portrait);
  const unrelated = await generateImageByApi(page, name, iva.entityId);
  await chooseImageByApi(page, name, unrelated);
  const pictures = picturesRegion(page);
  await pictures.getByRole('button', { name: 'Refresh pictures', exact: true }).click();
  await pictures.getByLabel('Picture object', { exact: true }).selectOption({ label: 'Arden' });
  await expect(pictures.getByText('Current picture', { exact: true })).toBeVisible();
  await expect(
    viewRegion(page)
      .getByRole('button', { name: 'Arden', exact: true })
      .locator('img[src^="blob:"]'),
  ).toBeVisible();
  let extraImageRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/images/jobs'))
      extraImageRequests++;
  });
  await page.getByRole('tab', { name: 'Scenario', exact: true }).click();
  await propose(
    page,
    'Arden',
    'Add a red cloak to Arden while keeping the prepared setting intact.',
  );
  const consequences = page
    .getByRole('heading', { name: 'Consequences for chosen pictures', exact: true })
    .locator('..');
  await expect(consequences).toContainText('Arden');
  await expect(consequences).toContainText('Current picture');
  await expect(consequences).toContainText('Chosen picture is stale');
  await expect(consequences).not.toContainText('Iva');
  await expect(
    page.getByText(
      'Pictures are never regenerated automatically. Stale or missing choices use the neutral fallback.',
      { exact: true },
    ),
  ).toBeVisible();
  await atRevision(page, name, 1);
  const before = await picturesAt(page, name, 1);
  expect(before.manifest.entries.find((entry) => entry.entityId === arden.entityId)?.state).toBe(
    'CURRENT',
  );
  await page.getByRole('button', { name: EN.apply, exact: true }).click();
  await atRevision(page, name, 2);
  const after = await picturesAt(page, name, 2);
  expect(after.manifest.entries.find((entry) => entry.entityId === arden.entityId)).toMatchObject({
    state: 'STALE',
    contentHash: portrait.contentHash,
  });
  expect(after.manifest.entries.find((entry) => entry.entityId === iva.entityId)).toMatchObject({
    state: 'CURRENT',
    contentHash: unrelated.contentHash,
  });
  await page.getByRole('tab', { name: 'World preview', exact: true }).click();
  await picturesRegion(page)
    .getByLabel('Picture object', { exact: true })
    .selectOption({ label: 'Arden' });
  await expect(
    picturesRegion(page).getByText('Stale: the appearance or object changed.', { exact: true }),
  ).toBeVisible();
  await expect(
    viewRegion(page)
      .getByRole('button', { name: 'Arden', exact: true })
      .locator('img[src^="blob:"]'),
  ).toHaveCount(0);
  const characterId = await enterCharacter(page);
  await expect(
    viewRegion(page)
      .getByRole('button', { name: 'Arden', exact: true })
      .locator('img[src^="blob:"]'),
  ).toHaveCount(0);
  const staleBytes = await page.request.get(
    `${draftApi(name)}/preview/content/${encodeURIComponent(portrait.contentHash)}?revision=2&perspective=CHARACTER&characterId=${encodeURIComponent(characterId)}`,
  );
  expect(staleBytes.status()).toBe(404);
  expect(extraImageRequests).toBe(0);
});

test('Russian structured editing and an AI proposal remain localized and require explicit application', async ({
  page,
}) => {
  const name = 'edit-ru';
  await openWorkshopDraft(page, name);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  const initial = await editing(page, name),
    opening = 'Колокол звучит до рассвета. Перевозчик просит помочь путешественникам.';
  await page.getByRole('button', { name: 'Структурная правка', exact: true }).click();
  await page.getByLabel('Раздел для правки', { exact: true }).selectOption('world');
  await page.getByRole('textbox', { name: 'Завязка', exact: true }).fill(opening);
  await page.getByRole('button', { name: 'Сохранить структурные изменения', exact: true }).click();
  await atRevision(page, name, 2);
  expect((await editing(page, name)).revision.content.world.opening).toBe(opening);
  await propose(page, 'Арден', 'Уточни, почему Арден помогает путешественникам.', RU);
  await atRevision(page, name, 2);
  for (const summary of await page.locator('.campaign-change-list > li > details > summary').all())
    await summary.click();
  await expect(page.getByText(/Изменено по запросу владельца/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: EN.apply, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: RU.apply, exact: true }).click();
  await atRevision(page, name, 3);
  const saved = await editing(page, name);
  expect(
    saved.revision.content.entities.find((entity) => entity.key === 'arden')?.description,
  ).toContain('Изменено по запросу владельца.');
  expect(saved.revision.content.world.opening).toBe(opening);
  expect(saved.revision.identities).toEqual(initial.revision.identities);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
});

test('unavailable AI editing keeps the owner instruction and selection without fabricating a job or proposal', async ({
  page,
}) => {
  const name = 'edit-unavailable',
    instruction = 'Clarify why Arden helps the river travelers.';
  await openWorkshopDraft(page, name);
  const initial = await editing(page, name);
  await page.getByRole('button', { name: EN.ai, exact: true }).click();
  await page.getByLabel(EN.instruction, { exact: true }).fill(instruction);
  await page.getByLabel(EN.search, { exact: true }).fill('Arden');
  await page.getByRole('checkbox', { name: 'Arden', exact: true }).first().check();
  await page.getByRole('button', { name: EN.scope, exact: true }).click();
  const refused = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/edits'),
  );
  await page.getByRole('button', { name: EN.prepare, exact: true }).click();
  const response = await refused;
  expect(response.status()).toBe(422);
  const availability = await page.request.get(`${draftApi(name)}/generation/availability`);
  expect(availability.status()).toBe(200);
  expect(await availability.json()).toMatchObject({ available: false, reason: 'NO_ROUTE' });
  await expect(
    page.getByText(
      'AI editing is unavailable for this request. Your instructions and selection are kept.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel(EN.instruction, { exact: true })).toHaveValue(instruction);
  await expect(page.getByRole('checkbox', { name: 'Arden', exact: true }).first()).toBeChecked();
  await expect(page.getByRole('button', { name: EN.review, exact: true })).toHaveCount(0);
  const history = await page.request.get(`${draftApi(name)}/edits`);
  expect(history.status()).toBe(200);
  expect(await history.json()).toMatchObject({ jobs: [] as CampaignGenerationJob[] });
  expect((await editing(page, name)).revision).toEqual(initial.revision);
});
