import { expect, test } from '@playwright/test';

import { dmRequest } from './support/authoring.ts';
import { enterCombat, expectAccepted, submit } from './support/combat.ts';
import {
  bannerWords,
  expectLive,
  LIVE_CAMPAIGNS,
  turnAnnounced,
  turnBanner,
} from './support/live.ts';
import { TOKENS } from './support/session.ts';
import { expectOnTop, openChronicle, openSheet, revealDockButton } from './support/shell.ts';

/**
 * A reaction asked while the player reads the Chronicle (docs/STAGE_320_DESIGN.md §5.5–5.6, §7;
 * ADR 0033): the modal book would make the question inert behind it, so the book closes —
 * keeping its chapter and the place on the page — the question takes focus and is announced
 * once (the banner's live words still say only whose turn it is), the player answers, and
 * focus comes back to the turn banner, never to the page. The campaign waits on the Goblin
 * Shaman's turn before the DM casts (`apps/server/src/testing/ui-live-campaigns.ts`).
 */
const campaign = LIVE_CAMPAIGNS.bookWindow;
const TITLE = 'Chapter I — Shadows on the Trade Road';

test('a reaction asked over the open Chronicle closes the book, is told once and answered', async ({
  browser,
}) => {
  const dm = await browser.newPage();
  await enterCombat(dm, campaign, TOKENS.dm);
  // A chapter to read, written through the route the book's header uses.
  const written = await dmRequest(dm, campaign, 'post', 'chronicle', {
    title: TITLE,
    perspective: 'CHARACTER:elowen-starwhisper',
    from: 0,
  });
  expect(written.body).toMatchObject({ result: { status: 'accepted' } });
  const player = await browser.newPage();
  await enterCombat(player, campaign);
  await expectLive(player);
  await expectLive(dm);
  await expect(turnBanner(player)).toHaveText("Unidentified creature 4's turn");

  // The player reads the chapter, some way down its right-hand page.
  await openChronicle(player);
  const book = player.getByRole('dialog', { name: 'Chronicle' });
  const chapter = book.getByRole('article', { name: TITLE });
  await expect(chapter).toBeVisible();
  const page = chapter.locator('.book-page--right');
  await page.hover();
  await player.mouse.wheel(0, 160);
  await expect.poll(() => page.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const place = await page.evaluate((element) => element.scrollTop);

  // The DM's shaman casts at Elowen: the question comes before the book.
  await openSheet(dm, 'Encounter');
  expectAccepted(await submit(dm, dm.getByRole('button', { name: 'Run suggested spell' })));
  const prompt = player.getByRole('alertdialog', { name: 'Reaction: Counterspell' });
  await expect(book).toBeHidden();
  await expect(prompt).toBeFocused();
  await expectOnTop(prompt);
  await expect(bannerWords(player)).toHaveText('Your reaction is needed');
  await expect(turnAnnounced(player)).toHaveText("Unidentified creature 4's turn");

  expectAccepted(
    await submit(player, prompt.getByRole('button', { name: 'Don’t interfere', exact: true })),
  );
  await expect(prompt).toHaveCount(0);
  await expect(turnBanner(player)).toBeFocused();

  // The book opens again at the same chapter and the same place on its page.
  await (await revealDockButton(player, 'Chronicle')).click();
  await expect(chapter).toBeVisible();
  await expect(book.getByRole('button', { name: TITLE })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate((element) => element.scrollTop)).toBe(place);
  await player.close();
  await dm.close();
});
