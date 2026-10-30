import { expect, test } from '@playwright/test';

import type {
  CampaignGenerationJob,
  CampaignRevisionView,
} from '../../packages/contracts/src/index.ts';
import { SIGN_IN_ORIGIN } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import {
  draftApi,
  openWorkshopDraft,
  scenarioInspector,
  workshopOwner,
} from './support/workshop.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(60_000);

test('a lost correction response retries its exact nonce and a later conflict preserves the owner’s input', async ({
  page,
}) => {
  await openWorkshopDraft(page, 'scenario-correction');
  await page
    .getByRole('navigation', { name: 'Scenario objects', exact: true })
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /^Cast and places/ }) })
    .getByRole('button', { name: 'Iva', exact: true })
    .click();
  const inspector = scenarioInspector(page);
  await inspector.getByRole('button', { name: 'Edit fields', exact: true }).click();
  const description = inspector.getByRole('textbox', { name: 'Description', exact: true });
  const firstText = 'The lighthouse keeper wears a blue scarf and wants a safe river passage.';
  await description.fill(firstText);
  let dropped = false;
  const nonces: string[] = [];
  await page.route(`**${draftApi('scenario-correction')}/revisions`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const body = route.request().postDataJSON() as { requestId: string };
    nonces.push(body.requestId);
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort();
      return;
    }
    await route.continue();
  });
  await inspector.getByRole('button', { name: 'Save corrections', exact: true }).click();
  await expect(
    inspector.getByRole('button', { name: 'Retry the same save', exact: true }),
  ).toBeVisible();
  await inspector.getByRole('button', { name: 'Retry the same save', exact: true }).click();
  await expect(inspector.getByText(firstText, { exact: true })).toBeVisible();
  expect(nonces).toHaveLength(2);
  expect(nonces[1]).toBe(nonces[0]);
  const saved = await page.request.get(`${draftApi('scenario-correction')}/package`),
    view = (await saved.json()) as CampaignRevisionView;
  expect(view.revision?.revision).toBe(2);
  if (!view.revision) throw new Error('test package missing');
  await inspector.getByRole('button', { name: 'Edit fields', exact: true }).click();
  const pendingText = 'My unsaved description must remain in this form after a revision conflict.';
  await inspector.getByRole('textbox', { name: 'Description', exact: true }).fill(pendingText);
  const external = await page.request.post(`${draftApi('scenario-correction')}/revisions`, {
    headers: { origin: SIGN_IN_ORIGIN, 'x-workshop-owner': workshopOwner('scenario-correction') },
    data: {
      requestId: crypto.randomUUID(),
      basedOnRevision: 2,
      content: {
        ...view.revision.content,
        world: { ...view.revision.content.world, opening: 'Another saved opening.' },
      },
    },
  });
  expect(external.status()).toBe(200);
  await inspector.getByRole('button', { name: 'Save corrections', exact: true }).click();
  await expect(inspector.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue(
    pendingText,
  );
  await expect(
    inspector.getByText(
      'Another revision was saved. Reload the selected revision before editing.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Scenario', exact: true })).toBeVisible();
  const latest = await page.request.get(`${draftApi('scenario-correction')}/package`),
    current = (await latest.json()) as CampaignRevisionView;
  expect(current.revision?.revision).toBe(3);
  expect(
    current.revision?.content.entities.find((entity) => entity.key === 'iva')?.description,
  ).toBe(firstText);
});

test('cancelling a generation closes the job and does not offer an unsupported retry', async ({
  page,
}) => {
  await openWorkshopDraft(page, 'scenario-cancel');
  await page.getByRole('tab', { name: 'Generation', exact: true }).click();
  await page.getByLabel('Campaign idea', { exact: true }).fill('Investigate a sunken bell.');
  await page.getByRole('button', { name: 'Generate campaign', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel generation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel generation', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry generation', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Generate campaign', exact: true })).toBeEnabled();
  const response = await page.request.get(`${draftApi('scenario-cancel')}/generation`),
    jobs = (await response.json()) as { jobs: CampaignGenerationJob[] };
  expect(jobs.jobs[0]?.status).toBe('CANCELLED');
  const packageResponse = await page.request.get(`${draftApi('scenario-cancel')}/package`),
    view = (await packageResponse.json()) as CampaignRevisionView;
  expect(view.revision?.revision).toBe(1);
});
