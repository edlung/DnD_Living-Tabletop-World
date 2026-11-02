import { expect, test } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';

/**
 * The first-session guide (docs/adr/0044-online-play.md §8): five short pages from "How to play" in
 * the top bar — the screens, exploring, a turn, the dice, talking — in English and in Russian.
 */
test('a new player reads how to play, page by page, and comes back to the world', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.player);
  const button = page.getByRole('button', { name: 'How to play', exact: true });
  await button.click();
  const guide = page.getByRole('dialog', { name: 'How to play' });
  await expect(guide.getByRole('heading', { name: 'Your screens' })).toBeVisible();
  await expectAccessible(page, 'the guide');
  for (const title of ['Exploring', 'Your turn in a fight', 'Rolling dice', 'Talking']) {
    await guide.getByRole('button', { name: 'Next' }).click();
    await expect(guide.getByRole('heading', { name: title })).toBeVisible();
  }
  await expect(guide).toContainText('Page 5 of 5');
  await guide.getByRole('button', { name: 'Back' }).click();
  await expect(guide.getByRole('heading', { name: 'Rolling dice' })).toBeVisible();
  await guide.getByRole('button', { name: 'Next' }).click();
  await guide.getByRole('button', { name: 'Start playing' }).click();
  await expect(guide).toBeHidden();
  await expect(button).toBeFocused();

  // It opens at its first page again; Escape closes it.
  await button.click();
  await expect(guide.getByRole('heading', { name: 'Your screens' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
});

test('the guide speaks Russian on a phone', async ({ browser }) => {
  // The sign-in form speaks the browser's language; the world, its campaign's (ADR 0031 §10).
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await enterWorld(page, TOKENS.player, UI_PARTY_CAMPAIGNS.ru);
  await page.getByRole('button', { name: 'Как играть', exact: true }).click();
  const guide = page.getByRole('dialog', { name: 'Как играть' });
  await expect(guide.getByRole('heading', { name: 'Ваши экраны' })).toBeVisible();
  await expect(guide).toContainText('Страница 1 из 5');
  await expectAccessible(page, 'the guide in Russian on a phone');
  await context.close();
});
