import { expect, test } from '@playwright/test';

import { closePages, freshPage } from './support/pages.ts';
import { expectAccessible } from './support/axe.ts';
import { openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  invite,
  joinAsDm,
  openInvitation,
} from './support/sign-in.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * Small comforts on the table's screen (docs/adr/0072-keepsakes.md §3, Stage 790), on the
 * invitation-mode servers, where the table's screen lives: a player's cheer and the DM's show on
 * the TV for a moment, over whatever is cast; the DM's break shows "Break" there, and coming back
 * shows the scene again. The TV gives no cheer and has no text size of its own. No trace or
 * screenshot is kept: the pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 15_000 };
const SPACED_CODE = /^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/;
const ELOWEN = 'Elowen Starwhisper';

test('the TV shows the table’s cheers and the DM’s break', async ({ browser }) => {
  test.setTimeout(180_000);
  const campaign = SIGN_IN_CAMPAIGNS.comforts;

  // The TV waits with its code; the DM pairs it.
  const tv = await freshPage(browser);
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(SPACED_CODE, LIVE);
  const dm = await freshPage(browser);
  await joinAsDm(dm, campaign);
  await openSheet(dm, 'Table screen');
  const screen = dm.locator('#sheet-screen');
  await screen.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screen.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(screen.getByRole('status')).toHaveText(
    'The screen is paired: it shows what you choose below.',
  );
  await expect(tv.locator('.display-cast')).toBeVisible(LIVE);

  // A player takes Elowen's seat and applauds: the TV shows it, with her name, and it goes.
  const link = await invite(dm, ELOWEN);
  const player = await freshPage(browser);
  await openInvitation(player, link);
  await expect(player.locator('nav.dock')).toBeVisible(LIVE);
  await openSheet(player, 'Dice');
  await player
    .getByRole('group', { name: 'Without words', exact: true })
    .getByRole('button', { name: 'Applause', exact: true })
    .click();
  const cheers = tv.locator('.cheer-layer--display');
  await expect(cheers.locator('.cheer-by')).toHaveText(ELOWEN, LIVE);
  await expect(cheers.locator('.cheer-sign')).toHaveText('👏');
  await expect(cheers.locator('.cheer-said')).toHaveText(`${ELOWEN}: Applause`);
  await expectAccessible(tv, 'the table’s screen with a cheer');
  await expect(cheers.locator('.cheer')).toHaveCount(0, LIVE);
  // The TV cheers as nobody: it has no row of marks.
  await expect(tv.getByRole('group', { name: 'Without words', exact: true })).toHaveCount(0);
  await expect(tv.locator('html')).not.toHaveAttribute('data-text-size');

  // The DM's count stands a few seconds short of an hour (the count itself is
  // `break-timer.test.ts`'s); asked to remind, the DM's screen offers the break.
  const sessionId = await dm.evaluate(async (id) => {
    const lobby = (await (await fetch(`/api/campaigns/${id}/lobby?perspective=DM`)).json()) as {
      session: { sessionId: string } | null;
    };
    return lobby.session?.sessionId ?? '';
  }, campaign);
  expect(sessionId).not.toBe('');
  await dm.evaluate(
    ([key, id]) => {
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
  await dm.reload();
  await expect(dm.locator('nav.dock')).toBeVisible(LIVE);
  await openSheet(dm, 'Session');
  // The TV is told slowly, so the pause is read back before the break is kept: a resume from the
  // Session sheet ends that break all the same, at once.
  await dm.route('**/display/cast', async (route) => {
    if (route.request().method() === 'POST') await new Promise((done) => setTimeout(done, 2_500));
    await route.continue();
  });
  await dm
    .locator('#sheet-session')
    .getByLabel('Remind me to take a break', { exact: true })
    .selectOption({ label: 'After 60 minutes of play' });
  const ask = dm.getByRole('region', { name: 'Time for a break?', exact: true });
  await expect(ask).toBeVisible(LIVE);
  await ask.getByRole('button', { name: 'Take a break', exact: true }).click();
  await expect(dm.getByRole('region', { name: 'Break', exact: true })).toContainText(
    'A break. The game is paused, and the table’s screens say “Break”.',
    LIVE,
  );

  // The TV says so, large; the player's screen waits.
  const title = tv.locator('.display-title');
  await expect(title.getByRole('heading', { level: 1, name: 'Break', exact: true })).toBeVisible(
    LIVE,
  );
  await expect(title).toContainText('We will be back at the table soon.');
  await expectAccessible(tv, 'the break on the table’s screen');
  await expect(player.getByText('The DM paused the game. It waits until they resume.')).toBeVisible(
    LIVE,
  );

  // The DM resumes from the Session sheet, not from the card: the break is over all the same,
  // the card says so, and the scene is on the TV again.
  await dm
    .locator('#sheet-session')
    .getByRole('button', { name: 'Resume the game', exact: true })
    .click();
  await expect(dm.getByRole('region', { name: 'Break', exact: true })).toHaveCount(0, LIVE);
  await expect(dm.locator('.break-said')).toHaveText('The game is on again.');
  await expect(tv.getByRole('heading', { level: 1, name: 'Break', exact: true })).toHaveCount(
    0,
    LIVE,
  );
  await expect(player.getByText('The DM paused the game. It waits until they resume.')).toBeHidden(
    LIVE,
  );
});
