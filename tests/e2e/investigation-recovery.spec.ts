import { expect, test } from '@playwright/test';

import {
  enterInvestigation,
  entityDetails,
  investigationBoundary,
  INVESTIGATION_CAMPAIGNS,
  playerKnowledge,
} from './support/investigation.ts';
import { holdResponse } from './support/session.ts';

test('an uncertain completed action retries the same command and records only one hypothesis', async ({
  page,
}) => {
  const campaign = INVESTIGATION_CAMPAIGNS.commandFailure;
  const privacy = investigationBoundary(page);
  await enterInvestigation(page, campaign);
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  await entityDetails(page).getByText('Form a hypothesis', { exact: true }).click();
  const hypothesis = 'Mira may have overlooked another departure.';
  await page.getByLabel('Hypothesis', { exact: true }).fill(hypothesis);
  await page.getByLabel('Share with', { exact: true }).selectOption({ label: 'Party' });
  const commandIds: string[] = [];
  await page.route('**/api/**/commands', async (route) => {
    const body = route.request().postDataJSON() as { commandId: string };
    commandIds.push(body.commandId);
    if (commandIds.length === 1) {
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  await entityDetails(page).getByRole('button', { name: 'Record hypothesis', exact: true }).click();
  await expect(
    page
      .getByRole('alert', { name: 'Action result' })
      .getByRole('button', { name: 'Retry action', exact: true }),
  ).toBeVisible();
  const retried = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/commands'),
  );
  await page
    .getByRole('alert', { name: 'Action result' })
    .getByRole('button', { name: 'Retry action', exact: true })
    .click();
  expect(((await (await retried).json()) as { status: string }).status).toBe('duplicate');
  await expect(entityDetails(page)).toContainText(hypothesis);
  expect(commandIds).toHaveLength(2);
  expect(commandIds[1]).toBe(commandIds[0]);
  const records = (await playerKnowledge(page, campaign)).filter(
    (record) => record.statement === hypothesis,
  );
  expect(records).toHaveLength(1);
  expect(records[0]?.knowledgeType).toBe('HYPOTHESIS');
  await privacy.assertClean();
});

test('a late accepted action cannot restore a previously selected object', async ({ page }) => {
  const privacy = investigationBoundary(page);
  await enterInvestigation(page, INVESTIGATION_CAMPAIGNS.selectionRace);
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  const pending = await holdResponse(page, (url) => url.pathname.endsWith('/commands'));
  await entityDetails(page)
    .getByRole('button', { name: 'Ask about Merchant Guild caravan', exact: true })
    .click();
  await pending.requested;
  await page.getByRole('button', { name: 'Elowen Starwhisper', exact: true }).click();
  await expect(
    entityDetails(page).getByRole('heading', { name: 'Elowen Starwhisper', exact: true }),
  ).toBeVisible();
  pending.release();
  await pending.completed;
  await expect(
    entityDetails(page).getByRole('heading', { name: 'Elowen Starwhisper', exact: true }),
  ).toBeVisible();
  await expect(
    entityDetails(page).getByRole('heading', { name: 'Mira Vale', exact: true }),
  ).toHaveCount(0);
  await privacy.assertClean();
});

test('late recalled memories cannot replace the current object context', async ({ page }) => {
  const privacy = investigationBoundary(page);
  await enterInvestigation(page, INVESTIGATION_CAMPAIGNS.recallRace);
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  const pending = await holdResponse(
    page,
    (url) => url.pathname.endsWith('/memories') && url.searchParams.get('entity') === 'mira-vale',
  );
  await entityDetails(page).getByRole('button', { name: 'Recall memories', exact: true }).click();
  await pending.requested;
  await page.getByRole('button', { name: 'Elowen Starwhisper', exact: true }).click();
  await expect(
    entityDetails(page).getByRole('heading', { name: 'Elowen Starwhisper', exact: true }),
  ).toBeVisible();
  pending.release();
  await pending.completed;
  await expect(page.getByRole('region', { name: 'Recalled memories', exact: true })).toHaveCount(0);
  await privacy.assertClean();
});
