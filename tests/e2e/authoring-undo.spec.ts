import { expect, test, type Page } from '@playwright/test';

import {
  ADD_TO_THE_WORLD,
  AUTHORING_CAMPAIGNS,
  TOMAS_REQUEST,
  createdEntityId,
  enterAsDm,
  playerCommand,
  propose,
  review,
} from './support/authoring.ts';
import { historyEntry, openHistory } from './support/dm.ts';
import { chooseLocation, openSheet } from './support/shell.ts';

/**
 * Undo of an authoring commit, from the DM history that replaced the review's screen-local
 * undo (docs/adr/0033-live-session.md §7; ADR 0029 §7 behaviour kept: a refused undo names its
 * blockers, each undone explicitly first). The history's preview is the world's own dry run:
 * while it says the undo is refused, Undo is disabled and says why (review of Stage 320).
 */
const tomas = (page: Page) => page.getByRole('button', { name: 'Tomas Reed', exact: true });
const commit = (page: Page) => historyEntry(page, `Proposed from: ${TOMAS_REQUEST}`);

test('an untouched authoring commit is undone as one safe unit', async ({ page }) => {
  await enterAsDm(page, AUTHORING_CAMPAIGNS.undo);
  await propose(page);
  await review(page).getByRole('button', { name: 'Confirm and add to the world' }).click();
  await expect(review(page)).toContainText('Added to the world');
  await chooseLocation(page, 'north-gate');
  await expect(tomas(page)).toBeVisible();

  await openHistory(page);
  await expect(commit(page)).toContainText('Added to the world');
  await commit(page).getByRole('button', { name: 'Undo this addition' }).click();
  await expect(commit(page)).toContainText('Undone');
  await expect(
    page.getByRole('status').filter({ hasText: 'Undone. The world no longer holds this.' }),
  ).toBeVisible();
  // The review of that proposal, still open in its sheet, now shows it undone as well.
  await openSheet(page, ADD_TO_THE_WORLD);
  await expect(review(page)).toContainText('Undone');
  await expect(tomas(page)).toHaveCount(0);
});

test('undo is refused while the story depends on him, and works after the dependents are undone', async ({
  page,
}) => {
  const campaign = AUTHORING_CAMPAIGNS.unsafe;
  await enterAsDm(page, campaign);
  const tomasId = createdEntityId(await propose(page));
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
        npcId: tomasId,
        topicId: 'guild-caravan',
      },
    ],
  ] as const) {
    const sent = await playerCommand(page, campaign, id, command);
    expect(sent.body, id).toMatchObject({ status: 'accepted' });
  }

  await openHistory(page);
  const undo = commit(page).getByRole('button', { name: 'Undo this addition' });
  const blockers = commit(page).getByRole('group', { name: 'Undo blockers' });
  await expect(blockers).toContainText('ask about');
  // The preview says the world refuses the undo now: the button agrees, and says why.
  await expect(undo).toBeDisabled();
  await expect(undo).toHaveAccessibleDescription(
    'Undo is blocked by later steps that depend on this: ask about',
  );
  await expect(commit(page)).toContainText('Added to the world');
  await openSheet(page, ADD_TO_THE_WORLD);
  await expect(review(page)).toContainText('Added to the world');
  await chooseLocation(page, 'north-gate');
  await expect(tomas(page)).toBeVisible();

  // The DM resolves the dependency explicitly, then the same undo succeeds.
  await openHistory(page);
  await blockers.getByRole('button', { name: 'Undo “ask about” first' }).click();
  await expect(blockers).toHaveCount(0);
  await expect(undo).toBeEnabled();
  await expect(undo).toHaveAccessibleDescription('');
  await undo.click();
  await expect(commit(page)).toContainText('Undone');
  await openSheet(page, ADD_TO_THE_WORLD);
  await expect(review(page)).toContainText('Undone');
  await expect(tomas(page)).toHaveCount(0);
});
