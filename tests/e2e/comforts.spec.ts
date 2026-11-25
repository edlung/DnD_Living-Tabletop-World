import { expect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { closeTopMenu, expectDockFits, openSheet, openTopMenu } from './support/shell.ts';
import { tile } from './support/choices.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * Small comforts (docs/adr/0072-keepsakes.md §3, Stage 790): a viewer makes this screen's text
 * larger and it stays; a cheer shows on every screen for a moment and is kept nowhere; the DM's
 * break reminder offers a break, which pauses the game, and brings the table back. Chromium on a
 * laptop and WebKit on an iPad, each on a campaign of its own. These servers have no table's
 * screen: the "Break" card and a cheer on the TV are in `comforts-screens.spec.ts`.
 */
const campaignOf = () =>
  test.info().project.name === 'ipad'
    ? UI_PARTY_CAMPAIGNS.comfortsIpad
    : UI_PARTY_CAMPAIGNS.comforts;

const API = 'http://127.0.0.1:4311';
const WAIT = { timeout: 15_000 };
const ELOWEN = 'Elowen Starwhisper';
const PAUSED = 'The DM paused the game. It waits until they resume.';
const SETTINGS = 'This screen: sound, motion, text size';

const asDm = { authorization: `Bearer ${TOKENS.dm}` };
const rootSize = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
test('a viewer makes this screen’s text larger, and it stays', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await freshPage(browser);
  await enterWorld(page, TOKENS.player, campaignOf());
  await openSheet(page, 'Dice');
  const dice = page.locator('#sheet-dice');
  await dice.getByText(SETTINGS, { exact: true }).click();
  await expect(tile(dice, 'Text size', 'Normal size')).toBeChecked();
  expect(await rootSize(page)).toBe('16px');

  await tile(dice, 'Text size', 'Larger').check();
  expect(await rootSize(page)).toBe('18px');
  await tile(dice, 'Text size', 'Largest').check();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');
  expect(await rootSize(page)).toBe('20px');
  // The page still fits its screen: nothing runs off sideways, the dock holds its buttons.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectDockFits(page);
  await expectAccessible(page, 'the Dice sheet at the largest text');

  // Kept in this browser: the page opens at that size, before anyone has signed in.
  await page.reload();
  await expect(page.getByLabel('Access token', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');
  expect(await rootSize(page)).toBe('20px');
  await expectAccessible(page, 'the start page at the largest text');

  // The same choice is on the first page of "How to play", where a newcomer reads first.
  await enterWorld(page, TOKENS.player, campaignOf());
  await openTopMenu(page);
  await page.getByRole('button', { name: 'How to play' }).first().click();
  const guide = page.getByRole('dialog', { name: 'How to play' });
  await expect(guide).toContainText('If the words are small, make them larger here');
  await expect(tile(guide, 'Text size', 'Largest')).toBeChecked();
  await expectAccessible(page, 'the guide’s first page at the largest text');
  // And back: the normal size leaves no mark on the page.
  await tile(guide, 'Text size', 'Normal size').check();
  await expect(page.locator('html')).not.toHaveAttribute('data-text-size');
  expect(await rootSize(page)).toBe('16px');
  await guide.getByRole('button', { name: 'Close the guide', exact: true }).click();
  // The guide gives the focus back to its row of the slip: the slip is closed to go on.
  await closeTopMenu(page);
  await openSheet(page, 'Dice');
  await dice.getByText(SETTINGS, { exact: true }).click();
  await expect(tile(dice, 'Text size', 'Normal size')).toBeChecked();
});

test('a cheer shows on every screen for a moment and is kept nowhere', async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const campaign = campaignOf();
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);

  // The player applauds: their own screen shows it at once, the DM's a moment later.
  await openSheet(player, 'Dice');
  const row = player.getByRole('group', { name: 'Without words', exact: true });
  await row.getByRole('button', { name: 'Applause', exact: true }).click();
  const mine = player.locator('.cheer-layer');
  await expect(mine.locator('.cheer-by')).toHaveText(ELOWEN);
  await expect(mine.locator('.cheer-said')).toHaveText(`${ELOWEN}: Applause`);
  const theirs = dm.locator('.cheer-layer');
  await expect(theirs.locator('.cheer-by')).toHaveText(ELOWEN, WAIT);
  await expect(theirs.locator('.cheer-sign')).toHaveText('👏');
  await expectAccessible(player, 'the Dice sheet with the row of cheers and a cheer shown');
  // It was one cheer, and it goes.
  await expect(mine.locator('.cheer')).toHaveCount(0, WAIT);
  await expect(theirs.locator('.cheer')).toHaveCount(0, WAIT);

  // The DM laughs back, from the table's talk: the player reads whose it is.
  await openSheet(dm, 'Chat');
  await dm
    .locator('#sheet-chat')
    .getByRole('group', { name: 'Without words', exact: true })
    .getByRole('button', { name: 'Laughter', exact: true })
    .click();
  await expect(mine.locator('.cheer-by')).toHaveText('The DM', WAIT);
  await expect(mine.locator('.cheer-said')).toHaveText('The DM: Laughter');

  // Kept nowhere: a few seconds on, the server holds none.
  await expect
    .poll(
      async () =>
        (
          await request.get(`${API}/campaigns/${campaign}/cheers?perspective=DM`, { headers: asDm })
        ).text(),
      WAIT,
    )
    .toBe(JSON.stringify({ perspective: 'DM', cheers: [] }));
});

test('the DM is reminded of a break; the break pauses the game and the table comes back', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const campaign = campaignOf();
  const lobby = (await (
    await request.get(`${API}/campaigns/${campaign}/lobby?perspective=DM`, { headers: asDm })
  ).json()) as { session: { sessionId: string } | null };
  const sessionId = lobby.session?.sessionId ?? '';
  expect(sessionId).not.toBe('');

  // This browser has counted an hour of play all but a second, two seconds ago (the count itself
  // is `break-timer.test.ts`'s): the reminder is due the moment the DM asks for it.
  const dm = await freshPage(browser);
  await dm.addInitScript(
    ([key, id]) => {
      if (window.localStorage.getItem(key) !== null) return;
      const state = {
        sessionId: id,
        played: 60 * 60_000 - 1_000,
        seenAt: Date.now() - 2_000,
        pausedAt: null,
        onBreak: false,
        shown: false,
        resume: null,
        askAt: 0,
        awaited: false,
      };
      window.localStorage.setItem(key, JSON.stringify(state));
    },
    [`ltw.break:${campaign}`, sessionId] as const,
  );
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);

  // Off until the DM asks: nothing is offered, however long the table has played.
  const ask = dm.getByRole('region', { name: 'Time for a break?', exact: true });
  await openSheet(dm, 'Session');
  const sheet = dm.locator('#sheet-session');
  const choice = sheet.getByLabel('Remind me to take a break', { exact: true });
  await expect(choice).toHaveValue('0');
  await expect(ask).toHaveCount(0);
  await choice.selectOption({ label: 'After 60 minutes of play' });
  await expect(ask).toContainText('60 minutes at the table. Time for a break?', WAIT);
  await expectAccessible(dm, 'the Session sheet with the break reminder');

  // The DM takes the break ("In 15 minutes" is `break-timer.test.ts`'s). It is the pause: this
  // server has no table's screen to tell, and the card says only what happened.
  await ask.getByRole('button', { name: 'Take a break', exact: true }).click();
  const resting = dm.getByRole('region', { name: 'Break', exact: true });
  await expect(resting).toHaveText(/^A break\. The game is paused\.\s*Back to the game$/, WAIT);
  await expect(resting).toBeFocused();
  await expect(player.getByText(PAUSED)).toBeVisible(WAIT);
  await expect(sheet.getByRole('button', { name: 'Resume the game', exact: true })).toBeVisible(
    WAIT,
  );
  await expect(sheet.getByRole('alert')).toHaveCount(0);

  // A reload keeps the break: the DM's own screen still knows how to come back.
  await dm.reload();
  await enterWorld(dm, TOKENS.dm, campaign);
  await expect(resting).toBeVisible(WAIT);
  await resting.getByRole('button', { name: 'Back to the game', exact: true }).click();
  await expect(resting).toHaveCount(0, WAIT);
  // The card is gone: its last word stays a moment where it was, and holds the focus.
  const said = dm.locator('.break-said');
  await expect(said).toHaveText('The game is on again.');
  await expect(said).toBeFocused();
  await expect(player.getByText(PAUSED)).toBeHidden(WAIT);
  // The count starts again: nothing is offered.
  await expect(ask).toHaveCount(0);
  await openSheet(dm, 'Session');
  await expect(sheet.getByRole('button', { name: 'Pause the game', exact: true })).toBeVisible(
    WAIT,
  );
});
