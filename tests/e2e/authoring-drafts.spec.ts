import { expect, test, type Page } from '@playwright/test';

import {
  ADD_TO_THE_WORLD,
  AUTHORING_CAMPAIGNS,
  enterAsDm,
  propose,
  review,
} from './support/authoring.ts';
import { openSheet } from './support/shell.ts';

/**
 * The DM's drafts live on the server (owner decisions 11, SI-D1; ADR 0029 §6, amendment
 * 2026-10-28): a reload or a switch of perspective restores the unfinished proposal without
 * asking the assistant again, nothing is kept in browser storage, and a cancelled draft never
 * comes back. A witness who was elsewhere is never moved by a fix (SI-D7).
 */
const restored = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Your unfinished proposal was restored.' });

test('a reload and a change of perspective keep the DM’s unfinished draft', async ({ page }) => {
  const campaign = AUTHORING_CAMPAIGNS.restore;
  let interpretations = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/ai/intents')) interpretations += 1;
  });
  await enterAsDm(page, campaign);
  await propose(page);
  await review(page).getByText('Edit proposal', { exact: true }).click();
  await page
    .getByLabel('Description', { exact: true })
    .fill('A young guard with a scar over one eye.');
  await review(page).getByRole('button', { name: 'Apply changes' }).click();
  await expect(review(page).getByText('revision 2')).toBeVisible();

  // A reload forgets the screen and the credential; the draft is the server's.
  await page.reload();
  await enterAsDm(page, campaign);
  await openSheet(page, ADD_TO_THE_WORLD);
  await expect(review(page)).toContainText('Create npc Tomas Reed at North Gate');
  await expect(review(page)).toContainText('A young guard with a scar over one eye.');
  await expect(review(page).getByText('Draft · revision 2')).toBeVisible();
  await expect(restored(page)).toBeVisible();
  const stored = await page.evaluate(
    () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
  );
  expect(stored).not.toContain('Tomas');

  // The Player View holds none of it; back in the DM view the draft returns.
  await page
    .getByLabel('Perspective', { exact: true })
    .selectOption('CHARACTER:elowen-starwhisper');
  await expect(page.getByText('Add to the world (DM)', { exact: true })).toHaveCount(0);
  expect(await page.content()).not.toContain('scar over one eye');
  await page.getByLabel('Perspective', { exact: true }).selectOption('DM');
  await openSheet(page, ADD_TO_THE_WORLD);
  await expect(review(page)).toContainText('A young guard with a scar over one eye.');
  expect(interpretations).toBe(1);

  // A cancel is the server's too: the discarded draft never returns.
  await review(page).getByRole('button', { name: 'Cancel proposal' }).click();
  await expect(review(page)).toHaveCount(0);
  await page.reload();
  await enterAsDm(page, campaign);
  await openSheet(page, ADD_TO_THE_WORLD);
  await expect(page.getByLabel('Describe what to add', { exact: true })).toBeVisible();
  await expect(review(page)).toHaveCount(0);
  await expect(restored(page)).toHaveCount(0);
});

test('a witness elsewhere is explained, never moved, and the description is one click away', async ({
  page,
}) => {
  await enterAsDm(page, AUTHORING_CAMPAIGNS.past);
  await propose(page);
  await review(page).getByText('Edit proposal', { exact: true }).click();
  await page.getByLabel('Where they stand', { exact: true }).selectOption('market-square');
  await review(page).getByRole('button', { name: 'Apply changes' }).click();
  await expect(review(page).getByText('revision 2')).toBeVisible();

  const warnings = review(page).getByRole('group', { name: /Warnings you must accept/ });
  await expect(warnings).toContainText(
    'The world records only where someone is now, not where they were before',
  );
  await expect(warnings.getByRole('button', { name: /^Place / })).toHaveCount(0);
  await warnings.getByRole('button', { name: 'Edit the description' }).click();
  await expect(page.getByLabel('Description', { exact: true })).toBeFocused();
  await page
    .getByLabel('Description', { exact: true })
    .fill('Stands at Market Square now; on the night the caravan left he kept the North Gate.');
  await review(page).getByRole('button', { name: 'Apply changes' }).click();
  await expect(review(page).getByText('revision 3')).toBeVisible();
  // He stays where the DM put him; the warning is accepted, not fixed by a move.
  await expect(review(page)).toContainText('Create npc Tomas Reed at Market Square');
  for (const box of await warnings.getByRole('checkbox').all()) await box.check();
  await review(page).getByRole('button', { name: 'Confirm and add to the world' }).click();
  await expect(review(page)).toContainText('Added to the world · revision 3');
  await expect(page.getByRole('button', { name: 'Tomas Reed', exact: true })).toBeVisible();
});
