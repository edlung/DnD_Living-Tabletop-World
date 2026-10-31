import { expect, test } from '@playwright/test';

import type {
  CampaignGenerationJob,
  CampaignGenerationProgressView,
  CampaignPackage,
  CampaignRevisionView,
} from '../../packages/contracts/src/index.ts';
import { SIGN_IN_ORIGIN } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import {
  draftApi,
  draftPath,
  openWorkshopDraft,
  scenarioInspector,
  workshopOwner,
} from './support/workshop.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(60_000);
const truth =
  'Iva activated the resonator left by her mentor. It is out of tune, and the bell responds to its mechanism.';

test('the owner follows opening, clue, testimony, holder and truth through a full independent scenario', async ({
  page,
}) => {
  await openWorkshopDraft(page, 'scenario-en');
  const inspector = scenarioInspector(page);
  await expect(
    inspector.getByRole('heading', { name: 'The Bell Beneath the Ice', exact: true }),
  ).toBeVisible();
  await inspector.getByRole('button', { name: 'Ringing at the Dock', exact: true }).click();
  await expect(
    inspector.getByRole('heading', { name: 'Ringing at the Dock', exact: true }),
  ).toBeVisible();
  await inspector
    .getByRole('region', { name: 'Connected objects', exact: true })
    .getByRole('button', {
      name: 'The copper dust on the dock matches parts of the old sluice.',
      exact: true,
    })
    .click();
  await inspector
    .getByRole('region', { name: 'Connected objects', exact: true })
    .getByRole('button', {
      name: 'The chart shows that the current changed near the old sluice.',
      exact: true,
    })
    .click();
  await expect(inspector.getByText('Testimony', { exact: true })).toBeVisible();
  await expect(inspector.getByText('Willing to share', { exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'Iva', exact: true }).first().click();
  await expect(inspector.getByRole('heading', { name: 'Iva', exact: true })).toBeVisible();
  await inspector
    .getByRole('region', { name: 'Connected objects', exact: true })
    .getByRole('listitem')
    .filter({ has: page.getByText('Knowledge held', { exact: true }) })
    .getByRole('button', {
      name: 'I activated the resonator to open a safe channel through the ice.',
      exact: true,
    })
    .click();
  await expect(inspector.getByText('Secret', { exact: true })).toBeVisible();
  await expect(inspector.getByText('Guarded', { exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'Iva', exact: true }).first().click();
  await inspector.getByRole('button', { name: truth, exact: true }).click();
  await expect(inspector.getByText('World truth', { exact: true }).first()).toBeVisible();
  await expect(inspector.getByText('Secret', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Scenario', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(new URL(page.url()).pathname).toBe(draftPath('scenario-en'));
});

test('Russian scenario fields save as a new immutable revision and survive reload', async ({
  page,
}) => {
  await openWorkshopDraft(page, 'scenario-ru');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  const title = await page.title();
  await page.getByRole('button', { name: 'Sign out of workshop', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Sign out of workshop?', exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  expect(await page.title()).toBe(title);
  await page.getByRole('button', { name: 'Stay signed in', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  expect(await page.title()).toBe(title);

  const nav = page.getByRole('navigation', { name: 'Объекты сценария' });
  await nav
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /^Персонажи и места/ }) })
    .getByRole('button', { name: 'Ива', exact: true })
    .click();
  const inspector = scenarioInspector(page);
  await inspector.getByRole('button', { name: 'Изменить поля', exact: true }).click();
  const description = inspector.getByRole('textbox', { name: 'Описание', exact: true });
  await description.fill(
    'Смотрительница маяка в синем шарфе. Она хочет восстановить безопасный путь по реке.',
  );
  await inspector.getByRole('button', { name: 'Сохранить исправления', exact: true }).click();
  await expect(
    inspector.getByText(
      'Смотрительница маяка в синем шарфе. Она хочет восстановить безопасный путь по реке.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Объекты сценария' })
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /^Персонажи и места/ }) })
    .getByRole('button', { name: 'Ива', exact: true })
    .click();
  await expect(
    scenarioInspector(page).getByText(
      'Смотрительница маяка в синем шарфе. Она хочет восстановить безопасный путь по реке.',
      { exact: true },
    ),
  ).toBeVisible();
  const response = await page.request.get(`${draftApi('scenario-ru')}/package`);
  expect(response.status()).toBe(200);
  expect(response.ok()).toBe(true);
  const view = (await response.json()) as CampaignRevisionView;
  expect(view.revision?.revision).toBe(2);
  expect(view.assessment.readiness).toBe('READY');
});

test('generation persists every step while its progress responses contain no scenario package', async ({
  page,
}) => {
  await openWorkshopDraft(page, 'scenario-generation');
  await page.getByRole('tab', { name: 'Generation', exact: true }).click();
  await page
    .getByLabel('Campaign idea', { exact: true })
    .fill('Investigate a sunken bell, with a peaceful resolution and an optional fight.');
  await page.getByLabel('Party size', { exact: true }).fill('3');
  await page.getByLabel('Party level', { exact: true }).fill('3');
  const progress: string[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('/progress'))
      void response.text().then((body) => progress.push(body));
  });
  await page.getByRole('button', { name: 'Generate campaign', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'View generated scenario', exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  expect(progress.length).toBeGreaterThan(0);
  for (const body of progress)
    for (const forbidden of [
      '"content":',
      '"identities":',
      '"knowledge":',
      '"prompt":',
      '"authSessionId":',
    ])
      expect(body).not.toContain(forbidden);
  await page.reload();
  await page.getByRole('tab', { name: 'Generation', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'View generated scenario', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'View generated scenario', exact: true }).click();
  await expect(
    scenarioInspector(page).getByRole('heading', { name: 'The Bell Beneath the Ice', exact: true }),
  ).toBeVisible();
});

test('a failed generation retries only its unfinished steps and keeps earlier artifacts', async ({
  page,
}) => {
  await openWorkshopDraft(page, 'scenario-retry');
  await page.getByRole('tab', { name: 'Generation', exact: true }).click();
  await page.getByLabel('Campaign idea', { exact: true }).fill('Investigate a sunken bell.');
  await page.getByLabel('Party size', { exact: true }).fill('3');
  await page.getByLabel('Party level', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Generate campaign', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry generation', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const first = await page.request.get(`${draftApi('scenario-retry')}/generation`);
  const jobs = (await first.json()) as { jobs: CampaignGenerationJob[] };
  const old = jobs.jobs[0];
  if (!old) throw new Error('test job missing');
  const oldResponse = await page.request.get(
      `${draftApi('scenario-retry')}/generation/${old.jobId}/progress`,
    ),
    oldView = (await oldResponse.json()) as CampaignGenerationProgressView;
  expect(oldView.job.nextStep).toBe(3);
  await page.getByRole('button', { name: 'View result: Cast and party', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Saved preparation step', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Scenario', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page
      .getByRole('navigation', { name: 'Scenario objects', exact: true })
      .getByRole('button', { name: 'Iva', exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    scenarioInspector(page).getByRole('button', { name: 'Edit fields', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('tab', { name: 'Generation', exact: true }).click();

  await page.getByRole('button', { name: 'Retry generation', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'View generated scenario', exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  const second = await page.request.get(`${draftApi('scenario-retry')}/generation`),
    newJobs = (await second.json()) as { jobs: CampaignGenerationJob[] };
  const completed = newJobs.jobs.find((job) => job.status === 'SUCCEEDED');
  if (!completed) throw new Error('completed job missing');
  const newResponse = await page.request.get(
      `${draftApi('scenario-retry')}/generation/${completed.jobId}/progress`,
    ),
    newView = (await newResponse.json()) as CampaignGenerationProgressView;
  expect(newView.steps.slice(0, 3).map((step) => step.traceId)).toEqual(
    oldView.steps.slice(0, 3).map((step) => step.traceId),
  );
});

test('an unavailable provider cannot pretend a generated campaign exists', async ({ page }) => {
  await openWorkshopDraft(page, 'scenario-unavailable');
  await page.getByRole('tab', { name: 'Generation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Generate campaign', exact: true })).toBeDisabled();
  await expect(page.getByText(/not available|not configured/i).first()).toBeVisible();
  const response = await page.request.get(`${draftApi('scenario-unavailable')}/generation`);
  expect(await response.json()).toMatchObject({ jobs: [] });
});

test('a late generated proposal does not replace the owner’s intervening revision', async ({
  page,
}) => {
  await openWorkshopDraft(page, 'scenario-cas');
  await page.getByRole('tab', { name: 'Generation', exact: true }).click();
  await page.getByLabel('Campaign idea', { exact: true }).fill('Investigate a sunken bell.');
  await page.getByRole('button', { name: 'Generate campaign', exact: true }).click();
  const original = await page.request.get(`${draftApi('scenario-cas')}/package`),
    stored = (await original.json()) as CampaignRevisionView;
  if (!stored.revision) throw new Error('test package missing');
  const content: CampaignPackage = {
    ...stored.revision.content,
    world: { ...stored.revision.content.world, name: 'The owner’s chosen world' },
  };
  const save = await page.request.post(`${draftApi('scenario-cas')}/revisions`, {
    headers: { origin: SIGN_IN_ORIGIN, 'x-workshop-owner': workshopOwner('scenario-cas') },
    data: { requestId: crypto.randomUUID(), basedOnRevision: 1, content },
  });
  expect(save.status()).toBe(200);
  await expect(
    page.getByRole('button', { name: 'View generation proposal', exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'View generation proposal', exact: true }).click();
  await expect(
    scenarioInspector(page).getByRole('heading', { name: 'The Bell Beneath the Ice', exact: true }),
  ).toBeVisible();
  const latest = await page.request.get(`${draftApi('scenario-cas')}/package`),
    current = (await latest.json()) as CampaignRevisionView;
  expect(current.revision?.revision).toBe(2);
  expect(current.revision?.content.world.name).toBe('The owner’s chosen world');
});
