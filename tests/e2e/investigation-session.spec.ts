import { expect, test } from '@playwright/test';

import {
  enterInvestigation,
  entityDetails,
  INVESTIGATION_CAMPAIGNS,
} from './support/investigation.ts';
import { holdResponse } from './support/session.ts';
import { sceneRegion } from './support/shell.ts';

test('an accepted private action completing after a perspective change cannot enter the public view', async ({
  page,
}) => {
  await enterInvestigation(page, INVESTIGATION_CAMPAIGNS.perspectiveRace);
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  const pending = await holdResponse(page, (url) => url.pathname.endsWith('/commands'));
  await entityDetails(page)
    .getByRole('button', { name: 'Ask about Merchant Guild caravan', exact: true })
    .click();
  await pending.requested;
  await page.getByLabel('Perspective', { exact: true }).selectOption('PUBLIC');
  // The public view has loaded: its scene is shown.
  await expect(sceneRegion(page)).toBeVisible();
  expect(await page.content()).not.toContain('before dawn');
  pending.release();
  await pending.completed;
  expect(await page.content()).not.toContain('before dawn');
  await expect(
    entityDetails(page).getByRole('heading', { name: 'Mira Vale', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Perspective', { exact: true })).toHaveValue('PUBLIC');
});

test('an action accepted before logout cannot restore its session or private result', async ({
  page,
}) => {
  await enterInvestigation(page, INVESTIGATION_CAMPAIGNS.logoutRace);
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  const pending = await holdResponse(page, (url) => url.pathname.endsWith('/commands'));
  await entityDetails(page)
    .getByRole('button', { name: 'Ask about Merchant Guild caravan', exact: true })
    .click();
  await pending.requested;
  await page.getByRole('button', { name: 'Leave session', exact: true }).click();
  await expect(page.getByLabel('Access token', { exact: true })).toHaveValue('');
  pending.release();
  await pending.completed;
  await expect(page.getByLabel('Access token', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toHaveCount(0);
  expect(await page.content()).not.toContain('before dawn');
});
