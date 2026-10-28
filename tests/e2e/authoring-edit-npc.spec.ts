import { expect, test, type Page } from '@playwright/test';

import {
  ADD_TO_THE_WORLD,
  AUTHORING_CAMPAIGNS,
  dmRequest,
  enterAsDm,
  playerCommand,
  review,
} from './support/authoring.ts';
import { historyEntry, openHistory } from './support/dm.ts';
import { collectApiBodies, enterWorld, TOKENS } from './support/session.ts';
import { chooseLocation, closeSheet, sceneRegion } from './support/shell.ts';

/**
 * The DM edits an NPC from its card (owner decisions 11, SI-D8): a DM-written proposal of
 * `UpdateEntityProfile` through the same preview, who-sees, confirm and History undo. Players
 * who know the NPC see the new name; the description stays the DM's, and an NPC the player has
 * not met keeps its name to itself.
 */
const details = (page: Page) => page.getByRole('complementary', { name: 'Entity details' });

async function editFromCard(page: Page, npc: string, name: string, description?: string) {
  await page.getByRole('button', { name: npc, exact: true }).click();
  const card = details(page);
  await card.getByText('Edit name and description', { exact: true }).click();
  await card.getByLabel('Name', { exact: true }).fill(name);
  if (description !== undefined) {
    await card.getByLabel('Description', { exact: true }).fill(description);
  }
  await card.getByRole('button', { name: 'Propose the change' }).click();
  await expect(review(page)).toBeVisible();
}

async function confirm(page: Page) {
  const warnings = review(page).getByRole('group', { name: /Warnings you must accept/ });
  for (const box of await warnings.getByRole('checkbox').all()) await box.check();
  // An edit adds nothing: its confirm says so (second stand-in pass).
  await expect(
    review(page).getByRole('button', { name: 'Confirm and add to the world' }),
  ).toHaveCount(0);
  await review(page).getByRole('button', { name: 'Confirm the edit' }).click();
  await expect(review(page)).toContainText('Added to the world');
  // Once confirmed, "who will see" no longer says the proposal is the DM's alone.
  await expect(review(page)).toContainText('Confirmed: it is in the world now, seen as follows.');
  await expect(review(page)).not.toContainText('Until you confirm it, only you see this proposal.');
}

test('a known NPC’s new name reaches the player; the description stays the DM’s; undo restores it', async ({
  browser,
}) => {
  const campaign = AUTHORING_CAMPAIGNS.editNpc;
  const dm = await browser.newPage();
  await enterAsDm(dm, campaign);
  await chooseLocation(dm, 'market-square');
  await editFromCard(dm, 'Mira Vale', 'Mira Ashford', 'A caravan trader with a burned ledger.');
  await expect(review(dm)).toContainText(
    'Update Mira Vale (name: Mira Ashford) (description: A caravan trader with a burned ledger.)',
  );
  await expect(review(dm)).toContainText(
    'Players who already know Mira Vale see the new name Mira Ashford',
  );
  await expect(review(dm)).toContainText('Players never read the description');
  await confirm(dm);
  await closeSheet(dm, ADD_TO_THE_WORLD);
  // The card shows the world as it is now.
  await expect(details(dm).getByRole('heading', { name: 'Mira Ashford' })).toBeVisible();
  await expect(details(dm)).toContainText('A caravan trader with a burned ledger.');

  const player = await browser.newPage();
  const traffic = collectApiBodies(player);
  await enterWorld(player, TOKENS.player, campaign);
  await expect(sceneRegion(player).getByRole('button', { name: 'Mira Ashford' })).toBeVisible();
  expect(await player.content()).not.toContain('burned ledger');
  await traffic.assertPlayerBoundary(['burned ledger', 'UpdateEntityProfile', 'proposalId']);
  await player.close();

  // Undo from History brings the old name back.
  await openHistory(dm);
  const entry = historyEntry(dm, 'Edit Mira Vale');
  await entry.getByRole('button', { name: 'Undo this addition' }).click();
  await expect(entry).toContainText('Undone');
  await closeSheet(dm, 'History');
  await expect(details(dm).getByRole('heading', { name: 'Mira Vale' })).toBeVisible();
  await dm.close();
});

test('an NPC the player has not met keeps its new name from the player', async ({ browser }) => {
  const campaign = AUTHORING_CAMPAIGNS.editHidden;
  const dm = await browser.newPage();
  await enterAsDm(dm, campaign);
  // Tomas exists, placed by the DM; Elowen has never learned his name.
  const created = await dmRequest(dm, campaign, 'post', 'authoring/proposals', {
    summary: 'Tomas.',
    commands: [
      {
        type: 'CreateEntity',
        kind: 'npc',
        name: 'Tomas Reed',
        description: 'A young guard.',
        existsSince: null,
        placement: { locationId: 'north-gate', since: null },
      },
    ],
  });
  const draft = created.body as {
    proposal: { proposalId: string };
    preview: { confirmation: unknown };
  };
  const committed = await dmRequest(
    dm,
    campaign,
    'post',
    `authoring/proposals/${draft.proposal.proposalId}/commit`,
    { revision: 1, confirmation: draft.preview.confirmation },
  );
  expect(committed.body).toMatchObject({ status: 'accepted' });

  await chooseLocation(dm, 'north-gate');
  await editFromCard(dm, 'Tomas Reed', 'Tomas the Gatekeeper');
  await confirm(dm);
  await closeSheet(dm, ADD_TO_THE_WORLD);
  await expect(details(dm).getByRole('heading', { name: 'Tomas the Gatekeeper' })).toBeVisible();

  const player = await browser.newPage();
  const traffic = collectApiBodies(player);
  expect(
    (
      await playerCommand(player, campaign, 'to-gate', {
        type: 'EnterLocation',
        characterId: 'elowen-starwhisper',
        locationId: 'north-gate',
      })
    ).body.status,
  ).toBe('accepted');
  await enterWorld(player, TOKENS.player, campaign);
  await expect(sceneRegion(player).getByRole('heading', { name: 'North Gate' })).toBeVisible();
  await expect(
    sceneRegion(player).getByRole('button', { name: /Unidentified|Stranger/ }),
  ).not.toHaveCount(0);
  const shown = await player.content();
  expect(shown).not.toContain('Gatekeeper');
  expect(shown).not.toContain('Tomas');
  await traffic.assertPlayerBoundary(['Gatekeeper', 'Tomas']);
  await player.close();
  await dm.close();
});
