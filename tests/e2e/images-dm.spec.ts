import { expect, test } from '@playwright/test';

import {
  assetsOf,
  detailsPanel,
  expectNoEnglish,
  expectServedPicture,
  IMAGE_CAMPAIGNS,
  imagesRegion,
  playerFetch,
  playerPresentation,
} from './support/images.ts';
import { collectApiBodies, enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * The DM's image controls (docs/STAGE_330_DESIGN.md "DM controls"; ADR 0022 §5, ADR 0035): the DM
 * requests a picture of Tomas Reed with a note for the image model, the test server's asset
 * worker makes candidates with the placeholder generator, and the DM approves, discards,
 * generates again and replaces. The player beside Tomas sees nothing of a candidate — not in the
 * page, not over the network, not even its bytes by hash — and the approved picture as soon as
 * the DM approves it (the live signal). Each journey owns its campaign.
 */
test('the DM requests, discards, approves and replaces Tomas’s picture; the player sees only what is approved', async ({
  browser,
}) => {
  test.slow();
  const campaign = IMAGE_CAMPAIGNS.tomas;
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  const received = collectApiBodies(player);
  await enterWorld(player, TOKENS.player, campaign);
  const seen = player.getByRole('button', { name: 'Unidentified npc', exact: true });
  await expect(seen).toBeVisible();
  await expect(seen.locator('img[src^="blob:"]')).toHaveCount(0);

  await enterWorld(dm, TOKENS.dm, campaign);
  await dm.getByRole('button', { name: 'Tomas Reed', exact: true }).click();
  const images = imagesRegion(dm);
  await expect(images).toContainText(
    'No picture is approved yet: players see the neutral fallback.',
  );
  // A figure derives from an approved main picture: not before there is one.
  await expect(images.getByRole('option', { name: 'A figure for the battlefield' })).toBeDisabled();
  await images
    .getByLabel('Note to the image model (optional)', { exact: true })
    .fill('Short dark hair under a steel cap');
  await images.getByRole('button', { name: 'Request picture', exact: true }).click();
  const result = images.getByRole('status');
  await expect(result).toHaveText(
    'Requested: Main picture. The candidate will appear here for your approval.',
  );
  const candidates = images.locator('.image-card--candidate');
  await expect(candidates).toHaveCount(1);
  await expectServedPicture(candidates.first().locator('img'));
  await expect(candidates.first()).toContainText(
    'Your note to the image model: Short dark hair under a steel cap',
  );
  await expect(candidates.first()).toContainText('Placeholder generator (tests and offline use)');

  // Generate again: the same request once more; the first candidate stays until decided.
  await candidates
    .first()
    .getByRole('button', { name: 'Generate again: Main picture', exact: true })
    .click();
  await expect(candidates).toHaveCount(2);
  const [first, second] = await assetsOf(dm, campaign, 'tomas-reed', 'CANDIDATE');
  if (!first || !second) throw new Error('two candidates expected');
  await expect(candidates.nth(1)).toContainText('Your note to the image model');
  // The player sees no candidate: not in the presentation, not even its bytes by hash.
  expect((await playerPresentation(player, campaign, 'tomas-reed')).image).toBeNull();
  expect(await playerFetch(player, campaign, first.contentHash)).toBe(404);
  expect(await playerFetch(player, campaign, second.contentHash)).toBe(404);
  await expect(seen.locator('img[src^="blob:"]')).toHaveCount(0);

  await candidates.first().getByRole('button', { name: 'Discard: Main picture' }).click();
  await expect(result).toHaveText('Discarded: Main picture. No one will see this picture.');
  await expect(candidates).toHaveCount(1);
  // The card the DM acted on is gone; focus is on the next card, never lost.
  const approve = images.getByRole('button', { name: 'Approve: Main picture', exact: true });
  await expect(approve).toBeFocused();

  await approve.click();
  await expect(result).toHaveText(
    'Approved: Main picture. Players who can see Tomas Reed now see this picture.',
  );
  await expect(candidates).toHaveCount(0);
  await expect(images.locator('.image-card--approved')).toHaveCount(1);
  // The player's screen follows at once and shows exactly the approved picture.
  await expectServedPicture(seen.locator('.medallion-face img'));
  expect((await playerPresentation(player, campaign, 'tomas-reed')).image?.contentHash).toBe(
    second.contentHash,
  );
  expect(await playerFetch(player, campaign, second.contentHash)).toBe(200);
  expect(await playerFetch(player, campaign, first.contentHash)).toBe(404);
  const shownBefore = await seen.locator('.medallion-face img').getAttribute('src');

  // Replace: a new request of the same kind; players keep the current picture until approval.
  await images.getByRole('button', { name: 'Replace: Main picture', exact: true }).click();
  await expect(
    images.getByText(
      'Replacing: Main picture. The current picture stays until you approve a new one.',
    ),
  ).toBeVisible();
  await expect(images.getByLabel('What to make', { exact: true })).toBeFocused();
  await images.getByRole('button', { name: 'Request picture', exact: true }).click();
  await expect(candidates).toHaveCount(1);
  const [third] = await assetsOf(dm, campaign, 'tomas-reed', 'CANDIDATE');
  if (!third) throw new Error('a replacement candidate expected');
  expect((await playerPresentation(player, campaign, 'tomas-reed')).image?.contentHash).toBe(
    second.contentHash,
  );
  await expect(candidates.first()).toContainText(
    'Approving it replaces the main picture; every later variant keeps its look.',
  );
  await images.getByRole('button', { name: 'Approve: Main picture', exact: true }).click();
  await expect(images.locator('.image-card--approved')).toHaveCount(1);
  await expect
    .poll(async () => (await playerPresentation(player, campaign, 'tomas-reed')).image?.contentHash)
    .toBe(third.contentHash);
  await expect(seen.locator('.medallion-face img')).not.toHaveAttribute('src', shownBefore ?? '');
  await expectServedPicture(seen.locator('.medallion-face img'));
  expect(
    (await assetsOf(dm, campaign, 'tomas-reed', 'SUPERSEDED')).map((asset) => asset.assetId),
  ).toEqual([second.assetId]);

  // With a main picture approved, a figure can be asked for; approved, Tomas stands in the scene.
  await images.getByLabel('What to make', { exact: true }).selectOption('figure');
  await images.getByRole('button', { name: 'Request picture', exact: true }).click();
  await expect(
    images.getByRole('button', { name: 'Approve: Figure for the battlefield', exact: true }),
  ).toBeVisible();
  await images
    .getByRole('button', { name: 'Approve: Figure for the battlefield', exact: true })
    .click();
  await expectServedPicture(seen.locator('.miniature-art'));
  expect((await playerPresentation(player, campaign, 'tomas-reed')).figure?.purpose).toBe('figure');

  // Nothing the player received over the network ever named the discarded candidate.
  await received.assertPlayerBoundary([first.contentHash, first.assetId, 'tomas-reed#']);
  await expect(player.locator('nav.dock').getByRole('button', { name: 'Images' })).toHaveCount(0);
});

test('a failed request says why and is tried again from the Images sheet', async ({ page }) => {
  const campaign = IMAGE_CAMPAIGNS.retry;
  await enterWorld(page, TOKENS.dm, campaign);
  await openSheet(page, 'Images');
  const sheet = page.locator('#sheet-images');
  const gate = sheet
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'North Gate' }) });
  await expect(gate).toContainText(
    'In snow · Failed: No picture could be made: no image budget is available, or there is nothing to work from.',
  );
  await gate.getByRole('button', { name: 'Try again: In snow of North Gate', exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText('Requested again: In snow of North Gate.');
  const approve = gate.getByRole('button', { name: 'Approve: In snow of North Gate', exact: true });
  await expect(approve).toBeVisible();
  // The failure was answered by a later request of its kind: it is no longer listed.
  await expect(gate).not.toContainText('Failed:');
  await expectServedPicture(gate.locator('.image-card--candidate img'));

  // The entity's own panel holds the same controls.
  await gate.getByRole('button', { name: 'Show North Gate', exact: true }).click();
  await expect(page.locator('#sheet-images')).toBeHidden();
  const images = imagesRegion(page);
  await images.getByRole('button', { name: 'Approve: In snow', exact: true }).click();
  // Shown only in snow; North Gate's other state pictures may fit at the same time.
  await expect(images.getByRole('status')).toHaveText(
    'Approved: In snow. Shown to players who can see North Gate in snow, unless another approved state picture fits better.',
  );
  await expect(images.locator('.image-card--approved')).toContainText(['In snow']);
  await openSheet(page, 'Images');
  await expect(sheet).toContainText(
    'Nothing is waiting for you: no candidates and no requests in progress.',
  );
});

test('a Russian DM approves Tomas’s picture in Russian, and the player sees it', async ({
  browser,
}) => {
  const campaign = IMAGE_CAMPAIGNS.tomasRu;
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(player, TOKENS.player, campaign);
  const seen = player.getByRole('button', { name: 'Неопознанный объект (НПС)', exact: true });
  await expect(seen).toBeVisible();

  await enterWorld(dm, TOKENS.dm, campaign);
  await dm.getByRole('button', { name: 'Томас Рид', exact: true }).click();
  const words = { panel: 'Подробности', region: 'Изображения (мастер)' };
  const images = imagesRegion(dm, words);
  await expect(images).toContainText(
    'Ни одно изображение пока не одобрено: игроки видят нейтральную замену.',
  );
  await images
    .getByLabel('Заметка для модели изображений (необязательно)', { exact: true })
    .fill('Короткие тёмные волосы, стальной шлем');
  await images.getByRole('button', { name: 'Запросить изображение', exact: true }).click();
  await expect(
    images.getByRole('button', { name: 'Одобрить: Основное изображение', exact: true }),
  ).toBeVisible();
  await expect(images.locator('.image-card--candidate')).toContainText(
    'Генератор-заглушка (для тестов и работы без сети)',
  );
  await expectNoEnglish(images, 'Russian image controls with a candidate');
  expect((await playerPresentation(player, campaign, 'tomas-reed')).image).toBeNull();
  await images.getByRole('button', { name: 'Одобрить: Основное изображение', exact: true }).click();
  await expect(images.getByRole('status')).toHaveText(
    'Одобрено: Основное изображение. Теперь это изображение видят игроки, которые видят «Томас Рид».',
  );
  await expectNoEnglish(images, 'Russian image controls after approval');
  await expectServedPicture(seen.locator('.medallion-face img'));
  await expect(
    detailsPanel(dm, 'Подробности').locator('.details-header img[src^="blob:"]'),
  ).toHaveCount(1);
});
