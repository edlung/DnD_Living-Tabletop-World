import { expect, test, type Page } from '@playwright/test';

import campaigns from './fixtures/dm-tool-campaigns.json' with { type: 'json' };
import { dmRequest } from './support/authoring.ts';
import { expectLive } from './support/live.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openChronicle } from './support/shell.ts';

/**
 * A chapter written while the player reads (docs/STAGE_320_DESIGN.md §5.6; ADR 0033 §4): the
 * book reads the chronicle again in the background and the page being read stays — its chapter,
 * its place, an open flashback whose Return still finds its button — while the new chapter's
 * ribbon says "New" until the player opens it. The campaign is this journey's own.
 */
const campaign = campaigns.pinned;
const FIRST = 'Chapter I — Shadows on the Trade Road';
const SECOND = 'Chapter II — The Gate at Dusk';

async function write(page: Page, title: string): Promise<void> {
  const written = await dmRequest(page, campaign, 'post', 'chronicle', {
    title,
    perspective: 'CHARACTER:elowen-starwhisper',
    from: 0,
  });
  expect(written.body, title).toMatchObject({ result: { status: 'accepted' } });
}

test('a chapter written while the player reads never replaces the page; its ribbon says New', async ({
  page,
}) => {
  await write(page, FIRST);
  await enterWorld(page, TOKENS.player, campaign);
  await expectLive(page);
  await openChronicle(page);
  const book = page.getByRole('dialog', { name: 'Chronicle' });
  const first = book.getByRole('article', { name: FIRST });
  await expect(first).toBeVisible();

  // The player reads some way down the right-hand page and opens its last moment's flashback.
  // Under the flashback the page is unseen and inert, out of the accessibility tree: by class.
  const right = book.locator('.book-chapter .book-page--right');
  await right.hover();
  await page.mouse.wheel(0, 120);
  await expect.poll(() => right.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const place = await right.evaluate((element) => element.scrollTop);
  const open = first.getByRole('button', { name: 'Open flashback' }).last();
  await expect(open).toBeInViewport({ ratio: 1 });
  await open.click();
  const flashback = book.getByRole('region', { name: 'Flashback' });
  await expect(flashback).toBeFocused();

  // The DM writes the next chapter; the live signal brings it into the open book.
  await write(page, SECOND);
  const ribbon = book.getByRole('button', { name: new RegExp(`^${SECOND}`) });
  await expect(ribbon).toContainText('New');
  await expect(ribbon).toHaveAttribute('aria-pressed', 'false');
  await expect(book.getByRole('button', { name: FIRST, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Nothing moved under the reader: the flashback, then its button and the place on the page.
  await expect(flashback).toBeFocused();
  await flashback.getByRole('button', { name: 'Return', exact: true }).click();
  await expect(open).toBeFocused();
  await expect(first).toBeVisible();
  expect(await right.evaluate((element) => element.scrollTop)).toBe(place);

  // Opening the new chapter shows it, and its ribbon is no longer marked.
  await ribbon.click();
  await expect(book.getByRole('article', { name: SECOND })).toBeVisible();
  await expect(ribbon).toHaveAttribute('aria-pressed', 'true');
  await expect(ribbon).not.toContainText('New');
});
