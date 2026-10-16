import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  assetsOf,
  expectServedPicture,
  IMAGE_CAMPAIGNS,
  imagesRegion,
  playerPresentation,
} from './support/images.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { dockButton, openSheet } from './support/shell.ts';

/**
 * The DM's image commands after the Stage 330 part B review (docs/STAGE_330_DESIGN.md "DM
 * controls"; ADR 0035 amendment): approving a picture supersedes the approved one of its kind,
 * and the words say what players now see; a command whose answer was lost holds every image
 * control and says so, with Retry, wherever the DM looks; no control comes back before the list
 * shows what the command did, so a second press sends nothing; and focus never falls to the page
 * when a command takes away the card it was on. Each journey owns its campaign.
 */
const COMMANDS = '**/api/**/commands';
const isCommand = (url: string) => new URL(url).pathname.endsWith('/commands');

/** Presses Tab until the control has focus. */
async function tabTo(page: Page, control: Locator): Promise<void> {
  for (let step = 0; step < 40; step += 1) {
    if (await control.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Tab never reached the control');
}

async function showInPanel(page: Page, campaign: string, name: string): Promise<Locator> {
  await enterWorld(page, TOKENS.dm, campaign);
  await openSheet(page, 'Images');
  await page.locator('#sheet-images').getByRole('button', { name, exact: true }).click();
  return imagesRegion(page);
}

test('approving the older of two figures makes it the one players see and the DM’s list approves', async ({
  browser,
}) => {
  test.slow();
  const campaign = IMAGE_CAMPAIGNS.supersede;
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(player, TOKENS.player, campaign);
  const seen = player.getByRole('button', { name: 'Unidentified npc', exact: true });
  await expect(seen).toBeVisible();

  await enterWorld(dm, TOKENS.dm, campaign);
  await dm.getByRole('button', { name: 'Tomas Reed', exact: true }).click();
  const images = imagesRegion(dm);
  const result = images.getByRole('status');
  const request = images.getByRole('button', { name: 'Request picture', exact: true });
  await request.click();
  await images.getByRole('button', { name: 'Approve: Main picture', exact: true }).click();
  await expect(result).toHaveText(
    'Approved: Main picture. Players who can see Tomas Reed now see this picture.',
  );

  // Two figures, the second made after the first.
  await images.getByLabel('What to make', { exact: true }).selectOption('figure');
  for (let made = 1; made <= 2; made += 1) {
    await request.click();
    await expect(result).toHaveText(
      'Requested: Figure for the battlefield. The candidate will appear here for your approval.',
    );
    await expect(request).toBeEnabled();
  }
  const approve = (assetId: string) =>
    images
      .locator(`[data-image-key="${assetId}"]`)
      .getByRole('button', { name: 'Approve: Figure for the battlefield', exact: true });
  await expect
    .poll(async () => (await assetsOf(dm, campaign, 'tomas-reed', 'CANDIDATE')).length)
    .toBe(2);
  const [older, newer] = await assetsOf(dm, campaign, 'tomas-reed', 'CANDIDATE');
  if (!older || !newer) throw new Error('two figures expected');
  const figureShown = async () =>
    (await playerPresentation(player, campaign, 'tomas-reed')).figure?.contentHash;
  const approved =
    'Approved: Figure for the battlefield. Players who can see Tomas Reed now see this picture.';

  // The newer first, then the older: the older supersedes it and is what players see.
  await approve(newer.assetId).click();
  await expect(result).toHaveText(approved);
  await expect.poll(figureShown).toBe(newer.contentHash);
  await approve(older.assetId).click();
  await expect(result).toHaveText(approved);
  await expect.poll(figureShown).toBe(older.contentHash);
  await expectServedPicture(seen.locator('.miniature-art'));
  // The DM's list approves the older one alone.
  const figures = images
    .locator('.image-card--approved')
    .filter({ hasText: 'Figure for the battlefield' });
  await expect(figures).toHaveCount(1);
  await expect(figures).toHaveAttribute('data-image-key', older.assetId);
  expect((await assetsOf(dm, campaign, 'tomas-reed', 'SUPERSEDED')).map((a) => a.assetId)).toEqual([
    newer.assetId,
  ]);

  // A picture for a state is shown only in that state, and says so.
  await images.getByLabel('What to make', { exact: true }).selectOption('variant');
  await images.getByLabel('For which state', { exact: true }).selectOption('night');
  await request.click();
  await images.getByRole('button', { name: 'Approve: At night', exact: true }).click();
  await expect(result).toHaveText(
    'Approved: At night. Shown to players who can see Tomas Reed at night.',
  );
});

test('an approval whose answer was lost holds the controls, and says so with Retry everywhere', async ({
  page,
}) => {
  const campaign = IMAGE_CAMPAIGNS.pending;
  const gate = await showInPanel(page, campaign, 'Show North Gate');
  // The approval is made, but its answer is lost on the way back.
  const sent: string[] = [];
  await page.route(COMMANDS, async (route) => {
    sent.push((route.request().postDataJSON() as { commandId: string }).commandId);
    if (sent.length === 1) {
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  await gate.getByRole('button', { name: 'Approve: At night', exact: true }).click();
  const lost =
    'The answer to “Approve: At night of North Gate” was interrupted. The change may have been made. Retry to check it.';
  const retryName = 'Retry the change: Approve: At night of North Gate';
  await expect(gate.getByRole('status')).toHaveText(lost);
  await expect(gate.getByRole('button', { name: retryName, exact: true })).toBeFocused();
  await expect(gate.getByRole('button', { name: 'Request picture', exact: true })).toBeDisabled();

  // The Images sheet says what holds its controls, with the same Retry.
  await openSheet(page, 'Images');
  const sheet = page.locator('#sheet-images');
  await expect(sheet.locator('.images-pending')).toContainText(lost);
  await expect(sheet.getByRole('button', { name: retryName, exact: true })).toBeVisible();
  const thorneFigure = 'Approve: Figure for the battlefield of Captain Thorne';
  await expect(sheet.getByRole('button', { name: thorneFigure, exact: true })).toBeDisabled();

  // So does another entity's panel; Retry there checks the change and answers there.
  await sheet.getByRole('button', { name: 'Show Captain Thorne', exact: true }).click();
  const thorne = imagesRegion(page);
  await expect(thorne.getByRole('heading', { name: 'Images (DM)' })).toBeVisible();
  await expect(thorne.locator('.images-pending')).toContainText(lost);
  const approveFigure = thorne.getByRole('button', {
    name: 'Approve: Figure for the battlefield',
    exact: true,
  });
  await expect(approveFigure).toBeDisabled();
  const retried = page.waitForResponse((response) => isCommand(response.url()));
  await thorne.getByRole('button', { name: retryName, exact: true }).click();
  expect(((await (await retried).json()) as { status: string }).status).toBe('duplicate');
  expect(sent).toEqual([sent[0], sent[0]]);
  await expect(thorne.getByRole('status')).toContainText('Approved: At night of North Gate.');
  await expect(thorne.locator('.images-pending')).toHaveCount(0);
  await expect(approveFigure).toBeEnabled();
});

test('a second press before the list shows the request sends nothing', async ({ page }) => {
  const campaign = IMAGE_CAMPAIGNS.double;
  const gate = await showInPanel(page, campaign, 'Show North Gate');
  const requested: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !isCommand(request.url())) return;
    const body = request.postDataJSON() as { commandId: string; command: { type: string } };
    if (body.command.type === 'RequestAsset') requested.push(body.commandId);
  });
  // The lineage read after each answer is slow: the card the DM pressed stays on screen.
  let slow = false;
  await page.route(`**/api/campaigns/${campaign}/assets`, async (route) => {
    if (slow) await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.continue();
  });
  const pressTwiceThenAgain = async (control: Locator) => {
    slow = true;
    const answered = page.waitForResponse(
      (response) => response.request().method() === 'POST' && isCommand(response.url()),
    );
    await control.dblclick();
    await answered;
    // The world has answered; the list does not show it yet.
    await expect(control).toBeDisabled();
    await control.click({ force: true });
  };

  await pressTwiceThenAgain(
    gate.getByRole('button', { name: 'Generate again: At night', exact: true }),
  );
  await expect(gate.getByRole('status')).toHaveText(
    'Requested again: At night. This candidate stays until you decide.',
  );
  slow = false;
  expect(requested).toHaveLength(1);

  await pressTwiceThenAgain(gate.getByRole('button', { name: 'Request picture', exact: true }));
  await expect(gate.getByRole('status')).toHaveText(
    'Requested: Main picture. The candidate will appear here for your approval.',
  );
  slow = false;
  expect(requested).toHaveLength(2);
  expect(new Set(requested).size).toBe(2);
});

test('the keyboard keeps its place in the Images sheet when a command takes away its card', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm, IMAGE_CAMPAIGNS.keyboard);
  await dockButton(page, 'Images').focus();
  await page.keyboard.press('Enter');
  const sheet = page.locator('#sheet-images');
  await expect(sheet).toBeVisible();

  // Approved: the card goes, and focus moves to North Gate's next card that can be acted on.
  await tabTo(
    page,
    sheet.getByRole('button', { name: 'Approve: At night of North Gate', exact: true }),
  );
  await page.keyboard.press('Enter');
  const tryAgain = sheet.getByRole('button', {
    name: 'Try again: In snow of North Gate',
    exact: true,
  });
  await expect(tryAgain).toBeFocused();
  // Tried again: a new request with nothing to press takes the row's place; focus is on the heading.
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('status')).toHaveText('Requested again: In snow of North Gate.');
  await expect(sheet.getByRole('heading', { name: 'North Gate', exact: true })).toBeFocused();

  // Captain Thorne's last card decided: he leaves the sheet, and focus is on the sheet.
  await tabTo(
    page,
    sheet.getByRole('button', {
      name: 'Discard: Figure for the battlefield of Captain Thorne',
      exact: true,
    }),
  );
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('heading', { name: 'Captain Thorne', exact: true })).toHaveCount(0);
  await expect(sheet).toBeFocused();
});

test('in a panel, focus comes back once per command, never on a later read of the lineage', async ({
  page,
}) => {
  const campaign = IMAGE_CAMPAIGNS.panel;
  const thorne = await showInPanel(page, campaign, 'Show Captain Thorne');
  await thorne
    .getByRole('button', { name: 'Discard: Figure for the battlefield', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(thorne.getByRole('status')).toHaveText(
    'Discarded: Figure for the battlefield. No one will see this picture.',
  );
  await expect(thorne).toBeFocused();

  // The DM leaves focus nowhere; the lineage changes elsewhere and is read again.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  const reread = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname.endsWith(`/campaigns/${campaign}/assets`),
  );
  const elsewhere = await page.request.post(`/api/campaigns/${campaign}/commands`, {
    headers: { authorization: `Bearer ${TOKENS.dm}` },
    data: {
      commandId: 'images-elsewhere',
      command: {
        type: 'RequestAsset',
        entityId: 'mira-vale',
        variant: 'derived',
        label: 'night',
        audience: 'players',
      },
    },
  });
  expect(elsewhere.status()).toBe(200);
  await reread;
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});
