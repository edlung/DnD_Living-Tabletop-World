import { expect, test, type Browser } from '@playwright/test';

import { expectAccessible, WIDTHS } from './support/axe.ts';
import { dockButton, expectOnTop, openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  forgedToken,
  invite,
  joinAsDm,
  joinPath,
  type Words,
} from './support/sign-in.ts';

/**
 * Accessibility of production sign-in (docs/STAGE_320_DESIGN.md §6–7; docs/adr/0036-production-
 * sign-in.md §7): axe scans of the join page (not signed in, the failed invitation, the question
 * before a sign-in is replaced), the sign-out question, the signed-out screen and the DM's
 * Players sheet (players and invitations, a new link, the question before revoking a player) at
 * 390 × 844, 820 × 1180 and 1440 × 900, and the Russian ones on a phone. Each width signs in with
 * its own DM link of the scans' campaign, whose Elowen is seated and Seren's seat empty; the
 * scans invite, ask and keep, but never spend an invitation or revoke anyone. No trace or
 * screenshot is kept: the Players sheet shows a link.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

async function scan(
  browser: Browser,
  size: (typeof WIDTHS)[number],
  campaign: string,
  index: number,
  words: Words,
  locale: string,
): Promise<void> {
  const viewport = { width: size.width, height: size.height };
  const where = `${locale} ${size.name}`;
  // Axe needs pages of browser.newContext() (tests/e2e/AGENTS.md).
  const fresh = await browser.newContext({ viewport, locale });
  const page = await fresh.newPage();
  await page.goto('/');
  await expect(accessState(page, words.none)).toBeVisible();
  await expectAccessible(page, `${where} not signed in`);
  await page.goto(joinPath(forgedToken()));
  await expect(accessState(page, words.failed)).toBeVisible();
  await expectAccessible(page, `${where} failed invitation`);
  await fresh.close();

  const context = await browser.newContext({ viewport, locale });
  const dm = await context.newPage();
  await joinAsDm(dm, campaign, index, words);
  if (size.name === 'tablet') {
    // Every tablet width keeps the whole DM dock, Players included, on screen.
    for (const width of [768, 1023]) {
      await dm.setViewportSize({ width, height: size.height });
      for (const button of await dm.locator('nav.dock button').all()) await expectOnTop(button);
    }
    await dm.setViewportSize(viewport);
  }
  await openSheet(dm, words.players);
  const sheet = dm.locator('#sheet-players');
  await expect(sheet.getByRole('region', { name: words.members })).toContainText(
    words === WORDS.ru ? 'Эловен Старвиспер' : 'Elowen Starwhisper',
  );
  await expectAccessible(dm, `${where} Players sheet`);
  const link = await invite(dm, 'Seren Ashgrove', words);
  await expectAccessible(dm, `${where} Players sheet with a new link`);
  const elowen = words === WORDS.ru ? 'Эловен Старвиспер' : 'Elowen Starwhisper';
  await sheet.getByRole('button', { name: words.revoke(elowen) }).click();
  await expect(sheet.getByRole('button', { name: words.revokeYes })).toBeVisible();
  await expectAccessible(dm, `${where} the question before revoking a player`);
  await sheet.getByRole('button', { name: words.revoke(elowen) }).click();

  // The invitation, opened where the DM is signed in: asked, then kept (the link stays unused).
  await dm.goto(link);
  const question = accessState(dm, words.replaceQuestion);
  await expect(question.getByRole('button', { name: words.keep })).toBeVisible();
  await expectAccessible(dm, `${where} the question before a sign-in is replaced`);
  await question.getByRole('button', { name: words.keep }).click();
  await expect(dockButton(dm, words.players)).toBeVisible();

  await dm.getByRole('button', { name: words.signOut, exact: true }).click();
  const dialog = dm.getByRole('dialog', { name: words.signOutQuestion });
  await expect(dialog).toBeVisible();
  await expectAccessible(dm, `${where} sign-out question`);
  await dialog.getByRole('button', { name: words.signOut, exact: true }).click();
  await expect(accessState(dm, words.signedOut)).toBeVisible();
  await expectAccessible(dm, `${where} signed out`);
  await context.close();
}

for (const [index, size] of WIDTHS.entries()) {
  test(`join, signed out and the Players sheet pass axe at ${size.name} width`, async ({
    browser,
  }) => {
    await scan(browser, size, SIGN_IN_CAMPAIGNS.a11y, index, WORDS.en, 'en-US');
  });
}

test('in Russian, join, signed out and the Players sheet pass axe on a phone', async ({
  browser,
}) => {
  const phone = WIDTHS.find((size) => size.name === 'phone');
  if (!phone) throw new Error('no phone width');
  await scan(browser, phone, SIGN_IN_CAMPAIGNS.a11yRu, 0, WORDS.ru, 'ru-RU');
});
