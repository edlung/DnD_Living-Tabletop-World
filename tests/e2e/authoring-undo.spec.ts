import { expect, test, type Page } from '@playwright/test';

import {
  AUTHORING_CAMPAIGNS,
  enterAsDm,
  playerCommand,
  propose,
  review,
} from './support/authoring.ts';

const tomas = (page: Page) => page.getByRole('button', { name: 'Tomas Reed', exact: true });

test('an untouched authoring commit is undone as one safe unit', async ({ page }) => {
  await enterAsDm(page, AUTHORING_CAMPAIGNS.undo);
  await propose(page);
  await review(page).getByRole('button', { name: 'Confirm and add to the world' }).click();
  await expect(review(page)).toContainText('Added to the world');
  await page.getByLabel('Location', { exact: true }).selectOption('north-gate');
  await expect(tomas(page)).toBeVisible();

  await review(page).getByRole('button', { name: 'Undo this addition' }).click();
  await expect(review(page)).toContainText('Undone');
  await expect(
    page.getByRole('status').filter({ hasText: 'Undone. The world no longer holds this.' }),
  ).toBeVisible();
  await expect(tomas(page)).toHaveCount(0);
});

test('undo is refused while the story depends on him, and works after the dependents are undone', async ({
  page,
}) => {
  const campaign = AUTHORING_CAMPAIGNS.unsafe;
  await enterAsDm(page, campaign);
  await propose(page);
  await review(page).getByText('Edit proposal', { exact: true }).click();
  await page.getByLabel('Willing to tell this when asked').check();
  await review(page).getByRole('button', { name: 'Apply changes' }).click();
  await expect(review(page).getByText('revision 2')).toBeVisible();
  await review(page).getByRole('button', { name: 'Confirm and add to the world' }).click();
  await expect(review(page)).toContainText('Added to the world');

  // Elowen meets Tomas and learns what he saw.
  for (const [id, command] of [
    [
      'to-gate',
      { type: 'EnterLocation', characterId: 'elowen-starwhisper', locationId: 'north-gate' },
    ],
    [
      'ask-tomas',
      {
        type: 'AskAbout',
        characterId: 'elowen-starwhisper',
        npcId: 'tomas-reed',
        topicId: 'guild-caravan',
      },
    ],
  ] as const) {
    const sent = await playerCommand(page, campaign, id, command);
    expect(sent.body, id).toMatchObject({ status: 'accepted' });
  }

  await review(page).getByRole('button', { name: 'Undo this addition' }).click();
  const blockers = review(page).getByRole('alert', { name: 'Undo blockers' });
  await expect(blockers).toContainText('ask about');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Other parts of the story now depend on this.' }),
  ).toBeVisible();
  await expect(review(page)).toContainText('Added to the world');
  await page.getByLabel('Location', { exact: true }).selectOption('north-gate');
  await expect(tomas(page)).toBeVisible();

  // The DM resolves the dependency explicitly, then the same undo succeeds.
  await blockers.getByRole('button', { name: 'Undo “ask about” first' }).click();
  await expect(blockers).toHaveCount(0);
  await review(page).getByRole('button', { name: 'Undo this addition' }).click();
  await expect(review(page)).toContainText('Undone');
  await expect(tomas(page)).toHaveCount(0);
});
