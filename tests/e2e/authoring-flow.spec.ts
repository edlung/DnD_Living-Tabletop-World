import { expect, test } from '@playwright/test';

import {
  ADD_TO_THE_WORLD,
  AUTHORING_CAMPAIGNS,
  enterAsDm,
  playerCommand,
  propose,
  review,
} from './support/authoring.ts';
import { collectApiBodies, enterWorld, TOKENS } from './support/session.ts';
import { chooseLocation, dockButton, openSheet } from './support/shell.ts';

const campaign = AUTHORING_CAMPAIGNS.flow;
const SECRET = 'saw the caravan leave';

test('Tomas Reed goes from a sentence to a previewed, edited, confirmed, native NPC', async ({
  browser,
}) => {
  const dm = await browser.newPage();
  await enterAsDm(dm, campaign);
  await propose(dm);
  await expect(review(dm)).toContainText('Create npc Tomas Reed at North Gate');
  await expect(review(dm)).toContainText('Risk: L2');
  await expect(review(dm).getByText('revision 1')).toBeVisible();
  // Nothing exists yet: a preview is not the world.
  await chooseLocation(dm, 'north-gate');
  await expect(dm.getByRole('button', { name: 'Tomas Reed', exact: true })).toHaveCount(0);

  // Editing stores a new revision and recomputes the preview and its confirmation.
  await openSheet(dm, ADD_TO_THE_WORLD);
  await review(dm).getByText('Edit proposal', { exact: true }).click();
  await dm
    .getByLabel('Description', { exact: true })
    .fill('A young guard of the Ravenford Guard, 22.');
  await dm.getByLabel('Willing to tell this when asked').check();
  await review(dm).getByRole('button', { name: 'Apply changes' }).click();
  await expect(review(dm).getByText('revision 2')).toBeVisible();
  await expect(review(dm)).toContainText('A young guard of the Ravenford Guard, 22.');
  await expect(review(dm)).toContainText('willing to be shared when asked');

  await review(dm).getByRole('button', { name: 'Confirm and add to the world' }).click();
  await expect(review(dm)).toContainText('Added to the world · revision 2');
  // A valid native entity: the DM's scene now holds him like anyone else.
  await expect(dm.getByRole('button', { name: 'Tomas Reed', exact: true })).toBeVisible();

  // The player meets an NPC of the world, with no authoring trace and no private account.
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
  await expect(
    player.getByRole('region', { name: 'Scene', exact: true }).getByRole('heading', {
      name: 'North Gate',
    }),
  ).toBeVisible();
  const scene = player.getByRole('region', { name: 'Scene', exact: true });
  await expect(scene.getByRole('button', { name: /Unidentified npc|Tomas Reed/ })).toBeVisible();
  // Stylesheets are tooling; the rendered page is what the player is shown.
  const content = await player.content();
  expect(content, 'player DOM must not contain the private account').not.toContain(SECRET);
  const shown = await player.locator('body').innerText();
  for (const hidden of [
    'Confirm and add',
    'Add to the world (DM)',
    ADD_TO_THE_WORLD,
    'authoring',
    'AI-generated',
  ]) {
    expect(shown, `player view must not show ${hidden}`).not.toContain(hidden);
  }
  await traffic.assertPlayerBoundary([SECRET, 'ApplyAuthoring', 'proposalId']);
  await player.close();

  // The DM previewing the Player View keeps no DM preview or private knowledge on screen.
  await dm.getByLabel('Perspective', { exact: true }).selectOption('CHARACTER:elowen-starwhisper');
  await expect(dm.getByText('Add to the world (DM)', { exact: true })).toHaveCount(0);
  await expect(dockButton(dm, ADD_TO_THE_WORLD)).toHaveCount(0);
  const previewed = await dm.content();
  for (const hidden of [SECRET, 'Confirm and add', 'Edit proposal', 'Proposed from']) {
    expect(previewed, `Player View must not contain ${hidden}`).not.toContain(hidden);
  }
  await dm.getByLabel('Perspective', { exact: true }).selectOption('DM');
  await openSheet(dm, ADD_TO_THE_WORLD);
  await expect(dm.getByText('Add to the world (DM)', { exact: true })).toBeVisible();
  await expect(review(dm)).toHaveCount(0);
  await dm.close();
});
