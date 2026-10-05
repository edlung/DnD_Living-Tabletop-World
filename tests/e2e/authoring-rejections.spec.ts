import { expect, test, type Page } from '@playwright/test';

import { AUTHORING_CAMPAIGNS, dmRequest, enterAsDm, propose, review } from './support/authoring.ts';

const tomas = (page: Page) => page.getByRole('button', { name: 'Tomas Reed', exact: true });
const confirm = (page: Page) =>
  review(page).getByRole('button', { name: 'Confirm and add to the world' });

test('a stale confirmation is refused, reloaded, and never looks committed', async ({ page }) => {
  const campaign = AUTHORING_CAMPAIGNS.stale;
  await enterAsDm(page, campaign);
  const stored = await propose(page);
  await page.getByLabel('Location', { exact: true }).selectOption('north-gate');
  // Another session edits the same proposal while this screen still shows revision 1.
  const edited = await dmRequest(
    page,
    campaign,
    'post',
    `authoring/proposals/${stored.proposalId}/revisions`,
    {
      basedOnRevision: 1,
      commands: stored.commands.map((command) =>
        command['type'] === 'CreateEntity'
          ? { ...command, description: 'A guard changed elsewhere.' }
          : command,
      ),
    },
  );
  expect(edited.status).toBe(201);

  await confirm(page).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'This proposal changed since you opened it.' }),
  ).toBeVisible();
  // The latest revision replaced the stale one, and nothing entered the world.
  await expect(review(page).getByText('Draft · revision 2')).toBeVisible();
  await expect(review(page)).toContainText('A guard changed elsewhere.');
  await expect(tomas(page)).toHaveCount(0);

  // Reviewing the latest revision and confirming it succeeds.
  await confirm(page).click();
  await expect(review(page)).toContainText('Added to the world · revision 2');
  await expect(tomas(page)).toBeVisible();
});

test('an invalid proposal cannot be confirmed, forced, or mistaken for a world entity', async ({
  page,
}) => {
  const campaign = AUTHORING_CAMPAIGNS.blocked;
  await enterAsDm(page, campaign);
  const stored = await propose(page, 'Mira Vale is dead.');
  await expect(review(page).getByRole('alert', { name: 'Blocking issues' })).toBeVisible();
  await expect(confirm(page)).toBeDisabled();

  // Even a forced commit is refused by the World Engine, and Mira is unchanged.
  const forced = await dmRequest(
    page,
    campaign,
    'post',
    `authoring/proposals/${stored.proposalId}/commit`,
    { revision: 1, confirmation: { riskLevel: 'L3', acknowledgedWarnings: [] } },
  );
  expect(forced.status).toBeGreaterThanOrEqual(400);
  expect(forced.body).toMatchObject({ status: 'rejected' });
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();

  await review(page).getByRole('button', { name: 'Cancel proposal' }).click();
  await expect(review(page)).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Proposal discarded. Nothing was added' }),
  ).toBeVisible();
});

test('a continuity warning must be accepted before the proposal can be confirmed', async ({
  page,
}) => {
  await enterAsDm(page, AUTHORING_CAMPAIGNS.warning);
  await propose(page);
  await review(page).getByText('Edit proposal', { exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Mira Vale');
  await review(page).getByRole('button', { name: 'Apply changes' }).click();
  await expect(review(page).getByText('revision 2')).toBeVisible();

  const warnings = review(page).getByRole('group', { name: /Warnings you must accept/ });
  await expect(warnings).toBeVisible();
  await expect(confirm(page)).toBeDisabled();
  await warnings.getByRole('checkbox').first().check();
  await expect(confirm(page)).toBeEnabled();
  // Editing again recomputes the preview and clears the earlier acknowledgement.
  await review(page).getByText('Edit proposal', { exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Tomas Reed');
  await review(page).getByRole('button', { name: 'Apply changes' }).click();
  await expect(review(page).getByText('revision 3')).toBeVisible();
  await expect(review(page).getByRole('group', { name: /Warnings you must accept/ })).toHaveCount(
    0,
  );
  await expect(confirm(page)).toBeEnabled();
});
